# CTX-ARCH-008 — Production Database Migration Discovery and Requirements

- **Status:** Discovery and requirements package — not an approved implementation architecture
- **Phase:** B — Production Database Migration Architecture Discovery
- **Date:** July 22, 2026
- **Scope:** Repository-grounded analysis only; no database, Railway, staging, or production access was used.
- **Governing documents:** [Documentation Index](../README.md), [Project Context](../project/project-context.md), [Development Protocol](../development-protocol.md), [CTX-STD-001](../standards/cretexchange-platform-standards.md), [CTX-DB-001](../standards/CTX-DB-001-database-migration-and-schema-governance-standard.md), [CTX-DEP-001](../standards/CTX-DEP-001-production-deployment-protocol.md), and [CTX-OPS-001](../operations/CTX-OPS-001-production-release-checklist.md).

## 1. Purpose and evidence labels

This package records what the repository proves today and the requirements for a future, separately approved production database migration architecture. It does not select a runner, create a ledger, authorize a migration, or change deployment behavior.

- **Verified repository fact** — directly supported by a repository file linked in this package.
- **Verified release evidence** — supported by the completed [0027/0029 release record](../operations/migration-releases/2026-07-22-0027-0029-preflight/draft-release-record.md).
- **Inference** — a conclusion drawn from the cited facts; it needs review before implementation.
- **Assumption / Unknown** — cannot be established without separately authorized external verification.
- **Decision required** — a governance or architecture choice that this discovery intentionally does not make.

## 2. Identifier inventory

### 2.1 Architecture identifiers

**Verified repository fact.** The [architecture index](./README.md) assigns CTX-ARCH-001 through CTX-ARCH-007 to seven canonical architecture documents. CTX-ARCH-008 is therefore the next identifier under that published sequence. The directory contains corresponding descriptive filenames for CTX-ARCH-001 through CTX-ARCH-006 and the numbered `CTX-ARCH-007` file; numbering is established by the index rather than filename prefix alone.

### 2.2 ADR identifiers

**Verified repository fact.** The [knowledge-base ADR register](../KNOWLEDGE_BASE/ARCHITECTURE_DECISION_RECORDS.md) already assigns ADR-001 through ADR-011, and the architecture documents contain further embedded ADRs through ADR-020. [CTX-STD-001](../standards/cretexchange-platform-standards.md) also defines ADR-026 through ADR-030. No repository convention for a `CTX-ADR-*` filename or registry was found.

**Decision required — DBM-DEC-001.** Before a supporting ADR is authored, establish whether it joins the existing ADR sequence (next candidate ADR-031, subject to a full register reconciliation) or introduces a governed `CTX-ADR-*` series. Do not create either in Phase B.

## 3. Current-state discovery

### 3.1 Migration artifacts and inventory

**Verified repository fact.** SQL migrations reside in [`migrations/`](../../migrations). `drizzle.config.ts` configures Drizzle with `out: "./migrations"` and [`shared/schema.ts`](../../shared/schema.ts), but no Drizzle journal or snapshot directory exists in the repository. The files are mixed generated/handwritten: `0000_oval_jean_grey.sql` says it was generated after introspection; later files include handwritten comments and guards. No SQL migration file was found outside `migrations/`.

**Verified repository fact.** Numbering is not sequential: `0001` is duplicated, `0005`–`0007` are absent, and retained no-op migrations preserve historical ordering at `0011`, `0012`, and `0015`. Existing SQL does not carry a standard checksum or complete metadata header. Most changes are additive or guarded, but several perform data updates, apply non-null constraints, or use PostgreSQL concurrent indexes; these properties require per-release review rather than a global safety claim.

