import assert from "node:assert/strict";
import test from "node:test";
import { getRequiredTermsForRole } from "../shared/terms";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "test-only-jwt-secret-32-characters-minimum";
process.env.SESSION_SECRET ||= "test-only-session-secret";
process.env.DATABASE_URL ||= "postgres://user:pass@127.0.0.1:1/test";

const user = { id: "driver-user", role: "driver" as const };

async function withStoragePatch(patch: Record<string, unknown>, run: () => Promise<void>) {
  const { storage } = await import("../server/storage");
  const original = new Map<string, unknown>();
  for (const [key, value] of Object.entries(patch)) {
    original.set(key, (storage as any)[key]);
    (storage as any)[key] = value;
  }
  try { await run(); } finally {
    for (const [key, value] of original) (storage as any)[key] = value;
  }
}

test("acceptance records a complete immutable language bundle and projection failure does not invalidate it", async () => {
  const acceptances: any[] = [];
  let legacyProjectionAttempts = 0;
  await withStoragePatch({
    getTermsAcceptancesForUser: async () => acceptances,
    createTermsAcceptanceBundleAtomically: async (versions: any[], entries: any[]) => {
      assert.equal(versions.length, 3);
      assert.equal(entries.length, 3);
      acceptances.push(...entries.map((entry, index) => ({ ...entry, id: `acceptance-${index}`, createdAt: new Date() })));
      return acceptances;
    },
    getDriver: async () => ({ id: "driver-profile", userId: user.id }),
    updateDriver: async () => { legacyProjectionAttempts += 1; throw new Error("projection failure"); },
  }, async () => {
    const { recordCurrentTermsAcceptance } = await import("../server/terms");
    const state = await recordCurrentTermsAcceptance(user, { headers: {} }, undefined, "es");
    assert.equal(state.requiresAcceptance, false);
    assert.equal(state.acceptedBundleLanguage, "es");
  });
  assert.equal(legacyProjectionAttempts, 1);
  assert.deepEqual(acceptances.map((entry) => entry.storageKey), getRequiredTermsForRole("driver", "es").map((doc) => doc.storageKey));
});

test("a failed authoritative bundle transaction never projects legacy acceptance", async () => {
  let projected = false;
  await withStoragePatch({
    createTermsAcceptanceBundleAtomically: async () => { throw new Error("second document failed"); },
    getDriver: async () => ({ id: "driver-profile", userId: user.id }),
    updateDriver: async () => { projected = true; },
  }, async () => {
    const { recordCurrentTermsAcceptance } = await import("../server/terms");
    await assert.rejects(() => recordCurrentTermsAcceptance(user, { headers: {} }, undefined, "en"), (error: any) => error?.code === "TERMS_LEDGER_UNAVAILABLE");
  });
  assert.equal(projected, false);
});

test("terms guard distinguishes ledger unavailability from current terms required", async () => {
  await withStoragePatch({
    getTermsAcceptancesForUser: async () => { throw new Error("ledger unavailable"); },
  }, async () => {
    const { requireCurrentTerms } = await import("../server/terms");
    const response: any = {
      statusCode: 200,
      body: undefined,
      status(code: number) { this.statusCode = code; return this; },
      json(value: unknown) { this.body = value; return this; },
    };
    let next = false;
    await requireCurrentTerms()({ user, headers: {} }, response, () => { next = true; });
    assert.equal(next, false);
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, {
      message: "Terms verification is temporarily unavailable",
      code: "TERMS_LEDGER_UNAVAILABLE",
    });
  });
});
