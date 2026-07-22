# Production Database Migration Execution Runbook

- **Status:** Approved reusable runbook
- **Governing Standard:** [CTX-DB-001](../standards/CTX-DB-001-database-migration-and-schema-governance-standard.md)

## Before execution

1. Verify the authorized operator, target environment, approved maintenance window, exact migration order, repository commit, and file checksums.
2. Re-run the approved read-only catalog and ledger precheck immediately before DDL.
3. Configure approved statement and lock timeouts; identify migrations that require autocommit or concurrent-index execution.
4. Open the release record and use sanitized command logging.

## Execution

1. Execute exactly one approved migration.
2. Capture command, start/finish time, transaction outcome, and sanitized database result.
3. Stop immediately on unexpected error, partial application, timeout, or changed assumption.
4. Verify every expected schema object before the next migration.
5. Record the migration only after its actual catalog effects are verified.

## Post-execution

1. Verify tables, columns, indexes, predicates, constraints, defaults, nullability, and applicable aggregate data evidence.
2. Verify application health and focused affected routes.
3. Confirm financial flags remain fail-closed and no provider call, payment, payout, wallet action, reward issuance, or settlement occurred.
4. Complete the release record, observation period, and sign-off.

## Prohibitions

Do not use a broad “run all migrations” command for selective repair unless specifically approved; rerun already-applied migrations to restore appearance of sequence; manually mark a migration applied without proving all effects; continue after unexpected error; enable financial flags; make provider calls; suppress needed audit output; or expose secrets or production customer data.

## Recovery decision tree

If the application is incompatible, first stop further migration. Select application rollback only when compatible with the actual schema. Select schema rollback only when explicitly safe and non-destructive. Otherwise use an approved forward repair. Preserve evidence and escalate before any data restoration.
