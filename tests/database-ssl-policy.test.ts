import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Client } from "pg";

import {
  getDatabaseConnectionString,
  getDatabaseSslConfiguration,
} from "../server/databaseSsl";

test("only an explicit staging opt-in allows the Railway self-signed database certificate", () => {
  assert.deepEqual(
    getDatabaseSslConfiguration({
      APP_ENV: "staging",
      DATABASE_SSL_ALLOW_SELF_SIGNED: "true",
    }),
    { rejectUnauthorized: false },
  );
});

test("self-signed opt-in alone and every non-staging environment retain verification", () => {
  for (const environment of [
    { DATABASE_SSL_ALLOW_SELF_SIGNED: "true" },
    { APP_ENV: "production", DATABASE_SSL_ALLOW_SELF_SIGNED: "true" },
    { APP_ENV: "staging", DATABASE_SSL_ALLOW_SELF_SIGNED: "false" },
    { APP_ENV: "staging", DATABASE_SSL_ALLOW_SELF_SIGNED: "TRUE" },
    { APP_ENV: "development", DATABASE_SSL_ALLOW_SELF_SIGNED: "true" },
    {},
  ]) {
    assert.deepEqual(getDatabaseSslConfiguration(environment), {
      rejectUnauthorized: true,
    });
  }
});

test("database pool keeps TLS enabled and does not use a global TLS bypass", () => {
  const source = readFileSync(new URL("../server/db.ts", import.meta.url), "utf8");
  assert.match(source, /ssl:\s*getDatabaseSslConfiguration\(\)/);
  assert.match(source, /connectionString:\s*getDatabaseConnectionString\(connectionString\)/);
  assert.doesNotMatch(source, /NODE_TLS_REJECT_UNAUTHORIZED/);
});

test("the connection-string sslmode cannot override the explicit TLS policy", () => {
  const connectionString = getDatabaseConnectionString(
    "postgres://user:pass@localhost:5432/cretexchange?sslmode=require&application_name=test",
  );
  assert.equal(new URL(connectionString).searchParams.has("sslmode"), false);
  assert.equal(new URL(connectionString).searchParams.get("application_name"), "test");

  const client = new Client({
    connectionString,
    ssl: getDatabaseSslConfiguration({
      APP_ENV: "staging",
      DATABASE_SSL_ALLOW_SELF_SIGNED: "true",
    }),
  });
  assert.deepEqual((client as any).connectionParameters.ssl, {
    rejectUnauthorized: false,
  });
});
