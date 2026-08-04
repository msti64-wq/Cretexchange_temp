import { createHash } from "node:crypto";
import { area } from "@turf/area";
import { bbox } from "@turf/bbox";
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import { distance } from "@turf/distance";
import { lineString, point, polygon } from "@turf/helpers";
import { kinks } from "@turf/kinks";
import { pointToLineDistance } from "@turf/point-to-line-distance";
import type {
  ActivityGeofenceEvaluation,
  InsertActivityGeofenceEvaluation,
} from "@shared/schema";

export const FACILITY_GEOFENCE_STATES = [
  "INSIDE_APPROVED_BOUNDARY",
  "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE",
  "OUTSIDE_EXCEPTION_ZONE",
  "LOCATION_UNAVAILABLE",
  "LOCATION_ACCURACY_INSUFFICIENT",
  "GEOMETRY_UNAVAILABLE",
  "GEOMETRY_INVALID",
] as const;

export type FacilityGeofenceState = typeof FACILITY_GEOFENCE_STATES[number];
export type FacilityGeofenceMode = "radius" | "polygon";
export type FacilityGeofenceEvaluationPurpose = "selection_advisory" | "check_in" | "submission";
export type Position = [longitude: number, latitude: number];

export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: Position[][];
}

export interface FacilityGeofenceBoundaryRecord {
  id: string;
  locationId: string;
  zoneKey: string;
  version: number;
  mode: string;
  centerLatitude: string | number | null;
  centerLongitude: string | number | null;
  radiusMeters: string | number | null;
  geometryGeojson: unknown;
  exceptionDistanceMeters: string | number;
  geometryChecksum: string;
  status: string;
  effectiveFrom: Date | string | null;
  effectiveTo: Date | string | null;
  activatedAt: Date | string | null;
}

export interface FacilityGeofenceObservation {
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  observedAt?: Date | string | null;
}

export interface FacilityGeofenceResult {
  locationId: string;
  boundaryVersionId: string | null;
  boundaryVersion: number | null;
  state: FacilityGeofenceState;
  evaluatedAt: string;
  observationTimestamp: string | null;
  advisory: boolean;
  reasonCode: string;
  canSubmitException: boolean;
  signedDistanceMeters: number | null;
  outsideDistanceMeters: number | null;
  accuracyMeters: number | null;
  observationLatitude: number | null;
  observationLongitude: number | null;
  exceptionDistanceMeters: number | null;
}

export type FacilityGeofenceDriverProjection = Omit<FacilityGeofenceResult,
  | "boundaryVersion"
  | "signedDistanceMeters"
  | "outsideDistanceMeters"
  | "accuracyMeters"
  | "observationLatitude"
  | "observationLongitude"
  | "exceptionDistanceMeters"
>;

export interface FacilityGeofenceRepository {
  listActiveBoundaries(locationIds: string[], effectiveAt: Date): Promise<FacilityGeofenceBoundaryRecord[]>;
  createActivityEvaluation(input: InsertActivityGeofenceEvaluation): Promise<ActivityGeofenceEvaluation>;
}

export interface FacilityGeofenceConfig {
  primaryZoneKey: string;
  exceptionDistanceMeters: number;
  maximumGpsAgeMs: number;
  maximumGpsAccuracyMeters: number;
  maximumFutureObservationSkewMs: number;
  minimumPolygonAreaSquareMeters: number;
  maximumPolygonAreaSquareMeters: number;
  maximumPolygonSpanMeters: number;
  maximumDistinctPolygonVertices: number;
  maximumBatchLocations: number;
  maximumGeometryCacheEntries: number;
}

export const DEFAULT_FACILITY_GEOFENCE_CONFIG: Readonly<FacilityGeofenceConfig> = Object.freeze({
  primaryZoneKey: "primary",
  exceptionDistanceMeters: 1_609.344,
  maximumGpsAgeMs: 60_000,
  maximumGpsAccuracyMeters: 100,
  maximumFutureObservationSkewMs: 5_000,
  minimumPolygonAreaSquareMeters: 1,
  maximumPolygonAreaSquareMeters: 5_179_976.220672,
  maximumPolygonSpanMeters: 8_046.72,
  maximumDistinctPolygonVertices: 200,
  maximumBatchLocations: 100,
  maximumGeometryCacheEntries: 256,
});

