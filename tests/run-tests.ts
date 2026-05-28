import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import Stripe from "stripe";
import { ObjectStorageService } from "../server/objectStorage";

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
process.env.PRIVATE_OBJECT_DIR =
  process.env.PRIVATE_OBJECT_DIR || "private";
process.env.PUBLIC_OBJECT_SEARCH_PATHS =
  process.env.PUBLIC_OBJECT_SEARCH_PATHS || "public";

await import("./reports.test.ts");
await import("./owner-access.test.ts");

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
  const gets = new Map<string, Function>();
  const puts = new Map<string, Function>();
  const deletes = new Map<string, Function>();
  const patches = new Map<string, Function>();
  const app = {
    get(path: string, ...handlers: Function[]) {
      gets.set(path, handlers[handlers.length - 1]);
    },
    post(path: string, ...handlers: Function[]) {
      posts.set(path, handlers[handlers.length - 1]);
    },
    put(path: string, ...handlers: Function[]) {
      puts.set(path, handlers[handlers.length - 1]);
    },
    delete(path: string, ...handlers: Function[]) {
      deletes.set(path, handlers[handlers.length - 1]);
    },
    patch(path: string, ...handlers: Function[]) {
      patches.set(path, handlers[handlers.length - 1]);
    },
    use() {},
  };

  return { app, posts, gets, puts, deletes, patches };
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

async function withPatchedStripe(
  patch: Record<string, unknown>,
  run: () => Promise<void>,
) {
  const stripeService = await import("../server/stripeService");
  const stripeObject = stripeService.stripe as unknown as Record<string, unknown>;
  const original = new Map<string, unknown>();

  for (const [key, value] of Object.entries(patch)) {
    original.set(key, stripeObject[key]);
    stripeObject[key] = value;
  }

  try {
    await run();
  } finally {
    for (const [key, value] of original.entries()) {
      stripeObject[key] = value;
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

  assert.equal(
    await canAccessObject({
      userRole: "admin",
      objectFile: noPolicy as never,
      requestedPermission: ObjectPermission.READ,
    }),
    true,
  );
});

test("photo upload storage selection requires complete S3 config", async () => {
  const { getUploadStorageSelection } = await import("../server/objectStorage");
  const originalEnv = {
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
    PRIVATE_OBJECT_DIR: process.env.PRIVATE_OBJECT_DIR,
  };

  process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
  process.env.S3_REGION = "auto";
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.S3_BUCKET = "test-bucket";
  process.env.PRIVATE_OBJECT_DIR = "private";

  assert.deepEqual(getUploadStorageSelection(), {
    provider: "s3",
    bucket: "test-bucket",
    s3EndpointPresent: true,
  });

  delete process.env.S3_BUCKET;
  assert.throws(
    () => getUploadStorageSelection(),
    /Missing object storage env vars: S3_BUCKET/,
  );

  if (originalEnv.S3_ENDPOINT === undefined) delete process.env.S3_ENDPOINT;
  else process.env.S3_ENDPOINT = originalEnv.S3_ENDPOINT;
  if (originalEnv.S3_REGION === undefined) delete process.env.S3_REGION;
  else process.env.S3_REGION = originalEnv.S3_REGION;
  if (originalEnv.S3_ACCESS_KEY_ID === undefined) delete process.env.S3_ACCESS_KEY_ID;
  else process.env.S3_ACCESS_KEY_ID = originalEnv.S3_ACCESS_KEY_ID;
  if (originalEnv.S3_SECRET_ACCESS_KEY === undefined) delete process.env.S3_SECRET_ACCESS_KEY;
  else process.env.S3_SECRET_ACCESS_KEY = originalEnv.S3_SECRET_ACCESS_KEY;
  if (originalEnv.S3_BUCKET === undefined) delete process.env.S3_BUCKET;
  else process.env.S3_BUCKET = originalEnv.S3_BUCKET;
});

test("photo upload route uses S3 provider when S3 env vars are present", async () => {
  const originalEnv = {
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
    PRIVATE_OBJECT_DIR: process.env.PRIVATE_OBJECT_DIR,
  };
  const originalSend = S3Client.prototype.send;
  const originalLog = console.log;
  const logs: string[] = [];

  process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
  process.env.S3_REGION = "auto";
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.S3_BUCKET = "test-bucket";
  process.env.PRIVATE_OBJECT_DIR = "private";

  S3Client.prototype.send = (async (command: unknown) => {
    if (command instanceof HeadBucketCommand) {
      return {};
    }
    throw new Error(`Unexpected S3 command in test: ${command?.constructor?.name || "unknown"}`);
  }) as typeof S3Client.prototype.send;

  console.log = (...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(" "));
  };

  try {
    const expressApp = express();
    const routes = new Map<string, Function>();
    const originalPost = expressApp.post.bind(expressApp);
    (expressApp as typeof expressApp & { post: typeof expressApp.post }).post = ((path: string, ...handlers: Function[]) => {
      routes.set(path, handlers[handlers.length - 1]);
      return originalPost(path, ...handlers);
    }) as typeof expressApp.post;

    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(expressApp as never);

    const uploadRoute = routes.get("/api/photos/upload-url");
    assert.equal(typeof uploadRoute, "function");

    const req = {
      body: { contentType: "image/jpeg" },
      user: { id: "driver_1" },
    };
    const res = createResponse();

    await uploadRoute!(req as never, res as never);

    assert.equal(res.statusCode, 200);
    assert.equal(typeof (res.body as { uploadUrl: string }).uploadUrl, "string");
    assert.equal((res.body as { contentType: string }).contentType, "image/jpeg");
    assert.ok(
      logs.some((line) => line.includes("Photo upload provider selected: s3")),
    );
    assert.ok(
      logs.some((line) => line.includes("Signed URL generation succeeded")),
    );
  } finally {
    S3Client.prototype.send = originalSend;
    console.log = originalLog;
    if (originalEnv.S3_ENDPOINT === undefined) delete process.env.S3_ENDPOINT;
    else process.env.S3_ENDPOINT = originalEnv.S3_ENDPOINT;
    if (originalEnv.S3_REGION === undefined) delete process.env.S3_REGION;
    else process.env.S3_REGION = originalEnv.S3_REGION;
    if (originalEnv.S3_ACCESS_KEY_ID === undefined) delete process.env.S3_ACCESS_KEY_ID;
    else process.env.S3_ACCESS_KEY_ID = originalEnv.S3_ACCESS_KEY_ID;
    if (originalEnv.S3_SECRET_ACCESS_KEY === undefined) delete process.env.S3_SECRET_ACCESS_KEY;
    else process.env.S3_SECRET_ACCESS_KEY = originalEnv.S3_SECRET_ACCESS_KEY;
    if (originalEnv.S3_BUCKET === undefined) delete process.env.S3_BUCKET;
    else process.env.S3_BUCKET = originalEnv.S3_BUCKET;
    if (originalEnv.PRIVATE_OBJECT_DIR === undefined) delete process.env.PRIVATE_OBJECT_DIR;
    else process.env.PRIVATE_OBJECT_DIR = originalEnv.PRIVATE_OBJECT_DIR;
  }
});

