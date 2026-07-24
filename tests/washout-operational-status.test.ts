import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveWashoutOperationalStatus } from "../client/src/lib/washoutOperationalStatus";

test("pending, verified, and rejected statuses provide consistent operational guidance by audience", () => {
  const pendingDriver = resolveWashoutOperationalStatus({ status: "pending", audience: "driver" });
  const pendingOwner = resolveWashoutOperationalStatus({ status: "pending_owner_approval", audience: "owner" });
  const pendingAdmin = resolveWashoutOperationalStatus({ status: "submitted", audience: "admin" });

  assert.equal(pendingDriver.state, "pending_review");
  assert.equal(pendingOwner.state, "pending_review");
  assert.equal(pendingAdmin.state, "pending_review");
  assert.equal(pendingDriver.requiresOwnerAction, true);
  assert.equal(pendingDriver.nextActionKey, "washout.recovery.pending_review.driver");
  assert.equal(pendingOwner.nextActionKey, "washout.recovery.pending_review.owner");
  assert.equal(pendingAdmin.nextActionKey, "washout.recovery.pending_review.admin");

  const verified = resolveWashoutOperationalStatus({ status: "verified", audience: "driver" });
  assert.equal(verified.state, "verified");
  assert.equal(verified.tone, "success");
  assert.equal(verified.requiresAdminAttention, false);

  const rejectedWithReason = resolveWashoutOperationalStatus({
    status: "rejected",
    rejectionReason: "Missing photo evidence",
    audience: "driver",
  });
  const rejectedWithoutReason = resolveWashoutOperationalStatus({ status: "rejected", audience: "owner" });
  assert.equal(rejectedWithReason.state, "rejected");
  assert.equal(rejectedWithReason.rejectionReason, "Missing photo evidence");
  assert.equal(rejectedWithoutReason.rejectionReason, null);
  assert.equal(rejectedWithReason.requiresAdminAttention, true);
});

test("incomplete and delayed presentation aliases supply recovery guidance without adding persisted statuses", () => {
  const incomplete = resolveWashoutOperationalStatus({ status: "upload_failed", audience: "driver" });
  const delayed = resolveWashoutOperationalStatus({ status: "needs_review", audience: "owner" });
  const unknown = resolveWashoutOperationalStatus({ status: "unexpected_legacy_status", audience: "admin" });

  assert.equal(incomplete.state, "incomplete");
  assert.equal(incomplete.nextActionKey, "washout.recovery.incomplete.driver");
  assert.equal(delayed.state, "requires_review");
  assert.equal(delayed.requiresAdminAttention, true);
  assert.equal(unknown.state, "requires_review");
});

test("operational presentation is independent of financial information", () => {
  const baseline = resolveWashoutOperationalStatus({ status: "pending", audience: "driver" });
  const withFinancialFields = resolveWashoutOperationalStatus({
    status: "pending",
    audience: "driver",
    paymentStatus: "failed",
    walletBalance: 0,
    stripePayoutsEnabled: false,
  } as any);

  assert.deepEqual(withFinancialFields, baseline);
});

test("driver, owner, and admin surfaces use the shared operational resolver and localized recovery keys", async () => {
  const [driverSource, ownerSource, adminSource, i18nSource] = await Promise.all([
    readFile("client/src/pages/driver/activity.tsx", "utf8"),
    readFile("client/src/pages/owner/dashboard.tsx", "utf8"),
    readFile("client/src/lib/adminTrustVerification.ts", "utf8"),
    readFile("client/src/lib/i18n.ts", "utf8"),
  ]);

  for (const source of [driverSource, ownerSource, adminSource]) {
    assert.match(source, /resolveWashoutOperationalStatus/);
  }
  for (const key of [
    "washout.status.pendingReview",
    "washout.status.verified",
    "washout.status.rejected",
    "washout.status.incomplete",
    "washout.status.requiresReview",
    "washout.recovery.pending_review.driver",
    "washout.recovery.rejected.driver",
  ]) {
    assert.equal((i18nSource.match(new RegExp(`"${key}":`, "g")) || []).length, 2, `${key} exists in English and Spanish`);
  }
});
