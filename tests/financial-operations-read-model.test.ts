import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildFinancialOperationsReadModel } from "../server/financialOperationsReadModel";

const current = new Date("2026-07-18T12:00:00.000Z");
const fixture = (overrides: Record<string, unknown> = {}) => ({
  cutoff: new Date("2026-07-17T05:00:00.000Z"),
  ownerRows: [{ id: "owner-a", companyName: "Alpha Recovery", userId: "owner-user", firstName: "Avery", lastName: "Owner" }, { id: "owner-b", companyName: "Bravo Yard", userId: "owner-b-user", firstName: "Blair", lastName: "Owner" }],
  locationRows: [{ id: "location-a", ownerId: "owner-a", name: "Alpha Facility" }, { id: "location-b", ownerId: "owner-b", name: "Bravo Facility" }],
  activityRows: [
    { id: "activity-missing", driverId: "driver-a", locationId: "location-a", status: "verified", amount: "12.50", checkInTime: current, verifiedAt: current, verifiedBy: "admin-a", createdAt: current, driverFirstName: "Drew", driverLastName: "Driver" },
    { id: "activity-ready", driverId: "driver-a", locationId: "location-a", status: "verified", amount: "10.00", checkInTime: current, verifiedAt: current, verifiedBy: "admin-a", createdAt: current, driverFirstName: "Drew", driverLastName: "Driver" },
    { id: "activity-batch", driverId: "driver-b", locationId: "location-b", status: "verified", amount: "8.00", checkInTime: current, verifiedAt: current, verifiedBy: "admin-a", createdAt: current, driverFirstName: "Dev", driverLastName: "Driver" },
    { id: "activity-pending", driverId: "driver-a", locationId: "location-a", status: "pending", amount: "10.00", checkInTime: current, verifiedAt: null, verifiedBy: null, createdAt: current, driverFirstName: "Drew", driverLastName: "Driver" },
    { id: "activity-rejected", driverId: "driver-a", locationId: "location-a", status: "rejected", amount: "10.00", checkInTime: current, verifiedAt: null, verifiedBy: null, createdAt: current, driverFirstName: "Drew", driverLastName: "Driver" },
  ],
  obligationRows: [{ id: "payment-ready", ownerId: "owner-a", activityId: "activity-ready", amount: "10.00", processingFee: "5.00", status: "pending", paidAt: null, createdAt: current }, { id: "payment-batch", ownerId: "owner-b", activityId: "activity-batch", amount: "8.00", processingFee: "5.00", status: "pending", paidAt: null, createdAt: current }],
  membershipRows: [{ id: "membership-batch", batchId: "batch-b", paymentId: "payment-batch", state: "active", frozenDriverIncentiveCents: 800, frozenPlatformFeeCents: 500, frozenFacilityChargeCents: 1300 }],
  batchRows: [{ id: "batch-b", ownerId: "owner-b", reference: "CTX-FB-001", state: "approved", periodStart: current, periodEnd: new Date("2026-07-25T12:00:00.000Z"), timezone: "America/Chicago", count: 1, driverTotal: 800, feeTotal: 500, facilityTotal: 1300, exceptionCount: 0, createdAt: current, createdBy: "admin-a", reviewedAt: current, approvedAt: current }],
  attemptRows: [], exceptionRows: [], eventRows: [{ id: "event-a", batchId: "batch-b", eventType: "approved", actorId: "admin-a", actorRole: "admin", reason: "Reviewed", priorState: "ready_for_review", newState: "approved", createdAt: current }],
  actorRows: [{ id: "admin-a", firstName: "Alex", lastName: "Admin" }],
  ...overrides,
});

