import { pathToFileURL } from "node:url";
import { sql } from "drizzle-orm";
import { validatePasswordPolicy } from "../shared/passwordPolicy";
import { hashPasswordForStorage } from "../server/passwordSecurity";

const STAGING_CONFIRMATION = "bootstrap-staging-admin";

type BootstrapUser = {
  id: string;
  username: string;
  email: string;
  role: string | null;
  isActive: boolean | null;
};

export type StagingAdminBootstrapContext = {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  password?: string;
  operator: string;
};

export type StagingAdminBootstrapResult = {
  action: "created" | "already_admin";
  user: BootstrapUser;
};

function requireTrimmedEnv(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("STAGING_ADMIN_EMAIL must be a valid email address");
  }
  return email;
}

/**
 * This guard intentionally uses Railway's deployment-environment identity, not
 * NODE_ENV: the production start command also sets NODE_ENV=production.
 */
export function readStagingAdminBootstrapContext(environment: NodeJS.ProcessEnv = process.env): StagingAdminBootstrapContext {
  if (environment.ADMIN_BOOTSTRAP_TARGET?.trim().toLowerCase() !== "staging") {
    throw new Error("This bootstrap is staging-only and requires ADMIN_BOOTSTRAP_TARGET=staging.");
  }
  if (environment.RAILWAY_ENVIRONMENT_NAME?.trim().toLowerCase() !== "staging") {
    throw new Error("Railway environment must be explicitly identified as staging.");
  }
  if (environment.STAGING_ADMIN_BOOTSTRAP_CONFIRM !== STAGING_CONFIRMATION) {
    throw new Error(`STAGING_ADMIN_BOOTSTRAP_CONFIRM must equal ${STAGING_CONFIRMATION}.`);
  }

  const email = normalizeEmail(requireTrimmedEnv(environment, "STAGING_ADMIN_EMAIL"));
  const username = environment.STAGING_ADMIN_USERNAME?.trim() || email;
  const firstName = environment.STAGING_ADMIN_FIRST_NAME?.trim() || "Staging";
  const lastName = environment.STAGING_ADMIN_LAST_NAME?.trim() || "Administrator";
  const operator = requireTrimmedEnv(environment, "STAGING_ADMIN_BOOTSTRAP_OPERATOR");
  const password = environment.STAGING_ADMIN_PASSWORD;

  if (password !== undefined) {
    const policy = validatePasswordPolicy(password, { username, email, firstName, lastName });
    if (!policy.valid) throw new Error(`STAGING_ADMIN_PASSWORD: ${policy.message}`);
  }

  return { email, username, firstName, lastName, password, operator };
}

export async function bootstrapStagingAdmin(
  context: StagingAdminBootstrapContext,
  dependencies: {
    findByEmail(email: string): Promise<BootstrapUser | undefined>;
    findByUsername(username: string): Promise<BootstrapUser | undefined>;
    create(input: { username: string; email: string; passwordHash: string; firstName: string; lastName: string }): Promise<BootstrapUser>;
    audit(input: { actorId: string; eventMetadata: Record<string, string> }): Promise<void>;
    hashPassword(password: string): Promise<string>;
  },
): Promise<StagingAdminBootstrapResult> {
  const existing = await dependencies.findByEmail(context.email);
  if (existing) {
    if (existing.role !== "admin" && existing.role !== "super_admin") {
      throw new Error("The requested staging account already exists with a non-administrative role; use a distinct staging-only email rather than changing an existing participant role.");
    }
    await dependencies.audit({
      actorId: existing.id,
      eventMetadata: { action: "staging_admin_bootstrap_noop", operator: context.operator, subjectEmail: existing.email, target: "staging" },
    });
    return { action: "already_admin", user: existing };
  }

  if (!context.password) throw new Error("STAGING_ADMIN_PASSWORD is required when creating a staging Admin account.");
  const existingUsername = await dependencies.findByUsername(context.username);
  if (existingUsername) throw new Error("STAGING_ADMIN_USERNAME is already assigned; choose a distinct staging-only username.");

  const created = await dependencies.create({
    username: context.username,
    email: context.email,
    passwordHash: await dependencies.hashPassword(context.password),
    firstName: context.firstName,
    lastName: context.lastName,
  });
  await dependencies.audit({
    actorId: created.id,
    eventMetadata: { action: "staging_admin_bootstrap_created", operator: context.operator, subjectEmail: created.email, target: "staging" },
  });
  return { action: "created", user: created };
}

async function run(): Promise<void> {
  const context = readStagingAdminBootstrapContext();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required inside the staging bootstrap job.");

  const [{ db, pool }, schema] = await Promise.all([
    import("../server/db"),
    import("../shared/schema"),
  ]);
  try {
    const result = await db.transaction(async (tx) => bootstrapStagingAdmin(context, {
      async findByEmail(email) {
        return (await tx.select({ id: schema.users.id, username: schema.users.username, email: schema.users.email, role: schema.users.role, isActive: schema.users.isActive })
          .from(schema.users)
          .where(sql`LOWER(${schema.users.email}) = ${email}`)
          .limit(1))[0];
      },
      async findByUsername(username) {
        return (await tx.select({ id: schema.users.id, username: schema.users.username, email: schema.users.email, role: schema.users.role, isActive: schema.users.isActive })
          .from(schema.users)
          .where(sql`LOWER(${schema.users.username}) = ${username.toLowerCase()}`)
          .limit(1))[0];
      },
      async create(input) {
        return (await tx.insert(schema.users).values({ ...input, role: "admin", isActive: true }).returning({ id: schema.users.id, username: schema.users.username, email: schema.users.email, role: schema.users.role, isActive: schema.users.isActive }))[0];
      },
      async audit(input) {
        await tx.insert(schema.governanceAuditEvents).values({ eventType: "staging_admin_bootstrap", actorId: input.actorId, eventMetadata: input.eventMetadata });
      },
      hashPassword: hashPasswordForStorage,
    }));
    console.log(`STAGING_ADMIN_BOOTSTRAP ${result.action} ${result.user.email} role=${result.user.role}`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error(`STAGING_ADMIN_BOOTSTRAP_FAILED ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  });
}
