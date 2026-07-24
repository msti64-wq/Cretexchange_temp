import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(new URL("../shared/schema.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../migrations/0036_add_washout_activity_admin_reviews.sql", import.meta.url), "utf8");
const storage = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");

test("administrative review is separate from canonical activity status", () => {
  assert.match(schema, /washoutActivityAdminReviews/);
  assert.match(migration, /WHERE resolution IS NULL/);
  assert.match(migration, /returned_to_owner_review/);
  assert.match(migration, /resolution IN \('closed', 'returned_to_owner_review'\)/);
});

test("only one unresolved request exists while later owner-rejection rounds remain possible", () => {
  assert.match(migration, /uniq_washout_activity_admin_reviews_unresolved/);
  assert.match(migration, /activity_id\) WHERE resolution IS NULL/);
  assert.doesNotMatch(migration, /UNIQUE\s*\(activity_id\)/i);
});

test("the driver request is rejected-only, owned, confirmed, and non-financial", () => {
  const handler = routes.slice(routes.indexOf("app.post('/api/drivers/activities/:id/administrative-review'"), routes.indexOf("app.get('/api/drivers/activities/:id/administrative-review'"));
  assert.match(handler, /activity\.driverId !== driver\.id/);
  assert.match(handler, /activity\.status !== "rejected"/);
  assert.match(handler, /administrativeReviewRequestSchema/);
  assert.doesNotMatch(handler, /createPayment|wallet|stripe|payout|settlement/i);
});

test("administrators can only close or return review; return is atomic and never verifies", () => {
  const resolver = storage.slice(storage.indexOf("async resolveWashoutActivityAdminReview"), storage.indexOf("async updateWashoutActivityStatus", storage.indexOf("async resolveWashoutActivityAdminReview")));
  assert.match(resolver, /db\.transaction/);
  assert.match(resolver, /eq\(washoutActivities\.status, "rejected"\)/);
  assert.match(resolver, /status: "pending"/);
  assert.match(resolver, /washoutActivityReviewEvents/);
  assert.doesNotMatch(resolver, /status: "verified"/);
  assert.doesNotMatch(resolver, /createPayment|wallet|stripe|payout|settlement/i);
});

test("admin and owner API projections enforce role boundaries", () => {
  const driverHandler = routes.slice(routes.indexOf("app.get('/api/drivers/activities/:id/administrative-review'"), routes.indexOf("app.get('/api/owners/activities/:id/administrative-review'"));
  const ownerHandler = routes.slice(routes.indexOf("app.get('/api/owners/activities/:id/administrative-review'"), routes.indexOf("app.get('/api/admin/administrative-reviews'"));
  const adminHandler = routes.slice(routes.indexOf("app.get('/api/admin/administrative-reviews'"), routes.indexOf("app.post('/api/admin/administrative-reviews/:id/decision'"));
  assert.match(driverHandler, /driverExplanation: review\.driverExplanation/);
  assert.match(driverHandler, /rationale: review\.adminRationale/);
  assert.match(ownerHandler, /req\.user\?\.role !== "owner"/);
  assert.match(ownerHandler, /location\.ownerId !== owner\.id/);
  assert.match(ownerHandler, /rationale: review\.adminRationale/);
  assert.match(ownerHandler, /returnedToOwnerReview/);
  assert.match(adminHandler, /actor\.role !== "admin" && actor\.role !== "super_admin"/);
  assert.match(adminHandler, /rejectionTimestamp: activity\.rejectedAt/);
  assert.match(adminHandler, /reviewAgeHours/);
  assert.match(adminHandler, /photos: photos\.map/);
  assert.match(adminHandler, /owner: \{ companyName/);
  assert.doesNotMatch(adminHandler, /licenseNumber|taxId|walletBalance|stripe/i);
  assert.doesNotMatch(adminHandler, /storageKey|gpsLatitude|gpsLongitude|imageFingerprint/i);
});