test("photo upload route rejects unsupported formats and oversized files", async () => {
  const originalEnv = {
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
    PRIVATE_OBJECT_DIR: process.env.PRIVATE_OBJECT_DIR,
  };
  const originalSend = S3Client.prototype.send;
  process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
  process.env.S3_REGION = "auto";
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.S3_BUCKET = "test-bucket";
  process.env.PRIVATE_OBJECT_DIR = "private";

  S3Client.prototype.send = (async (command: unknown) => {
    if (command instanceof HeadBucketCommand) {
      return {};
    }
    throw new Error(`Unexpected S3 command in test: ${command?.constructor?.name || "unknown"}`);
  }) as typeof S3Client.prototype.send;

  try {
    const expressApp = express();
    const routes = new Map<string, Function>();
    const originalPost = expressApp.post.bind(expressApp);
    (expressApp as typeof expressApp & { post: typeof expressApp.post }).post = ((path: string, ...handlers: Function[]) => {
      routes.set(path, handlers[handlers.length - 1]);
      return originalPost(path, ...handlers);
    }) as typeof expressApp.post;

    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(expressApp as never);

    const uploadRoute = routes.get("/api/photos/upload-url");
    assert.equal(typeof uploadRoute, "function");

    const unsupportedRes = createResponse();
    await uploadRoute!(
      {
        body: { contentType: "image/gif", fileSize: 12345 },
        user: { id: "driver_1" },
      },
      unsupportedRes as never,
    );
    assert.equal(unsupportedRes.statusCode, 400);
    assert.match(
      String((unsupportedRes.body as { message?: string }).message || ""),
      /Unsupported photo format/,
    );

    const oversizedRes = createResponse();
    await uploadRoute!(
      {
        body: { contentType: "image/jpeg", fileSize: 20 * 1024 * 1024 },
        user: { id: "driver_1" },
      },
      oversizedRes as never,
    );
    assert.equal(oversizedRes.statusCode, 400);
    assert.match(
      String((oversizedRes.body as { message?: string }).message || ""),
      /Photo is too large/,
    );
  } finally {
    S3Client.prototype.send = originalSend;
    if (originalEnv.S3_ENDPOINT === undefined) delete process.env.S3_ENDPOINT;
    else process.env.S3_ENDPOINT = originalEnv.S3_ENDPOINT;
    if (originalEnv.S3_REGION === undefined) delete process.env.S3_REGION;
    else process.env.S3_REGION = originalEnv.S3_REGION;
    if (originalEnv.S3_ACCESS_KEY_ID === undefined) delete process.env.S3_ACCESS_KEY_ID;
    else process.env.S3_ACCESS_KEY_ID = originalEnv.S3_ACCESS_KEY_ID;
    if (originalEnv.S3_SECRET_ACCESS_KEY === undefined) delete process.env.S3_SECRET_ACCESS_KEY;
    else process.env.S3_SECRET_ACCESS_KEY = originalEnv.S3_SECRET_ACCESS_KEY;
    if (originalEnv.S3_BUCKET === undefined) delete process.env.S3_BUCKET;
    else process.env.S3_BUCKET = originalEnv.S3_BUCKET;
    if (originalEnv.PRIVATE_OBJECT_DIR === undefined) delete process.env.PRIVATE_OBJECT_DIR;
    else process.env.PRIVATE_OBJECT_DIR = originalEnv.PRIVATE_OBJECT_DIR;
  }
});

test("activity photo route returns signed GET URLs for authorized viewers when S3 is configured", async () => {
  const { app, gets } = createRouteRegistry();
  const originalEnv = {
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
  };
  const originalSend = S3Client.prototype.send;
  process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
  process.env.S3_REGION = "auto";
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.S3_BUCKET = "test-bucket";

  await withPatchedStorage(
    {
      getWashoutActivity: async () => ({
        id: "activity_1",
        locationId: "location_1",
        driverId: "driver_row_1",
      }),
      getWashoutLocation: async () => ({
        id: "location_1",
        ownerId: "owner_row_1",
      }),
      getOwner: async (userId: string) =>
        userId === "owner_user_1" ? { id: "owner_row_1", userId } : undefined,
      getDriver: async (userId: string) =>
        userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined,
      getUser: async (userId: string) =>
        userId === "admin_user_1"
          ? makeUser({ id: userId, role: "admin" })
          : makeUser({
              id: userId,
              role: userId === "owner_user_1" ? "owner" : "driver",
            }),
      getPhotosByActivity: async () => [
        {
          id: "photo_1",
          storageKey: "photo-1.jpg",
          uploadedAt: new Date("2025-01-01T00:00:00.000Z"),
          contentType: "image/jpeg",
          imageFingerprint: "ffffffffffffffff",
        },
      ],
      getRecentWashoutPhotoDuplicateCandidates: async () => [
        {
          photoId: "prior_photo_1",
          activityId: "activity_0",
          driverId: "driver_row_0",
          driverName: "Prior Driver",
          locationId: "location_0",
          locationName: "Prior Location",
          priorUploadedAt: "2024-12-01T00:00:00.000Z",
          imageFingerprint: "ffffffffffffffff",
        },
      ],
    },
    async () => {
      S3Client.prototype.send = (async () => ({})) as never;
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/photos/activity/:activityId");
      assert.equal(typeof route, "function");

      const ownerRes = createResponse();
      await route!(
        {
          params: { activityId: "activity_1" },
          user: { id: "owner_user_1", role: "owner" },
        },
        ownerRes,
      );
      assert.equal(ownerRes.statusCode, 200);
      assert.equal((ownerRes.body as { photos: Array<{ duplicateMatches?: unknown }> }).photos[0].duplicateMatches, undefined);
      assert.match(
        (ownerRes.body as { photos: Array<{ url: string }> }).photos[0].url,
        /^https:\/\/example\.r2\.cloudflarestorage\.com/,
      );
      assert.match(
        (ownerRes.body as { photos: Array<{ url: string }> }).photos[0].url,
        /X-Amz-Signature=/,
      );
      assert.match(
        (ownerRes.body as { photos: Array<{ url: string }> }).photos[0].url,
        /X-Amz-Credential=/,
      );

      const adminRes = createResponse();
      await route!(
        {
          params: { activityId: "activity_1" },
          user: { id: "admin_user_1", role: "admin" },
        },
        adminRes,
      );
      assert.equal(adminRes.statusCode, 200);
      assert.equal(
        ((adminRes.body as { photos: Array<{ duplicateMatches: Array<{ confidence: number }> }> }).photos[0].duplicateMatches || []).length,
        1,
      );
      assert.match(
        (adminRes.body as { photos: Array<{ url: string }> }).photos[0].url,
        /^https:\/\/example\.r2\.cloudflarestorage\.com/,
      );
    },
  );

  S3Client.prototype.send = originalSend;
  if (originalEnv.S3_ENDPOINT === undefined) delete process.env.S3_ENDPOINT;
  else process.env.S3_ENDPOINT = originalEnv.S3_ENDPOINT;
  if (originalEnv.S3_REGION === undefined) delete process.env.S3_REGION;
  else process.env.S3_REGION = originalEnv.S3_REGION;
  if (originalEnv.S3_ACCESS_KEY_ID === undefined) delete process.env.S3_ACCESS_KEY_ID;
  else process.env.S3_ACCESS_KEY_ID = originalEnv.S3_ACCESS_KEY_ID;
  if (originalEnv.S3_SECRET_ACCESS_KEY === undefined) delete process.env.S3_SECRET_ACCESS_KEY;
  else process.env.S3_SECRET_ACCESS_KEY = originalEnv.S3_SECRET_ACCESS_KEY;
  if (originalEnv.S3_BUCKET === undefined) delete process.env.S3_BUCKET;
  else process.env.S3_BUCKET = originalEnv.S3_BUCKET;
  if (originalEnv.PRIVATE_OBJECT_DIR === undefined) delete process.env.PRIVATE_OBJECT_DIR;
  else process.env.PRIVATE_OBJECT_DIR = originalEnv.PRIVATE_OBJECT_DIR;
});