type GeometryValidationSuccess = {
  valid: true;
  mode: FacilityGeofenceMode;
  checksum: string;
  center?: Position;
  radiusMeters?: number;
  polygon?: GeoJsonPolygon;
  areaSquareMeters?: number;
  spanMeters?: number;
};

export type FacilityGeofenceGeometryValidation = GeometryValidationSuccess | {
  valid: false;
  reasonCode: string;
};

type PreparedGeometry = GeometryValidationSuccess & { valid: true };

export interface PreparedActivityGeofenceEvaluation {
  persist: boolean;
  evidence: InsertActivityGeofenceEvaluation | null;
}

export type FacilityGeofenceAuditLogger = (
  event: "boundary_lookup_failed" | "geometry_invalid" | "evaluation_persist_failed",
  safeContext: { locationId: string; boundaryVersionId?: string | null; reasonCode: string },
) => void;

function numberValue(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function samePosition(left: Position, right: Position): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function validPosition(value: unknown): value is Position {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === "number"
    && Number.isFinite(value[0])
    && value[0] >= -180
    && value[0] <= 180
    && typeof value[1] === "number"
    && Number.isFinite(value[1])
    && value[1] >= -90
    && value[1] <= 90;
}

function isGeoJsonPolygon(value: unknown): value is GeoJsonPolygon {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GeoJsonPolygon>;
  return candidate.type === "Polygon" && Array.isArray(candidate.coordinates);
}

function canonicalGeometryPayload(input: {
  mode: FacilityGeofenceMode;
  center?: Position;
  radiusMeters?: number;
  polygon?: GeoJsonPolygon;
  exceptionDistanceMeters: number;
}): unknown {
  return input.mode === "radius"
    ? {
        mode: "radius",
        center: input.center,
        radiusMeters: input.radiusMeters,
        exceptionDistanceMeters: input.exceptionDistanceMeters,
      }
    : {
        mode: "polygon",
        geometry: input.polygon,
        exceptionDistanceMeters: input.exceptionDistanceMeters,
      };
}

export function calculateFacilityGeofenceChecksum(input: {
  mode: FacilityGeofenceMode;
  center?: Position;
  radiusMeters?: number;
  polygon?: GeoJsonPolygon;
  exceptionDistanceMeters: number;
}): string {
  return createHash("sha256").update(JSON.stringify(canonicalGeometryPayload(input))).digest("hex");
}

export function validateFacilityGeofenceBoundary(
  boundary: FacilityGeofenceBoundaryRecord,
  config: Readonly<FacilityGeofenceConfig> = DEFAULT_FACILITY_GEOFENCE_CONFIG,
): FacilityGeofenceGeometryValidation {
  const exceptionDistanceMeters = numberValue(boundary.exceptionDistanceMeters);
  if (exceptionDistanceMeters === null || exceptionDistanceMeters <= 0) {
    return { valid: false, reasonCode: "EXCEPTION_DISTANCE_INVALID" };
  }
  if (exceptionDistanceMeters > config.exceptionDistanceMeters) {
    return { valid: false, reasonCode: "EXCEPTION_DISTANCE_EXCEEDS_PLATFORM_LIMIT" };
  }

  if (boundary.mode === "radius") {
    const latitude = numberValue(boundary.centerLatitude);
    const longitude = numberValue(boundary.centerLongitude);
    const radiusMeters = numberValue(boundary.radiusMeters);
    if (latitude === null || longitude === null || !validPosition([longitude, latitude])) {
      return { valid: false, reasonCode: "RADIUS_CENTER_INVALID" };
    }
    if (radiusMeters === null || radiusMeters <= 0) {
      return { valid: false, reasonCode: "RADIUS_DISTANCE_INVALID" };
    }
    if (boundary.geometryGeojson !== null && boundary.geometryGeojson !== undefined) {
      return { valid: false, reasonCode: "RADIUS_GEOMETRY_CONFLICT" };
    }
    const center: Position = [longitude, latitude];
    const checksum = calculateFacilityGeofenceChecksum({
      mode: "radius",
      center,
      radiusMeters,
      exceptionDistanceMeters,
    });
    if (boundary.geometryChecksum !== checksum) {
      return { valid: false, reasonCode: "GEOMETRY_CHECKSUM_MISMATCH" };
    }
    return { valid: true, mode: "radius", center, radiusMeters, checksum };
  }

  if (boundary.mode !== "polygon") {
    return { valid: false, reasonCode: "BOUNDARY_MODE_INVALID" };
  }
  if (boundary.centerLatitude !== null || boundary.centerLongitude !== null || boundary.radiusMeters !== null) {
    return { valid: false, reasonCode: "POLYGON_RADIUS_FIELDS_CONFLICT" };
  }
  if (!isGeoJsonPolygon(boundary.geometryGeojson)) {
    return { valid: false, reasonCode: "POLYGON_GEOJSON_INVALID" };
  }
  if (boundary.geometryGeojson.coordinates.length !== 1) {
    return { valid: false, reasonCode: "POLYGON_SINGLE_EXTERIOR_RING_REQUIRED" };
  }

  const ring = boundary.geometryGeojson.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4 || !ring.every(validPosition)) {
    return { valid: false, reasonCode: "POLYGON_COORDINATES_INVALID" };
  }
  if (!samePosition(ring[0], ring[ring.length - 1])) {
    return { valid: false, reasonCode: "POLYGON_RING_NOT_CLOSED" };
  }

  const distinctVertices = ring.slice(0, -1);
  if (distinctVertices.length < 3) {
    return { valid: false, reasonCode: "POLYGON_TOO_FEW_DISTINCT_VERTICES" };
  }
  if (distinctVertices.length > config.maximumDistinctPolygonVertices) {
    return { valid: false, reasonCode: "POLYGON_VERTEX_LIMIT_EXCEEDED" };
  }
  const uniqueVertices = new Set(distinctVertices.map(([longitude, latitude]) => `${longitude}:${latitude}`));
  if (uniqueVertices.size !== distinctVertices.length) {
    return { valid: false, reasonCode: "POLYGON_DUPLICATE_VERTEX" };
  }
  for (let index = 1; index < ring.length; index += 1) {
    if (samePosition(ring[index - 1], ring[index])) {
      return { valid: false, reasonCode: "POLYGON_ADJACENT_DUPLICATE_VERTEX" };
    }
  }

  const longitudes = distinctVertices.map(([longitude]) => longitude);
  if (Math.max(...longitudes) - Math.min(...longitudes) > 180) {
    return { valid: false, reasonCode: "POLYGON_ANTIMERIDIAN_UNSUPPORTED" };
  }

  try {
    const polygonFeature = polygon([ring]);
    if (kinks(polygonFeature).features.length > 0) {
      return { valid: false, reasonCode: "POLYGON_SELF_INTERSECTION" };
    }
    const areaSquareMeters = area(polygonFeature);
    if (!Number.isFinite(areaSquareMeters) || areaSquareMeters < config.minimumPolygonAreaSquareMeters) {
      return { valid: false, reasonCode: "POLYGON_AREA_INSUFFICIENT" };
    }
    if (areaSquareMeters > config.maximumPolygonAreaSquareMeters) {
      return { valid: false, reasonCode: "POLYGON_AREA_LIMIT_EXCEEDED" };
    }
    const bounds = bbox(polygonFeature);
    const spanMeters = distance(point([bounds[0], bounds[1]]), point([bounds[2], bounds[3]]), { units: "meters" });
    if (!Number.isFinite(spanMeters) || spanMeters > config.maximumPolygonSpanMeters) {
      return { valid: false, reasonCode: "POLYGON_SPAN_LIMIT_EXCEEDED" };
    }
    const checksum = calculateFacilityGeofenceChecksum({
      mode: "polygon",
      polygon: boundary.geometryGeojson,
      exceptionDistanceMeters,
    });
    if (boundary.geometryChecksum !== checksum) {
      return { valid: false, reasonCode: "GEOMETRY_CHECKSUM_MISMATCH" };
    }
    return {
      valid: true,
      mode: "polygon",
      polygon: boundary.geometryGeojson,
      checksum,
      areaSquareMeters,
      spanMeters,
    };
  } catch {
    return { valid: false, reasonCode: "POLYGON_GEOJSON_INVALID" };
  }
}

