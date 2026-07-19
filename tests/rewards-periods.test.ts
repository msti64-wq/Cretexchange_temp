import assert from "node:assert/strict";
import test from "node:test";

import {
  REWARDS_PERIOD_CANCELLATION_ANNOUNCEMENT,
  canTransitionRewardsPeriod,
  resolveRewardsPeriodForActivity,
} from "../server/rewardsPeriods";

const CUTOFF = "2026-07-17T05:00:00.000Z";

test("rewards periods allow only the documented lifecycle transitions", () => {
  assert.equal(canTransitionRewardsPeriod("scheduled", "active"), true);
  assert.equal(canTransitionRewardsPeriod("active", "paused"), true);
  assert.equal(canTransitionRewardsPeriod("paused", "active"), true);
  assert.equal(canTransitionRewardsPeriod("cancelled", "active"), false);
  assert.equal(canTransitionRewardsPeriod("completed", "cancelled"), false);
});

test("rewards-period activity resolution honors the configured cutoff and Chicago month", () => {
  const historical = resolveRewardsPeriodForActivity({
    verifiedAt: "2026-07-17T04:59:59.000Z",
    createdAt: "2026-07-20T00:00:00.000Z",
  }, CUTOFF);
  const current = resolveRewardsPeriodForActivity({
    verifiedAt: CUTOFF,
    createdAt: "2026-07-01T00:00:00.000Z",
  }, CUTOFF);
  const fallback = resolveRewardsPeriodForActivity({ createdAt: "2026-07-17T05:00:01.000Z" }, CUTOFF);

  assert.deepEqual(historical, { historical: true, month: 7, year: 2026 });
  assert.deepEqual(current, { historical: false, month: 7, year: 2026 });
  assert.deepEqual(fallback, { historical: false, month: 7, year: 2026 });
});

test("cancelled-period announcement preserves the approved operational message", () => {
  assert.match(REWARDS_PERIOD_CANCELLATION_ANNOUNCEMENT, /will not be held for this month/i);
  assert.match(REWARDS_PERIOD_CANCELLATION_ANNOUNCEMENT, /verification remain unaffected/i);
});