test("create-with-photos applies ACL metadata for location owners", async () => {
  const { app, posts } = createRouteRegistry();
  const originalTrySetObjectEntityAclPolicy = ObjectStorageService.prototype.trySetObjectEntityAclPolicy;
  const aclCalls: Array<{ rawPath: string; aclPolicy: { owner: string; visibility: string; aclRules?: Array<{ group: { type: string; id: string }; permission: string }> } }> = [];

  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = (async function (
    this: unknown,
    rawPath: string,
    aclPolicy: { owner: string; visibility: string; aclRules?: Array<{ group: { type: string; id: string }; permission: string }> },
  ) {
    aclCalls.push({ rawPath, aclPolicy });
    return rawPath;
  }) as never;

  try {
    await withPatchedStorage(
      {
        getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
        getWashoutLocation: async (locationId: string) =>
          locationId === "location_1"
            ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
            : undefined,
        getRecentWashoutPhotoDuplicateCandidates: async () => [],
        createWashoutActivityWithPhotos: async (_activity: Record<string, unknown>, photos: Array<Record<string, unknown>>) => ({
          activity: { id: "activity_1", locationId: "location_1" },
          photos: photos.map((photo, index) => ({
            id: `photo_${index + 1}`,
            storageKey: photo.storageKey,
            contentType: photo.contentType,
            uploadedAt: new Date("2025-01-01T00:00:00.000Z"),
          })),
        }),
      },
      async () => {
        const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
        process.env.PRIVATE_OBJECT_DIR = "private";
        try {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = posts.get("/api/activities/create-with-photos");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: "driver_user_1", role: "driver" },
              body: {
                activityData: {
                  locationId: "location_1",
                  amount: "4.00",
                  checkInTime: "2025-01-01T00:00:00.000Z",
                  status: "pending",
                },
                photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2025-01-01T00:00:00.000Z",
                  uploadedAt: "2025-01-01T00:05:00.000Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
            res,
          );

          assert.equal(res.statusCode, 200);
          assert.equal(aclCalls.length, 1);
          assert.equal(aclCalls[0].rawPath, "/objects/photos/photo-1.jpg");
          assert.equal(aclCalls[0].aclPolicy.owner, "driver_user_1");
          assert.equal(aclCalls[0].aclPolicy.visibility, "private");
          assert.equal(aclCalls[0].aclPolicy.aclRules?.[0].group.type, "LOCATION_OWNER");
          assert.equal(aclCalls[0].aclPolicy.aclRules?.[0].group.id, "location_1");
          assert.equal(aclCalls[0].aclPolicy.aclRules?.[0].permission, "read");
        } finally {
          if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
          else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
        }
      },
    );
  } finally {
    ObjectStorageService.prototype.trySetObjectEntityAclPolicy = originalTrySetObjectEntityAclPolicy;
  }
});

test("create-with-photos rejects missing photo data with 400", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async () => {
        throw new Error("should not be called");
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "4.00",
                checkInTime: "2025-01-01T00:00:00.000Z",
                status: "pending",
              },
              photoData: [],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 400);
        assert.match(String((res.body as { message?: string }).message || ""), /At least one photo is required/i);
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );
});

test("create-with-photos rejects invalid status with 400", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async () => {
        throw new Error("should not be called");
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "4.00",
                checkInTime: "2025-01-01T00:00:00.000Z",
                status: "verified",
              },
              photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2025-01-01T00:00:00.000Z",
                  uploadedAt: "2025-01-01T00:05:00.000Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 400);
        assert.match(String((res.body as { message?: string }).message || ""), /Checkout must start in pending status/i);
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );
});

test("create-with-photos rejects missing gps metadata with 400", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async () => {
        throw new Error("should not be called");
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "4.00",
                checkInTime: "2025-01-01T00:00:00.000Z",
                status: "pending",
              },
              photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2025-01-01T00:00:00.000Z",
                  uploadedAt: "2025-01-01T00:05:00.000Z",
                  gpsLatitude: null,
                  gpsLongitude: null,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 400);
        assert.match(
          String((res.body as { message?: string }).message || ""),
          /enable GPS/i,
        );
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );
});

test("rubble complete rejects missing GPS coordinates with 400", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutActivity: async (visitId: string) =>
        visitId === "visit_1"
          ? { id: "visit_1", driverId: "driver_row_1", locationId: "location_1", serviceType: "rubble_dropoff", status: "in_progress", materialSlug: "dirt", materialCustomLabel: null }
          : undefined,
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      updateWashoutActivityStatus: async () => ({ id: "visit_1", locationId: "location_1" }),
      getLocationMaterialIntents: async () => [{ materialSlug: "dirt", driverPayCents: 100 }],
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = posts.get("/api/rubble/visits/:visitId/complete");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "driver_user_1", role: "driver" },
          params: { visitId: "visit_1" },
          body: {
            beforePhotoUrl: "/objects/photos/before.jpg",
            afterPhotoUrl: "/objects/photos/after.jpg",
          },
        },
        res,
      );

      assert.equal(res.statusCode, 400);
      assert.match(String((res.body as { message?: string }).message || ""), /GPS coordinates are required/i);
    },
  );
});

test("photo verification helper flags missing gps and out-of-range photos", async () => {
  const { evaluatePhotoVerification } = await import("../shared/photoVerification");

  const missingGps = evaluatePhotoVerification({
    gpsLatitude: null,
    gpsLongitude: null,
    locationLatitude: 40,
    locationLongitude: -100,
  });
  assert.equal(missingGps.status, "needs_review");
  assert.equal(missingGps.distanceMiles, null);

  const outOfRange = evaluatePhotoVerification({
    gpsLatitude: 41,
    gpsLongitude: -100,
    locationLatitude: 40,
    locationLongitude: -100,
  });
  assert.equal(outOfRange.status, "failed");
  assert.ok(outOfRange.distanceMiles != null);
});

test("photo fingerprint helper builds stable hashes and detects duplicates", async () => {
  const {
    buildAverageHashFromGrayscaleValues,
    calculatePhotoFingerprintHammingDistance,
    findLikelyDuplicatePhotoMatches,
  } = await import("../shared/photoFingerprint");

  const grayscale = Array.from({ length: 64 }, (_, index) => index);
  const fingerprint = buildAverageHashFromGrayscaleValues(grayscale);
  assert.equal(fingerprint.length, 16);

  const identicalDistance = calculatePhotoFingerprintHammingDistance(fingerprint, fingerprint);
  assert.equal(identicalDistance, 0);

  const matches = findLikelyDuplicatePhotoMatches(fingerprint, [
    {
      photoId: "photo_prior",
      activityId: "activity_prior",
      driverId: "driver_prior",
      driverName: "Prior Driver",
      locationId: "location_prior",
      locationName: "Prior Location",
      priorUploadedAt: "2025-01-01T00:00:00.000Z",
      imageFingerprint: fingerprint,
    },
  ]);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].confidence, 100);
  assert.equal(matches[0].hashDistance, 0);
});