| ID | File / repository purpose | Primary objects or behavior | Characteristics and risk | Known production status / evidence |
| --- | --- | --- | --- | --- |
| 0000 | [`0000_oval_jean_grey.sql`](../../migrations/0000_oval_jean_grey.sql) — generated baseline | enums, core tables, indexes | large baseline; generated; operational risk high | Unknown; no ledger evidence |
| 0001a | [`0001_add_enhanced_location_creation_flag.sql`](../../migrations/0001_add_enhanced_location_creation_flag.sql) | feature flag | data insert/upsert; low–medium | Unknown |
| 0001b–0003 | [photo metadata migrations](../../migrations/0001_add_photo_metadata_fields.sql), [`0002`](../../migrations/0002_add_washout_photo_driver_location.sql), [`0003`](../../migrations/0003_add_washout_photo_full_metadata.sql) | `washout_photos` columns, type/FK guards | backfills and non-null constraints; high | Unknown; legacy helper also touches this area |
| 0004 | [`0004_add_lottery_notifications.sql`](../../migrations/0004_add_lottery_notifications.sql) | lottery notification table/indexes | additive guarded DDL; medium | Unknown |
| 0008–0012 | [`0008`](../../migrations/0008_payment_tip_amount.sql) through [`0012`](../../migrations/0012_noop_legacy_location_tip_units.sql) | payment tip fields / retained no-ops | legacy or no-op; do not infer application | Unknown |
| 0013–0019 | [`0013`](../../migrations/0013_add_localized_terms_acceptance.sql) through [`0019`](../../migrations/0019_add_lottery_drawing_fulfillments.sql) | terms and lottery/prize objects | additive guarded DDL; 0018/0019 include audit/inventory tables; medium | Unknown |
| 0020 | [`0020_unique_payment_obligation_per_activity.sql`](../../migrations/0020_unique_payment_obligation_per_activity.sql) | payment audit fields and global activity unique index | duplicate stop check; financial; high | Unknown in this repository-only phase |
| 0021 | [`0021_add_canonical_payment_obligation_kind.sql`](../../migrations/0021_add_canonical_payment_obligation_kind.sql) | canonical discriminator/index | additive financial schema; high | Unknown |
| 0022–0023 | [`0022`](../../migrations/0022_add_canonical_financial_batch_drafts.sql), [`0023`](../../migrations/0023_add_canonical_financial_batch_lifecycle.sql) | batch drafts, membership, audit, lifecycle | additive financial schema; high | Unknown |
| 0024–0025 | [`0024`](../../migrations/0024_replace_global_payment_activity_uniqueness_with_canonical_partial.sql), [`0025`](../../migrations/0025_retire_global_payment_activity_uniqueness.sql) | payment uniqueness indexes | autocommit / `CREATE` or `DROP INDEX CONCURRENTLY`; high; recovery-sensitive | **Verified release evidence:** later release record states partial index present and global index absent; exact historical application remains a reconciliation matter |
| 0026 | [`0026_add_configured_financial_cutoff.sql`](../../migrations/0026_add_configured_financial_cutoff.sql) | `system_settings` cutoff | schema plus settings update; financial; high | **Verified release evidence:** one non-null cutoff setting existed during 0027/0029 preflight; execution provenance remains unknown |
| 0027 | [`0027_add_rewards_period_controls.sql`](../../migrations/0027_add_rewards_period_controls.sql) | rewards periods and lottery-entry fields/index | additive schema; high | **Verified release evidence:** executed and catalog-verified July 22, 2026 |
| 0028 | [`0028_add_canonical_batch_execution_states.sql`](../../migrations/0028_add_canonical_batch_execution_states.sql) | batch execution states/check | additive financial schema; high | **Verified release evidence:** pre-existing catalog effects were verified and deliberately not rerun |
| 0029 | [`0029_add_canonical_financial_payment_attempts.sql`](../../migrations/0029_add_canonical_financial_payment_attempts.sql) | payment-attempt table/indexes | additive financial schema; high | **Verified release evidence:** executed and catalog-verified July 22, 2026 |
| 0030–0034 | [`0030`](../../migrations/0030_add_washout_activity_rejection_audit.sql) through [`0034`](../../migrations/0034_add_driver_active_material_intent.sql) | rejection audit, approval intent/audit, auth token version, materials, driver material | mostly additive; 0033 includes data normalization and constraints; medium–high | Unknown |

The inventory is a repository classification, not an assertion of database history. Transactional behavior is **Unknown** unless the SQL explicitly requires autocommit: 0024 and 0025 explicitly do. Any target-database status not cited above requires controlled reconciliation under the [Legacy Schema Reconciliation Procedure](../operations/legacy-database-schema-reconciliation-procedure.md).

### 3.2 Execution mechanisms

