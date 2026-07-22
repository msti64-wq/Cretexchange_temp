# Migration Release Package — 0027 and 0029

> **PREFLIGHT ONLY — NOT AUTHORIZATION TO EXECUTE**

## Scope and identity

| Item | Evidence |
| --- | --- |
| Target | CreteXchange production application and its intended production database only. |
| Application SHA observed | `15616fd11a621cf88e7d49b43039a9804e7ab656` |
| Repository baseline used for review | `feature/cutoff-and-rewards-controls` at `93f69c89585aaf998268b213f6f098e993a25bb5` (documentation-only commits follow the application SHA). |
| Approved execution scope | Only 0027, then 0029. Never rerun 0028. |
| 0027 introducing commit | `8e9443fb1bafc36228a1c56f653e11daad25e190` — `feat(admin): add rewards period controls` — Mike Stiger — July 19, 2026. |
| 0029 introducing commit | `328299f068defb5a6e1d3852f508b3bcd84e6f71` — `feat(payments): add webhook settlement and payment retries` — Mike Stiger — July 19, 2026. |
| File immutability | `git log --follow` identifies the listed introducing commit as the only history for each file. Both are ancestors of the observed application SHA. |

## Required migration order and dependency reasoning

1. **0027** creates `rewards_periods`, then adds its nullable foreign-key column and eligibility fields to `driver_lottery_entries`, then adds the lookup index. The `rewards_period_id` foreign key depends on the newly created table.
2. **0029** creates `canonical_financial_payment_attempts`, referencing the existing `billing_batches(id)` and `users(id)` records. It does not depend on 0027 directly, but follows repository order and must be run after the separately verified existing 0028 state.

The production catalog has no durable migration ledger. Its historical state is therefore a reconciled catalog state, not a sequence inferred from filenames: the effects of 0020–0026 and 0028 were observed; 0027 and 0029 were entirely absent. This package does not permit a ledger backfill or re-execution of 0028.

## Statement-by-statement impact analysis

### 0027 — rewards-period controls

| Statement group | Effect | Existing-data impact | Lock / execution posture |
| --- | --- | --- | --- |
| `CREATE TABLE IF NOT EXISTS rewards_periods` | Creates an empty table, primary key, two checks, user foreign keys, and `(month, year)` uniqueness. | No existing business rows are changed. `IF NOT EXISTS` would not repair a drifted pre-existing table; catalog absence is a hard prerequisite. | Transactional DDL; `ACCESS EXCLUSIVE` only on the new relation while created. |
| Add nullable `rewards_period_id` | Adds a nullable FK to the new table. | Existing lottery rows remain `NULL`; no mapping/backfill is performed. | `ALTER TABLE` takes `ACCESS EXCLUSIVE` on `driver_lottery_entries`; execute during a quiet window. |
| Add `eligibility_status` | Adds non-null column with constant default `eligible` and an allowed-status check. | Existing rows retain their business identity and receive the schema default. The constraint must be catalog-verified after execution. | The table lock is the availability risk; PostgreSQL 17 supports metadata-only constant defaults, but this must not be treated as permission to skip the controlled window. |
| Add remaining nullable eligibility audit fields | Adds reason, timestamp, and actor FK columns. | No historic records are rewritten or classified. | Same short `ALTER TABLE` lock window. |
| Create period/eligibility index | Supports period/admin eligibility access. | No rows change. | Non-concurrent index build. It reads the existing 30-row table and can block concurrent writes; it is included inside the transaction. |

### 0029 — canonical financial payment-attempt schema

| Statement group | Effect | Existing-data impact | Lock / execution posture |
| --- | --- | --- | --- |
| `CREATE TABLE canonical_financial_payment_attempts` | Creates an empty, additive attempt ledger with `billing_batches` and `users` foreign keys and the validity check. | No payments, obligations, batches, wallets, provider records, or ledger rows are changed. Schema alone cannot invoke Stripe or any provider. | Transactional DDL; `ACCESS EXCLUSIVE` only on the new relation. |
| Five indexes | Creates two global unique indexes, two partial unique indexes, and one batch/status index. | New table is empty, so no existing-table index scan or backfill occurs. | Non-concurrent but only over the new empty table; all are valid only if each creation succeeds in the transaction. |