function unavailableResult(input: {
  locationId: string;
  boundary?: FacilityGeofenceBoundaryRecord | null;
  state: FacilityGeofenceState;
  reasonCode: string;
  evaluatedAt: Date;
  observation?: FacilityGeofenceObservation | null;
  advisory: boolean;
}): FacilityGeofenceResult {
  const observedAt = dateValue(input.observation?.observedAt);
  const latitude = numberValue(input.observation?.latitude);
  const longitude = numberValue(input.observation?.longitude);
  const accuracyMeters = numberValue(input.observation?.accuracyMeters);
  const hasCompleteValidPosition = latitude !== null
    && longitude !== null
    && validPosition([longitude, latitude]);
  return {
    locationId: input.locationId,
    boundaryVersionId: input.boundary?.id ?? null,
    boundaryVersion: input.boundary?.version ?? null,
    state: input.state,
    evaluatedAt: input.evaluatedAt.toISOString(),
    observationTimestamp: observedAt?.toISOString() ?? null,
    advisory: input.advisory,
    reasonCode: input.reasonCode,
    canSubmitException: false,
    signedDistanceMeters: null,
    outsideDistanceMeters: null,
    accuracyMeters: accuracyMeters !== null && accuracyMeters >= 0 ? accuracyMeters : null,
    observationLatitude: hasCompleteValidPosition ? latitude : null,
    observationLongitude: hasCompleteValidPosition ? longitude : null,
    exceptionDistanceMeters: input.boundary ? numberValue(input.boundary.exceptionDistanceMeters) : null,
  };
}

