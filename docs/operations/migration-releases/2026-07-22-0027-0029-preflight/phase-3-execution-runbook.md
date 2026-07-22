# Phase 3 Execution Runbook Instance — 0027 and 0029

> **PREFLIGHT ONLY — NOT AUTHORIZATION TO EXECUTE**

This is the exact controlled execution sequence to use only after separate written authorization. It deliberately does not include credentials, connection strings, broad migration runners, provider actions, or application deployment.

## Preconditions

1. Complete the [Production Preflight Checklist](./production-preflight-checklist.md) afresh.
2. Confirm the production target, release approver, operator, application SHA, both file checksums, and backup/PITR evidence.
3. Capture the current production health result and `FINANCIAL_EXECUTION_POLICY` startup evidence showing execution denied.
4. Quiesce only nonessential lottery-entry writes for the brief 0027 `ALTER TABLE` window; do not change financial configuration.

## Read-only reconfirmation

Use the appendix’s read-only session first. It SHALL include:

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SHOW transaction_read_only;
-- Run appendix preflight queries.
ROLLBACK;
```

`SHOW transaction_read_only` MUST return `on`. Any changed catalog result is a stop condition.

## Authorized execution shape

Execute the exact reviewed contents of each immutable file through an approved, audited PostgreSQL client. Do not substitute `drizzle-kit push`, `npm run db:migrate`, a startup hook, or a broad “run all migrations” command.

### Transaction 1 — 0027 only

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Execute exactly migrations/0027_add_rewards_period_controls.sql after its SHA-256 is rechecked.
COMMIT;
```

Immediately run the 0027 post-schema verification queries. Stop before 0029 on any failure, missing object, unexpected default/nullability, invalid index, or application health regression.

### Transaction 2 — 0029 only

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Execute exactly migrations/0029_add_canonical_financial_payment_attempts.sql after its SHA-256 is rechecked.
COMMIT;
```

Immediately run the 0029 post-schema verification queries, then the smoke checklist and observation plan.

## Mandatory stop conditions

- Any checksum mismatch or migration-file modification.
- Any ledger/canonical-catalog contradiction or partial 0027/0029 artifact.
- A lock timeout, statement timeout, DDL error, unexpected object definition, or health failure.
- Absent backup/PITR evidence, ambiguous target, or financial execution becoming enabled.
- Any suggestion to run 0028, a broad runner, a deployment, an application rewrite, a data backfill, or provider action.

## Observation and completion

Observe health and the affected read-only routes for at least 15 minutes after the second schema verification. Record sanitized errors, schema state, health, and smoke outcomes in the draft release record. Do not call a release complete until the record is signed off under CTX-DB-001, CTX-DEP-001, and CTX-OPS-001.