| Mechanism | Evidence | Current behavior / assessment |
| --- | --- | --- |
| Drizzle schema push | [`package.json`](../../package.json): `npm run db:push` | `drizzle-kit push`; development-oriented in the [Operations Runbook](../OPERATIONS_RUNBOOK.md). It is not an approved production execution mechanism under CTX-DB-001. |
| Imperative migration helper | [`package.json`](../../package.json): `npm run db:migrate`; [`scripts/apply-photo-schema-migration.ts`](../../scripts/apply-photo-schema-migration.ts) | Direct `pg` client DDL/data repair for photo schema. It is a legacy specific-purpose helper, not an ordered runner or durable ledger. |
| Application startup | [`server/index.ts`](../../server/index.ts), [`package.json`](../../package.json): `start` | Starts Express from `dist/index.js`; no repository startup import invokes a migration file. This satisfies the intended separation but cannot prove Railway has no external hook. |
| Build | [`package.json`](../../package.json): `build` | Vite plus esbuild; no repository build-script migration command. |
| Tests / maintenance scripts | [`scripts/`](../../scripts), [`package.json`](../../package.json) | Repair/verification tools exist; each needs an explicit future allow-list because names alone do not establish production safety. |

**Inference.** Repository deployment/build/start paths do not automatically apply the numbered SQL files. **Unknown.** Railway release commands, dashboard hooks, service topology, scaling, deployment rollback, branch mapping, and external CI cannot be proven without separately authorized console/CI evidence.

### 3.3 Database and ORM constraints

**Verified repository fact.** The runtime uses `pg` 8.16.3 and Drizzle ORM 0.45.2; Drizzle Kit 0.30.4 is development tooling ([`package.json`](../../package.json), [`drizzle.config.ts`](../../drizzle.config.ts)). Schema definitions are in [`shared/schema.ts`](../../shared/schema.ts). Runtime creates a `pg` pool wrapped by `RobustPool` in [`server/db.ts`](../../server/db.ts), with a maximum of ten connections and 30-second statement/query timeouts. It uses TLS through [`server/databaseSsl.ts`](../../server/databaseSsl.ts): certificate validation is required except an explicit staging self-signed opt-in.

**Verified repository fact.** The runtime requires `DATABASE_URL`; its credentials, role grants, database version, schema namespace, advisory-lock availability, and separation from a migration credential are not documented in repository configuration. The release evidence establishes PostgreSQL catalog use and controlled transaction timeouts for 0027/0029, but does not establish a reusable runner credential model.

### 3.4 Existing controls and principal gaps

Existing governance is strong: [CTX-DB-001](../standards/CTX-DB-001-database-migration-and-schema-governance-standard.md) requires immutable files, separate execution, checksum evidence, a ledger, one-at-a-time execution, catalog verification, and fail-closed financial controls. The [release procedure](../operations/database-migration-release-procedure.md), [preflight checklist](../operations/production-database-migration-preflight-checklist.md), [execution runbook](../operations/production-database-migration-execution-runbook.md), and [release record template](../operations/database-migration-release-record-template.md) prescribe operator controls.

The principal gap is implementation: no repository-controlled ordered runner, durable ledger, checksum manifest/journal, concurrency lock, target-environment guard, or automated repository/database comparison exists. The 0027/0029 release record confirms these gaps required manual catalog reconstruction and controlled operator execution.

## 4. Requirements catalogue

Priorities: **P0** first implementation; **P1** required before production adoption; **P2** later maturity. Acceptance criteria are deliberately implementation-neutral.

