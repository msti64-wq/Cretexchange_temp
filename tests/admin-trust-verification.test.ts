import assert from "node:assert/strict";
import test from "node:test";

import { buildAdminTrustVerification } from "../client/src/lib/adminTrustVerification";

test("trust verification aggregates only persisted operational activity statuses", () => {
  const result = buildAdminTrustVerification(
    [
      { washoutStatus: "verified" },
      { washoutStatus: "VERIFIED" },
      { washoutStatus: "pending" },
      { washoutStatus: "rejected" },
      { washoutStatus: "unknown" },
    ],
    { pendingCounts: { olderThan24h: 5, olderThan48h: 3, olderThan72h: 1 } },
  );

  assert.equal(result.verified, 2);
  assert.equal(result.pending, 1);
  assert.equal(result.rejected, 1);
  assert.equal(result.exceptions, 1);
  assert.equal(result.reviewBacklog, 1);
  assert.deepEqual(result.distribution, [
    { label: "Verified", count: 2 },
    { label: "Pending", count: 1 },
    { label: "Rejected", count: 1 },
    { label: "Review exceptions", count: 1 },
  ]);
});

test("trust verification preserves unavailable values for partial or missing API data", () => {
  const result = buildAdminTrustVerification(undefined, { pendingCounts: { olderThan24h: 4 } });

  assert.equal(result.verified, null);
  assert.equal(result.pending, null);
  assert.equal(result.rejected, null);
  assert.equal(result.exceptions, null);
  assert.equal(result.reviewBacklog, null);
  assert.equal(result.olderThan24h, 4);
  assert.equal(result.olderThan48h, null);
  assert.equal(result.olderThan72h, null);
  assert.deepEqual(result.distribution, []);
});

test("trust verification rejects malformed aging values rather than inventing counts", () => {
  const result = buildAdminTrustVerification([], {
    pendingCounts: { olderThan24h: "4", olderThan48h: -1, olderThan72h: Number.NaN },
  });

  assert.equal(result.verified, 0);
  assert.equal(result.pending, 0);
  assert.equal(result.rejected, 0);
  assert.equal(result.exceptions, 0);
  assert.equal(result.reviewBacklog, 0);
  assert.equal(result.olderThan24h, null);
  assert.equal(result.olderThan48h, null);
  assert.equal(result.olderThan72h, null);
});

test("financial-looking fields do not affect trust verification output", () => {
  const baseline = buildAdminTrustVerification(
    [{ washoutStatus: "verified" }, { washoutStatus: "pending" }],
    { pendingCounts: { olderThan24h: 1, olderThan48h: 0, olderThan72h: 0 } },
  );
  const withFinancialLookingFields = buildAdminTrustVerification(
    [
      {
        washoutStatus: "verified",
        walletBalance: "999", stripeConnectAccountId: "acct_sensitive", paymentStatus: "paid",
        paymentAmount: "100", ownerReceivable: "101", processingFee: "1",
      } as any,
      {
        washoutStatus: "pending",
        walletBalance: "0", stripeCustomerId: "cus_sensitive", paymentStatus: "unpaid",
        paymentAmount: "0", ownerReceivable: "0", processingFee: "0",
      } as any,
    ],
    { pendingCounts: { olderThan24h: 1, olderThan48h: 0, olderThan72h: 0 } },
  );

  assert.deepEqual(withFinancialLookingFields, baseline);
  assert.deepEqual(Object.keys(withFinancialLookingFields).sort(), [
    "distribution", "exceptions", "olderThan24h", "olderThan48h", "olderThan72h", "pending", "rejected", "reviewBacklog", "verified",
  ]);
});