test("owner-centred read model groups canonical setup work without mixing unrelated owners", () => {
  const model = buildFinancialOperationsReadModel(fixture() as any);
  const alpha = model.owners.find((owner) => owner.ownerId === "owner-a")!;
  const bravo = model.owners.find((owner) => owner.ownerId === "owner-b")!;
  assert.equal(alpha.awaitingFinancialSetup, 1);
  assert.equal(alpha.readyToBatch, 1);
  assert.equal(alpha.unbatchedFrozenAmountCents, 1000);
  assert.equal(alpha.nextAction, "create_financial_obligations");
  assert.equal(bravo.awaitingFinancialSetup, 0);
  assert.equal(bravo.openBatches, 1);
  assert.equal(model.summary.approvedWashoutsAwaitingFinancialSetup, 1);
  assert.equal(model.summary.obligationsReadyToBatch, 1);
});

test("read model excludes pending, rejected, and historical activities from current action totals", () => {
  const historical = { id: "activity-history", driverId: "driver-a", locationId: "location-a", status: "verified", amount: "9.00", checkInTime: new Date("2026-07-16T04:59:59.000Z"), verifiedAt: new Date("2026-07-16T04:59:59.000Z"), verifiedBy: "admin-a", createdAt: current, driverFirstName: "Drew", driverLastName: "Driver" };
  const model = buildFinancialOperationsReadModel(fixture({ activityRows: [...fixture().activityRows, historical] }) as any);
  assert.equal(model.summary.approvedWashoutsAwaitingFinancialSetup, 1);
  assert.equal(model.summary.obligationsReadyToBatch, 1);
});

test("paid is projected only from authoritative succeeded attempt evidence and exceptions require attention", () => {
  const paid = buildFinancialOperationsReadModel(fixture({ attemptRows: [{ id: "attempt", batchId: "batch-b", status: "succeeded", createdAt: current }] }) as any);
  assert.equal(paid.summary.confirmedPaidCents, 1300);
  assert.equal(paid.summary.batchedButNotPaidCents, 0);
  const attention = buildFinancialOperationsReadModel(fixture({ exceptionRows: [{ id: "exception", batchId: null, paymentId: "payment-ready", status: "open", category: "relationship" }] }) as any);
  assert.equal(attention.summary.attentionRequiredCount, 1);
  assert.equal(attention.owners.find((owner) => owner.ownerId === "owner-a")?.nextAction, "resolve_exception");
});

test("Financial Operations routes retain read-only overview endpoints and replace primary navigation", async () => {
  const [routes, app, nav, page] = await Promise.all([
    readFile(new URL("../server/routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../client/src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/components/MobileNav.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/admin/financial-operations.tsx", import.meta.url), "utf8"),
  ]);
  for (const endpoint of ["/api/admin/financial-operations/overview", "/api/admin/financial-operations/owners", "/api/admin/financial-operations/batches/:batchId", "/api/admin/financial-operations/audit"]) assert.match(routes, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(app, /path="\/admin\/financial-operations"/);
  assert.match(app, /path="\/financial-workspace" component=\{FinancialOperations\}/);
  assert.match(nav, /path: "\/admin\/financial-operations"/);
  assert.doesNotMatch(nav, /path: "\/payments"/);
  assert.doesNotMatch(nav, /path: "\/fees"/);
  assert.doesNotMatch(nav, /path: "\/billing"/);
  assert.doesNotMatch(page, /\/execute|\/retry|\/attempts/);
});

test("owner-centred operational controls use opaque selections, canonical preview, lifecycle routes, and no provider execution", async () => {
  const source = await readFile(new URL("../client/src/pages/admin/financial-operations.tsx", import.meta.url), "utf8");
  assert.match(source, /Create Financial Obligations/);
  assert.match(source, /selectionToken: activity\.selectionToken/);
  assert.match(source, /\/api\/admin\/financial-obligations\/create/);
  assert.match(source, /Preview Batch/);
  assert.match(source, /\/api\/admin\/financial-batches\/preview/);
  assert.match(source, /Create Draft Batch/);
  assert.match(source, /\/api\/admin\/financial-batches/);
  assert.match(source, /ready-for-review/);
  assert.match(source, /Approve batch for future collection/);
  assert.match(source, /Approved means Ready for Collection\. It does not mean paid/);
  assert.match(source, /Cancel canonical batch/);
  assert.doesNotMatch(source, /\/execute|\/retry|\/attempts|stripeService|treasury/i);
});