test("create-with-photos stores verification metadata from driver gps", async () => {
  const { app, posts } = createRouteRegistry();
  let capturedPhotos: Array<Record<string, unknown>> = [];
  const originalTrySetObjectEntityAclPolicy = ObjectStorageService.prototype.trySetObjectEntityAclPolicy;
  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = (async function (
    this: unknown,
    rawPath: string,
  ) {
    return rawPath;
  }) as never;

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async (_activity: Record<string, unknown>, photos: Array<Record<string, unknown>>) => {
        capturedPhotos = photos;
        return {
          activity: { id: "activity_1", locationId: "location_1" },
          photos: photos.map((photo, index) => ({
            id: `photo_${index + 1}`,
            storageKey: photo.storageKey,
            contentType: photo.contentType,
            uploadedAt: new Date("2025-01-01T00:00:00.000Z"),
            photoTakenAt: photo.photoTakenAt,
            gpsLatitude: photo.gpsLatitude,
            gpsLongitude: photo.gpsLongitude,
            verificationStatus: photo.verificationStatus,
            verificationDistanceMiles: photo.verificationDistanceMiles,
            verificationReason: photo.verificationReason,
            driverId: photo.driverId,
            locationId: photo.locationId,
          })),
        };
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "4.00",
                checkInTime: "2025-01-01T00:00:00.000Z",
                status: "pending",
              },
              photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2025-01-01T00:00:00.000Z",
                  uploadedAt: "2025-01-01T00:05:00.000Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        assert.equal(capturedPhotos.length, 1);
        assert.equal(capturedPhotos[0].driverId, "driver_row_1");
        assert.equal(capturedPhotos[0].locationId, "location_1");
        assert.equal(capturedPhotos[0].verificationStatus, "verified");
        assert.equal(capturedPhotos[0].verificationDistanceMiles, "0.000");
        assert.equal(capturedPhotos[0].verificationReason, "Within 1 mile of the washout location.");
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );

  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = originalTrySetObjectEntityAclPolicy;
});

test("create-with-photos marks moderately stale photos for review", async () => {
  const { app, posts } = createRouteRegistry();
  let capturedPhotos: Array<Record<string, unknown>> = [];
  const originalTrySetObjectEntityAclPolicy = ObjectStorageService.prototype.trySetObjectEntityAclPolicy;
  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = (async function (
    this: unknown,
    rawPath: string,
  ) {
    return rawPath;
  }) as never;

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async (_activity: Record<string, unknown>, photos: Array<Record<string, unknown>>) => {
        capturedPhotos = photos;
        return {
          activity: { id: "activity_1", locationId: "location_1" },
          photos: photos.map((photo, index) => ({
            id: `photo_${index + 1}`,
            storageKey: photo.storageKey,
            contentType: photo.contentType,
            uploadedAt: new Date("2026-05-22T21:23:05.084Z"),
            photoTakenAt: photo.photoTakenAt,
            gpsLatitude: photo.gpsLatitude,
            gpsLongitude: photo.gpsLongitude,
            verificationStatus: photo.verificationStatus,
            verificationDistanceMiles: photo.verificationDistanceMiles,
            verificationReason: photo.verificationReason,
            driverId: photo.driverId,
            locationId: photo.locationId,
          })),
        };
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "0.01",
                checkInTime: "2026-05-22T21:23:05.084Z",
                status: "pending",
              },
              photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2026-05-22T13:00:00.000Z",
                  uploadedAt: "2026-05-22T21:23:05.084Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        assert.equal(capturedPhotos.length, 1);
        assert.equal(capturedPhotos[0].verificationStatus, "needs_review");
        assert.match(String(capturedPhotos[0].verificationReason), /marked for review/i);
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );

  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = originalTrySetObjectEntityAclPolicy;
});

test("create-with-photos rejects stale photo metadata", async () => {
  const { app, posts } = createRouteRegistry();
  const originalTrySetObjectEntityAclPolicy = ObjectStorageService.prototype.trySetObjectEntityAclPolicy;
  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = (async function (
    this: unknown,
    rawPath: string,
  ) {
    return rawPath;
  }) as never;

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async () => {
        throw new Error("should not be called");
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "0.01",
                checkInTime: "2026-05-22T21:23:05.084Z",
                status: "pending",
              },
              photoData: [
                {
                  storageKey: "photo-1779484984494-yl95qr87o.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2026-04-08T15:05:31.590Z",
                  uploadedAt: "2026-05-22T21:23:05.084Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 400);
        assert.match(
          String((res.body as { message?: string }).message || ""),
          /Please take a new photo at the washout site before completing checkout\./,
        );
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );

  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = originalTrySetObjectEntityAclPolicy;
});

test("create-with-photos marks duplicate lookup failures for review instead of crashing", async () => {
  const { app, posts } = createRouteRegistry();
  let capturedPhotos: Array<Record<string, unknown>> = [];
  const originalTrySetObjectEntityAclPolicy = ObjectStorageService.prototype.trySetObjectEntityAclPolicy;
  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = (async function (
    this: unknown,
    rawPath: string,
  ) {
    return rawPath;
  }) as never;

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => {
        throw new Error("duplicate lookup offline");
      },
      createWashoutActivityWithPhotos: async (_activity: Record<string, unknown>, photos: Array<Record<string, unknown>>) => {
        capturedPhotos = photos;
        return {
          activity: { id: "activity_1", locationId: "location_1" },
          photos: photos.map((photo, index) => ({
            id: `photo_${index + 1}`,
            storageKey: photo.storageKey,
            contentType: photo.contentType,
            uploadedAt: new Date("2026-05-22T21:23:05.084Z"),
            photoTakenAt: photo.photoTakenAt,
            gpsLatitude: photo.gpsLatitude,
            gpsLongitude: photo.gpsLongitude,
            verificationStatus: photo.verificationStatus,
            verificationDistanceMiles: photo.verificationDistanceMiles,
            verificationReason: photo.verificationReason,
            driverId: photo.driverId,
            locationId: photo.locationId,
          })),
        };
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "0.01",
                latitude: "40.000000",
                longitude: "-100.000000",
                notes: "Mobile checkout",
                checkInTime: "2026-05-22T21:23:05.084Z",
                status: "pending",
              },
              photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2026-05-22T20:55:31.590Z",
                  uploadedAt: "2026-05-22T21:23:05.084Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        assert.equal(capturedPhotos.length, 1);
        assert.equal(capturedPhotos[0].verificationStatus, "needs_review");
        assert.match(String(capturedPhotos[0].verificationReason), /duplicate verification unavailable/i);
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );

  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = originalTrySetObjectEntityAclPolicy;
});

test("create-with-photos rejects missing photo metadata", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async () => {
        throw new Error("should not be called");
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "0.01",
                checkInTime: "2026-05-22T21:23:05.084Z",
                status: "pending",
              },
              photoData: [
                {
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2026-05-22T15:05:31.590Z",
                  uploadedAt: "2026-05-22T21:23:05.084Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 400);
        assert.match(
          String((res.body as { message?: string }).message || ""),
          /missing its storage key/i,
        );
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );
});

