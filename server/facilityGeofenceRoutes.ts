import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { FEATURE_FLAGS } from "@shared/featureFlags";
import type { FacilityGeofenceBoundary } from "@shared/schema";
import { isAuthenticated } from "./tokenAuth";
import { storage as defaultStorage, type IStorage } from "./storage";
import {
  calculateFacilityGeofenceChecksum,
  DEFAULT_FACILITY_GEOFENCE_CONFIG,
  validateFacilityGeofenceBoundary,
  type GeoJsonPolygon,
  type Position,
} from "./facilityGeofenceService";
import { DrizzleFacilityGeofenceRepository } from "./facilityGeofenceRepository";
import { isGeofenceFeatureEnabled } from "./geofenceFeatureFlags";

const pointSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);
const polygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(pointSchema).min(4)).length(1),
});
const boundaryInputSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("radius"),
    center: pointSchema,
    radiusMeters: z.number().positive().max(8_046.72),
    exceptionDistanceMeters: z.number().positive().max(DEFAULT_FACILITY_GEOFENCE_CONFIG.exceptionDistanceMeters).default(DEFAULT_FACILITY_GEOFENCE_CONFIG.exceptionDistanceMeters),
  }),
  z.object({
    mode: z.literal("polygon"),
    geometry: polygonSchema,
    exceptionDistanceMeters: z.number().positive().max(DEFAULT_FACILITY_GEOFENCE_CONFIG.exceptionDistanceMeters).default(DEFAULT_FACILITY_GEOFENCE_CONFIG.exceptionDistanceMeters),
  }),
]);
const activationSchema = z.object({
  confirmationAcknowledged: z.literal(true),
  reasonCode: z.string().trim().min(3).max(80),
});
const assistanceSchema = z.object({
  boundaryVersionId: z.string().uuid(),
  reasonCode: z.enum(["MAP_HELP", "BOUNDARY_CORRECTION_HELP", "LOCATION_DATA_HELP", "OTHER"]),
  note: z.string().trim().max(500).optional(),
});

type Repository = DrizzleFacilityGeofenceRepository;

function requestId(req: Request): string {
  const supplied = req.header("x-request-id");
  return supplied && supplied.length <= 160 ? supplied : randomUUID();
}

function safeBoundary(boundary: FacilityGeofenceBoundary) {
  return {
    id: boundary.id,
    locationId: boundary.locationId,
    version: boundary.version,
    mode: boundary.mode,
    center: boundary.mode === "radius"
      ? [Number(boundary.centerLongitude), Number(boundary.centerLatitude)]
      : null,
    radiusMeters: boundary.radiusMeters === null ? null : Number(boundary.radiusMeters),
    geometry: boundary.mode === "polygon" ? boundary.geometryGeojson : null,
    exceptionDistanceMeters: Number(boundary.exceptionDistanceMeters),
    status: boundary.status,
    effectiveFrom: boundary.effectiveFrom,
    effectiveTo: boundary.effectiveTo,
    createdAt: boundary.createdAt,
    activatedAt: boundary.activatedAt,
  };
}

function candidateFromInput(locationId: string, input: z.infer<typeof boundaryInputSchema>) {
  const common = {
    id: "validation-preview",
    locationId,
    zoneKey: "primary",
    version: 1,
    exceptionDistanceMeters: input.exceptionDistanceMeters,
    status: "draft",
    effectiveFrom: null,
    effectiveTo: null,
    activatedAt: null,
  };
  if (input.mode === "radius") {
    const center = input.center as Position;
    return {
      ...common,
      mode: "radius",
      centerLatitude: center[1],
      centerLongitude: center[0],
      radiusMeters: input.radiusMeters,
      geometryGeojson: null,
      geometryChecksum: calculateFacilityGeofenceChecksum({
        mode: "radius",
        center,
        radiusMeters: input.radiusMeters,
        exceptionDistanceMeters: input.exceptionDistanceMeters,
      }),
    };
  }
  const geometry = input.geometry as GeoJsonPolygon;
  return {
    ...common,
    mode: "polygon",
    centerLatitude: null,
    centerLongitude: null,
    radiusMeters: null,
    geometryGeojson: geometry,
    geometryChecksum: calculateFacilityGeofenceChecksum({
      mode: "polygon",
      polygon: geometry,
      exceptionDistanceMeters: input.exceptionDistanceMeters,
    }),
  };
}

