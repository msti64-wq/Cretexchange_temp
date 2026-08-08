import { randomUUID } from "node:crypto";
import type { Express } from "express";
import { z } from "zod";
import { isFacilityScopedGeofenceFeatureFlag } from "@shared/featureFlags";
import { isAuthenticated } from "./tokenAuth";
import { storage as defaultStorage, type IStorage } from "./storage";

type FacilityFeatureControlStorage = Pick<IStorage,
  | "getUser"
  | "getWashoutLocation"
  | "listFacilityFeatureFlagOverrides"
  | "listFacilityFeatureFlagOverrideEvents"
  | "setFacilityFeatureFlagOverride"
>;

const updateSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().trim().min(3).max(500),
}).strict();

function isAdmin(role?: string): role is "admin" | "super_admin" {
  return role === "admin" || role === "super_admin";
}

export function registerFacilityFeatureControlRoutes(
  app: Express,
  dependencies: { storage?: FacilityFeatureControlStorage } = {},
) {
  const storage = dependencies.storage || defaultStorage;

  // Facility-scoped controls are a separate, narrowly governed pilot surface.
  // Owner and Driver identities cannot read or mutate administrative rows.
  app.get("/api/admin/facilities/:locationId/geofence-controls", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !isAdmin(user.role)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const locationId = z.string().uuid().safeParse(req.params.locationId);
      if (!locationId.success) return res.status(400).json({ message: "Invalid Facility reference" });
      const location = await storage.getWashoutLocation(locationId.data);
      if (!location) return res.status(404).json({ message: "Recovery Facility not found" });
      const [overrides, history] = await Promise.all([
        storage.listFacilityFeatureFlagOverrides(locationId.data),
        storage.listFacilityFeatureFlagOverrideEvents(locationId.data, 100),
      ]);
      return res.json({ facilityId: locationId.data, overrides, history });
    } catch (error) {
      console.error("Facility geofence control read failed", {
        locationId: req.params.locationId,
        message: error instanceof Error ? error.message : "unknown",
      });
      return res.status(500).json({ message: "Unable to load Facility geofence controls" });
    }
  });

  app.put("/api/admin/facilities/:locationId/geofence-controls/:flagKey", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !isAdmin(user.role)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const locationId = z.string().uuid().safeParse(req.params.locationId);
      if (!locationId.success) return res.status(400).json({ message: "Invalid Facility reference" });
      if (!isFacilityScopedGeofenceFeatureFlag(req.params.flagKey)) {
        return res.status(400).json({ message: "This feature cannot be controlled by Facility" });
      }
      const body = updateSchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({ message: "Enabled state and governance reason are required" });
      }

      const suppliedRequestId = req.header("x-request-id");
      const requestId = suppliedRequestId && suppliedRequestId.length <= 160
        ? suppliedRequestId
        : randomUUID();
      const result = await storage.setFacilityFeatureFlagOverride({
        flagKey: req.params.flagKey,
        locationId: locationId.data,
        enabled: body.data.enabled,
        actorUserId: user.id,
        actorRole: user.role,
        reason: body.data.reason,
        requestId,
        idempotencyKey: `${requestId}:${locationId.data}:${req.params.flagKey}`,
      });
      return res.status(result.reused ? 200 : 201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      if (message === "FACILITY_FEATURE_CONTROL_FACILITY_NOT_FOUND") {
        return res.status(404).json({ message: "Recovery Facility not found" });
      }
      if (message === "FACILITY_FEATURE_CONTROL_IDEMPOTENCY_CONFLICT") {
        return res.status(409).json({ message: "Request reference conflicts with an earlier Facility control change" });
      }
      console.error("Facility geofence control update failed", {
        locationId: req.params.locationId,
        flagKey: req.params.flagKey,
        message,
      });
      return res.status(500).json({ message: "Unable to update Facility geofence control" });
    }
  });
}
