import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const driver = readFileSync(new URL("../client/src/pages/driver/activity.tsx", import.meta.url), "utf8");
const owner = readFileSync(new URL("../client/src/pages/owner/dashboard.tsx", import.meta.url), "utf8");
const admin = readFileSync(new URL("../client/src/pages/admin/dashboard.tsx", import.meta.url), "utf8");
const translations = readFileSync(new URL("../client/src/lib/i18n.ts", import.meta.url), "utf8");

test("driver review request is rejected-only, confirmed, and has no financial action", () => {
  assert.match(driver, /record\.status === "rejected"/);
  assert.match(driver, /confirmationAcknowledged: true/);
  assert.match(driver, /driverExplanation/);
  assert.doesNotMatch(driver, /createPayment|wallet|stripe|payout|settlement/i);
});

test("owner sees limited review status without an administrative decision control", () => {
  assert.match(owner, /\/api\/owners\/activities\/\$\{activity\.id\}\/administrative-review/);
  assert.match(owner, /returnedToOwnerReview/);
  assert.doesNotMatch(owner.slice(owner.indexOf("function OwnerAdministrativeReviewStatus"), owner.indexOf("function OptionalDriverTipControl")), /administrative-reviews\/.*\/decision/);
});

test("admin queue offers only facilitator actions and authoritative timeline fields", () => {
  const queue = admin.slice(admin.indexOf("function AdministrativeReviewQueue"), admin.indexOf("export default function AdminDashboard"));
  assert.match(queue, /returned_to_owner_review/);
  assert.match(queue, /closeAction/);
  assert.match(queue, /timelineRejected/);
  assert.doesNotMatch(queue, /Verify Activity|Reject Activity|status dropdown/i);
  assert.doesNotMatch(queue, /wallet|stripe|payout|settlement/i);
});

test("administrative review strings have English and Spanish entries", () => {
  for (const key of ["adminReview.requestAction", "adminReview.queueTitle", "adminReview.returnAction", "adminReview.ownerReturnedGuidance"]) {
    assert.equal(translations.split(`\"${key}\"`).length - 1, 2, `${key} must be translated in both locales`);
  }
});