export function registerFacilityGeofenceRoutes(
  app: Express,
  dependencies: { storage?: IStorage; repository?: Repository } = {},
) {
  const storage = dependencies.storage || defaultStorage;
  const repository = dependencies.repository || new DrizzleFacilityGeofenceRepository();

  async function authorizeOwner(req: any, res: Response, locationId: string) {
    const user = await storage.getUser(req.user.id);
    if (!user || user.role !== "owner") {
      res.status(403).json({ message: "Facility Owner access required" });
      return null;
    }
    const enabled = await isGeofenceFeatureEnabled(
      storage,
      FEATURE_FLAGS.GEOFENCE_OWNER_BOUNDARY_MANAGEMENT,
      user.id,
      user.role,
    );
    if (!enabled) {
      res.status(404).json({ message: "Facility boundary management is not available" });
      return null;
    }
    const [owner, location] = await Promise.all([
      storage.getOwner(user.id),
      storage.getWashoutLocation(locationId),
    ]);
    if (!owner || !location || location.ownerId !== owner.id) {
      res.status(404).json({ message: "Recovery Facility not found" });
      return null;
    }
    return { user, owner, location };
  }

  app.get("/api/owners/locations/:locationId/geofence", isAuthenticated, async (req: any, res) => {
    try {
      const access = await authorizeOwner(req, res, req.params.locationId);
      if (!access) return;
      const [versions, events] = await Promise.all([
        repository.listBoundaryVersions(access.location.id),
        repository.listRevisionEvents(access.location.id),
      ]);
      const active = versions.find((row) => row.status === "active") || null;
      res.json({
        facility: {
          id: access.location.id,
          name: access.location.name,
          latitude: Number(access.location.latitude),
          longitude: Number(access.location.longitude),
        },
        readiness: active ? "configured" : "not_configured",
        active: active ? safeBoundary(active) : null,
        versions: versions.map(safeBoundary),
        history: events.map((event) => ({
          id: event.id,
          boundaryVersionId: event.boundaryVersionId,
          eventType: event.eventType,
          actorRole: event.actorRole,
          reasonCode: event.reasonCode,
          safeMetadata: event.safeMetadata,
          createdAt: event.createdAt,
        })),
      });
    } catch (error) {
      console.error("Owner geofence read failed", { locationId: req.params.locationId, message: error instanceof Error ? error.message : "unknown" });
      res.status(500).json({ message: "Unable to load Facility boundary" });
    }
  });

  app.post("/api/owners/locations/:locationId/geofence/validate", isAuthenticated, async (req: any, res) => {
    const access = await authorizeOwner(req, res, req.params.locationId);
    if (!access) return;
    const parsed = boundaryInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ valid: false, reasonCode: "BOUNDARY_INPUT_INVALID", issues: parsed.error.issues });
    const candidate = candidateFromInput(access.location.id, parsed.data);
    const validation = validateFacilityGeofenceBoundary(candidate);
    return res.status(validation.valid ? 200 : 422).json(validation);
  });

  app.post("/api/owners/locations/:locationId/geofence/drafts", isAuthenticated, async (req: any, res) => {
    try {
      const access = await authorizeOwner(req, res, req.params.locationId);
      if (!access) return;
      const parsed = boundaryInputSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Boundary input is invalid", issues: parsed.error.issues });
      const candidate = candidateFromInput(access.location.id, parsed.data);
      const validation = validateFacilityGeofenceBoundary(candidate);
      if (!validation.valid) return res.status(422).json(validation);
      const id = requestId(req);
      const draft = await repository.createDraft({
        boundary: {
          locationId: access.location.id,
          zoneKey: "primary",
          mode: candidate.mode,
          centerLatitude: candidate.centerLatitude === null ? null : String(candidate.centerLatitude),
          centerLongitude: candidate.centerLongitude === null ? null : String(candidate.centerLongitude),
          radiusMeters: candidate.radiusMeters === null ? null : String(candidate.radiusMeters),
          geometryGeojson: candidate.geometryGeojson,
          exceptionDistanceMeters: String(candidate.exceptionDistanceMeters),
          geometryChecksum: candidate.geometryChecksum,
          status: "draft",
          effectiveFrom: null,
          effectiveTo: null,
          previousVersionId: null,
          createdBy: access.user.id,
          activatedBy: null,
          activatedAt: null,
        },
        revision: {
          locationId: access.location.id,
          eventType: "draft_created",
          actorUserId: access.user.id,
          actorRole: "owner",
          reasonCode: "OWNER_DRAFT_CREATED",
          requestId: id,
          idempotencyKey: `${id}:draft`,
          safeMetadata: { mode: candidate.mode },
        },
      });
      res.status(201).json({ boundary: safeBoundary(draft), validation });
    } catch (error) {
      console.error("Owner geofence draft failed", { locationId: req.params.locationId, message: error instanceof Error ? error.message : "unknown" });
      res.status(500).json({ message: "Unable to save Facility boundary draft" });
    }
  });

  app.post("/api/owners/locations/:locationId/geofence/versions/:boundaryVersionId/activate", isAuthenticated, async (req: any, res) => {
    try {
      const access = await authorizeOwner(req, res, req.params.locationId);
      if (!access) return;
      const parsed = activationSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Explicit activation confirmation and reason are required" });
      const draft = await repository.getBoundaryVersion(req.params.boundaryVersionId);
      if (!draft || draft.locationId !== access.location.id || draft.status !== "draft") return res.status(404).json({ message: "Boundary draft not found" });
      const validation = validateFacilityGeofenceBoundary(draft);
      if (!validation.valid) return res.status(422).json(validation);
      const activated = await repository.activateDraft({
        boundaryVersionId: draft.id,
        locationId: access.location.id,
        actorUserId: access.user.id,
        requestId: requestId(req),
        reasonCode: parsed.data.reasonCode,
      });
      res.json({ boundary: safeBoundary(activated) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      if (message === "GEOFENCE_DRAFT_NOT_FOUND") return res.status(409).json({ message: "Boundary draft is no longer available" });
      console.error("Owner geofence activation failed", { locationId: req.params.locationId, message });
      res.status(500).json({ message: "Unable to activate Facility boundary" });
    }
  });

  app.post("/api/owners/locations/:locationId/geofence/assistance", isAuthenticated, async (req: any, res) => {
    const access = await authorizeOwner(req, res, req.params.locationId);
    if (!access) return;
    const parsed = assistanceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Assistance request is invalid" });
    const boundary = await repository.getBoundaryVersion(parsed.data.boundaryVersionId);
    if (!boundary || boundary.locationId !== access.location.id) return res.status(404).json({ message: "Boundary version not found" });
    const id = requestId(req);
    await repository.appendRevisionEvent({
      locationId: access.location.id,
      boundaryVersionId: boundary.id,
      eventType: "assistance_requested",
      actorUserId: access.user.id,
      actorRole: "owner",
      reasonCode: parsed.data.reasonCode,
      requestId: id,
      idempotencyKey: `${id}:assistance:${boundary.id}`,
      safeMetadata: parsed.data.note ? { note: parsed.data.note } : {},
    });
    res.status(202).json({ accepted: true });
  });
}
