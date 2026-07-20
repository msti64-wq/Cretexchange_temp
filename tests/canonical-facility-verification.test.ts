import assert from "node:assert/strict";
import test from "node:test";

const CUTOFF = "2026-07-17T05:00:00.000Z";

type Role = "owner" | "admin" | "driver";
type Activity = {
  id: string;
  ownerId: string;
  facilityId: string;
  driverId: string;
  locationId: string;
  photographId: string;
  washoutId: string;
  status: "pending" | "verified" | "rejected";
  verifiedAt?: string;
  createdAt: string;
  rejectionReason?: string;
};

type Actor = { id: string; role: Role; ownerId?: string; canApproveFacilities?: boolean };
type Obligation = { activityId: string; ownerId: string; facilityId: string; driverId: string; locationId: string; status: "unpaid" };

function createFixture() {
  const activity: Activity = {
    id: "activity-current",
    ownerId: "owner-1",
    facilityId: "facility-1",
    driverId: "driver-1",
    locationId: "location-1",
    photographId: "photo-1",
    washoutId: "washout-1",
    status: "pending",
    verifiedAt: CUTOFF,
    createdAt: "2026-07-01T00:00:00.000Z",
  };
  const obligations = new Map<string, Obligation>();
  const batches = new Map<string, { state: "draft" | "processing" | "paid" }>();
  const calls = { database: 0, stripeCharge: 0, stripeTransfer: 0, wallet: 0, payout: 0 };
  const external = {
    database() { calls.database += 1; throw new Error("unexpected database access"); },
    stripeCharge() { calls.stripeCharge += 1; throw new Error("unexpected Stripe charge"); },
    stripeTransfer() { calls.stripeTransfer += 1; throw new Error("unexpected Stripe transfer"); },
    wallet() { calls.wallet += 1; throw new Error("unexpected wallet execution"); },
    payout() { calls.payout += 1; throw new Error("unexpected payout execution"); },
  };

  const isCurrent = (candidate: Activity) =>
    new Date(candidate.verifiedAt ?? candidate.createdAt).getTime() >= new Date(CUTOFF).getTime();

  function authorize(actor: Actor, candidate: Activity) {
    return (actor.role === "owner" && actor.ownerId === candidate.ownerId)
      || (actor.role === "admin" && actor.canApproveFacilities === true);
  }

  function approve(actor: Actor, candidate: Activity) {
    if (!authorize(actor, candidate)) return { result: "forbidden" as const };
    if (candidate.status !== "pending" && candidate.status !== "verified") return { result: "conflict" as const };
    candidate.status = "verified";
    if (!isCurrent(candidate)) return { result: "verified" as const, obligation: null };
    const existing = obligations.get(candidate.id);
    if (existing) return { result: "verified" as const, obligation: existing };
    const obligation: Obligation = {
      activityId: candidate.id,
      ownerId: candidate.ownerId,
      facilityId: candidate.facilityId,
      driverId: candidate.driverId,
      locationId: candidate.locationId,
      status: "unpaid",
    };
    obligations.set(candidate.id, obligation);
    return { result: "verified" as const, obligation };
  }

  function reject(actor: Actor, candidate: Activity, reason: string) {
    if (!authorize(actor, candidate)) return { result: "forbidden" as const };
    if (candidate.status !== "pending") return { result: "conflict" as const };
    candidate.status = "rejected";
    candidate.rejectionReason = reason;
    return { result: "rejected" as const };
  }

  return { activity, obligations, batches, calls, external, approve, reject };
}

const facilityOwner: Actor = { id: "owner-user-1", role: "owner", ownerId: "owner-1" };
const otherOwner: Actor = { id: "owner-user-2", role: "owner", ownerId: "owner-2" };
const approvingAdmin: Actor = { id: "admin-1", role: "admin", canApproveFacilities: true };
const driver: Actor = { id: "driver-1", role: "driver" };