| ID | Requirement, rationale, and acceptance criteria | Priority / target |
| --- | --- | --- |
| DBM-FUNC-001 | Discover ordered repository migration artifacts, reject duplicate identifiers, and expose intentional gaps/no-ops. Rationale: the current directory has duplicate `0001` and gaps. **Accept:** a plan names every candidate, collision, gap, and disposition. | P0 / runner foundation |
| DBM-FUNC-002 | Validate immutable SHA-256 checksums before execution. **Accept:** a mismatch stops before any DDL and is recorded. | P0 / runner foundation |
| DBM-FUNC-003 | Provide `status`, `plan`, `preflight`, and explicit `apply` modes; `apply` must never be the default. **Accept:** non-apply modes issue no DDL/DML. | P0 / runner foundation |
| DBM-FUNC-004 | Execute approved migrations in reviewed order, one at a time, with explicit handling for nontransactional SQL. **Accept:** 0024/0025-style concurrent-index files cannot run inside a transaction. | P0 / runner foundation |
| DBM-SAFE-001 | Acquire a database-scoped single-executor lock with bounded timeout. **Accept:** a concurrent invocation exits without applying SQL. | P0 / runner foundation |
| DBM-SAFE-002 | Require explicit production target confirmation, approved package identity, and exact file checksum. **Accept:** ambiguous environment or mismatch fails closed. | P0 / production adoption |
| DBM-SAFE-003 | Enforce statement, lock, and idle-in-transaction timeouts appropriate to the reviewed migration. **Accept:** evidence records the effective settings. | P0 / production adoption |
| DBM-SAFE-004 | Require compatibility proof and prevent normal application startup from applying schema. **Accept:** deployment package identifies compatible application versions before and after execution. | P0 / production adoption |
| DBM-OPS-001 | Separate application deployment from migration execution and support an operator-controlled release step. **Accept:** deployment success cannot mark a migration applied. | P0 / production adoption |
| DBM-OPS-002 | Support resumable safe execution: completed, failed, reconciled, skipped, and not-applicable states are distinguished. **Accept:** a partially nontransactional file causes stop-and-inspect, not blind retry. | P1 / production adoption |
| DBM-OPS-003 | Produce structured, redacted command/result evidence and stable exit codes. **Accept:** logs contain no connection strings or credentials. | P0 / runner foundation |
| DBM-SEC-001 | Use least-privilege, separately governed migration credentials where practical; normal runtime must not require schema-change permission. **Accept:** credential model and grants are documented and reviewed. | P1 / production adoption |
| DBM-SEC-002 | Preserve financial fail-closed controls throughout schema activity. **Accept:** migration execution cannot enable providers, collection, settlement, payouts, wallets, rewards, or schedulers. | P0 / production adoption |
| DBM-AUD-001 | Maintain an immutable durable ledger with identifier, filename, SHA-256, environment, repository/application SHA, executor, start/end, duration, outcome, error reference, release reference, and verification evidence. **Accept:** each execution has exactly one durable outcome record. | P0 / ledger foundation |
| DBM-AUD-002 | Never infer a historical ledger entry merely from a filename or deployment. **Accept:** reconciliation records evidence and classification separately from execution. | P0 / ledger foundation |
| DBM-REC-001 | Define forward-repair, transaction rollback, application rollback, PITR, and destructive-change recovery separately. **Accept:** every release package states which are feasible. | P0 / production adoption |
| DBM-REC-002 | Stop on checksum drift, partial object state, unknown legacy state, or absent backup/PITR evidence. **Accept:** the runner/report supplies a deterministic no-go result. | P1 / production adoption |
| DBM-TEST-001 | Test ordering, checksums, duplicate identifiers, environment guards, redaction, status/plan/apply behavior, and ledger transitions. **Accept:** automated unit coverage exercises each stop condition. | P0 / runner foundation |
| DBM-TEST-002 | Test advisory-lock contention, transactional rollback, nontransactional failure, and legacy reconciliation against disposable PostgreSQL. **Accept:** integration evidence proves no duplicate executor application. | P1 / production adoption |
| DBM-TEST-003 | Require staging/operator validation for production credentials, Railway behavior, backups/PITR, health gates, and authenticated smoke tests. **Accept:** release record links evidence rather than asserting simulation equivalence. | P1 / production adoption |

## 5. Ledger and runner requirements

### 5.1 Ledger

The future ledger is **not designed or created here**. It must be owned by the database-migration architecture, not a deployment-history inference. It needs unique identity for environment plus migration identifier/filename, immutable checksum and source commit, execution timestamps/duration, executor identity, outcome/error reference, transaction identifier where usable, approval/release record reference, reconciliation classification, and catalog-verification evidence. A checksum mismatch, object-without-ledger-entry, ledger-without-object, or modified historical file is a stop condition.

For 0020–0029, the future reconciliation must record each as **applied**, **reconciled**, **skipped**, **not applicable**, **partial**, or **cannot determine** based on object-by-object evidence. The [reconciliation procedure](../operations/legacy-database-schema-reconciliation-procedure.md) forbids silently converting uncertainty into an applied row. 0027 and 0029 have execution evidence; 0028 has pre-existing verified effects and must remain protected from rerun.

### 5.2 Runner

**Preliminary technical direction — inference, not a decision.** A Node/TypeScript operator executable can reuse the present `pg` stack while treating SQL files as immutable artifacts. It should use PostgreSQL advisory locking, bounded timeouts, a transaction per compatible migration, explicit autocommit support for concurrent-index migrations, a mandatory production guard, checksum validation, plan/status/preflight/apply/reconciliation modes, redacted structured output, and nonzero stop-condition exit codes.

