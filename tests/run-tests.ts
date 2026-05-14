import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import Stripe from "stripe";

type TestCase = {
  name: string;
  run: () => Promise<void> | void;
};

const tests: TestCase[] = [];

function test(name: string, run: TestCase["run"]) {
  tests.push({ name, run });
}

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-only-jwt-secret-32-characters-minimum";
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || "test-only-session-secret";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgres://user:pass@127.0.0.1:1/test";
process.env.STRIPE_SECRET_KEY =
  process.env.STRIPE_SECRET_KEY || "sk_test_unit_test_secret";

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    set(headers: Record<string, string>) {
      this.headers = { ...this.headers, ...headers };
      return this;
    },
    sendStatus(code: number) {
      this.statusCode = code;
      this.body = code;
      return this;
    },
  };
}

function createRouteRegistry() {
  const posts = new Map<string, Function>();
  const app = {
    post(path: string, ...handlers: Function[]) {
      posts.set(path, handlers[handlers.length - 1]);
    },
  };

  return { app, posts };
}

async function withPatchedStorage(
  patch: Record<string, unknown>,
  run: () => Promise<void>,
) {
  const { storage } = await import("../server/storage");
  const original = new Map<string, unknown>();

  for (const [key, value] of Object.entries(patch)) {
    original.set(key, storage[key]);
    storage[key] = value;
  }

  try {
    await run();
  } finally {
    for (const [key, value] of original.entries()) {
      storage[key] = value;
    }
  }
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user_1",
    username: "testuser",
    email: "test@example.com",
    passwordHash: "hashed-password",
    firstName: "Test",
    lastName: "User",
    phone: "555-0100",
    street: "1 Test Way",
    city: "Testville",
    state: "TX",
    zip: "75001",
    role: "driver",
    isActive: true,
    ...overrides,
  };
}

test("public registration rejects privileged roles", async () => {
  const { setupAuth } = await import("../server/tokenAuth");
  const { app, posts } = createRouteRegistry();
  await setupAuth(app as never);

  const register = posts.get("/api/register");
  assert.equal(typeof register, "function");

  let storageTouched = false;
  await withPatchedStorage(
    {
      getUserByUsernameInsensitive: async () => {
        storageTouched = true;
        return undefined;
      },
      getUserByEmail: async () => {
        storageTouched = true;
        return undefined;
      },
      createUser: async () => {
        storageTouched = true;
        return makeUser();
      },
    },
    async () => {
      for (const role of [undefined, "admin", "super_admin"]) {
        const res = createResponse();
        await register!(
          {
            body: {
              username: "blocked",
              email: "blocked@example.com",
              password: "password",
              firstName: "Blocked",
              lastName: "User",
              role,
            },
          },
          res,
        );

        assert.equal(res.statusCode, 400);
        assert.match((res.body as { message: string }).message, /Invalid role/);
      }
    },
  );

  assert.equal(storageTouched, false);
});

