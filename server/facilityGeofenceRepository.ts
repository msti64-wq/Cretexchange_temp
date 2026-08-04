import { and, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import {
  activityGeofenceEvaluations,
  facilityGeofenceBoundaries,
  facilityGeofenceRevisionEvents,
  type ActivityGeofenceEvaluation,
  type FacilityGeofenceBoundary,
  type FacilityGeofenceRevisionEvent,
  type InsertActivityGeofenceEvaluation,
  type InsertFacilityGeofenceRevisionEvent,
} from "@shared/schema";
import { db } from "./db";
import type {
  FacilityGeofenceBoundaryRecord,
  FacilityGeofenceRepository,
} from "./facilityGeofenceService";

/**
 * Persistence adapter for the canonical service. Route-level role, ownership,
 * and Driver eligibility checks remain mandatory before callers provide a
 * Facility ID. This adapter deliberately exposes no cross-Owner list method.
 */
export class DrizzleFacilityGeofenceRepository implements FacilityGeofenceRepository {
  async listActiveBoundaries(locationIds: string[], effectiveAt: Date): Promise<FacilityGeofenceBoundaryRecord[]> {
    if (locationIds.length === 0) return [];
    const rows = await db
      .select()
      .from(facilityGeofenceBoundaries)
      .where(and(
        inArray(facilityGeofenceBoundaries.locationId, locationIds),
        eq(facilityGeofenceBoundaries.zoneKey, "primary"),
        eq(facilityGeofenceBoundaries.status, "active"),
        lte(facilityGeofenceBoundaries.effectiveFrom, effectiveAt),
        or(
          isNull(facilityGeofenceBoundaries.effectiveTo),
          gt(facilityGeofenceBoundaries.effectiveTo, effectiveAt),
        ),
      ))
      .orderBy(
        facilityGeofenceBoundaries.locationId,
        desc(facilityGeofenceBoundaries.version),
      );
    return rows as FacilityGeofenceBoundary[];
  }

  async createActivityEvaluation(
    input: InsertActivityGeofenceEvaluation,
  ): Promise<ActivityGeofenceEvaluation> {
    const [created] = await db
      .insert(activityGeofenceEvaluations)
      .values(input)
      .onConflictDoNothing({ target: activityGeofenceEvaluations.idempotencyKey })
      .returning();
    if (created) return created;

    const [existing] = await db
      .select()
      .from(activityGeofenceEvaluations)
      .where(eq(activityGeofenceEvaluations.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (!existing) throw new Error("Canonical geofence evaluation idempotency lookup failed");
    return existing;
  }

  async appendRevisionEvent(
    input: InsertFacilityGeofenceRevisionEvent,
  ): Promise<FacilityGeofenceRevisionEvent> {
    const [created] = await db
      .insert(facilityGeofenceRevisionEvents)
      .values(input)
      .onConflictDoNothing({ target: facilityGeofenceRevisionEvents.idempotencyKey })
      .returning();
    if (created) return created;

    const [existing] = await db
      .select()
      .from(facilityGeofenceRevisionEvents)
      .where(eq(facilityGeofenceRevisionEvents.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (!existing) throw new Error("Canonical geofence revision idempotency lookup failed");
    return existing;
  }
}
