import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { closeClient } from "./controlled-production-migrations";

const CUTOVER_LOCK = "cretexchange:auth-session-cutover-v1";
const REQUEST_REFERENCE_PATTERN = /^auth-cutover-[A-Za-z0-9._:-]{8,147}$/;
const MAX_USER_COUNT = 1_000_000;

type CutoverMode = "plan" | "count" | "apply";

export type AuthSessionCutoverPlan = Readonly<{
  mode: CutoverMode;
  deployedSha: string;
  requestReference: string;
  expectedUserCount: number;
  confirmed: boolean;
}>;

export type AuthSessionCutoverState = Readonly<{
  userCount: number;
  tokenVersionSum: number;
  activeSessionCount: number;
  completedCutoverCount: number;
  matchingCutoverCount: number;
}>;

function fail(message: string): never { throw new Error(message); }
function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
function exactSha(value: string | undefined): string | null {
  return value && /^[a-f0-9]{40}$/i.test(value.trim()) ? value.trim().toLowerCase() : null;
}

export function resolveAuthSessionCutoverPlan(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
): AuthSessionCutoverPlan {
  const mode = args[0];
  if (mode !== "plan" && mode !== "count" && mode !== "apply") fail("Cutover mode must be plan, count, or apply.");
  const permittedOptions = new Set(["--deployed-sha", "--request-reference", "--expected-user-count", "--confirm-production"]);
  for (let index = 1; index < args.length; index += 1) {
    const current = args[index];
    if (!permittedOptions.has(current)) fail(`Unsupported cutover option: ${current}.`);
    if (current === "--confirm-production") continue;
    if (index + 1 >= args.length || args[index + 1].startsWith("--")) fail(`Missing value for ${current}.`);
    if (args.indexOf(current) !== index) fail(`Duplicate cutover option: ${current}.`);
    index += 1;
  }
  if (environment.AUTH_SESSION_CUTOVER_TARGET !== "production") fail("AUTH_SESSION_CUTOVER_TARGET=production is required.");
  if (environment.RAILWAY_ENVIRONMENT_NAME !== "production") fail("Railway environment must be explicitly identified as production.");

  const deployedSha = exactSha(environment.RAILWAY_GIT_COMMIT_SHA);
  const suppliedSha = exactSha(option(args, "--deployed-sha"));
  const authorizedSha = exactSha(environment.AUTH_SESSION_CUTOVER_AUTHORIZATION_SHA);
  if (!deployedSha || deployedSha !== suppliedSha || deployedSha !== authorizedSha) {
    fail("Cutover authorization must match the immutable Railway deployment commit.");
  }

  const requestReference = option(args, "--request-reference")?.trim();
  if (!requestReference || !REQUEST_REFERENCE_PATTERN.test(requestReference)
    || requestReference !== environment.AUTH_SESSION_CUTOVER_REQUEST_REFERENCE?.trim()) {
    fail("A bounded, exactly authorized auth cutover request reference is required.");
  }
  const rawExpected = option(args, "--expected-user-count");
  const expectedUserCount = rawExpected && /^\d+$/.test(rawExpected) ? Number(rawExpected) : Number.NaN;
  if (!Number.isSafeInteger(expectedUserCount) || expectedUserCount < 0 || expectedUserCount > MAX_USER_COUNT) {
    fail("Expected user count must be a bounded non-negative integer.");
  }

  return {
    mode,
    deployedSha,
    requestReference,
    expectedUserCount,
    confirmed: args.includes("--confirm-production"),
  };
}

export async function inspectAuthSessionCutoverState(
  client: pg.Client,
  requestReference: string,
): Promise<AuthSessionCutoverState> {
  const result = await client.query<{
    user_count: number;
    token_version_sum: number;
    active_session_count: number;
    completed_cutover_count: number;
    matching_cutover_count: number;
  }>(`SELECT
    (SELECT count(*)::int FROM users) AS user_count,
    (SELECT coalesce(sum(auth_token_version),0)::bigint FROM users) AS token_version_sum,
    (SELECT count(*)::int FROM auth_sessions WHERE revoked_at IS NULL) AS active_session_count,
    (SELECT count(*)::int FROM auth_security_events WHERE event_type='auth.cutover.legacy_tokens_invalidated') AS completed_cutover_count,
    (SELECT count(*)::int FROM auth_security_events WHERE event_type='auth.cutover.legacy_tokens_invalidated' AND request_reference=$1) AS matching_cutover_count`,
  [requestReference]);
  const row = result.rows[0];
  return {
    userCount: Number(row?.user_count || 0),
    tokenVersionSum: Number(row?.token_version_sum || 0),
    activeSessionCount: Number(row?.active_session_count || 0),
    completedCutoverCount: Number(row?.completed_cutover_count || 0),
    matchingCutoverCount: Number(row?.matching_cutover_count || 0),
  };
}

