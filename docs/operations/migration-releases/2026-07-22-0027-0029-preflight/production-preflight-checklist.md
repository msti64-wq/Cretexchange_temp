# Production Preflight Checklist — 0027 and 0029

> **PREFLIGHT ONLY — NOT AUTHORIZATION TO EXECUTE**

Complete this checklist immediately before a separately authorized Phase 3 execution. A checked box must have sanitized evidence in the release record.

## Identity and source

- [x] Intended application/service was identified as production; production health reported healthy with database connected before this package was prepared.
- [x] Observed application SHA: `15616fd11a621cf88e7d49b43039a9804e7ab656`.
- [x] 0027 SHA-256 matches `5f8d2ba7c56c8878c7dfdac4535529f3f8c8fc9626a7d01cab145ff2033c052f`.
- [x] 0029 SHA-256 matches `a9f5501ea544fdb0717e9f36c08cf65b8680c94fd353b9426acd0cf040c3dbf6`.
- [x] Repository history proves the reviewed artifacts were introduced by `8e9443f` and `328299f`, respectively, and are ancestors of the observed application SHA.
- [ ] Reconfirm the target’s application SHA, service, environment, and database binding immediately before Phase 3.
- [ ] Record the named operator, approver, maintenance window, and change/incident reference.

## Catalog and ledger

- [x] No ledger candidate was found; catalog reconciliation is explicit.
- [x] 0020–0026 and 0028 expected catalog state is present, including canonical partial payment uniqueness and 0028 frozen totals check.
- [x] 0027 has no target table, columns, or index.
- [x] 0029 has no target table, check constraint, or any of its five indexes.
- [ ] Repeat every appendix query in a new `BEGIN READ ONLY` session immediately before execution and verify no partial state.
- [ ] Stop if a ledger appears with conflicting evidence, any expected object is partially present, the 0028 state differs, or either checksum differs.

## Dependency and integrity prerequisites

- [x] `driver_lottery_entries`, `billing_batches`, and `users` exist and are small; current aggregate counts/sizes are recorded in the package.
- [x] Parent identifiers for 0029 are compatible `character varying` values; `gen_random_uuid()` is available.
- [ ] Repeat aggregate counts/sizes and source-table existence checks immediately before execution.
- [ ] Confirm current system load has no long-running transaction or lock that would make the short 0027 write-blocking window unsafe.

## Availability and timeout posture

- [x] 0027 is transactional and includes non-concurrent index creation over the 30-row lottery table; it can block lottery-entry writes.
- [x] 0029 is transactional and builds indexes only on its new empty table.
- [ ] Set `lock_timeout` to 5 seconds and `statement_timeout` to 30 seconds for each transaction; stop rather than retry blindly on timeout.
- [ ] Schedule a short low-traffic maintenance/quiesce window for 0027 and communicate a temporary lottery-entry write pause if required.

## Backup, recovery, and safety

- [ ] Obtain and record current production backup/PITR retention, restore-point availability, owner, and evidence reference. This is an approval blocker; it was not available from the repository or read-only service evidence.
- [x] No destructive statement, data backfill, data deletion, provider call, wallet mutation, payment, transfer, settlement, or payout is in either migration.
- [x] Production service environment has no explicitly enabled financial-execution flags. Application policy defaults to deny when `FINANCIAL_EXECUTION_ENABLED` is absent and additionally requires explicit production enablement for live Stripe execution.
- [ ] Reconfirm the four financial execution variables are absent or explicitly false and record the startup policy log as `allowed:false` before execution.

## Approval gate

- [ ] Separate written authorization names **only** 0027 and 0029, in that order, on the intended production database.
- [ ] Approval explicitly excludes 0028, broad migration runners, deployment, provider enablement, financial execution, and data backfill.
- [ ] Phase 3 runbook, schema verification appendix, smoke checklist, risks/rollback appendix, and release record are open and assigned.

**No-Go rule:** any unchecked mandatory item, changed catalog state, failed health check, unavailable backup/PITR evidence, or ambiguous target ends the execution attempt before DDL.