test("create-with-photos returns a schema message when the db insert fails", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async () => {
        const error = new Error('column "photo_taken_at" of relation "washout_photos" does not exist') as Error & {
          code?: string;
          table?: string;
          column?: string;
        };
        error.code = "42703";
        error.table = "washout_photos";
        error.column = "photo_taken_at";
        throw error;
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "0.01",
                latitude: "40.000000",
                longitude: "-100.000000",
                notes: "Mobile checkout",
                checkInTime: "2026-05-22T21:23:05.084Z",
                status: "pending",
              },
              photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2026-05-22T20:55:31.590Z",
                  uploadedAt: "2026-05-22T21:23:05.084Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 500);
        assert.match(
          String((res.body as { message?: string }).message || ""),
          /Database schema is missing required photo metadata fields\. Please deploy the latest migration\./,
        );
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );
});

test("create-with-photos flags duplicate fingerprints for review", async () => {
  const { app, posts } = createRouteRegistry();
  let capturedPhotos: Array<Record<string, unknown>> = [];
  let duplicateWindowStart: Date | null = null;
  const originalTrySetObjectEntityAclPolicy = ObjectStorageService.prototype.trySetObjectEntityAclPolicy;
  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = (async function (
    this: unknown,
    rawPath: string,
  ) {
    return rawPath;
  }) as never;

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async (since: Date) => {
        duplicateWindowStart = since;
        return [
        {
          photoId: "prior_photo_1",
          activityId: "activity_prior",
          driverId: "driver_row_9",
          driverName: "Prior Driver",
          locationId: "location_prior",
          locationName: "Prior Location",
          priorUploadedAt: "2025-01-01T00:00:00.000Z",
          imageFingerprint: "ffffffffffffffff",
        },
      ];
      },
      createWashoutActivityWithPhotos: async (_activity: Record<string, unknown>, photos: Array<Record<string, unknown>>) => {
        capturedPhotos = photos;
        return {
          activity: { id: "activity_1", locationId: "location_1" },
          photos: photos.map((photo, index) => ({
            id: `photo_${index + 1}`,
            storageKey: photo.storageKey,
            contentType: photo.contentType,
            uploadedAt: new Date("2025-01-01T00:00:00.000Z"),
            photoTakenAt: photo.photoTakenAt,
            gpsLatitude: photo.gpsLatitude,
            gpsLongitude: photo.gpsLongitude,
            verificationStatus: photo.verificationStatus,
            verificationDistanceMiles: photo.verificationDistanceMiles,
            verificationReason: photo.verificationReason,
            driverId: photo.driverId,
            locationId: photo.locationId,
            duplicateMatches: photo.duplicateMatches,
            imageFingerprint: photo.imageFingerprint,
          })),
        };
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "4.00",
                checkInTime: "2025-01-01T00:00:00.000Z",
                status: "pending",
              },
              photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2025-01-01T00:00:00.000Z",
                  uploadedAt: "2025-01-01T00:05:00.000Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "ffffffffffffffff",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        assert.equal(capturedPhotos.length, 1);
        assert.ok(duplicateWindowStart instanceof Date);
        const lookbackDays =
          (Date.now() - duplicateWindowStart.getTime()) / (24 * 60 * 60 * 1000);
        assert.ok(lookbackDays > 89 && lookbackDays < 91);
        assert.equal(capturedPhotos[0].verificationStatus, "needs_review");
        assert.equal(capturedPhotos[0].duplicateMatchedPhotoId, "prior_photo_1");
        assert.equal(capturedPhotos[0].duplicateSimilarityScore, 100);
        assert.equal(capturedPhotos[0].duplicateHashDistance, 0);
        assert.match(
          String(capturedPhotos[0].verificationReason),
          /Possible duplicate photo detected/,
        );
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );

  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = originalTrySetObjectEntityAclPolicy;
});

test("owner verify rejects washouts outside the owner's locations", async () => {
  const { app, puts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getOwner: async () => ({
        id: "owner_1",
        userId: "user_1",
        useCustomBillingModel: true,
        customWashoutRate: "12.00",
      }),
      getWashoutActivity: async () => ({
        id: "activity_1",
        locationId: "location_other",
        status: "pending",
        amount: "10.00",
        driverId: "driver_row_1",
        serviceType: "washout",
      }),
      getWashoutLocation: async () => ({
        id: "location_other",
        ownerId: "owner_other",
      }),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/owners/activities/:id/verify");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { id: "activity_1" },
          user: { id: "user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 403);
      assert.match(
        String((res.body as { message?: string }).message || ""),
        /does not belong to your location/i,
      );
    },
  );
});

test("owner verify rejects already processed washouts", async () => {
  const { app, puts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getOwner: async () => ({
        id: "owner_1",
        userId: "user_1",
        useCustomBillingModel: true,
        customWashoutRate: "12.00",
      }),
      getWashoutActivity: async () => ({
        id: "activity_1",
        locationId: "location_1",
        status: "rejected",
        amount: "10.00",
        driverId: "driver_row_1",
        serviceType: "washout",
      }),
      getWashoutLocation: async () => ({
        id: "location_1",
        ownerId: "owner_1",
      }),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/owners/activities/:id/verify");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { id: "activity_1" },
          user: { id: "user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 409);
      assert.match(
        String((res.body as { message?: string }).message || ""),
        /already been processed/i,
      );
      assert.equal((res.body as { details?: { currentStatus?: string } }).details?.currentStatus, "rejected");
    },
  );
});

