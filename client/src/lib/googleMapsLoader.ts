export const GOOGLE_MAPS_CALLBACK_NAME = "__creteXchangeFacilityBoundaryMapsReady";

type ImportLibrary = (libraryName: string) => Promise<unknown>;

type LoaderWindow = {
  google?: {
    maps?: {
      importLibrary?: ImportLibrary;
    };
  };
  [key: string]: unknown;
};

export interface GoogleMapsLibrary {
  Map: new (element: HTMLElement, options?: Record<string, unknown>) => any;
  Circle: new (options?: Record<string, unknown>) => any;
  Polygon: new (options?: Record<string, unknown>) => any;
}

interface GoogleMapsLoaderEnvironment {
  window: LoaderWindow;
  document: Document;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
  now?: () => number;
  bootstrapTimeoutMs?: number;
  pollIntervalMs?: number;
}

export interface GoogleMapsLoader {
  load(apiKey: string | undefined): Promise<GoogleMapsLibrary>;
}

export function createGoogleMapsLoader(environment: GoogleMapsLoaderEnvironment): GoogleMapsLoader {
  const schedule = environment.setTimeout ?? globalThis.setTimeout;
  const cancel = environment.clearTimeout ?? globalThis.clearTimeout;
  const now = environment.now ?? Date.now;
  const bootstrapTimeoutMs = environment.bootstrapTimeoutMs ?? 10_000;
  const pollIntervalMs = environment.pollIntervalMs ?? 25;
  let bootstrapPromise: Promise<ImportLibrary> | null = null;
  let mapsLibraryPromise: Promise<GoogleMapsLibrary> | null = null;

  const getImportLibrary = (): ImportLibrary | null => {
    const maps = environment.window.google?.maps;
    if (typeof maps?.importLibrary !== "function") return null;
    return maps.importLibrary.bind(maps);
  };

  const waitForExistingBootstrap = (script: HTMLScriptElement): Promise<ImportLibrary> => new Promise((resolve, reject) => {
    const deadline = now() + bootstrapTimeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timer !== undefined) cancel(timer);
      script.removeEventListener("error", fail);
    };
    const fail = () => {
      cleanup();
      reject(new Error("Google Maps bootstrap failed to load"));
    };
    const check = () => {
      const importLibrary = getImportLibrary();
      if (importLibrary) {
        cleanup();
        resolve(importLibrary);
        return;
      }
      if (now() >= deadline) {
        fail();
        return;
      }
      timer = schedule(check, pollIntervalMs);
    };

    script.addEventListener("error", fail, { once: true });
    check();
  });

  const loadBootstrap = (apiKey: string): Promise<ImportLibrary> => {
    const available = getImportLibrary();
    if (available) return Promise.resolve(available);
    if (bootstrapPromise) return bootstrapPromise;

    const pending = new Promise<ImportLibrary>((resolve, reject) => {
      const existing = environment.document.querySelector<HTMLScriptElement>('script[src*="maps.googleapis.com/maps/api/js"]');
      if (existing) {
        void waitForExistingBootstrap(existing).then(resolve, reject);
        return;
      }

      const script = environment.document.createElement("script");
      const callback = () => {
        try {
          const importLibrary = getImportLibrary();
          if (!importLibrary) throw new Error("Google Maps importLibrary is unavailable after bootstrap");
          resolve(importLibrary);
        } catch (error) {
          reject(error);
        } finally {
          if (environment.window[GOOGLE_MAPS_CALLBACK_NAME] === callback) {
            delete environment.window[GOOGLE_MAPS_CALLBACK_NAME];
          }
        }
      };
      const fail = () => {
        if (environment.window[GOOGLE_MAPS_CALLBACK_NAME] === callback) {
          delete environment.window[GOOGLE_MAPS_CALLBACK_NAME];
        }
        script.remove();
        reject(new Error("Google Maps bootstrap failed to load"));
      };

      environment.window[GOOGLE_MAPS_CALLBACK_NAME] = callback;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&callback=${GOOGLE_MAPS_CALLBACK_NAME}`;
      script.async = true;
      script.defer = true;
      script.dataset.creteGoogleMapsLoader = "true";
      script.addEventListener("error", fail, { once: true });
      environment.document.head.appendChild(script);
    });

    bootstrapPromise = pending.catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
    return bootstrapPromise;
  };

  const load = (apiKey: string | undefined): Promise<GoogleMapsLibrary> => {
    if (!apiKey || apiKey === "YOUR_API_KEY") {
      return Promise.reject(new Error("Google Maps browser key is unavailable"));
    }
    if (mapsLibraryPromise) return mapsLibraryPromise;

    const pending = loadBootstrap(apiKey).then(async (importLibrary) => {
      const library = await importLibrary("maps") as Partial<GoogleMapsLibrary>;
      if (typeof library.Map !== "function" || typeof library.Circle !== "function" || typeof library.Polygon !== "function") {
        throw new Error("Google Maps library constructors are unavailable");
      }
      return library as GoogleMapsLibrary;
    });

    mapsLibraryPromise = pending.catch((error) => {
      mapsLibraryPromise = null;
      throw error;
    });
    return mapsLibraryPromise;
  };

  return { load };
}

let browserLoader: GoogleMapsLoader | null = null;

export function loadGoogleMapsLibrary(apiKey: string | undefined): Promise<GoogleMapsLibrary> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Google Maps is only available in a browser"));
  }
  browserLoader ??= createGoogleMapsLoader({
    window: window as unknown as LoaderWindow,
    document,
  });
  return browserLoader.load(apiKey);
}
