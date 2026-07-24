# ADR-031 — Production Database Migration Execution Architecture

- **Status:** **ACCEPTED — IMPLEMENTATION NOT YET AUTHORIZED**
- **Date:** July 22, 2026
- **Owners / approver:** Michael Loren Stiger — Architecture Owner, Business Owner, and Approver
- **Operating model:** Single-Operator Startup
- **Related architecture:** [CTX-ARCH-008 — Production Database Migration Architecture](./CTX-ARCH-008-production-database-migration-architecture.md)
- **Related discovery:** The Phase B discovery artifact is not retained in the current repository; the architecture and approval record preserve the resulting evidence boundary.
- **Related approval:** [CTX-ARCH-008 Architecture Approval Record](./approvals/CTX-ARCH-008-architecture-approval-record.md)
- **Related platform evidence:** [Phase F Railway Platform and Database Recovery Verification](./verification/CTX-ARCH-008-railway-platform-and-database-recovery-verification.md)
- **Supersedes:** None
- **Superseded by:** None

## Context and problem

CreteXchange has reviewed SQL migration artifacts but no repository-owned manifest, ordered production runner, durable migration ledger, target guard, or reusable concurrency control. The 0027/0029 release showed that application deployment does not establish schema state and that historical effects cannot be reconstructed from filenames alone. CTX-ARCH-008 establishes the required architecture; this ADR records the selected direction and the limits of that decision.

The decision is deliberately separate from implementation and production adoption. Phase F found enough evidence to decide the repository-owned execution model, but not enough to select a permanent Railway invocation mechanism, prove credential separation, establish recovery readiness, or treat staging as production-equivalent.

## Decision drivers

- Production migrations must remain separate from normal application startup.
- Accepted migration history must be deterministic, immutable, checksum-verified, and auditable.
- Existing generated and handwritten SQL artifacts must be preserved as reviewed inputs.
- Execution must fail closed on target ambiguity, drift, lock contention, partial state, or missing approval.
- Financial/provider execution must remain independently fail closed.
- Recovery, application rollback, and database recovery must not be conflated.
- Platform assumptions must be tested rather than inferred from documentation.

## Decisions

### Accepted decisions