test("owner verify approves legacy pending washouts and falls back when driver Stripe is missing", async () => {
  const { app, puts } = createRouteRegistry();
  let verified = false;
  let createdPayment = false;

  await withPatchedStorage(
    {
      getOwner: async () => ({
        id: "owner_1",
        userId: "user_1",
        useCustomBillingModel: false,
        customWashoutRate: null,
        stripeCustomerId: "cus_owner_1",
        stripePaymentMethodId: "pm_owner_1",
      }),
      getWashoutActivity: async () => ({
        id: "activity_1",
        locationId: "location_1",
        status: "pending_owner_approval",
        amount: "10.00",
        driverId: "driver_row_1",
        serviceType: "washout",
      }),
      getWashoutLocation: async () => ({
        id: "location_1",
        ownerId: "owner_1",
      }),
      getOwnerBillingSettings: async () => ({
        billingCadence: "immediate",
        billingTimezone: "America/Chicago",
        billingCutoffTime: "23:59:00",
      }),
      calculateBusinessDateForOwner: async () => "2026-05-28",
      getDriverById: async () => ({
        id: "driver_row_1",
        userId: "driver_user_1",
      }),
      getUserById: async () => ({
        id: "driver_user_1",
        username: "driver1",
        firstName: "Driver",
        lastName: "One",
        stripeConnectAccountId: null,
      }),
            createPayment: async () => {
              createdPayment = true;
              return {
                id: "payment_1",
                status: "awaiting_driver_stripe",
                payoutStatus: "not_started",
              };
            },
      verifyWashoutActivity: async () => {
        verified = true;
        return {
          id: "activity_1",
          locationId: "location_1",
          status: "verified",
          amount: "10.00",
          driverId: "driver_row_1",
          serviceType: "washout",
        };
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/owners/activities/:id/verify");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { id: "activity_1" },
          user: { id: "user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal(verified, true);
      assert.equal(createdPayment, true);
      assert.equal((res.body as { status?: string }).status, "verified");
      assert.equal((res.body as { paymentStatus?: string }).paymentStatus, "awaiting_driver_stripe");
      assert.equal((res.body as { payoutStatus?: string }).payoutStatus, "not_started");
      assert.match(String((res.body as { message?: string }).message || ""), /payment will be processed once the driver completes payment setup/i);
    },
  );
});

test("owner verify charges normally when driver Stripe is ready", async () => {
  const { app, puts } = createRouteRegistry();
  let createdPayment: Record<string, unknown> | null = null;
  let walletCredits = 0;

  await withMockedDb([[]], async (mock) => {
    await withPatchedStripe(
      {
        accounts: {
          retrieve: async () => ({
            id: "acct_driver_1",
            capabilities: { transfers: "active" },
          }),
        },
        paymentMethods: {
          retrieve: async () => ({
            id: "pm_owner_1",
            type: "card",
            card: { brand: "visa", last4: "4242" },
          }),
        },
        paymentIntents: {
          create: async () => ({
            id: "pi_1",
            status: "succeeded",
          }),
        },
      },
      async () => {
        await withPatchedStorage(
          {
            getOwner: async () => ({
              id: "owner_1",
              userId: "user_1",
              useCustomBillingModel: false,
              customWashoutRate: null,
              stripeCustomerId: "cus_owner_1",
              stripePaymentMethodId: "pm_owner_1",
            }),
            getWashoutActivity: async () => ({
              id: "activity_1",
              locationId: "location_1",
              status: "pending",
              amount: "10.00",
              driverId: "driver_row_1",
              serviceType: "washout",
            }),
            getWashoutLocation: async () => ({
              id: "location_1",
              ownerId: "owner_1",
              name: "Site A",
            }),
            getOwnerBillingSettings: async () => ({
              billingCadence: "immediate",
              billingTimezone: "America/Chicago",
              billingCutoffTime: "23:59:00",
            }),
            calculateBusinessDateForOwner: async () => "2026-05-28",
            getDriverById: async () => ({
              id: "driver_row_1",
              userId: "driver_user_1",
            }),
            getUserById: async () => ({
              id: "driver_user_1",
              username: "driver1",
              firstName: "Driver",
              lastName: "One",
              stripeConnectAccountId: "acct_driver_1",
            }),
            getDriverWallet: async () => null,
            createDriverWallet: async () => ({ id: "wallet_1" }),
            adjustDriverWalletBalance: async () => undefined,
            createWalletTransaction: async () => undefined,
            createPayment: async (payment: Record<string, unknown>) => {
              createdPayment = payment;
              return {
                id: "payment_1",
                ...payment,
              } as any;
            },
            updatePaymentStatus: async () => ({
              id: "payment_1",
              status: "completed",
            }),
            verifyWashoutActivity: async () => ({
              id: "activity_1",
              locationId: "location_1",
              status: "verified",
              amount: "10.00",
              driverId: "driver_row_1",
              serviceType: "washout",
            }),
          },
          async () => {
            const { registerRoutes } = await import("../server/routes");
            await registerRoutes(app as never);
            const route = puts.get("/api/owners/activities/:id/verify");
            assert.equal(typeof route, "function");

            const res = createResponse();
            await route!(
              {
                params: { id: "activity_1" },
                user: { id: "user_1" },
              },
              res,
            );

            assert.equal(res.statusCode, 200);
            assert.equal((res.body as { status?: string }).status, "verified");
            assert.equal(createdPayment?.status, "completed");
          },
        );
      },
    );
  });
});

test("driver dashboard shows approved washouts awaiting Stripe setup", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async () => ({
        id: "driver_row_1",
        userId: "driver_user_1",
        truckNumber: "Truck 1",
      }),
      getActivitiesByDriver: async () => [],
      getDriverStats: async () => ({ totalEarnings: 0, totalWashouts: 0, avgPerWashout: 0 }),
      getRecentActivitiesByDriver: async () => [],
      getUser: async () => ({
        id: "driver_user_1",
        username: "driver1",
        firstName: "Driver",
        lastName: "One",
      }),
      getFeatureFlag: async () => ({ enabled: false }),
      getDriverLotteryEntryCount: async () => 0,
      getPaymentsAwaitingDriverStripeByDriver: async () => ([
        {
          id: "payment_1",
          amount: "10.00",
          processingFee: "5.00",
          status: "awaiting_driver_stripe",
          payoutStatus: "not_started",
          location: { name: "Site A" },
          activity: { locationId: "location_1" },
        },
      ]),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/drivers/dashboard");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "driver_user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal((res.body as { awaitingDriverStripeCount?: number }).awaitingDriverStripeCount, 1);
      assert.equal(
        (res.body as { awaitingDriverStripePayments?: Array<{ status?: string }> }).awaitingDriverStripePayments?.[0]?.status,
        "awaiting_driver_stripe",
      );
    },
  );
});

test("admin dashboard shows payments awaiting driver Stripe setup", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "admin",
      }),
      getSystemStats: async () => ({ totalEarnings: 0, totalWashouts: 0, totalDrivers: 0, totalOwners: 0 }),
      getPaymentsAwaitingDriverStripe: async () => ([
        {
          id: "payment_1",
          amount: "10.00",
          processingFee: "5.00",
          status: "awaiting_driver_stripe",
          payoutStatus: "not_started",
          driverUser: { username: "driver1" },
          activity: { location: { name: "Site A", street: "1 Main St" } },
          location: { name: "Site A", street: "1 Main St" },
        },
      ]),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/dashboard");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal((res.body as { awaitingDriverStripeCount?: number }).awaitingDriverStripeCount, 1);
    },
  );
});

