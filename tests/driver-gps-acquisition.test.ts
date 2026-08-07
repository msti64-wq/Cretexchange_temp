import assert from "node:assert/strict";
import test from "node:test";
import {
  GpsAcquisitionError,
  createDriverLocationAcquirer,
} from "../client/src/lib/gps";

class MockGeolocation {
  success: PositionCallback | null = null;
  error: PositionErrorCallback | null = null;
  options: PositionOptions | undefined;
  watchCalls = 0;
  cleared: number[] = [];

  watchPosition(success: PositionCallback, error?: PositionErrorCallback | null, options?: PositionOptions): number {
    this.watchCalls += 1;
    this.success = success;
    this.error = error || null;
    this.options = options;
    return 41;
  }

  clearWatch(watchId: number) {
    this.cleared.push(watchId);
  }

  emit(accuracy: number, timestamp: number) {
    this.success?.({
      coords: { latitude: 30, longitude: -97, accuracy },
      timestamp,
    } as GeolocationPosition);
  }

  fail(code: number) {
    this.error?.({
      code,
      message: "safe mock failure",
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    } as GeolocationPositionError);
  }
}

function controlledAcquirer(now = 1_800_000_000_000) {
  const geolocation = new MockGeolocation();
  let timeout: (() => void) | null = null;
  let clearedTimers = 0;
  const acquirer = createDriverLocationAcquirer({
    geolocation,
    now: () => now,
    setTimer(callback) {
      timeout = callback;
      return 7 as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer() {
      clearedTimers += 1;
    },
  });
  return {
    acquirer,
    geolocation,
    now,
    expire: () => {
      assert.ok(timeout);
      timeout();
    },
    clearedTimers: () => clearedTimers,
  };
}

test("fresh Retry GPS requests maximumAge zero and rejects a stale cached observation", async () => {
  const h = controlledAcquirer();
  const pending = h.acquirer.acquire({ fresh: true });
  assert.equal(h.geolocation.options?.maximumAge, 0);
  assert.equal(h.geolocation.options?.enableHighAccuracy, true);
  h.geolocation.emit(20, h.now - 60_001);
  h.expire();
  await assert.rejects(pending, (error: unknown) => error instanceof GpsAcquisitionError && error.reason === "timeout");
});

test("progressive acquisition waits through an imprecise reading and resolves on the first acceptable fresh reading", async () => {
  const h = controlledAcquirer();
  const pending = h.acquirer.acquire({ fresh: true });
  h.geolocation.emit(260, h.now - 500);
  h.geolocation.emit(80, h.now - 100);
  const result = await pending;
  assert.equal(result.accuracyMeters, 80);
  assert.equal(h.geolocation.cleared.length, 1);
  assert.equal(h.clearedTimers(), 1);
});

test("bounded timeout returns the best fresh observation even when it remains over 100 meters", async () => {
  const h = controlledAcquirer();
  const pending = h.acquirer.acquire({ fresh: true });
  h.geolocation.emit(240, h.now - 400);
  h.geolocation.emit(150, h.now - 200);
  h.expire();
  const result = await pending;
  assert.equal(result.accuracyMeters, 150);
  assert.equal(h.geolocation.cleared.length, 1);
  assert.equal(h.clearedTimers(), 1);
});

test("no observation produces a controlled timeout and permission denial remains distinct", async () => {
  const timeoutHarness = controlledAcquirer();
  const timedOut = timeoutHarness.acquirer.acquire({ fresh: true });
  timeoutHarness.expire();
  await assert.rejects(timedOut, (error: unknown) => error instanceof GpsAcquisitionError && error.reason === "timeout");

  const permissionHarness = controlledAcquirer();
  const denied = permissionHarness.acquirer.acquire({ fresh: true });
  permissionHarness.geolocation.fail(1);
  await assert.rejects(denied, (error: unknown) => error instanceof GpsAcquisitionError && error.reason === "permission_denied");
});

test("temporary unavailable errors remain bounded and report unavailable only after the acquisition window", async () => {
  const h = controlledAcquirer();
  const pending = h.acquirer.acquire({ fresh: true });
  h.geolocation.fail(2);
  assert.equal(h.acquirer.isAcquiring(), true);
  h.expire();
  await assert.rejects(pending, (error: unknown) => error instanceof GpsAcquisitionError && error.reason === "unavailable");
});

test("simultaneous retries share one watcher and completion clears its watcher and timer", async () => {
  const h = controlledAcquirer();
  const first = h.acquirer.acquire({ fresh: true });
  const second = h.acquirer.acquire({ fresh: true });
  assert.equal(first, second);
  assert.equal(h.geolocation.watchCalls, 1);
  h.geolocation.emit(75, h.now);
  assert.equal((await first).accuracyMeters, 75);
  assert.equal((await second).accuracyMeters, 75);
  assert.deepEqual(h.geolocation.cleared, [41]);
  assert.equal(h.clearedTimers(), 1);
});

test("component cancellation clears the active watcher and timer", async () => {
  const h = controlledAcquirer();
  const pending = h.acquirer.acquire({ fresh: true });
  h.acquirer.cancel();
  await assert.rejects(pending, (error: unknown) => error instanceof GpsAcquisitionError && error.reason === "cancelled");
  assert.deepEqual(h.geolocation.cleared, [41]);
  assert.equal(h.clearedTimers(), 1);
  assert.equal(h.acquirer.isAcquiring(), false);
});
