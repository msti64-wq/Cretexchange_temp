import { and, desc, eq, gt, inArray, isNull, lte, max, or } from "drizzle-orm";
import {
  activityGeofenceEvaluations,
  facilityGeofenceBoundaries,
  facilityGeofenceRevisionEvents,
  type ActivityGeofenceEvaluation,
  type FacilityGeofenceBoundary,
  type FacilityGeofenceRevisionEvent,
  type InsertActivityGeofenceEvaluation,
  type InsertFacilityGeofenceRevisionEvent,
  type InsertFacilityGeofenceBoundary,
} from "@shared/schema";
import { db } from "./db";
import type {
  FacilityGeofenceBoundaryRecord,
  FacilityGeofenceRepository,
} from "./facilityGeofenceService";

export const FACILITY_GEOFENCE_OWNER_VERSION_LIMIT = 100;
export const FACILITY_GEOFENCE_OWNER_HISTORY_LIMIT = 250;

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

  async listBoundaryVersions(locationId: string): Promise<FacilityGeofenceBoundary[]> {
    return db
      .select()
      .from(facilityGeofenceBoundaries)
      .where(and(
        eq(facilityGeofenceBoundaries.locationId, locationId),
        eq(facilityGeofenceBoundaries.zoneKey, "primary"),
      ))
      .orderBy(desc(facilityGeofenceBoundaries.version))
      .limit(FACILITY_GEOFENCE_OWNER_VERSION_LIMIT);
  }

  async listRevisionEvents(locationId: string): Promise<FacilityGeofenceRevisionEvent[]> {
    return db
      .select()
      .from(facilityGeofenceRevisionEvents)
      .where(eq(facilityGeofenceRevisionEvents.locationId, locationId))
      .orderBy(desc(facilityGeofenceRevisionEvents.createdAt))
      .limit(FACILITY_GEOFENCE_OWNER_HISTORY_LIMIT);
  }

  async getBoundaryVersion(boundaryVersionId: string): Promise<FacilityGeofenceBoundary | undefined> {
    const [boundary] = await db
      .select()
      .from(facilityGeofenceBoundaries)
      .where(eq(facilityGeofenceBoundaries.id, boundaryVersionId))
      .limit(1);
    return boundary;
  }

  async getLatestActivityEvaluation(activityId: string): Promise<ActivityGeofenceEvaluation | undefined> {
    const [evaluation] = await db
      .select()
      .from(activityGeofenceEvaluations)
      .where(eq(activityGeofenceEvaluations.activityId, activityId))
      .orderBy(desc(activityGeofenceEvaluations.createdAt))
      .limit(1);
    return evaluation;
  }

  async listLatestActivityEvaluations(activityIds: string[]): Promise<Map<string, ActivityGeofenceEvaluation>> {
    const uniqueActivityIds = Array.from(new Set(activityIds));
    if (uniqueActivityIds.length === 0) return new Map();
    const rows = await db
      .selectDistinctOn([activityGeofenceEvaluations.activityId])
      .from(activityGeofenceEvaluations)
      .where(inArray(activityGeofenceEvaluations.activityId, uniqueActivityIds))
      .orderBy(
        activityGeofenceEvaluations.activityId,
        desc(activityGeofenceEvaluations.createdAt),
        desc(activityGeofenceEvaluations.id),
      );
    const result = new Map<string, ActivityGeofenceEvaluation>();
    for (const row of rows) {
      if (row.activityId && !result.has(row.activityId)) result.set(row.activityId, row);
    }
    return result;
  }

  async createDraft(input: {
    boundary: Omit<InsertFacilityGeofenceBoundary, "version">;
    revision: Omit<InsertFacilityGeofenceRevisionEvent, "boundaryVersionId">;
  }): Promise<FacilityGeofenceBoundary> {
    return db.transaction(async (tx) => {
      const [latest] = await tx
        .select({ version: max(facilityGeofenceBoundaries.version) })
        .from(facilityGeofenceBoundaries)
        .where(and(
          eq(facilityGeofenceBoundaries.locationId, input.boundary.locationId),
          eq(facilityGeofenceBoundaries.zoneKey, input.boundary.zoneKey || "primary"),
        ));
      const version = Number(latest?.version || 0) + 1;
      const [created] = await tx
        .insert(facilityGeofenceBoundaries)
        .values({ ...input.boundary, version })
        .returning();
      await tx.insert(facilityGeofenceRevisionEvents).values({
        ...input.revision,
        boundaryVersionId: created.id,
      });
      return created;
    });
  }

  async activateDraft(input: {
    boundaryVersionId: string;
    locationId: string;
    actorUserId: string;
    requestId: string;
    reasonCode: string;
  }): Promise<FacilityGeofenceBoundary> {
    return db.transaction(async (tx) => {
      const [draft] = await tx
        .select()
        .from(facilityGeofenceBoundaries)
        .where(and(
          eq(facilityGeofenceBoundaries.id, input.boundaryVersionId),
          eq(facilityGeofenceBoundaries.locationId, input.locationId),
          eq(facilityGeofenceBoundaries.zoneKey, "primary"),
          eq(facilityGeofenceBoundaries.status, "draft"),
        ))
        .limit(1);
      if (!draft) throw new Error("GEOFENCE_DRAFT_NOT_FOUND");

      const now = new Date();
      const [previous] = await tx
        .select()
        .from(facilityGeofenceBoundaries)
        .where(and(
          eq(facilityGeofenceBoundaries.locationId, input.locationId),
          eq(facilityGeofenceBoundaries.zoneKey, "primary"),
          eq(facilityGeofenceBoundaries.status, "active"),
        ))
        .limit(1);

      if (previous) {
        await tx
          .update(facilityGeofenceBoundaries)
          .set({ status: "superseded", effectiveTo: now })
          .where(eq(facilityGeofenceBoundaries.id, previous.id));
        await tx.insert(facilityGeofenceRevisionEvents).values({
          locationId: input.locationId,
          boundaryVersionId: previous.id,
          eventType: "superseded",
          actorUserId: input.actorUserId,
          actorRole: "owner",
          reasonCode: input.reasonCode,
          requestId: input.requestId,
          idempotencyKey: `${input.requestId}:superseded:${previous.id}`,
          safeMetadata: { replacementVersion: draft.version },
        });
      }

      const [activated] = await tx
        .update(facilityGeofenceBoundaries)
        .set({
          status: "active",
          effectiveFrom: now,
          effectiveTo: null,
          activatedAt: now,
          activatedBy: input.actorUserId,
          previousVersionId: previous?.id || null,
        })
        .where(eq(facilityGeofenceBoundaries.id, draft.id))
        .returning();
      await tx.insert(facilityGeofenceRevisionEvents).values({
        locationId: input.locationId,
        boundaryVersionId: activated.id,
        eventType: "activated",
        actorUserId: input.actorUserId,
        actorRole: "owner",
        reasonCode: input.reasonCode,
        requestId: input.requestId,
        idempotencyKey: `${input.requestId}:activated:${activated.id}`,
        safeMetadata: { version: activated.version, mode: activated.mode },
      });
      return activated;
    });
  }
}