test("deferred driver Stripe payment can be processed once the driver is ready", async () => {
  const { app, posts } = createRouteRegistry();
  let paymentStatusUpdates: Array<Record<string, unknown>> = [];

  await withMockedDb([[]], async (mock) => {
    await withPatchedStripe(
      {
        accounts: {
          retrieve: async () => ({
            id: "acct_driver_1",
            capabilities: { transfers: "active" },
          }),
        },
        paymentMethods: {
          retrieve: async () => ({
            id: "pm_owner_1",
            type: "card",
            card: { brand: "visa", last4: "4242" },
          }),
        },
        paymentIntents: {
          create: async () => ({
            id: "pi_deferred_1",
            status: "succeeded",
          }),
        },
      },
      async () => {
        await withPatchedStorage(
          {
            getPaymentById: async () => ({
              id: "payment_1",
              activityId: "activity_1",
              driverId: "driver_row_1",
              ownerId: "owner_1",
              amount: "10.00",
              processingFee: "5.00",
              washoutServiceFee: "5.00",
              payoutStatus: "not_started",
              status: "awaiting_driver_stripe",
              businessDate: "2026-05-28",
            }),
            getWashoutActivity: async () => ({
              id: "activity_1",
              locationId: "location_1",
              status: "verified",
              amount: "10.00",
              driverId: "driver_row_1",
              serviceType: "washout",
            }),
            getWashoutLocation: async () => ({
              id: "location_1",
              ownerId: "owner_1",
              name: "Site A",
              street: "1 Main St",
            }),
            getOwnerById: async () => ({
              id: "owner_1",
              userId: "user_owner_1",
              useCustomBillingModel: false,
              customWashoutRate: null,
              stripeCustomerId: "cus_owner_1",
              stripePaymentMethodId: "pm_owner_1",
            }),
            getUser: async (id: string) => {
              if (id === "admin_1") {
                return {
                  id: "admin_1",
                  username: "admin1",
                  role: "admin",
                };
              }
              if (id === "user_owner_1") {
                return {
                  id: "user_owner_1",
                  username: "owner1",
                  firstName: "Owner",
                  lastName: "One",
                  stripeCustomerId: "cus_owner_1",
                  stripePaymentMethodId: "pm_owner_1",
                };
              }
              return {
                id: "driver_user_1",
                username: "driver1",
                firstName: "Driver",
                lastName: "One",
                stripeConnectAccountId: "acct_driver_1",
              };
            },
            getDriverById: async () => ({
              id: "driver_row_1",
              userId: "driver_user_1",
            }),
            getDriverWallet: async () => null,
            createDriverWallet: async () => ({ id: "wallet_1" }),
            adjustDriverWalletBalance: async () => undefined,
            createWalletTransaction: async () => undefined,
            createDriverLotteryEntry: async () => ({ id: "lottery_1" }),
            updatePaymentStatus: async () => ({
              id: "payment_1",
              status: "completed",
            }),
          },
          async () => {
            const { registerRoutes } = await import("../server/routes");
            await registerRoutes(app as never);
            const route = posts.get("/api/admin/payments/process-awaiting-driver-stripe");
            assert.equal(typeof route, "function");

            const res = createResponse();
            await route!(
              {
                body: { paymentId: "payment_1" },
                user: { id: "admin_1", role: "admin" },
              },
              res,
            );

            assert.equal(res.statusCode, 200);
            assert.equal((res.body as { processed?: number }).processed, 1);
            assert.equal((res.body as { skipped?: number }).skipped, 0);
            assert.equal((res.body as { failed?: number }).failed, 0);
            paymentStatusUpdates = mock.updates;
          },
        );
      },
    );
  });

  assert.ok(paymentStatusUpdates.length > 0);
});

test("owner verify is idempotent for lottery entry creation on retry", async () => {
  const { app, puts } = createRouteRegistry();
  let activityStatus: "pending" | "verified" | "rejected" = "pending";
  let lotteryEntryCalls = 0;

  await withMockedDb([[]], async () => {
    await withPatchedStripe(
      {
        accounts: {
          retrieve: async () => ({
            id: "acct_driver_1",
            capabilities: { transfers: "active" },
          }),
        },
      },
      async () => {
        await withPatchedStorage(
          {
            getOwner: async () => ({
              id: "owner_1",
              userId: "user_1",
              useCustomBillingModel: true,
              customWashoutRate: "12.00",
            }),
            getWashoutActivity: async () => ({
              id: "activity_1",
              locationId: "location_1",
              status: activityStatus,
              amount: "10.00",
              driverId: "driver_row_1",
              serviceType: "washout",
            }),
            getWashoutLocation: async () => ({
              id: "location_1",
              ownerId: "owner_1",
            }),
            getOwnerBillingSettings: async () => ({
              billingCadence: "weekly",
              billingTimezone: "America/Chicago",
              billingCutoffTime: "23:59:00",
            }),
            calculateBusinessDateForOwner: async () => "2026-05-22",
            getDriverById: async () => ({
              id: "driver_row_1",
              userId: "driver_user_1",
            }),
            getUserById: async () => ({
              id: "driver_user_1",
              username: "driver1",
              firstName: "Driver",
              lastName: "One",
              stripeConnectAccountId: "acct_driver_1",
            }),
            getFeatureFlag: async () => ({ enabled: true }),
            createPayment: async () => ({
              id: "payment_1",
            }),
            verifyWashoutActivity: async () => {
              activityStatus = "verified";
              return {
                id: "activity_1",
                locationId: "location_1",
                status: "verified",
                amount: "10.00",
                driverId: "driver_row_1",
                serviceType: "washout",
              };
            },
            createDriverLotteryEntry: async () => {
              lotteryEntryCalls += 1;
              return {
                id: "lottery_entry_1",
                driverId: "driver_row_1",
                activityId: "activity_1",
                ownerId: "owner_1",
                ticketNumber: "CX-202605-0001",
                entriesEarned: 1,
                lotteryMonth: 5,
                lotteryYear: 2026,
                isArchived: false,
              };
            },
          },
          async () => {
            const { registerRoutes } = await import("../server/routes");
            await registerRoutes(app as never);
            const route = puts.get("/api/owners/activities/:id/verify");
            assert.equal(typeof route, "function");

            const firstRes = createResponse();
            await route!(
              {
                params: { id: "activity_1" },
                user: { id: "user_1" },
              },
              firstRes,
            );

            assert.equal(firstRes.statusCode, 200);
            assert.equal(lotteryEntryCalls, 1);

            const secondRes = createResponse();
            await route!(
              {
                params: { id: "activity_1" },
                user: { id: "user_1" },
              },
              secondRes,
            );

            assert.equal(secondRes.statusCode, 409);
            assert.equal(lotteryEntryCalls, 1);
          },
        );
      },
    );
  });
});