function signedBoundaryDistanceMeters(
  geometry: PreparedGeometry,
  observationPosition: Position,
): number {
  if (geometry.mode === "radius") {
    const centerDistanceMeters = distance(point(geometry.center!), point(observationPosition), { units: "meters" });
    return centerDistanceMeters - geometry.radiusMeters!;
  }

  const polygonFeature = polygon(geometry.polygon!.coordinates);
  const observationPoint = point(observationPosition);
  const edgeDistanceMeters = pointToLineDistance(
    observationPoint,
    lineString(geometry.polygon!.coordinates[0]),
    { units: "meters", method: "geodesic" },
  );
  if (edgeDistanceMeters <= 1e-7) return 0;
  return booleanPointInPolygon(observationPoint, polygonFeature, { ignoreBoundary: false })
    ? -edgeDistanceMeters
    : edgeDistanceMeters;
}

export function projectFacilityGeofenceResultForDriver(
  result: FacilityGeofenceResult,
): FacilityGeofenceDriverProjection {
  return {
    locationId: result.locationId,
    boundaryVersionId: result.boundaryVersionId,
    state: result.state,
    evaluatedAt: result.evaluatedAt,
    observationTimestamp: result.observationTimestamp,
    advisory: result.advisory,
    reasonCode: result.reasonCode,
    canSubmitException: result.canSubmitException,
  };
}

export class FacilityGeofenceService {
  private readonly geometryCache = new Map<string, PreparedGeometry>();

  constructor(
    private readonly repository: FacilityGeofenceRepository,
    private readonly config: Readonly<FacilityGeofenceConfig> = DEFAULT_FACILITY_GEOFENCE_CONFIG,
    private readonly clock: () => Date = () => new Date(),
    private readonly auditLogger: FacilityGeofenceAuditLogger = () => undefined,
  ) {}

