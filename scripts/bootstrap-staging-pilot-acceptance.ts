import { pathToFileURL } from "node:url";
import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";

const CONFIRMATION = "prepare-staging-pilot-acceptance";
const PASSWORD_HASH_ROUNDS = 10;
const PARTICIPANTS = [
  { role: "driver", suffix: "driver" },
  { role: "owner", suffix: "owner" },
  { role: "admin", suffix: "admin" },
  { role: "super_admin", suffix: "super-admin" },
] as const;

type ParticipantRole = (typeof PARTICIPANTS)[number]["role"];
type Participant = { role: ParticipantRole; username: string; email: string };
type UserRecord = { id: string; username: string; email: string; role: string | null; isActive: boolean | null };

function requireEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function normalizedNamespace(value: string): string {
  const namespace = value.trim().toLowerCase();
  if (!/^[a-z0-9-]{3,48}$/.test(namespace)) {
    throw new Error("STAGING_PILOT_ACCEPTANCE_NAMESPACE must contain only lowercase letters, numbers, and hyphens.");
  }
  return namespace;
}

export type StagingPilotAcceptanceContext = {
  namespace: string;
  password: string;
  operator: string;
  participants: Participant[];
};

/** Deliberately rejects both production and ambiguous environments. */
export function readStagingPilotAcceptanceContext(environment: NodeJS.ProcessEnv = process.env): StagingPilotAcceptanceContext {
  if (environment.PILOT_ACCEPTANCE_TARGET?.trim().toLowerCase() !== "staging") {
    throw new Error("This bootstrap is staging-only and requires PILOT_ACCEPTANCE_TARGET=staging.");
  }
  if (environment.RAILWAY_ENVIRONMENT_NAME?.trim().toLowerCase() !== "staging") {
    throw new Error("Railway environment must be explicitly identified as staging.");
  }
  if (environment.PILOT_ACCEPTANCE_CONFIRM !== CONFIRMATION) {
    throw new Error(`PILOT_ACCEPTANCE_CONFIRM must equal ${CONFIRMATION}.`);
  }
  const namespace = normalizedNamespace(environment.STAGING_PILOT_ACCEPTANCE_NAMESPACE || "pilot-acceptance");
  const password = requireEnvironment(environment, "STAGING_PILOT_ACCEPTANCE_PASSWORD");
  if (password.length < 16) throw new Error("STAGING_PILOT_ACCEPTANCE_PASSWORD must be at least 16 characters.");
  const operator = requireEnvironment(environment, "STAGING_PILOT_ACCEPTANCE_OPERATOR");
  const participants = PARTICIPANTS.map(({ role, suffix }) => ({
    role,
    username: `${namespace}-${suffix}`,
    email: `${namespace}-${suffix}@cretexchange.invalid`,
  }));
  return { namespace, password, operator, participants };
}

export async function bootstrapStagingPilotAcceptance(
  context: StagingPilotAcceptanceContext,
  dependencies: {
    findByEmail(email: string): Promise<UserRecord | undefined>;
    findByUsername(username: string): Promise<UserRecord | undefined>;
    createUser(input: { username: string; email: string; passwordHash: string; firstName: string; lastName: string; role: ParticipantRole }): Promise<UserRecord>;
    createDriver(userId: string): Promise<void>;
    createOwner(userId: string): Promise<void>;
    audit(input: { actorId: string; role: ParticipantRole; action: "created" | "existing"; namespace: string; operator: string }): Promise<void>;
    hashPassword(password: string): Promise<string>;
  },
): Promise<{ created: ParticipantRole[]; existing: ParticipantRole[] }> {
  const created: ParticipantRole[] = [];
  const existing: ParticipantRole[] = [];
  for (const participant of context.participants) {
    const byEmail = await dependencies.findByEmail(participant.email);
    const byUsername = await dependencies.findByUsername(participant.username);
    const user = byEmail || byUsername;
    if (user) {
      if (user.email.toLowerCase() !== participant.email || user.username.toLowerCase() !== participant.username || user.role !== participant.role) {
        throw new Error(`Existing staging acceptance identity conflicts for role ${participant.role}; use a distinct namespace rather than changing an account.`);
      }
      await dependencies.audit({ actorId: user.id, role: participant.role, action: "existing", namespace: context.namespace, operator: context.operator });
      existing.push(participant.role);
      continue;
    }
    const userRecord = await dependencies.createUser({
      ...participant,
      passwordHash: await dependencies.hashPassword(context.password),
      firstName: "Pilot",
      lastName: participant.role.replace("_", " "),
    });
    if (participant.role === "driver") await dependencies.createDriver(userRecord.id);
    if (participant.role === "owner") await dependencies.createOwner(userRecord.id);
    await dependencies.audit({ actorId: userRecord.id, role: participant.role, action: "created", namespace: context.namespace, operator: context.operator });
    created.push(participant.role);
  }
  return { created, existing };
}

async function run(): Promise<void> {
  const context = readStagingPilotAcceptanceContext();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required inside the Railway staging service.");
  const [{ db, pool }, schema] = await Promise.all([import("../server/db"), import("../shared/schema")]);
  try {
    const result = await db.transaction(async (tx) => bootstrapStagingPilotAcceptance(context, {
      async findByEmail(email) {
        return (await tx.select({ id: schema.users.id, username: schema.users.username, email: schema.users.email, role: schema.users.role, isActive: schema.users.isActive })
          .from(schema.users).where(sql`LOWER(${schema.users.email}) = ${email}`).limit(1))[0];
      },
      async findByUsername(username) {
        return (await tx.select({ id: schema.users.id, username: schema.users.username, email: schema.users.email, role: schema.users.role, isActive: schema.users.isActive })
          .from(schema.users).where(sql`LOWER(${schema.users.username}) = ${username}`).limit(1))[0];
      },
      async createUser(input) {
        return (await tx.insert(schema.users).values({ ...input, isActive: true }).returning({ id: schema.users.id, username: schema.users.username, email: schema.users.email, role: schema.users.role, isActive: schema.users.isActive }))[0];
      },
      async createDriver(userId) {
        await tx.insert(schema.drivers).values({ userId, licenseNumber: "", employerName: "", employerPhone: "", truckNumber: "" });
      },
      async createOwner(userId) {
        await tx.insert(schema.owners).values({ userId, companyName: "", businessLicense: "", taxId: "" });
      },
      async audit(input) {
        await tx.insert(schema.governanceAuditEvents).values({
          eventType: "staging_pilot_acceptance_identity",
          actorId: input.actorId,
          eventMetadata: { target: "staging", role: input.role, action: input.action, namespace: input.namespace, operator: input.operator },
        });
      },
      hashPassword: (password) => bcrypt.hash(password, PASSWORD_HASH_ROUNDS),
    }));
    console.log(`STAGING_PILOT_ACCEPTANCE_BOOTSTRAP created=${result.created.length} existing=${result.existing.length} target=staging`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error(`STAGING_PILOT_ACCEPTANCE_BOOTSTRAP_FAILED ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  });
}