test("public registration allows driver and owner profiles only", async () => {
  const { setupAuth } = await import("../server/tokenAuth");
  const { app, posts } = createRouteRegistry();
  await setupAuth(app as never);

  const register = posts.get("/api/register");
  assert.equal(typeof register, "function");

  const createdProfiles: Array<{ type: string; userId: string }> = [];

  await withPatchedStorage(
    {
      getUserByUsernameInsensitive: async () => undefined,
      getUserByEmail: async () => undefined,
      createUser: async (userData: Record<string, unknown>) =>
        makeUser({
          id: `user_${userData.role}`,
          username: userData.username,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          passwordHash: userData.passwordHash,
        }),
      createDriver: async (driverData: { userId: string }) => {
        createdProfiles.push({ type: "driver", userId: driverData.userId });
        return { id: "driver_1", ...driverData };
      },
      createOwner: async (ownerData: { userId: string }) => {
        createdProfiles.push({ type: "owner", userId: ownerData.userId });
        return { id: "owner_1", ...ownerData };
      },
    },
    async () => {
      for (const role of ["driver", "owner"]) {
        const res = createResponse();
        await register!(
          {
            body: {
              username: `${role}user`,
              email: `${role}@example.com`,
              password: "password",
              firstName: "Allowed",
              lastName: "User",
              role,
            },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        assert.equal((res.body as { user: { role: string } }).user.role, role);
        assert.equal(
          "passwordHash" in (res.body as { user: Record<string, unknown> }).user,
          false,
        );
        assert.equal(typeof (res.body as { token: string }).token, "string");
      }
    },
  );

  assert.deepEqual(createdProfiles, [
    { type: "driver", userId: "user_driver" },
    { type: "owner", userId: "user_owner" },
  ]);
});

test("JWT auth rejects inactive users and strips password hashes", async () => {
  const { isAuthenticated } = await import("../server/tokenAuth");
  const token = jwt.sign(
    { userId: "user_1", username: "testuser" },
    process.env.JWT_SECRET!,
  );

  await withPatchedStorage(
    {
      getUserById: async () => makeUser({ isActive: false }),
    },
    async () => {
      const req = {
        method: "GET",
        path: "/api/me",
        headers: { authorization: `Bearer ${token}` },
      };
      const res = createResponse();
      let nextCalled = false;

      await isAuthenticated(req as never, res as never, () => {
        nextCalled = true;
      });

      assert.equal(res.statusCode, 403);
      assert.equal((res.body as { message: string }).message, "Account is inactive");
      assert.equal(nextCalled, false);
    },
  );

  await withPatchedStorage(
    {
      getUserById: async () => makeUser({ role: "owner" }),
    },
    async () => {
      const req = {
        method: "GET",
        path: "/api/me",
        headers: { authorization: `Bearer ${token}` },
        user: undefined as unknown,
      };
      const res = createResponse();
      let nextCalled = false;

      await isAuthenticated(req as never, res as never, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(res.statusCode, 200);
      assert.equal((req.user as { role: string }).role, "owner");
      assert.equal(
        "passwordHash" in (req.user as Record<string, unknown>),
        false,
      );
    },
  );
});

class FakeObjectFile {
  public metadata: Record<string, string> = {};
  public existsValue = true;

  constructor(public readonly name: string) {}

  async exists() {
    return [this.existsValue];
  }

  async getMetadata() {
    return [{ metadata: this.metadata }];
  }

  async setMetadata(input: { metadata: Record<string, string> }) {
    this.metadata = { ...this.metadata, ...input.metadata };
  }
}

test("object ACL policy metadata can be set and read", async () => {
  const { getObjectAclPolicy, setObjectAclPolicy } = await import(
    "../server/objectAcl"
  );
  const file = new FakeObjectFile("photos/test.jpg");
  const policy = {
    owner: "owner_1",
    visibility: "private" as const,
  };

  await setObjectAclPolicy(file as never, policy);

  assert.deepEqual(await getObjectAclPolicy(file as never), policy);
  assert.ok(file.metadata["custom:aclPolicy"]);

  const missing = new FakeObjectFile("photos/missing.jpg");
  missing.existsValue = false;
  await assert.rejects(
    () => setObjectAclPolicy(missing as never, policy),
    /Object not found: photos\/missing\.jpg/,
  );
});

test("object ACL enforces public read, private owner access, and default deny", async () => {
  const { ObjectPermission, canAccessObject } = await import("../server/objectAcl");

  const noPolicy = new FakeObjectFile("photos/no-policy.jpg");
  assert.equal(
    await canAccessObject({
      objectFile: noPolicy as never,
      requestedPermission: ObjectPermission.READ,
    }),
    false,
  );

  const publicFile = new FakeObjectFile("photos/public.jpg");
  publicFile.metadata["custom:aclPolicy"] = JSON.stringify({
    owner: "owner_1",
    visibility: "public",
  });

  assert.equal(
    await canAccessObject({
      objectFile: publicFile as never,
      requestedPermission: ObjectPermission.READ,
    }),
    true,
  );
  assert.equal(
    await canAccessObject({
      objectFile: publicFile as never,
      requestedPermission: ObjectPermission.WRITE,
    }),
    false,
  );

  const privateFile = new FakeObjectFile("photos/private.jpg");
  privateFile.metadata["custom:aclPolicy"] = JSON.stringify({
    owner: "owner_1",
    visibility: "private",
  });

  assert.equal(
    await canAccessObject({
      userId: "owner_1",
      objectFile: privateFile as never,
      requestedPermission: ObjectPermission.WRITE,
    }),
    true,
  );
  assert.equal(
    await canAccessObject({
      userId: "other_user",
      objectFile: privateFile as never,
      requestedPermission: ObjectPermission.READ,
    }),
    false,
  );
});

type DbMock = {
  selectResults: unknown[][];
  inserts: unknown[];
  updates: Array<{ table: unknown; payload: Record<string, unknown> }>;
};

async function withMockedDb(
  selectResults: unknown[][],
  run: (mock: DbMock) => Promise<void>,
) {
  const { db } = await import("../server/db");
  const dbObject = db as unknown as {
    select: unknown;
    insert: unknown;
    update: unknown;
  };
  const original = {
    select: dbObject.select,
    insert: dbObject.insert,
    update: dbObject.update,
  };
  const mock: DbMock = {
    selectResults: [...selectResults],
    inserts: [],
    updates: [],
  };

  dbObject.select = () => ({
    from: () => ({
      where: () => ({
        limit: async () => mock.selectResults.shift() || [],
      }),
    }),
  });
  dbObject.insert = () => ({
    values: async (payload: unknown) => {
      mock.inserts.push(payload);
      return [];
    },
  });
  dbObject.update = (table: unknown) => ({
    set: (payload: Record<string, unknown>) => ({
      where: async () => {
        mock.updates.push({ table, payload });
        return [];
      },
    }),
  });

  try {
    await run(mock);
  } finally {
    dbObject.select = original.select;
    dbObject.insert = original.insert;
    dbObject.update = original.update;
  }
}

function signedStripeEvent(type: string, object: Record<string, unknown>, id: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET!;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-08-27.basil",
  });
  const payload = JSON.stringify({
    id,
    object: "event",
    api_version: "2025-08-27.basil",
    created: Math.floor(Date.now() / 1000),
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });

  return { payload, signature };
}

test("payment webhooks require a configured secret and valid signature", async () => {
  const { processStripeWebhook } = await import("../server/webhookService");
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;

  delete process.env.STRIPE_WEBHOOK_SECRET;
  const missingSecret = await processStripeWebhook("{}", "bad-signature");
  assert.equal(missingSecret.success, false);
  assert.equal(missingSecret.error, "Missing webhook secret");

  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
  const invalidSignature = await processStripeWebhook("{}", "bad-signature");
  assert.equal(invalidSignature.success, false);
  assert.equal(invalidSignature.message, "Invalid signature");

  if (originalSecret === undefined) {
    delete process.env.STRIPE_WEBHOOK_SECRET;
  } else {
    process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
  }
});

test("payment_intent.succeeded webhooks complete matching payments", async () => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

  await withMockedDb([[], [{ id: "payment_1", activityId: "activity_1" }]], async (mock) => {
    const { processStripeWebhook } = await import("../server/webhookService");
    const { payload, signature } = signedStripeEvent(
      "payment_intent.succeeded",
      {
        id: "pi_succeeded",
        object: "payment_intent",
        amount: 2500,
        currency: "usd",
        metadata: { activity_id: "activity_1" },
        status: "succeeded",
      },
      "evt_payment_succeeded",
    );

    const result = await processStripeWebhook(payload, signature);

    assert.equal(result.success, true);
    assert.equal(result.message, "Payment payment_1 confirmed");
    assert.deepEqual(mock.inserts[0], {
      stripeEventId: "evt_payment_succeeded",
      eventType: "payment_intent.succeeded",
      status: "processing",
      payload: JSON.parse(payload),
      accountId: null,
    });
    assert.ok(
      mock.updates.some(
        ({ payload: update }) =>
          update.status === "completed" &&
          update.stripePaymentIntentId === "pi_succeeded",
      ),
    );
    assert.ok(
      mock.updates.some(
        ({ payload: update }) =>
          update.status === "processed" && update.processedAt instanceof Date,
      ),
    );
  });
});

