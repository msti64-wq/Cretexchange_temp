import assert from "node:assert/strict";
import test from "node:test";
import { closeClient } from "../scripts/controlled-production-migrations";

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
