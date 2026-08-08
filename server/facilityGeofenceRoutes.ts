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
  FacilityGeofenceService,
  projectFacilityGeofenceResultForDriver,
} from "./facilityGeofenceService";
import { DrizzleFacilityGeofenceRepository } from "./facilityGeofenceRepository";
import { isGeofenceFeatureEnabled } from "./geofenceFeatureFlags";
import { emitNotificationBestEffort, emitRoleNotificationBestEffort } from "./notificationService";

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
const temporaryContextSchema = z.object({
  confirmationAcknowledged: z.literal(true),
  note: z.string().trim().min(3).max(500),
});
const advisorySchema = z.object({
  locationIds: z.array(z.string().uuid()).min(1).max(DEFAULT_FACILITY_GEOFENCE_CONFIG.maximumBatchLocations),
  materialSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  observation: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number().nonnegative(),
    observedAt: z.string().datetime({ offset: true }),
  }).nullable(),
});
const singleAdvisorySchema = z.object({
  observation: advisorySchema.shape.observation,
});
const submissionPreflightSchema = z.object({
  observation: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number().nonnegative(),
    observedAt: z.string().datetime({ offset: true }),
  }),
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
  const evaluator = new FacilityGeofenceService(repository);

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
    const notificationsEnabled = await isGeofenceFeatureEnabled(
      storage,
      FEATURE_FLAGS.GEOFENCE_NOTIFICATIONS,
      access.user.id,
      access.user.role,
      access.location.id,
    );
    if (notificationsEnabled) {
      await emitNotificationBestEffort({
        userId: access.user.id,
        recipientRole: "owner",
        templateKey: "owner_geofence_assistance_recorded",
        title: "Facility boundary assistance requested",
        message: `Your assistance request for ${access.location.name} was recorded for Platform Operations.`,
        deepLink: `/locations/${access.location.id}/geofence`,
        metadata: { facilityName: access.location.name, status: "assistance_requested" },
        sourceEntityType: "facility_geofence_boundary",
        sourceEntityId: boundary.id,
        idempotencyKey: `${id}:assistance:owner`,
      });
      await Promise.all((["admin", "super_admin"] as const).map((recipientRole) => emitRoleNotificationBestEffort({
        recipientRole,
        templateKey: "admin_geofence_assistance_requested",
        title: "Facility boundary assistance requested",
        message: `A Facility Owner requested boundary assistance for ${access.location.name}.`,
        deepLink: "/notifications",
        metadata: { facilityName: access.location.name, status: "assistance_requested" },
        sourceEntityType: "facility_geofence_boundary",
        sourceEntityId: boundary.id,
        idempotencyKey: `${id}:assistance:${recipientRole}`,
      })));
    }
    res.status(202).json({ accepted: true });
  });

  app.post("/api/drivers/locations/geofence-status", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || user.role !== "driver") return res.status(403).json({ message: "Driver access required" });
      const enabled = await isGeofenceFeatureEnabled(storage, FEATURE_FLAGS.GEOFENCE_ADVISORY_EVALUATION, user.id, user.role);
      if (!enabled) return res.status(404).json({ message: "Facility boundary advisory is not available" });
      const parsed = advisorySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Facility advisory request is invalid", issues: parsed.error.issues });

      const eligible = await storage.getActiveLocationsAcceptingMaterial(parsed.data.materialSlug);
      const eligibleIds = new Set(eligible.map((location: { id: string }) => location.id));
      const locationIds = Array.from(new Set(parsed.data.locationIds)).filter((locationId) => eligibleIds.has(locationId));
      if (locationIds.length !== new Set(parsed.data.locationIds).size) {
        return res.status(403).json({ message: "One or more Recovery Facilities are not eligible for the selected material" });
      }

      const evaluatedAt = new Date();
      const boundaries = await evaluator.loadActiveBoundaries(locationIds, evaluatedAt);
      const results = locationIds.map((locationId) => projectFacilityGeofenceResultForDriver(
        evaluator.evaluateBoundary({
          locationId,
          boundary: boundaries.get(locationId) || null,
          observation: parsed.data.observation,
          purpose: "selection_advisory",
          evaluatedAt,
        }),
      ));
      const responseComplete = results.length === locationIds.length
        && locationIds.every((locationId) => results.some((result) => result.locationId === locationId));
      if (!responseComplete) {
        console.error("Driver Facility advisory response incomplete", {
          requestedCount: locationIds.length,
          resultCount: results.length,
        });
        return res.status(503).json({ message: "Facility boundary status response was incomplete", code: "ADVISORY_RESPONSE_INCOMPLETE" });
      }

      console.info("Driver Facility advisory evaluated", {
        requestedCount: locationIds.length,
        resultCount: results.length,
        observationPresent: parsed.data.observation !== null,
        responseComplete,
        results: results.map((result) => ({
          locationId: result.locationId,
          state: result.state,
          reasonCode: result.reasonCode,
          activeBoundaryPresent: result.boundaryVersionId !== null,
        })),
      });
      res.json({ enabled: true, complete: true, results });
    } catch (error) {
      console.error("Driver Facility advisory failed", { userId: req.user?.id, message: error instanceof Error ? error.message : "unknown" });
      res.status(503).json({ message: "Facility boundary status could not be confirmed" });
    }
  });

  app.post("/api/drivers/locations/:locationId/geofence-advisory", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || user.role !== "driver") return res.status(403).json({ message: "Driver access required" });
      const enabled = await isGeofenceFeatureEnabled(storage, FEATURE_FLAGS.GEOFENCE_ADVISORY_EVALUATION, user.id, user.role);
      if (!enabled) return res.status(404).json({ message: "Facility boundary advisory is not available" });
      const parsed = singleAdvisorySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Facility advisory request is invalid", issues: parsed.error.issues });

      const driver = await storage.getDriver(user.id);
      if (!driver?.activeMaterialSlug) return res.status(409).json({ message: "Select a material before checking in" });
      const eligible = await storage.getActiveLocationsAcceptingMaterial(driver.activeMaterialSlug);
      if (!eligible.some((location: { id: string }) => location.id === req.params.locationId)) {
        return res.status(403).json({ message: "Recovery Facility is not eligible for the selected material" });
      }

      const result = await evaluator.evaluateLocation({
        locationId: req.params.locationId,
        observation: parsed.data.observation,
        purpose: "selection_advisory",
      });
      res.json(projectFacilityGeofenceResultForDriver(result));
    } catch (error) {
      console.error("Driver check-in Facility advisory failed", { locationId: req.params.locationId, message: error instanceof Error ? error.message : "unknown" });
      res.status(503).json({ message: "Facility boundary status could not be confirmed" });
    }
  });

  app.post("/api/drivers/locations/:locationId/geofence-check", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || user.role !== "driver") return res.status(403).json({ message: "Driver access required" });
      const enabled = await isGeofenceFeatureEnabled(
        storage,
        FEATURE_FLAGS.GEOFENCE_SUBMISSION_ENFORCEMENT,
        user.id,
        user.role,
        req.params.locationId,
      );
      if (!enabled) return res.status(404).json({ message: "Facility boundary enforcement is not available" });
      const parsed = submissionPreflightSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Current location evidence is invalid" });
      const driver = await storage.getDriver(user.id);
      if (!driver?.activeMaterialSlug) return res.status(409).json({ message: "Select a material before checkout" });
      const eligible = await storage.getActiveLocationsAcceptingMaterial(driver.activeMaterialSlug);
      if (!eligible.some((location: { id: string }) => location.id === req.params.locationId)) return res.status(403).json({ message: "Recovery Facility is not eligible for the selected material" });
      const result = await evaluator.evaluateLocation({ locationId: req.params.locationId, observation: parsed.data.observation, purpose: "check_in" });
      res.json(projectFacilityGeofenceResultForDriver(result));
    } catch (error) {
      console.error("Driver Facility boundary preflight failed", { locationId: req.params.locationId, message: error instanceof Error ? error.message : "unknown" });
      res.status(503).json({ message: "Location could not be confirmed" });
    }
  });

  app.post("/api/owners/activities/:activityId/geofence/temporary-context", isAuthenticated, async (req: any, res) => {
    try {
      const activity = await storage.getWashoutActivity(req.params.activityId);
      if (!activity) return res.status(404).json({ message: "Material Recovery Activity not found" });
      const access = await authorizeOwner(req, res, activity.locationId);
      if (!access) return;
      const parsed = temporaryContextSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Temporary context confirmation and note are required" });
      const evaluation = await repository.getLatestActivityEvaluation(activity.id);
      if (!evaluation || evaluation.resultState !== "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE" || !evaluation.boundaryVersionId) {
        return res.status(409).json({ message: "This activity does not have a governed boundary exception" });
      }
      const id = requestId(req);
      await repository.appendRevisionEvent({
        locationId: activity.locationId,
        boundaryVersionId: evaluation.boundaryVersionId,
        eventType: "correction_recorded",
        actorUserId: access.user.id,
        actorRole: "owner",
        reasonCode: "TEMPORARY_EXCEPTION_CONTEXT",
        requestId: id,
        idempotencyKey: `${id}:temporary-context:${activity.id}`,
        safeMetadata: { activityId: activity.id, note: parsed.data.note },
      });
      res.status(201).json({ recorded: true });
    } catch (error) {
      console.error("Owner temporary boundary context failed", { activityId: req.params.activityId, message: error instanceof Error ? error.message : "unknown" });
      res.status(500).json({ message: "Unable to record temporary boundary context" });
    }
  });

  app.get("/api/admin/geofence/activities/:activityId/context", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !["admin", "super_admin"].includes(user.role)) return res.status(403).json({ message: "Admin access required" });
      const evaluation = await repository.getLatestActivityEvaluation(req.params.activityId);
      if (!evaluation) return res.status(404).json({ message: "Facility boundary context not found" });
      const enabled = await isGeofenceFeatureEnabled(
        storage,
        FEATURE_FLAGS.GEOFENCE_NOTIFICATIONS,
        user.id,
        user.role,
        evaluation.locationId,
      );
      if (!enabled) return res.status(404).json({ message: "Facility boundary context is not available" });
      res.json({
        activityId: req.params.activityId,
        state: evaluation.resultState,
        reasonCode: evaluation.reasonCode,
        boundaryVersion: evaluation.boundaryVersion,
        acknowledgementCode: evaluation.exceptionAcknowledgementCode,
        driverNote: evaluation.driverNote,
        evidenceComplete: evaluation.evidenceComplete,
        evaluatedAt: evaluation.evaluatedAt,
      });
    } catch (error) {
      console.error("Admin geofence context failed", { activityId: req.params.activityId, message: error instanceof Error ? error.message : "unknown" });
      res.status(500).json({ message: "Unable to load Facility boundary context" });
    }
  });
}