test("payment_intent.payment_failed webhooks mark matching payments failed", async () => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

  await withMockedDb([[], [{ id: "payment_2", activityId: "activity_2" }]], async (mock) => {
    const { processStripeWebhook } = await import("../server/webhookService");
    const { payload, signature } = signedStripeEvent(
      "payment_intent.payment_failed",
      {
        id: "pi_failed",
        object: "payment_intent",
        amount: 2500,
        currency: "usd",
        metadata: { activity_id: "activity_2" },
        status: "requires_payment_method",
        last_payment_error: { message: "Card declined" },
      },
      "evt_payment_failed",
    );

    const result = await processStripeWebhook(payload, signature);

    assert.equal(result.success, true);
    assert.equal(result.message, "Payment payment_2 marked as failed");
    assert.equal(
      (mock.inserts[0] as { stripeEventId: string }).stripeEventId,
      "evt_payment_failed",
    );
    assert.ok(
      mock.updates.some(
        ({ payload: update }) =>
          update.status === "failed" &&
          update.stripePaymentIntentId === "pi_failed",
      ),
    );
  });
});

test("payment webhooks skip already processed Stripe events", async () => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

  await withMockedDb(
    [[{ stripeEventId: "evt_duplicate", status: "processed" }]],
    async (mock) => {
      const { processStripeWebhook } = await import("../server/webhookService");
      const { payload, signature } = signedStripeEvent(
        "payment_intent.succeeded",
        {
          id: "pi_duplicate",
          object: "payment_intent",
          amount: 2500,
          currency: "usd",
          metadata: { activity_id: "activity_duplicate" },
          status: "succeeded",
        },
        "evt_duplicate",
      );

      const result = await processStripeWebhook(payload, signature);

      assert.equal(result.success, true);
      assert.equal(result.message, "Event already processed (idempotent)");
      assert.equal(mock.inserts.length, 0);
      assert.equal(mock.updates.length, 0);
    },
  );
});

let failures = 0;

for (const { name, run } of tests) {
  try {
    await run();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

if (failures > 0) {
  console.error(`${failures}/${tests.length} tests failed`);
  process.exit(1);
}

console.log(`${tests.length} tests passed`);
process.exit(0);