1. **No startup migrations.** Numbered production migrations SHALL NOT run as part of ordinary application startup. Restarts, replica changes, overlap, and application-pool behavior make startup execution operationally unsafe and insufficiently auditable.
2. **Repository-owned manifest.** Production migrations SHALL be governed by a reviewed repository-owned manifest or equivalent registry containing a stable logical identifier, ordered artifact reference, SHA-256 checksum, classification, transaction behavior, applicability, verification requirements, and immutable accepted history.
3. **Direct-SQL Node/TypeScript runner.** The first runner SHALL be a Node/TypeScript component using the existing `pg` stack to execute the reviewed repository SQL artifacts directly. This preserves the exact mixed generated/handwritten SQL and permits explicit transactional/autocommit handling. Drizzle remains development tooling, not the production migration executor.
4. **Distinct runner modes.** The architecture SHALL support separate plan, status, verify, preflight, apply, and reconcile modes or equivalents. Exact command spelling, flags, and exit-code mappings are implementation design.
5. **PostgreSQL migration ledger.** Execution and reconciliation evidence SHALL be retained in a PostgreSQL ledger with immutable migration/artifact/checksum identity, repository commit, environment, release and executor identity, timestamps, outcome, verification, reconciliation, remediation, and redacted failure evidence. It must accommodate `applied`, `failed`, `reconciled`, `skipped`, `not_applicable`, and `remediated` without falsely claiming atomicity for nontransactional work.
6. **Separate ledger bootstrap.** Ledger bootstrap SHALL be a separately approved additive release with its own checksum, catalog evidence, and release record. It SHALL NOT invent prior `applied` history. Historical state is reconciled afterward and remains distinguishable from normal application.
7. **Evidence-based reconciliation.** Historical state SHALL be reconciled from catalog, release, checksum, and migration-specific evidence. Filename order, current schema shape, and deployment history alone are insufficient. Ambiguity remains explicit. Migration `0028` SHALL NOT be marked normally applied or rerun without evidence and separate approval.
8. **Dedicated session-level advisory lock.** An applying runner SHALL retain a PostgreSQL session-level advisory lock on one dedicated direct database session for the full controlled execution boundary. Lock acquisition/release happens on that same session; lock failure is fail closed. Exact namespace, key, wait policy, and timeout remain implementation design.
9. **Classified transaction strategy.** Migrations SHALL be classified as transactional, nontransactional, reconciliation-only, not applicable, or an approved equivalent. Transactional work uses explicit transactions where valid. Nontransactional work receives at-most-one serialized attempt per authorization; failure or ambiguity stops for evidence review and explicit remediation. Universal exactly-once execution is not claimed.
10. **Expand-and-contract by default.** Additive compatibility precedes application dependence; destructive contraction occurs only after compatibility and observation evidence. Deployment overlap strengthens this requirement. Exceptions need documented review, recovery posture, and approval.
11. **Application rollback is not database recovery.** Image/deployment rollback does not reverse completed schema work. Recovery is separately assessed as transaction rollback, forward remediation, schema correction, PITR, or restoration; forward remediation is preferred where reversal is unsafe.
12. **Dual non-secret production target proof.** Apply mode SHALL require at least two independent non-secret target proofs plus the approved release identity. Exact safe identifiers and mechanics remain deferred until provider/environment mapping is confirmed.
13. **Least-privilege target state.** The migration runner should use credentials distinct from ordinary runtime credentials, and runtime credentials should not hold schema-migration authority where avoidable. Provider credentials are not exposed by default.
14. **Separate runner architecture; invocation mechanism deferred.** A migration runner is distinct from application startup. Railway pre-deploy, a controlled one-off mechanism, a dedicated service, GitHub/external orchestration, and manually authorized operator invocation remain alternatives. No permanent Railway invocation mechanism is selected now.
15. **Recovery evidence gate.** Production migration authorization SHALL require appropriate recovery evidence. Provider documentation does not prove the current production database has usable PITR, backup, or restoration capability.
16. **Low staging parity.** Staging is not production-equivalent until topology/configuration gaps are resolved or expressly bounded in a rehearsal. The invalid deployment-region findings from Phase F require separate authorized remediation before either environment is relied upon for deployment behavior.
17. **Financial safeguards.** Migration work SHALL NOT enable providers, payments, transfers, wallets, settlement, payouts, rewards execution, schedulers, or synthetic production financial activity. Migration success does not authorize financial execution.
18. **Emergency principle and ownership.** Emergency migration work remains subject to target confirmation, serialization, redacted evidence, retained records, and post-event reconciliation. Review may be compressed only under explicit incident authority; it is never silently bypassed. Michael Loren Stiger is the current accountable owner/approver in the Single-Operator Startup model.
19. **Implementation CI gates.** A future implementation SHALL statically validate manifest integrity, identifiers, ordering, artifacts, checksum drift, accepted-history immutability, classifications, unsafe configuration, and corresponding tests. Workflow/tool selection is deferred.

### Decision-status summary

| Status | Decision set |
| --- | --- |
| **ACCEPTED** | Decisions 1–12 and 15–19 above: runner architecture, manifest/ledger/reconciliation/lock/transaction/compatibility/recovery/target-proof principles, financial safeguards, ownership, and CI control requirements. |
| **PROVISIONAL — VALIDATION REQUIRED** | Separate runner invocation through a manually authorized operator may be evaluated for controlled staging adoption after authorization; Railway pre-deploy is a viable candidate, not a selection. |
| **DEFERRED — IMPLEMENTATION DESIGN** | Manifest serialization and parser; CLI names/flags/exit codes; ledger schema/table name; lock key/timeouts; detailed state transitions; target-proof identifiers; runner log structure; CI mechanics. |
| **DEFERRED — CONTROLLED TEST REQUIRED** | Session affinity, lock contention, failure/retry/overlap behavior, long-running stability, credential isolation/grants, staging rehearsal, restore/PITR workflow, deployment gating, and post-schema rollback behavior. |
| **DEFERRED — OWNER OR PROVIDER CONFIRMATION REQUIRED** | Production database provider/target identity, credential model, recovery ownership/retention, Railway plan/log retention/job capability, environment-to-branch mapping, and role authority. |
| **REJECTED** | Startup migrations, filename-only history, no ledger, transaction-level-only locking for the whole release, silent historical marking/skipping, destructive in-place default evolution, and treating application rollback as database rollback. |

