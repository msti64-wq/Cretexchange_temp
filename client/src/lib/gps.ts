export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  observedAt: string;
}

export type GpsAcquisitionFailureReason =
  | "unsupported"
  | "permission_denied"
  | "unavailable"
  | "timeout"
  | "cancelled";

export class GpsAcquisitionError extends Error {
  constructor(
    public readonly reason: GpsAcquisitionFailureReason,
    message: string,
  ) {
    super(message);
    this.name = "GpsAcquisitionError";
  }
}

export interface GpsAcquisitionOptions {
  fresh?: boolean;
  timeoutMs?: number;
  acceptableAccuracyMeters?: number;
  maximumObservationAgeMs?: number;
}

interface GeolocationSource {
  watchPosition(
    success: PositionCallback,
    error?: PositionErrorCallback | null,
    options?: PositionOptions,
  ): number;
  clearWatch(watchId: number): void;
}

interface GpsAcquirerDependencies {
  geolocation?: GeolocationSource | null;
  now?: () => number;
  setTimer?: (callback: () => void, timeoutMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

export interface DriverLocationAcquirer {
  acquire(options?: GpsAcquisitionOptions): Promise<Coordinates>;
  cancel(): void;
  isAcquiring(): boolean;
}

const DEFAULT_ACQUISITION_TIMEOUT_MS = 20_000;
const DEFAULT_ACCEPTABLE_ACCURACY_METERS = 100;
const DEFAULT_MAXIMUM_OBSERVATION_AGE_MS = 60_000;
const INITIAL_MAXIMUM_AGE_MS = 30_000;
const MAXIMUM_FUTURE_SKEW_MS = 5_000;

function geolocationError(error: GeolocationPositionError): GpsAcquisitionError {
  if (error.code === error.PERMISSION_DENIED) {
    return new GpsAcquisitionError("permission_denied", "Location access denied by user.");
  }
  if (error.code === error.TIMEOUT) {
    return new GpsAcquisitionError("timeout", "Location request timed out.");
  }
  return new GpsAcquisitionError("unavailable", "Location information is unavailable.");
}

function resolveGeolocation(dependency: GeolocationSource | null | undefined): GeolocationSource | null {
  if (dependency !== undefined) return dependency;
  return typeof navigator !== "undefined" ? navigator.geolocation : null;
}

export function createDriverLocationAcquirer(dependencies: GpsAcquirerDependencies = {}): DriverLocationAcquirer {
  let active: { promise: Promise<Coordinates>; cancel: () => void } | null = null;

  const acquire = (options: GpsAcquisitionOptions = {}): Promise<Coordinates> => {
    if (active) return active.promise;

    const geolocation = resolveGeolocation(dependencies.geolocation);
    if (!geolocation) {
      return Promise.reject(new GpsAcquisitionError("unsupported", "Geolocation is not supported by this browser."));
    }

    const now = dependencies.now || Date.now;
    const setTimer = dependencies.setTimer || ((callback, timeoutMs) => setTimeout(callback, timeoutMs));
    const clearTimer = dependencies.clearTimer || ((timer) => clearTimeout(timer));
    const timeoutMs = options.timeoutMs ?? DEFAULT_ACQUISITION_TIMEOUT_MS;
    const acceptableAccuracyMeters = options.acceptableAccuracyMeters ?? DEFAULT_ACCEPTABLE_ACCURACY_METERS;
    const maximumObservationAgeMs = options.maximumObservationAgeMs ?? DEFAULT_MAXIMUM_OBSERVATION_AGE_MS;

    let watchId: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;
    let bestFresh: Coordinates | null = null;
    let lastFailure: GpsAcquisitionError | null = null;
    let resolvePromise!: (coordinates: Coordinates) => void;
    let rejectPromise!: (error: GpsAcquisitionError) => void;

    const cleanup = () => {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      if (watchId !== null) {
        geolocation.clearWatch(watchId);
        watchId = null;
      }
    };

    const resolveOnce = (coordinates: Coordinates) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolvePromise(coordinates);
    };

    const rejectOnce = (error: GpsAcquisitionError) => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectPromise(error);
    };

    const promise = new Promise<Coordinates>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;

      timer = setTimer(() => {
        if (bestFresh) resolveOnce(bestFresh);
        else rejectOnce(lastFailure || new GpsAcquisitionError("timeout", "Location request timed out."));
      }, timeoutMs);

      try {
        const createdWatchId = geolocation.watchPosition(
          (position) => {
            if (settled) return;
            const observedAtMs = position.timestamp;
            const ageMs = now() - observedAtMs;
            if (!Number.isFinite(observedAtMs) || ageMs > maximumObservationAgeMs || ageMs < -MAXIMUM_FUTURE_SKEW_MS) {
              return;
            }

            const coordinates: Coordinates = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracyMeters: position.coords.accuracy,
              observedAt: new Date(observedAtMs).toISOString(),
            };
            if (!bestFresh || coordinates.accuracyMeters < bestFresh.accuracyMeters) {
              bestFresh = coordinates;
            }
            if (coordinates.accuracyMeters <= acceptableAccuracyMeters) {
              resolveOnce(coordinates);
            }
          },
          (error) => {
            if (settled) return;
            const mapped = geolocationError(error);
            if (mapped.reason === "permission_denied") {
              rejectOnce(mapped);
            } else {
              lastFailure = mapped;
            }
          },
          {
            enableHighAccuracy: true,
            timeout: timeoutMs,
            maximumAge: options.fresh ? 0 : INITIAL_MAXIMUM_AGE_MS,
          },
        );
        watchId = createdWatchId;
        if (settled) cleanup();
      } catch {
        rejectOnce(new GpsAcquisitionError("unavailable", "Location information is unavailable."));
      }
    });

    const cancel = () => rejectOnce(new GpsAcquisitionError("cancelled", "Location request cancelled."));
    active = { promise, cancel };
    void promise.finally(() => {
      if (active?.promise === promise) active = null;
    }).catch(() => undefined);
    return promise;
  };

  return {
    acquire,
    cancel() {
      const current = active;
      active = null;
      current?.cancel();
    },
    isAcquiring() {
      return active !== null;
    },
  };
}

const defaultDriverLocationAcquirer = createDriverLocationAcquirer();

export function getCurrentLocation(options?: GpsAcquisitionOptions): Promise<Coordinates> {
  return defaultDriverLocationAcquirer.acquire(options);
}

export function cancelCurrentLocationAcquisition(): void {
  defaultDriverLocationAcquirer.cancel();
}

export function watchLocation(
  callback: (coords: Coordinates) => void,
  errorCallback?: (error: GeolocationPositionError) => void
): number {
  if (!navigator.geolocation) {
    throw new Error("Geolocation is not supported by this browser.");
  }

  return navigator.geolocation.watchPosition(
    (position) => {
      callback({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
        observedAt: new Date(position.timestamp).toISOString(),
      });
    },
    errorCallback,
    {
      enableHighAccuracy: true,
      timeout: DEFAULT_ACQUISITION_TIMEOUT_MS,
      maximumAge: INITIAL_MAXIMUM_AGE_MS,
    }
  );
}

export function clearLocationWatch(watchId: number): void {
  navigator.geolocation.clearWatch(watchId);
}

export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