Mandatory first implementation: DBM-FUNC-001–004, DBM-SAFE-001–004, DBM-OPS-001/003, DBM-SEC-002, DBM-AUD-001/002, DBM-REC-001, and DBM-TEST-001. Deferred only after first adoption may be richer dashboards, alerting, automated release-record generation, CI execution, and long-term migration analytics; no deferred item may weaken production gates.

## 6. Deployment-pattern analysis

| Pattern | Fit / advantages | Risks and rollback posture | Status |
| --- | --- | --- | --- |
| A. Migrate before application deployment | Clear schema gate; easy operator evidence | New schema must remain compatible with current app; failed migration can delay release | Viable only with expand/contract compatibility proof |
| B. Deploy application before migration | Can stage code paths before schema use | Existing repository history shows schema absence can produce runtime API failures; application may start incompatible | Not preferred as a default |
| C. Expand-and-contract | Safest compatibility model; supports A or D | Requires disciplined multi-release planning and explicit contract removal | Strong preliminary direction |
| D. Dedicated release job / one-off runner | Separates runtime from schema permissions; auditable and concurrency-controllable | Railway job/one-off semantics and identity require external verification | Strong preliminary direction, conditional on platform verification |
| E. Startup migration | Operationally simple in appearance | Conflicts with CTX-DB-001; replicas/restarts can race; opaque rollback and audit | Prohibited by current standard |

**Preliminary recommendation.** Combine Pattern C with a separately approved operator-controlled Pattern D, with Pattern A/B chosen per compatibility proof. This aligns with CTX-DB-001’s prohibition on uncontrolled startup migration and the manual separation evidenced in the 0027/0029 release. It is not final until Railway release-job, deployment/health, credential, and rollback assumptions are verified.

## 7. Decision register

| ID | Decision required | Viable options / preliminary recommendation | Approver |
| --- | --- | --- | --- |
| DBM-DEC-001 | ADR numbering and registry | Existing ADR sequence vs governed CTX-ADR registry; reconcile register first | Architecture governance owner |
| DBM-DEC-002 | Ledger location and ownership | Application DB schema, dedicated ops schema, or external evidence store; prefer database-adjacent ledger with exported release evidence, subject to privilege review | Architecture + security |
| DBM-DEC-003 | Execution mechanism | Manual local operator executable, Railway one-off/release job, or CI executor; prefer dedicated operator/job after Railway verification | Release authority |
| DBM-DEC-004 | Credential separation | Runtime credential, migration credential, or controlled shared credential; prefer separate least-privilege migration credential | Security + operations |
| DBM-DEC-005 | Lock primitive and timeout policy | PostgreSQL advisory lock with release-specific timeouts is preliminary preference | Architecture + DBA/operator |
| DBM-DEC-006 | Historical reconciliation scope | Entire history vs staged verified cohorts; prefer evidence-led staged reconciliation | Release authority |
| DBM-DEC-007 | Required backup/PITR evidence | Platform proof and tested restore window vs unsupported assertion; require evidence before production adoption | Business/technical approver |
| DBM-DEC-008 | Railway deployment gate | One-off job, manual operator gate, or CI integration; do not select until platform behavior is verified | Operations owner |

## 8. Risk register

| Risk | Likelihood / impact / severity | Current control | Required control / residual owner |
| --- | --- | --- | --- |
| Duplicate or concurrent execution | Medium / Critical / Critical | Manual one-at-a-time runbook | Advisory lock plus durable ledger; architecture owner |
| Checksum drift or modified historical SQL | Medium / Critical / Critical | CTX-DB-001 policy | Immutable checksum validation and stop; release owner |
| Undocumented schema drift / legacy reconciliation error | High / Critical / Critical | Manual catalog evidence | Reconciliation classifications and proof; database governance owner |
| Application/schema incompatibility | Medium / Critical / Critical | Preflight procedure | Expand/contract proof and deployment gate; release owner |
| Failed transactional migration | Medium / High / High | Manual transaction discipline | Bounded transaction, evidence, forward-repair decision; operator |
| Partial nontransactional migration | Medium / Critical / Critical | SQL comments on 0024/0025 | Explicit autocommit state machine and recovery runbook; architecture owner |
| Successful migration but failed application deployment | Medium / High / High | CTX-DEP-001 | Compatibility envelope, health gate, rollback/forward repair; release owner |
| Irreversible/destructive change | Low / Critical / High | CTX-DB-001 policy | Separate approval, backup/PITR proof, forward plan; approver |
| Missing backup/PITR evidence | Medium / Critical / Critical | Release-specific review | Required go/no-go gate; operator |
| Excess database privilege | Medium / High / High | Unknown | Separate credentials/grants and audit; security owner |
| Secret leakage | Medium / High / High | Documentation redaction rules | Structured redaction tests and sanitized evidence; security owner |
| Financial execution side effect | Low / Critical / High | Fail-closed policy/docs | Explicit flag/provider/scheduler checks in runner and release record; financial governance owner |
| Railway behavior assumption | Medium / High / High | Repository-only evidence | Console/API verification and deployment rehearsal; operations owner |
| Legacy reconciliation error | High / Critical / Critical | Approved reconciliation procedure | Independent catalog evidence and approval; database governance owner |