export async function executeAuthSessionTokenVersionCutover(
  client: pg.Client,
  plan: AuthSessionCutoverPlan,
): Promise<{ status: "applied" | "already_applied"; affectedUsers: number; tokenVersionSum: number }> {
  if (plan.mode !== "apply" || !plan.confirmed) fail("Apply mode requires --confirm-production.");
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [CUTOVER_LOCK]);
    const before = await inspectAuthSessionCutoverState(client, plan.requestReference);
    if (before.userCount !== plan.expectedUserCount) {
      fail(`User count changed before cutover (${before.userCount}/${plan.expectedUserCount}).`);
    }
    if (before.matchingCutoverCount === 1 && before.completedCutoverCount === 1) {
      await client.query("COMMIT");
      return { status: "already_applied", affectedUsers: 0, tokenVersionSum: before.tokenVersionSum };
    }
    if (before.matchingCutoverCount !== 0 || before.completedCutoverCount !== 0) {
      fail("A different or duplicate authentication cutover audit record already exists.");
    }
    if (before.activeSessionCount !== 0) {
      fail(`Authentication cutover requires zero active server sessions (${before.activeSessionCount} found).`);
    }

    const updated = await client.query("UPDATE users SET auth_token_version=auth_token_version+1, updated_at=now() WHERE auth_token_version >= 0");
    if (updated.rowCount !== plan.expectedUserCount) {
      fail(`Authentication token invalidation row count changed (${updated.rowCount}/${plan.expectedUserCount}).`);
    }
    const tokenVersionSum = before.tokenVersionSum + plan.expectedUserCount;
    await client.query(`INSERT INTO auth_security_events
      (event_type,outcome,reason_code,request_reference,retention_class,retain_until,event_metadata)
      VALUES ('auth.cutover.legacy_tokens_invalidated','success','session_foundation_cutover',$1,'privileged',now() + interval '7 years',$2::jsonb)`, [
      plan.requestReference,
      JSON.stringify({
        deployedSha: plan.deployedSha,
        usersAffected: plan.expectedUserCount,
        activeSessionsBefore: before.activeSessionCount,
        priorCredentialEpochSum: before.tokenVersionSum,
        resultingCredentialEpochSum: tokenVersionSum,
      }),
    ]);
    await client.query("COMMIT");
    return { status: "applied", affectedUsers: plan.expectedUserCount, tokenVersionSum };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const plan = resolveAuthSessionCutoverPlan(args, process.env);
  console.log(`AUTH_SESSION_CUTOVER_PLAN mode=${plan.mode} deployed_sha=${plan.deployedSha} request_reference=${plan.requestReference} expected_users=${plan.expectedUserCount}`);
  if (plan.mode === "plan") return;
  if (!process.env.DATABASE_URL) fail("DATABASE_URL is required inside the governed Production cutover job.");

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  try {
    if (plan.mode === "count") {
      const state = await inspectAuthSessionCutoverState(client, plan.requestReference);
      if (state.userCount !== plan.expectedUserCount) {
        fail(`User count changed before cutover (${state.userCount}/${plan.expectedUserCount}).`);
      }
      console.log(`AUTH_SESSION_CUTOVER_COUNT users=${state.userCount} token_version_sum=${state.tokenVersionSum} active_sessions=${state.activeSessionCount} completed_cutovers=${state.completedCutoverCount}`);
      return;
    }
    const result = await executeAuthSessionTokenVersionCutover(client, plan);
    console.log(`AUTH_SESSION_CUTOVER_${result.status.toUpperCase()} affected_users=${result.affectedUsers} token_version_sum=${result.tokenVersionSum}`);
  } finally {
    await closeClient(client);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`AUTH_SESSION_CUTOVER_FAILED ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  });
}