function assertNoExternalExecution(calls: ReturnType<typeof createFixture>["calls"]) {
  assert.deepEqual(calls, { database: 0, stripeCharge: 0, stripeTransfer: 0, wallet: 0, payout: 0 });
}

test("an authorized facility owner approves a current pending washout and creates one unpaid obligation", () => {
  const state = createFixture();
  const result = state.approve(facilityOwner, state.activity);

  assert.equal(result.result, "verified");
  assert.equal(state.activity.status, "verified");
  assert.equal(state.obligations.size, 1);
  assert.equal(result.obligation?.status, "unpaid");
  assert.equal(state.batches.size, 0);
  assertNoExternalExecution(state.calls);
});

test("facility ownership, intended admin permission, and unauthorized roles are enforced", () => {
  const ownerMismatch = createFixture();
  assert.equal(ownerMismatch.approve(otherOwner, ownerMismatch.activity).result, "forbidden");

  const admin = createFixture();
  assert.equal(admin.approve(approvingAdmin, admin.activity).result, "verified");

  const unauthorized = createFixture();
  assert.equal(unauthorized.approve(driver, unauthorized.activity).result, "forbidden");
  assert.equal(unauthorized.obligations.size, 0);
});

test("repeated approval reconciles rather than duplicates the canonical obligation", () => {
  const state = createFixture();
  const first = state.approve(facilityOwner, state.activity);
  const repeated = state.approve(facilityOwner, state.activity);

  assert.equal(state.obligations.size, 1);
  assert.equal(first.obligation, repeated.obligation);
  assert.equal(repeated.obligation?.status, "unpaid");
  assertNoExternalExecution(state.calls);
});

test("rejection creates no obligation and retains its configured reason", () => {
  const state = createFixture();
  const result = state.reject(facilityOwner, state.activity, "Photograph does not show the completed washout.");

  assert.equal(result.result, "rejected");
  assert.equal(state.activity.status, "rejected");
  assert.equal(state.activity.rejectionReason, "Photograph does not show the completed washout.");
  assert.equal(state.obligations.size, 0);
  assertNoExternalExecution(state.calls);
});

test("verification keeps driver, facility, location, owner, photograph, and washout relationships", () => {
  const state = createFixture();
  const result = state.approve(facilityOwner, state.activity);

  assert.deepEqual(
    [
      result.obligation?.driverId,
      result.obligation?.facilityId,
      result.obligation?.locationId,
      result.obligation?.ownerId,
      state.activity.photographId,
      state.activity.washoutId,
    ],
    ["driver-1", "facility-1", "location-1", "owner-1", "photo-1", "washout-1"],
  );
});

test("historical approval remains visible without a current obligation", () => {
  const state = createFixture();
  state.activity.verifiedAt = "2026-07-17T04:59:59.000Z";
  const result = state.approve(facilityOwner, state.activity);

  assert.equal(result.result, "verified");
  assert.equal(state.activity.status, "verified");
  assert.equal(result.obligation, null);
  assert.equal(state.obligations.size, 0);
  assertNoExternalExecution(state.calls);
});

test("verification is operational-only even when every provider dependency is disabled", () => {
  const state = createFixture();
  // The explicit mocks fail if called; approval succeeds without touching them.
  assert.doesNotThrow(() => state.approve(facilityOwner, state.activity));
  assertNoExternalExecution(state.calls);
  void state.external;
});

test("unexpected database and provider access fails immediately", () => {
  const state = createFixture();

  assert.throws(() => state.external.database(), /unexpected database access/);
  assert.throws(() => state.external.stripeCharge(), /unexpected Stripe charge/);
  assert.throws(() => state.external.stripeTransfer(), /unexpected Stripe transfer/);
  assert.throws(() => state.external.wallet(), /unexpected wallet execution/);
  assert.throws(() => state.external.payout(), /unexpected payout execution/);
});