  async loadActiveBoundaries(locationIds: string[], effectiveAt = this.clock()): Promise<Map<string, FacilityGeofenceBoundaryRecord>> {
    const uniqueLocationIds = Array.from(new Set(locationIds.filter((value) => typeof value === "string" && value.length > 0)));
    if (uniqueLocationIds.length > this.config.maximumBatchLocations) {
      throw new Error("Facility geofence lookup exceeds the governed batch limit");
    }
    if (uniqueLocationIds.length === 0) return new Map();

    const rows = await this.repository.listActiveBoundaries(uniqueLocationIds, effectiveAt);
    const selected = new Map<string, FacilityGeofenceBoundaryRecord>();
    for (const row of rows) {
      if (row.zoneKey !== this.config.primaryZoneKey || row.status !== "active") continue;
      const from = dateValue(row.effectiveFrom);
      const to = dateValue(row.effectiveTo);
      if (!from || from.getTime() > effectiveAt.getTime() || (to && to.getTime() <= effectiveAt.getTime())) continue;
      const current = selected.get(row.locationId);
      if (!current || row.version > current.version) selected.set(row.locationId, row);
    }
    return selected;
  }

  async evaluateLocation(input: {
    locationId: string;
    observation?: FacilityGeofenceObservation | null;
    purpose: FacilityGeofenceEvaluationPurpose;
  }): Promise<FacilityGeofenceResult> {
    const evaluatedAt = this.clock();
    try {
      const boundary = (await this.loadActiveBoundaries([input.locationId], evaluatedAt)).get(input.locationId) ?? null;
      return this.evaluateBoundary({ ...input, boundary, evaluatedAt });
    } catch {
      this.auditLogger("boundary_lookup_failed", {
        locationId: input.locationId,
        reasonCode: "BOUNDARY_LOOKUP_UNAVAILABLE",
      });
      return unavailableResult({
        locationId: input.locationId,
        state: "GEOMETRY_UNAVAILABLE",
        reasonCode: "BOUNDARY_LOOKUP_UNAVAILABLE",
        evaluatedAt,
        observation: input.observation,
        advisory: input.purpose === "selection_advisory",
      });
    }
  }

