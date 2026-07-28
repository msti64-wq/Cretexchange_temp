import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("controlled staging migration runner is bounded to the reviewed release", async () => {
  const [script, packageJson] = await Promise.all([
    readFile(new URL("../scripts/controlled-staging-migrations.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(packageJson, /"db:migrate:controlled"/);
  for (const id of ["0031", "0032", "0033", "0034", "0035", "0036", "0037", "0038"]) assert.match(script, new RegExp(`id: "${id}"`));
  assert.match(script, /MIGRATION_TARGET=staging/);
  assert.match(script, /--confirm-staging/);
  assert.match(script, /pg_try_advisory_lock/);
  assert.doesNotMatch(script, /readdir|glob|drizzle-kit push|db:migrate/);
});