0029 has no `IF NOT EXISTS` guards. Its completely absent table, five indexes, and check constraint are mandatory preconditions. Any partial object is a stop condition.

## Fresh production evidence recorded on July 22, 2026

The preflight ran inside `BEGIN READ ONLY` with a 30-second statement timeout, 5-second lock timeout, and `ROLLBACK`; `SHOW transaction_read_only` returned `on`. No rows, identifiers, customer information, or provider identifiers were returned.

- No migration or Drizzle ledger candidate exists in any inspected non-system schema.
- `rewards_periods` and `canonical_financial_payment_attempts` are absent.
- All five 0027 target columns and the 0027 index are absent.
- All five 0029 indexes and its check constraint are absent.
- `driver_lottery_entries` has 30 rows and total relation size 147,456 bytes; `billing_batches` has 3 rows and 122,880 bytes; `users` has 4 rows and 65,536 bytes.
- Both FK parents use `character varying` IDs; `gen_random_uuid()` is present on PostgreSQL 17.10.
- The canonical partial payment uniqueness index is unique, valid, and ready; the retired global payment activity index is absent; the configured history-cutoff setting has one non-null row; and the 0028 frozen-totals check exists.

## Compatibility matrix

| State | 0027 compatibility | 0029 compatibility | Decision |
| --- | --- | --- | --- |
| Current production catalog | Required table/columns/index all absent; source table and users parent compatible. | Required table/indexes/check all absent; `billing_batches` and users parents compatible. | Eligible only after fresh Phase 3 repeat preflight. |
| Partially present 0027 or 0029 object | Unsafe: `IF NOT EXISTS` could conceal 0027 drift; 0029 would error after partial DDL. | Unsafe. | Stop; catalog review and forward repair only. |
| 0028 absent or definition differs | Out of scope and application compatibility uncertain. | Out of scope. | Stop; never run 0028 without separate authorization. |
| Application before schema | Routes requiring rewards periods/payment attempts can fail with schema-missing errors. | Same. | Do not deploy incompatible application. |
| Application after verified schema | Rewards/admin queries and canonical attempt read paths have required tables. | Same. | Proceed to health and focused smoke only after separate approval. |

## Exact Phase 3 execution strategy

This package prepares, but does not authorize, a local `psql` or equivalently audited client using the production connection without printing it. The execution operator SHALL:

1. Verify environment, service, repository branch, application SHA, operator identity, the two SHA-256 values, backup/PITR evidence, and each checklist prerequisite.
2. Re-run the read-only preflight in the appendix. Stop on any changed result.
3. Disable or quiesce nonessential lottery-entry writes for the short 0027 `ALTER TABLE`/index window through approved operational coordination; do not alter financial execution flags.
4. Execute **0027 only** in one explicit transaction with `lock_timeout = '5s'` and `statement_timeout = '30s'`; commit only after no error.
5. Run 0027 post-schema verification. Stop if any expected object differs.
6. Execute **0029 only** in a second explicit transaction with the same conservative timeouts; commit only after no error.
7. Run 0029 post-schema verification, application health checks, then the focused smoke checklist. Record sanitized timestamps and outcomes.

Neither file requires autocommit or `CREATE INDEX CONCURRENTLY`. No broad "run all migrations" command is permitted.

## Release recommendation

**Conditional Go for a separately authorized Phase 3 execution only.** The catalog, checksums, dependencies, table sizes, and fail-closed application policy support a controlled two-transaction additive release. The conditions that remain mandatory are: fresh immediately-before execution preflight; backup/PITR confirmation; approved maintenance/quiesce window; exact operator/approval recording; and a documented decision to keep all financial execution flags absent/false. Any condition failure is **No-Go**.