  evaluateBoundary(input: {
    locationId: string;
    boundary?: FacilityGeofenceBoundaryRecord | null;
    observation?: FacilityGeofenceObservation | null;
    purpose: FacilityGeofenceEvaluationPurpose;
    evaluatedAt?: Date;
  }): FacilityGeofenceResult {
    const evaluatedAt = input.evaluatedAt ?? this.clock();
    const advisory = input.purpose === "selection_advisory";
    const observationLatitude = numberValue(input.observation?.latitude);
    const observationLongitude = numberValue(input.observation?.longitude);
    if (
      observationLatitude === null
      || observationLongitude === null
      || !validPosition([observationLongitude, observationLatitude])
    ) {
      return unavailableResult({
        locationId: input.locationId,
        boundary: input.boundary,
        state: "LOCATION_UNAVAILABLE",
        reasonCode: "LOCATION_COORDINATES_UNAVAILABLE",
        evaluatedAt,
        observation: input.observation,
        advisory,
      });
    }

    const observedAt = dateValue(input.observation?.observedAt);
    const accuracyMeters = numberValue(input.observation?.accuracyMeters);
    if (!observedAt || accuracyMeters === null || accuracyMeters < 0) {
      return unavailableResult({
        locationId: input.locationId,
        boundary: input.boundary,
        state: "LOCATION_ACCURACY_INSUFFICIENT",
        reasonCode: !observedAt ? "LOCATION_TIMESTAMP_INVALID" : "LOCATION_ACCURACY_MISSING",
        evaluatedAt,
        observation: input.observation,
        advisory,
      });
    }
    const ageMs = evaluatedAt.getTime() - observedAt.getTime();
    if (ageMs > this.config.maximumGpsAgeMs || ageMs < -this.config.maximumFutureObservationSkewMs) {
      return unavailableResult({
        locationId: input.locationId,
        boundary: input.boundary,
        state: "LOCATION_ACCURACY_INSUFFICIENT",
        reasonCode: "LOCATION_TIMESTAMP_OUTSIDE_WINDOW",
        evaluatedAt,
        observation: input.observation,
        advisory,
      });
    }
    if (accuracyMeters > this.config.maximumGpsAccuracyMeters) {
      return unavailableResult({
        locationId: input.locationId,
        boundary: input.boundary,
        state: "LOCATION_ACCURACY_INSUFFICIENT",
        reasonCode: "LOCATION_ACCURACY_EXCEEDS_LIMIT",
        evaluatedAt,
        observation: input.observation,
        advisory,
      });
    }
    if (!input.boundary) {
      return unavailableResult({
        locationId: input.locationId,
        state: "GEOMETRY_UNAVAILABLE",
        reasonCode: "NO_ACTIVE_PRIMARY_BOUNDARY",
        evaluatedAt,
        observation: input.observation,
        advisory,
      });
    }

    const geometry = this.getPreparedGeometry(input.boundary);
    if (!geometry.valid) {
      this.auditLogger("geometry_invalid", {
        locationId: input.locationId,
        boundaryVersionId: input.boundary.id,
        reasonCode: geometry.reasonCode,
      });
      return unavailableResult({
        locationId: input.locationId,
        boundary: input.boundary,
        state: "GEOMETRY_INVALID",
        reasonCode: geometry.reasonCode,
        evaluatedAt,
        observation: input.observation,
        advisory,
      });
    }

    const signedDistanceMeters = signedBoundaryDistanceMeters(
      geometry,
      [observationLongitude, observationLatitude],
    );
    const outsideDistanceMeters = Math.max(0, signedDistanceMeters);
    const exceptionDistanceMeters = numberValue(input.boundary.exceptionDistanceMeters)!;
    const overlapsBoundary = accuracyMeters > 0
      && signedDistanceMeters - accuracyMeters <= 0
      && signedDistanceMeters + accuracyMeters >= 0;
    const overlapsExceptionThreshold = accuracyMeters > 0
      && outsideDistanceMeters > 0
      && outsideDistanceMeters - accuracyMeters <= exceptionDistanceMeters
      && outsideDistanceMeters + accuracyMeters >= exceptionDistanceMeters;

    if (overlapsBoundary || overlapsExceptionThreshold) {
      return {
        locationId: input.locationId,
        boundaryVersionId: input.boundary.id,
        boundaryVersion: input.boundary.version,
        state: "LOCATION_ACCURACY_INSUFFICIENT",
        evaluatedAt: evaluatedAt.toISOString(),
        observationTimestamp: observedAt.toISOString(),
        advisory,
        reasonCode: overlapsBoundary ? "LOCATION_UNCERTAINTY_OVERLAPS_BOUNDARY" : "LOCATION_UNCERTAINTY_OVERLAPS_EXCEPTION_THRESHOLD",
        canSubmitException: false,
        signedDistanceMeters,
        outsideDistanceMeters,
        accuracyMeters,
        observationLatitude,
        observationLongitude,
        exceptionDistanceMeters,
      };
    }

    const state: FacilityGeofenceState = signedDistanceMeters <= 0
      ? "INSIDE_APPROVED_BOUNDARY"
      : outsideDistanceMeters <= exceptionDistanceMeters
        ? "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE"
        : "OUTSIDE_EXCEPTION_ZONE";

    return {
      locationId: input.locationId,
      boundaryVersionId: input.boundary.id,
      boundaryVersion: input.boundary.version,
      state,
      evaluatedAt: evaluatedAt.toISOString(),
      observationTimestamp: observedAt.toISOString(),
      advisory,
      reasonCode: state,
      canSubmitException: state === "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE",
      signedDistanceMeters,
      outsideDistanceMeters,
      accuracyMeters,
      observationLatitude,
      observationLongitude,
      exceptionDistanceMeters,
    };
  }