## Alternatives considered

| Alternative | Benefit | Drawback / disposition |
| --- | --- | --- |
| Application-startup migrations | Few visible moving parts. | **Rejected.** Restarts, overlap, and replicas can duplicate or obscure execution; violates CTX-DB-001. |
| Drizzle-native automatic production execution | Uses existing ORM tooling. | **Rejected for the first runner.** It does not preserve the existing reviewed SQL artifacts or required transaction/autocommit control as directly. |
| Manual SQL with no repository runner | Immediate familiarity. | **Rejected.** No durable checksum/order/ledger/guard model. |
| Railway pre-deploy permanently selected now | Documented deployment-failure gate. | **Deferred.** Project-specific retries, credentials, audit, overlap, and approval behavior are untested. |
| Dedicated migration service | Potential runtime/credential separation. | **Deferred.** Requires controlled validation of lifecycle, cost, credentials, and concurrency. |
| GitHub Actions/external orchestration | Potential review and approval integration. | **Deferred.** No current workflow/account evidence proves safe operation. |
| No ledger | Lower initial schema effort. | **Rejected.** Cannot meet durable execution/reconciliation evidence requirements. |
| Filename-only migration tracking | Simple to inspect. | **Rejected.** Existing duplicate/gapped history makes it unsafe. |
| Transaction-level locking only | Automatic release at transaction end. | **Rejected for release serialization.** It cannot protect a multi-transaction/nontransactional execution boundary. |
| No legacy reconciliation | Faster apparent adoption. | **Rejected.** Would fabricate history or leave known ambiguity unmanaged. |
| Destructive in-place schema changes | Fewer releases. | **Rejected as the default.** Incompatible with safe overlap and recovery posture. |
| Application rollback as database recovery | Familiar deployment action. | **Rejected.** A successful application rollback does not undo committed schema/data changes. |

## Rationale

The selected direction is the smallest architecture that treats SQL files, catalog state, deployment state, and release evidence as separate sources of truth. The current `pg` stack is sufficient for a direct runner without adopting another language or framework, while a manifest and ledger supply controls absent from the repository today. PostgreSQL defines session-level advisory locks in a way that matches the full release boundary when one dedicated client holds the session; Phase F correctly leaves the real provider connection path as a test requirement.

Railway documents pre-deploy behavior, rollback, variable references, and Railway-hosted PostgreSQL recovery capabilities, but Phase F did not verify the current production database provider, invocation behavior, credential grants, or recovery usability. The ADR therefore accepts the runner architecture while explicitly deferring its permanent execution mechanism.

## Consequences

### Positive

- Safer, observable migration execution with checksum, ledger, target, and lock controls.
- Explicit treatment of legacy uncertainty and nontransactional partial states.
- Reduced coupling between application deployment and schema execution.
- Clearer recovery expectations and stronger future automation boundaries.

### Costs and constraints

- Implementation requires a ledger bootstrap, manifest, runner, tests, credentials/grants, and release procedures.
- Reconciliation and controlled tests require time, approvals, and an isolated environment.
- Early adoption may remain manually authorized until a platform mechanism is verified.
- Single-operator approval requires explicit evidence and compensating discipline.

### Ongoing

