import assert from "node:assert/strict";
import test from "node:test";
import {
  isOwnerFacilityIntelligenceTimeoutError,
  OwnerFacilityIntelligenceTimeoutError,
  withOwnerFacilityIntelligenceTimeout,
} from "../client/src/lib/ownerFacilityIntelligenceQuery";

test("Owner Intelligence request completes normally inside the bounded window", async () => {
  const value = await withOwnerFacilityIntelligenceTimeout(async (signal) => {
    assert.equal(signal.aborted, false);
    return "ready";
  }, undefined, 100);
  assert.equal(value, "ready");
});

test("Owner Intelligence request reports an explicit timeout", async () => {
  await assert.rejects(
    withOwnerFacilityIntelligenceTimeout(
      (signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      }),
      undefined,
      5,
    ),
    (error) => {
      assert.ok(error instanceof OwnerFacilityIntelligenceTimeoutError);
      assert.equal(isOwnerFacilityIntelligenceTimeoutError(error), true);
      return true;
    },
  );
});

test("Owner Intelligence request preserves parent cancellation as cancellation, not timeout", async () => {
  const parent = new AbortController();
  const pending = withOwnerFacilityIntelligenceTimeout(
    (signal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }),
    parent.signal,
    1_000,
  );
  parent.abort();
  await assert.rejects(pending, (error) => {
    assert.equal(isOwnerFacilityIntelligenceTimeoutError(error), false);
    return true;
  });
});
