import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { Client } from "pg";

const databaseUrl = process.env.NOTIFICATION_TEST_DATABASE_URL;
const confirmation = process.env.NOTIFICATION_TEST_CONFIRM;

function requireIsolatedDatabase(url: string) {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!/(?:test|validation|isolated)/i.test(name) || confirmation !== "isolated-notifications") {
    throw new Error("Notification integration tests require an explicitly confirmed isolated validation database");
  }
}

test("0039 supports idempotency, recipient scoping, read/archive state, and indexed query plans", { skip: !databaseUrl ? "NOTIFICATION_TEST_DATABASE_URL is not configured" : false }, async () => {
  requireIsolatedDatabase(databaseUrl!);
  const migration = await readFile(path.resolve("migrations/0039_extend_notifications_for_communication_center.sql"), "utf8");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE TEMP TABLE notifications (id varchar PRIMARY KEY, user_id varchar NOT NULL, title varchar NOT NULL, message text NOT NULL, type varchar NOT NULL DEFAULT 'info', is_read boolean DEFAULT false, data jsonb, created_at timestamp DEFAULT now())");
    await client.query(migration);

    const insert = `INSERT INTO notifications
      (id,user_id,title,message,type,recipient_role,category,template_key,idempotency_key,deep_link,data)
      VALUES ($1,$2,'Submitted','Submitted','activity_submitted','driver','operational','activity_submitted',$3,'/activity','{"facilityName":"Test"}')
      ON CONFLICT (idempotency_key) DO NOTHING`;
    await client.query(insert, ["n1", "driver-one", "activity:a:submitted:driver"]);
    await client.query(insert, ["n2", "driver-one", "activity:a:submitted:driver"]);
    assert.equal(Number((await client.query("SELECT count(*) AS value FROM notifications WHERE user_id='driver-one'")).rows[0].value), 1);
    assert.equal(Number((await client.query("SELECT count(*) AS value FROM notifications WHERE user_id='driver-two'")).rows[0].value), 0);

    await client.query("UPDATE notifications SET is_read=true, read_at=now() WHERE id='n1' AND user_id='driver-one'");
    assert.equal((await client.query("SELECT read_at IS NOT NULL AS read FROM notifications WHERE id='n1'")).rows[0].read, true);
    await client.query("UPDATE notifications SET archived_at=now() WHERE id='n1' AND user_id='driver-one'");
    assert.equal(Number((await client.query("SELECT count(*) AS value FROM notifications WHERE user_id='driver-one' AND archived_at IS NULL")).rows[0].value), 0);

    const catalog = await client.query("SELECT count(*)::int AS value FROM pg_indexes WHERE schemaname LIKE 'pg_temp_%' AND indexname IN ('notifications_idempotency_key_unique','notifications_user_archived_created_idx','notifications_user_read_archived_idx','notifications_user_category_created_idx')");
    assert.equal(Number(catalog.rows[0].value), 4);
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
});