## 9. Traceability from the 0027/0029 release

| Release lesson / finding | Future requirement |
| --- | --- |
| No durable repository-controlled ledger was found. | DBM-AUD-001/002 and DBM-DEC-002 |
| Required schemas were absent while application paths already depended on them. | DBM-SAFE-004 and deployment gating |
| 0027/0029 required manual preflight, explicit transaction execution, and catalog verification. | DBM-FUNC-003/004, DBM-SAFE-003, DBM-OPS-001 |
| 0028 was already present and was deliberately not rerun. | DBM-OPS-002 and reconciliation states |
| Financial execution remained fail-closed; no provider action was used for validation. | DBM-SEC-002 |
| Functional closure required authenticated role-based reads and existing records, not synthetic financial records. | DBM-TEST-003 and release smoke strategy |

## 10. Release gates, recovery, and testing

Future production adoption SHALL require repository inventory/checksums, fresh ledger/catalog comparison, compatibility assessment, verified target/environment, approval, backup/PITR evidence, financial fail-closed evidence, one-migration execution evidence, post-DDL catalog evidence, application health, role-appropriate smoke checks, observation, and durable release record. These reinforce rather than replace [CTX-DEP-001](../standards/CTX-DEP-001-production-deployment-protocol.md) and [CTX-OPS-001](../operations/CTX-OPS-001-production-release-checklist.md).

Recovery must distinguish application rollback (does not reverse schema), transactional rollback, nontransactional forward repair, feature/financial-execution disablement, and separately authorized PITR/data restoration. No migration system may promise automatic database rollback.

CI-suitable tests: parser/order/checksum/duplicate/modified-file tests; environment confirmation; redaction; ledger state transitions; SQL policy classification; and runner exit behavior. Disposable PostgreSQL tests: advisory-lock contention, transaction rollback, autocommit/concurrent-index failure, partial failures, ledger mismatch, empty database, and representative legacy schemas. Operator-controlled staging/production evidence: credential grants, Railway release behavior, backup/PITR, real deployment gates, authenticated smoke checks, and recovery exercises.

## 11. Proposed future documents (outlines only)

### Production Database Migration Architecture

1. Purpose, scope, and authority
2. Current-state constraints and migration inventory policy
3. Execution topology and trust boundaries
4. Ledger model and reconciliation model
5. Runner modes, locks, checksums, transactions, and nontransactional SQL
6. Deployment compatibility and Railway integration
7. Release gates, evidence, and financial security
8. Rollback, forward repair, backup/PITR, and incident response
9. Testing and operational ownership
10. Adoption plan and success criteria

### Supporting ADR

1. Context and decision drivers
2. Options: custom Node/TypeScript runner, Drizzle-native execution, managed release job, startup execution
3. Decision and rationale
4. Consequences and non-goals
5. Security/financial guardrails
6. Adoption and reconciliation plan
7. Reconsideration triggers

## 12. Phase C readiness

**CONDITIONALLY READY FOR ARCHITECTURE DRAFTING.** The repository facts, governance controls, release evidence, gaps, requirements, risks, and candidate topology are sufficient to draft a proposal. Approval remains blocked for implementation until the decision register is resolved and external evidence establishes: Railway deployment/job/rollback behavior; actual database roles and version; runtime versus migration credential separation; advisory-lock and timeout behavior; environment/production confirmation method; backup/PITR evidence; complete legacy catalog reconciliation scope; and a staging/disposable PostgreSQL validation plan.

## 13. Phase B safety record

This package was produced from local repository files only. No production or staging access occurred; no database connection, DDL, DML, migration (including 0028), deployment, Railway configuration change, GitHub workflow change, application-code change, or migration-file change occurred. Nothing in this document authorizes those actions.