  prepareActivityEvaluation(input: {
    result: FacilityGeofenceResult;
    purpose: FacilityGeofenceEvaluationPurpose;
    idempotencyKey: string;
    activityId?: string | null;
    workflowReference?: string | null;
    exceptionAcknowledgementCode?: string | null;
    driverNote?: string | null;
    evidenceComplete: boolean;
  }): PreparedActivityGeofenceEvaluation {
    if (input.purpose === "selection_advisory") {
      return { persist: false, evidence: null };
    }
    if (!input.activityId && !input.workflowReference) {
      throw new Error("A durable geofence evaluation requires an activity or workflow reference");
    }
    if (!input.idempotencyKey || input.idempotencyKey.length > 240) {
      throw new Error("A bounded geofence evaluation idempotency key is required");
    }
    const driverNote = input.driverNote?.trim() || null;
    if (driverNote && driverNote.length > 500) {
      throw new Error("Geofence evaluation Driver note exceeds 500 characters");
    }
    const evidence: InsertActivityGeofenceEvaluation = {
      activityId: input.activityId ?? null,
      workflowReference: input.workflowReference ?? null,
      locationId: input.result.locationId,
      boundaryVersionId: input.result.boundaryVersionId,
      boundaryVersion: input.result.boundaryVersion,
      evaluationPurpose: input.purpose,
      resultState: input.result.state,
      reasonCode: input.result.reasonCode,
      observationLatitude: input.result.observationLatitude?.toString() ?? null,
      observationLongitude: input.result.observationLongitude?.toString() ?? null,
      accuracyMeters: input.result.accuracyMeters?.toString() ?? null,
      observedAt: input.result.observationTimestamp ? new Date(input.result.observationTimestamp) : null,
      evaluatedAt: new Date(input.result.evaluatedAt),
      signedDistanceMeters: input.result.signedDistanceMeters?.toString() ?? null,
      outsideDistanceMeters: input.result.outsideDistanceMeters?.toString() ?? null,
      exceptionDistanceMeters: input.result.exceptionDistanceMeters?.toString() ?? null,
      exceptionAcknowledgementCode: input.exceptionAcknowledgementCode ?? null,
      driverNote,
      evidenceComplete: input.evidenceComplete,
      idempotencyKey: input.idempotencyKey,
    };
    return { persist: true, evidence };
  }

  async persistActivityEvaluation(
    prepared: PreparedActivityGeofenceEvaluation,
  ): Promise<ActivityGeofenceEvaluation | null> {
    if (!prepared.persist || !prepared.evidence) return null;
    try {
      return await this.repository.createActivityEvaluation(prepared.evidence);
    } catch (error) {
      this.auditLogger("evaluation_persist_failed", {
        locationId: prepared.evidence.locationId,
        boundaryVersionId: prepared.evidence.boundaryVersionId,
        reasonCode: "EVALUATION_PERSIST_FAILED",
      });
      throw error;
    }
  }

  private getPreparedGeometry(boundary: FacilityGeofenceBoundaryRecord): FacilityGeofenceGeometryValidation {
    const cacheKey = `${boundary.id}:${boundary.geometryChecksum}`;
    const cached = this.geometryCache.get(cacheKey);
    if (cached) return cached;

    const validation = validateFacilityGeofenceBoundary(boundary, this.config);
    if (!validation.valid) return validation;
    if (boundary.activatedAt && boundary.status === "active") {
      this.geometryCache.set(cacheKey, validation);
      while (this.geometryCache.size > this.config.maximumGeometryCacheEntries) {
        const oldestKey = this.geometryCache.keys().next().value;
        if (typeof oldestKey !== "string") break;
        this.geometryCache.delete(oldestKey);
      }
    }
    return validation;
  }
}

// Legacy isolation note: shared/photoVerification.ts remains authoritative for
// the existing <=1 mile verified, >1 through 3 mile warning, and >3 mile failed
// behavior. The two inline 500-foot rubble arrival/completion checks in
// server/routes.ts also remain untouched. Later work may adapt those callers to
// this service only behind the separately governed transition/enforcement flags.
