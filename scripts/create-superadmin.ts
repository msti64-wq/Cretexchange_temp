import { pathToFileURL } from "node:url";
import { sql } from "drizzle-orm";
import { users } from "../shared/schema";
import { enforcePasswordPolicy, hashPasswordForStorage } from "../server/passwordSecurity";


type AdminResult = {
  id: string;
  username: string;
  email: string;
  role: string | null;
  isActive: boolean | null;
};

const adminResultColumns = {
  id: users.id,
  username: users.username,
  email: users.email,
  role: users.role,
  isActive: users.isActive,
};

function requireTrimmedEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function requirePasswordEnv(): string {
  const value = process.env.SUPERADMIN_PASSWORD;
  if (!value) {
    throw new Error("SUPERADMIN_PASSWORD is required");
  }
  return value;
}

function optionalTrimmedEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("SUPERADMIN_EMAIL must be a valid email address");
  }
  return email;
}

function logResult(action: "created" | "updated", user: AdminResult): void {
  console.log(`Super admin ${action}: ${user.email}`);
  console.log(`Username: ${user.username}`);
  console.log(`Role: ${user.role}`);
  console.log(`Active: ${user.isActive === true ? "yes" : "no"}`);
}

export async function runCreateSuperadmin(): Promise<void> {
  requireTrimmedEnv("DATABASE_URL");

  const email = normalizeEmail(requireTrimmedEnv("SUPERADMIN_EMAIL"));
  const password = requirePasswordEnv();
  const username = optionalTrimmedEnv("SUPERADMIN_USERNAME") ?? email;
  const firstName = optionalTrimmedEnv("SUPERADMIN_FIRST_NAME") ?? "Super";
  const lastName = optionalTrimmedEnv("SUPERADMIN_LAST_NAME") ?? "Admin";

  enforcePasswordPolicy(password, { username, email, firstName, lastName });

  const { db, pool } = await import("../server/db");

  try {
    const passwordHash = await hashPasswordForStorage(password);

    const [existingByEmail] = await db
      .select(adminResultColumns)
      .from(users)
      .where(sql`LOWER(${users.email}) = ${email}`)
      .limit(1);

    if (existingByEmail) {
      const [updatedUser] = await db
        .update(users)
        .set({
          passwordHash,
          role: "super_admin",
          isActive: true,
          updatedAt: new Date(),
        })
        .where(sql`${users.id} = ${existingByEmail.id}`)
        .returning(adminResultColumns);

      logResult("updated", updatedUser);
      return;
    }

    const [existingByUsername] = await db
      .select(adminResultColumns)
      .from(users)
      .where(sql`LOWER(${users.username}) = ${username.toLowerCase()}`)
      .limit(1);

    if (existingByUsername) {
      throw new Error(
        `Cannot create super admin: username '${username}' is already used by ${existingByUsername.email}`,
      );
    }

    const [createdUser] = await db
      .insert(users)
      .values({
        username,
        email,
        passwordHash,
        firstName,
        lastName,
        role: "super_admin",
        isActive: true,
      })
      .returning(adminResultColumns);

    logResult("created", createdUser);
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  try {
    await runCreateSuperadmin();
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to create super admin: ${message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