- Railway/provider documentation and environment behavior must be periodically revalidated.
- The architecture should evolve as platform capabilities and organization roles change.
- Future operating roles should separate architecture approval, release approval, execution, database administration, security review, and audit review.

## Risks and mitigations

| Risk | Mitigation / residual condition |
| --- | --- |
| Incorrect legacy reconciliation | Evidence-based classifications; no filename/schema inference; explicit uncertainty. |
| Concurrent execution or retry ambiguity | Dedicated session lock, ledger state, fail-closed runner; controlled concurrency/retry tests remain required. |
| Checksum drift | Repository manifest and immutable accepted-history validation. |
| Partial nontransactional execution | Explicit classification, at-most-one authorized attempt, stop-and-remediate evidence. |
| Application/schema incompatibility | Expand-and-contract, compatible deployment gate, health/smoke evidence. |
| Wrong target | Dual non-secret proof, release identity, fail-closed preflight. |
| Excess credential privilege | Least-privilege target state; grants/credential model deferred pending evidence. |
| Untested PITR/restore | Recovery gate, provider confirmation, and restore rehearsal before high-risk adoption. |
| Low staging parity or invalid region | Record parity gaps; separately authorize remediation before relying on staging/deployment behavior. |
| Provider behavior differs from documentation | Controlled tests and release-specific evidence. |
| Single-operator error | Explicit ownership, named approvals, durable release evidence, and future role separation. |

## Controlled tests carried forward

| Test | Blocks implementation start | Blocks implementation acceptance | Blocks production adoption |
| --- | --- | --- | --- |
| Advisory lock / persistent session affinity through intended path | No, approved plan required | Yes | Yes |
| Failed executor, retry, and overlap prevention | No, approved plan required | Yes | Yes |
| Distinct migration credential injection and grants | No, target state may be designed | Yes | Yes |
| Staging migration rehearsal and long-running connection stability | No | Yes | Yes |
| PITR/restore workflow and restoration rehearsal | No for non-destructive foundation | No for limited foundation | Yes for destructive/high-risk adoption; otherwise approved risk disposition required |
| Application rollback after completed schema migration | No | Yes | Yes |
| Release gating under migration failure | No | Yes | Yes |

No controlled test is authorized by this ADR.

## Implementation authorization gate

Implementation remains prohibited until a separate **Implementation Authorization Record** confirms that this ADR is accepted, implementation-blocking decisions are resolved or formally delegated, required provider/platform confirmations are complete, controlled-test plans are approved, staging-parity remediation scope is established, the invalid-region issue has an authorized remediation path, and change/branch/review controls are defined.

## Production adoption gate

Production adoption remains prohibited until implementation completion and review; automated and disposable-database tests; staging rehearsal; ledger-bootstrap approval; legacy-reconciliation approval; target-proof validation; credential and advisory-lock validation; backup/PITR evidence; restore rehearsal or explicitly approved risk disposition; fresh production preflight; approved release record; controlled observation; and closure are complete.

## Supersession and change control

This ADR governs the first controlled migration-capability implementation direction. It does not supersede CTX-ARCH-008, CTX-DB-001, CTX-DEP-001, or CTX-OPS-001. A material change to the runner mechanism, ledger guarantee, credential model, lock model, recovery posture, or release authority requires ADR review. Provider facts must be revised from new direct evidence, not assumption.

## References

- [CTX-ARCH-008](./CTX-ARCH-008-production-database-migration-architecture.md)
- Phase B discovery artifact not retained in the current repository
- [Phase E approval record](./approvals/CTX-ARCH-008-architecture-approval-record.md)
- [Phase F verification record](./verification/CTX-ARCH-008-railway-platform-and-database-recovery-verification.md)
- [CTX-DB-001](../standards/CTX-DB-001-database-migration-and-schema-governance-standard.md)
- [CTX-DEP-001](../standards/CTX-DEP-001-production-deployment-protocol.md)
- [CTX-OPS-001](../operations/CTX-OPS-001-production-release-checklist.md)
