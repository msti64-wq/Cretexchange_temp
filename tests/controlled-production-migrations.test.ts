import assert from "node:assert/strict";
import test from "node:test";
import { closeClient } from "../scripts/controlled-production-migrations";
import { readFile } from "node:fs/promises";

test("bounded production migration cleanup force-closes a non-closing database session", async () => {
  let resolveEnd: (() => void) | undefined;
  let destroyed = false;
  const client = {
    connection: {
      stream: {
        destroy() {
          destroyed = true;
          resolveEnd?.();
        },
      },
    },
    end() {
      return new Promise<void>((resolve) => { resolveEnd = resolve; });
    },
  } as unknown as import("pg").Client;

  await closeClient(client, 5);
  assert.equal(destroyed, true);
});

test("controlled production migration runner allowlists and catalog-verifies migration 0038", async () => {
  const script = await readFile(new URL("../scripts/controlled-production-migrations.ts", import.meta.url), "utf8");
  assert.match(script, /id: "0038"/);
  assert.match(script, /0038_add_platform_analytics_events\.sql/);
  assert.match(script, /platform_analytics_events_event_type_valid/);
  assert.match(script, /platform_analytics_events_source_event_key_unique/);
  assert.match(script, /contype='f'/);
  assert.match(script, /to_regclass\(\$1\)/);
});
