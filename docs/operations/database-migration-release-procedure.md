# Database Migration Release Procedure

- **Status:** Approved operational procedure
- **Owner:** V8 Laboratories
- **Governing Standard:** [CTX-DB-001](../standards/CTX-DB-001-database-migration-and-schema-governance-standard.md)

## Purpose

Use this procedure for every routine controlled migration release. Approval to perform a read-only preflight is not approval to execute production DDL.

## Procedure

1. **Change discovery** — identify every migration between deployed and target commits; record filenames, SHA-256 values, dependency order, route impact, and whether each is additive, destructive, backfilling, or non-transactional.
2. **Architecture and standards review** — identify applicable CTX-ARCH, Product Decisions, CTX-DB-001, CTX-DEP-001, and CTX-OPS-001.
3. **Migration authoring** — document idempotency, compatibility, locking, foreign-key, constraint, index, backfill, and recovery behavior. Applied files remain immutable.
4. **Local verification** — run focused tests and suitable local/disposable database validation; capture checksums.
5. **Test-environment execution** — execute the exact reviewed files in order against an isolated environment and record catalog evidence.
6. **Release package** — complete the [Migration Release Package](./database-migration-release-package-template.md) and [Preflight Checklist](./production-database-migration-preflight-checklist.md).
7. **Production read-only preflight** — use a protected read-only transaction, scoped timeouts, ledger/catalog inspection, aggregate integrity checks, and no row-level sensitive output.
8. **Approval checkpoint** — obtain explicit approval for the exact environment, files, checksums, order, window, and operator. Stop if approval is limited to preflight.
9. **Production execution** — use the approved method, execute one migration at a time, and create the durable release record. Do not use a broad “run all” command unless specifically approved.
10. **Catalog verification** — verify each expected table, column, default, nullability, index, predicate, foreign key, and constraint.
11. **Application compatibility** — deploy compatible application code only after required schema is verified, or confirm the deployed application remains compatible.
12. **Smoke testing** — verify health and focused affected routes without unintended production data or financial actions.
13. **Observation** — monitor sanitized logs and agreed metrics for the approved observation period.
14. **Closure** — complete CTX-OPS-001 and the release record, including known limitations and sign-off.
15. **Incident or rollback path** — stop, preserve evidence, and decide between application rollback, schema rollback, forward repair, or data restoration.

## Mandatory stop conditions

Stop and escalate for unknown migration state; absent approval/recovery posture; checksum mismatch; unexpected schema or partial object; unclear order; lock risk outside the approved window; unexpected row count; failed constraint/FK validation; provider call; financial flag change; health failure; smoke-test failure; or inability to create the required release record.

## Current non-executed example

**DOCUMENTATION EXAMPLE ONLY — NOT AUTHORIZATION TO EXECUTE.** At application SHA `15616fd11a621cf88e7d49b43039a9804e7ab656`, catalog audit found `0027_add_rewards_period_controls.sql` (`5f8d2ba7c56c8878c7dfdac4535529f3f8c8fc9626a7d01cab145ff2033c052f`) and `0029_add_canonical_financial_payment_attempts.sql` (`a9f5501ea544fdb0717e9f36c08cf65b8680c94fd353b9426acd0cf040c3dbf6`) absent. Migration 0028 was present and must not be rerun merely to restore sequence appearance. Financial execution remained disabled and fail-closed.