for (const winnerCount of [1, 2, 3] as const) {
  test(`lottery drawing sends winner and participant messages for ${winnerCount} winner${winnerCount === 1 ? "" : "s"}`, async () => {
    const fixture = createLotteryMessagingFixture(winnerCount);
    const route = await getLotteryExecuteRoute();

    await withPatchedStorage(fixture.patch, async () => {
      await withMockedRandom(0, async () => {
        const res = createResponse();
        await route(
          {
            user: { id: "admin_user_1" },
            body: {
              month: 5,
              year: 2026,
              numberOfWinners: winnerCount,
              firstPrize: "Gold Prize",
              secondPrize: winnerCount >= 2 ? "Silver Prize" : "",
              thirdPrize: winnerCount >= 3 ? "Bronze Prize" : "",
            },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        const body = res.body as any;
        assert.equal(body.drawing.winnerNotificationCount, winnerCount);
        assert.equal(body.drawing.participantNotificationCount, 3);

        const winnerMessages = fixture.state.notificationCalls.filter((call) => call.notificationKind === "winner");
        const participantMessages = fixture.state.notificationCalls.filter((call) => call.notificationKind === "participant");
        assert.equal(winnerMessages.length, winnerCount);
        assert.equal(participantMessages.length, 3);

        const participantUserIds = new Set(participantMessages.map((call) => call.userId));
        assert.deepEqual(participantUserIds, new Set(["driver_user_1", "driver_user_2", "driver_user_3"]));

        const winnerUserIds = new Set(winnerMessages.map((call) => call.userId));
        for (const userId of winnerUserIds) {
          assert(participantUserIds.has(userId), "winners should receive the general announcement too");
        }

        const participantMessage = participantMessages[0];
        assert(participantMessage.message.includes("Winners:"));
        assert(participantMessage.message.includes("Alex Stone"));
        assert(!participantMessage.message.includes("@"));
        assert(!participantMessage.message.includes("555"));
        assert.deepEqual(
          participantMessage.data.winners,
          winnerMessages.map((call, index) => ({
            place: index + 1,
            driverName: call.data.driverName,
          })),
        );
      });
    });
  });
}

test("lottery drawing retry does not duplicate winner or participant messages", async () => {
  const fixture = createLotteryMessagingFixture(3);
  const route = await getLotteryExecuteRoute();

  await withPatchedStorage(fixture.patch, async () => {
    await withMockedRandom(0, async () => {
      const firstRes = createResponse();
      await route(
        {
          user: { id: "admin_user_1" },
          body: {
            month: 5,
            year: 2026,
            numberOfWinners: 3,
            firstPrize: "Gold Prize",
            secondPrize: "Silver Prize",
            thirdPrize: "Bronze Prize",
          },
        },
        firstRes,
      );

      assert.equal(firstRes.statusCode, 200);
      const firstCount = fixture.state.notificationCalls.length;
      assert.equal(firstCount, 6);

      const secondRes = createResponse();
      await route(
        {
          user: { id: "admin_user_1" },
          body: {
            month: 5,
            year: 2026,
            numberOfWinners: 3,
            firstPrize: "Gold Prize",
            secondPrize: "Silver Prize",
            thirdPrize: "Bronze Prize",
          },
        },
        secondRes,
      );

      assert.equal(secondRes.statusCode, 200);
      assert.equal(fixture.state.notificationCalls.length, firstCount);
      assert.equal((secondRes.body as any).drawing.winnerNotificationCount, 3);
      assert.equal((secondRes.body as any).drawing.participantNotificationCount, 3);
    });
  });
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
    values: (payload: unknown) => {
      mock.inserts.push(payload);
      return {
        returning: async () => [],
      };
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

type LotteryMessagingFixture = {
  patch: Record<string, unknown>;
  state: {
    notificationCalls: Array<{
      userId: string;
      driverId: string | null;
      notificationKind: "winner" | "participant";
      place: number | null;
      title: string;
      message: string;
      data: any;
    }>;
    currentDrawing: any;
  };
};

function createLotteryMessagingFixture(winnerCount: 1 | 2 | 3): LotteryMessagingFixture {
  const drivers = [
    { id: "driver_row_1", userId: "driver_user_1", username: "alpha", firstName: "Alex", lastName: "Stone" },
    { id: "driver_row_2", userId: "driver_user_2", username: "bravo", firstName: "Blake", lastName: "River" },
    { id: "driver_row_3", userId: "driver_user_3", username: "charlie", firstName: "Casey", lastName: "Lane" },
  ];

  const totals = drivers.map((driver, index) => ({
    driverId: driver.id,
    driverName: `${driver.firstName} ${driver.lastName}`,
    totalEntries: 3 - index,
    payoutPreference: "bank_transfer",
    payoutPreferenceNote: null,
  }));

  const individualEntries = drivers.flatMap((driver, index) => (
    Array.from({ length: 3 - index }, (_, entryIndex) => ({
      id: `entry_${driver.id}_${entryIndex + 1}`,
      driverId: driver.id,
      ticketNumber: `CX-202605-${String(index * 10 + entryIndex + 1).padStart(4, "0")}`,
      entriesEarned: 1,
      lotteryMonth: 5,
      lotteryYear: 2026,
      isArchived: false,
      createdAt: new Date("2026-05-01T00:00:00Z"),
      driver: {
        id: driver.id,
        userId: driver.userId,
        user: {
          id: driver.userId,
          username: driver.username,
          firstName: driver.firstName,
          lastName: driver.lastName,
        },
      },
      owner: { id: "owner_1", userId: "owner_user_1", companyName: "Owner Co" },
      activity: {
        id: `activity_${driver.id}`,
        checkInTime: new Date("2026-05-01T00:00:00Z"),
      },
    }))
  ));

  const state = {
    expectedWinnerCount: winnerCount,
    notificationCalls: [] as LotteryMessagingFixture["state"]["notificationCalls"],
    currentDrawing: null as any,
  };
  const notificationKeySet = new Set<string>();

  const patch: Record<string, unknown> = {
    getUser: async () => ({
      id: "admin_user_1",
      username: "admin1",
      email: "admin@example.com",
      firstName: "Admin",
      lastName: "User",
      role: "admin",
      isActive: true,
    }),
    getDriverLotteryEntryTotals: async () => totals,
    getAllDriverLotteryEntries: async () => individualEntries,
    getAllDrivers: async () => drivers.map((driver) => ({
      id: driver.id,
      userId: driver.userId,
      user: {
        id: driver.userId,
        username: driver.username,
        firstName: driver.firstName,
        lastName: driver.lastName,
      },
    })),
    getLotteryDrawingByMonthYear: async () => state.currentDrawing,
    createLotteryDrawing: async (payload: any) => {
      state.currentDrawing = {
        id: "drawing_1",
        drawingDate: new Date("2026-05-22T00:00:00Z"),
        executedByName: "admin1",
        winnerNotificationCount: 0,
        participantNotificationCount: 0,
        winnerNotificationsSentAt: null,
        participantNotificationsSentAt: null,
        ...payload,
      };
      return state.currentDrawing;
    },
    createLotteryNotificationOnce: async (notification: any) => {
      const key = `${notification.lotteryDrawingId}:${notification.userId}:${notification.notificationKind}`;
      const created = !notificationKeySet.has(key);
      if (created) {
        notificationKeySet.add(key);
        state.notificationCalls.push(notification);
      }
      return {
        created,
        record: {
          id: `lottery_notification_${notificationKeySet.size}`,
          notificationId: created ? `notification_${notificationKeySet.size}` : null,
          sentAt: created ? new Date("2026-05-22T00:00:00Z") : null,
          ...notification,
        },
      };
    },
    getLotteryNotificationSummary: async () => ({
      winnerNotificationCount: state.notificationCalls.filter((n) => n.notificationKind === "winner").length,
      participantNotificationCount: state.notificationCalls.filter((n) => n.notificationKind === "participant").length,
      winnerNotificationsSentAt: state.notificationCalls.some((n) => n.notificationKind === "winner") ? new Date("2026-05-22T00:00:00Z") : null,
      participantNotificationsSentAt: state.notificationCalls.some((n) => n.notificationKind === "participant") ? new Date("2026-05-22T00:00:00Z") : null,
    }),
    updateLotteryDrawingNotificationSummary: async (_drawingId: string, updates: any) => {
      state.currentDrawing = {
        ...state.currentDrawing,
        ...updates,
      };
      return state.currentDrawing;
    },
    archiveLotteryMonth: async () => 0,
  };

  return { patch, state };
}

async function getLotteryExecuteRoute() {
  const { app, posts } = createRouteRegistry();
  const { registerRoutes } = await import("../server/routes");
  await registerRoutes(app as never);
  const route = posts.get("/api/admin/lottery/execute");
  assert.equal(typeof route, "function");
  return route as Function;
}

async function withMockedRandom<T>(value: number, run: () => Promise<T>): Promise<T> {
  const original = Math.random;
  Math.random = () => value;
  try {
    return await run();
  } finally {
    Math.random = original;
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
