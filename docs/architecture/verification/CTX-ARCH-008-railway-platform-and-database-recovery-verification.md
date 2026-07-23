# CTX-ARCH-008 — Railway Platform and Database Recovery Verification

- **Document ID:** CTX-ARCH-008-VERIFICATION
- **Record type:** Architecture verification evidence; not architecture, an ADR, implementation authorization, or production authorization
- **Related architecture:** [CTX-ARCH-008 — Production Database Migration Architecture](../CTX-ARCH-008-production-database-migration-architecture.md)
- **Related approval:** [CTX-ARCH-008 Architecture Approval Record](../approvals/CTX-ARCH-008-architecture-approval-record.md)
- **Related discovery:** [Production Database Migration Discovery and Requirements](../production-database-migration-discovery-and-requirements.md)
- **Related ADR:** [ADR-031 — Production Database Migration Execution Architecture](../ADR-031-production-database-migration-execution-architecture.md) — decisions only; Phase F findings and their verification status are unchanged.
- **Status:** **CONDITIONALLY READY FOR ADR — IMPLEMENTATION NOT AUTHORIZED — PRODUCTION ADOPTION NOT AUTHORIZED**
- **Date:** July 22, 2026
- **Repository / branch at start:** `cretexchange-phasea-clean` / `feature/cutoff-and-rewards-controls`
- **Starting repository commit:** `3f7016be89e0ec13d964eae8bb4ab4b71371215f`
- **Evidence boundary:** Read-only Railway console inspection, local repository inspection, and official Railway and PostgreSQL documentation. No database connection, SQL, deployment, Railway command, configuration change, or controlled test occurred.

## 1. Executive summary

Phase F replaced some CTX-ARCH-008 Railway assumptions with bounded evidence. The inspected Railway project has distinct `production` and `staging` environments. Production currently exposes one online application service, while staging exposes a separate application service, a Railway PostgreSQL service with a volume, and a bucket. The environments are therefore not materially equivalent today. Both inspected application services display an invalid configured region that Railway says blocks future deployments; this is a material release-readiness risk, not a migration-runner decision.

Railway documentation confirms that a first-class pre-deploy command exists and runs between build and deployment with application variables; a failing command prevents deployment. It also documents image rollback, deployment overlap controls, reference variables, backups, and PITR for Railway-hosted PostgreSQL. Those documents do **not** prove that the current production database is Railway-hosted, that PITR is enabled, that restores are usable, or that any job/runner mechanism is safe for this project.

The record supports a future ADR, but it does not choose a runner. A controlled test and owner/provider confirmation remain required for the production database path, credential/grant model, session-affinity behavior, failure/retry behavior, and recovery posture.

## 2. Scope and authorization boundaries

This record covers platform, topology, deployment, variable metadata, PostgreSQL session semantics, and recovery evidence relevant to CTX-ARCH-008. It does not create a release mechanism, ledger, runner, migration, service, database role, backup, restore, or ADR. It does not alter CTX-ARCH-008's status.

The following did not occur: staging or production mutation; database connection; SQL; DDL/DML; a migration including `0028`; a Railway command/job/shell; a deployment/redeploy/restart/scale action; variable/configuration change; backup/restore/PITR; application, migration, dependency, CI, or workflow change; or a push.

## 3. Evidence methodology and labels

Each finding uses one of the required labels below. A platform-documentation finding is not represented as observed project behavior.

| Status | Meaning |
| --- | --- |
| **VERIFIED — PROJECT CONFIGURATION** | Directly observed in the authenticated Railway project or local repository configuration. |
| **VERIFIED — PROVIDER CONSOLE OBSERVATION** | Directly observed in the Railway console without changing it. |
| **VERIFIED — PLATFORM DOCUMENTATION** | Supported by the cited official provider or PostgreSQL documentation, accessed July 22, 2026. |
| **INFERRED — REQUIRES CONFIRMATION** | A bounded conclusion drawn from facts, not a direct proof. |
| **NOT VERIFIED — CONTROLLED TEST REQUIRED** | Read-only evidence cannot establish the fact. |
| **NOT VERIFIED — OWNER OR PROVIDER CONFIRMATION REQUIRED** | Requires authority, account, billing, provider, or ownership evidence not available in this phase. |
| **NOT APPLICABLE** | The question does not apply to the observed configuration. |

All identifiers below are limited to service/environment names or redacted identifiers. No connection string, credential, token, or secret value was inspected or copied.

## 4. Environment and service inventory

| Finding | Status | Observation | Architectural significance / limitation |
| --- | --- | --- | --- |
| F-ENV-001 | **VERIFIED — PROVIDER CONSOLE OBSERVATION** | The authenticated Railway project presented the `production` and `staging` environments. | Environment separation exists at the Railway-project level; branch mapping was not exposed in the inspected UI. |
| F-ENV-002 | **VERIFIED — PROVIDER CONSOLE OBSERVATION** | Production showed one online application service: `Cretexchange_temp`, with public domain `cretexchange.app`. | No production worker/job/database service appeared in the inspected project architecture view. This does not prove no external services exist. |
| F-ENV-003 | **VERIFIED — PROVIDER CONSOLE OBSERVATION** | Staging showed `robust-cooperation` (online), `Postgres` (online), `postgres-volume`, and one bucket. | Staging has Railway-hosted PostgreSQL and an object bucket visible in-project. |
| F-ENV-004 | **VERIFIED — PROVIDER CONSOLE OBSERVATION** | Production's inspected architecture view did not show a Railway PostgreSQL service; production application variables include a masked `DATABASE_URL`. | The current production database provider/binding is **not verified**. It may be external, but that is only an inference until variable-reference metadata or provider ownership evidence is reviewed. |
| F-ENV-005 | **VERIFIED — PROVIDER CONSOLE OBSERVATION** | Staging and production application-service names, service composition, and visible data services differ. | Staging parity is **LOW** for a production migration rehearsal until database-provider/topology and configuration parity are intentionally established. |
| F-ENV-006 | **VERIFIED — PROVIDER CONSOLE OBSERVATION** | Both inspected application service settings showed an invalid configured region: `us-west2` in production and `sfo` in staging. Railway stated each blocks deployments. | A deployment/rehearsal cannot be treated as ready. No region was changed in this phase. |

### 4.1 Branch, source, and network observations

| Finding | Status | Observation | Limitation |
| --- | --- | --- | --- |
| F-SRC-001 | **VERIFIED — PROVIDER CONSOLE OBSERVATION** | Both inspected application services link to GitHub repository `msti64-wq/Cretexchange_temp` and state that changes to a branch connected to the respective environment deploy automatically. | The exact branch name was not exposed in the read-only snapshot; commit-to-environment mapping remains unverified. |
| F-SRC-002 | **VERIFIED — PROVIDER CONSOLE OBSERVATION** | Production’s active deployment was successful and attributed to GitHub; deployment history preserves status, source message, timing, and deployment identity. | Retention duration and export completeness were not established. |
| F-NET-001 | **VERIFIED — PROVIDER CONSOLE OBSERVATION** | Both application services expose public/private networking settings in the console. | Network path from the production application to the target database, including any proxy/pooler, is unverified. |

## 5. Deployment verification

| Finding | Status | Observation | Architectural significance / limitation |
| --- | --- | --- | --- |
| F-DEP-001 | **VERIFIED — PROJECT CONFIGURATION** | Repository `package.json` has `build` and `start` scripts but neither invokes numbered SQL migrations. `server/index.ts` registers routes and starts the HTTP server; it does not import numbered migration files. | This supports CTX-ARCH-008's prohibition on startup migrations, but does not prove an external Railway command cannot run one. |
| F-DEP-002 | **VERIFIED — PROVIDER CONSOLE OBSERVATION** | The production service uses Railpack with Node 22.23.1, one configured replica, restart-on-failure policy, and a maximum of 10 restart retries. | A migration attached to ordinary startup would be exposed to restart/retry behavior and is prohibited. |
| F-DEP-003 | **VERIFIED — PROVIDER CONSOLE OBSERVATION** | The production and staging settings pages offered adding a pre-deploy step and showed no configured pre-deploy command in the inspected view. | Absence is limited to the visible service configuration; repository config-as-code/other external automation must also be reviewed for a release. |
| F-DEP-004 | **VERIFIED — PROVIDER CONSOLE OBSERVATION** | The settings pages showed a health-check configuration control, but no configured path/value was visible in the read-only snapshot. | The current health path, timeout, and deployment gate behavior are unverified. |
| F-DEP-005 | **VERIFIED — PLATFORM DOCUMENTATION** | Railway documents pre-deploy commands as running between build and application deployment in a separate container with access to application variables; a non-zero exit prevents the deployment from proceeding. | It is a viable option to evaluate in an ADR, not an approved migration mechanism. Its overlap/retry/approval behavior for this project requires a controlled test. |
| F-DEP-006 | **VERIFIED — PLATFORM DOCUMENTATION** | Railway documents deployment rollback as redeploying a prior successful deployment image/source and restoring that deployment's custom variables. | Application rollback does not establish database rollback. CTX-ARCH-008's forward-repair rule remains unchanged. |
| F-DEP-007 | **VERIFIED — PLATFORM DOCUMENTATION** | Railway documents configurable old/new deployment overlap and graceful draining; default deployment behavior maintains one deployment per service. | Historical/concurrent-client behavior cannot be assumed from documentation; normal startup migrations remain prohibited. |

### Deployment evidence and retention

Deployment history visibly retained deployment state, source message, elapsed age, initiator label, and a deployment identifier. Build, deployment, and runtime log availability are visible through the console navigation. **NOT VERIFIED — OWNER OR PROVIDER CONFIRMATION REQUIRED:** retention duration, export/download scope, audit-event immutability, exit-code retention, and whether a future one-off execution log is retained long enough for a regulated release record. Railway logs are supporting evidence only; they are not a migration ledger.

## 6. Release-job and controlled one-off execution capabilities

No execution mechanism was created, invoked, or selected. The matrix is decision support only.

| Option | Current availability evidence | Safety / failure visibility | Serialization and retry risk | Credential separation / auditability | Status for ADR |
| --- | --- | --- | --- | --- | --- |
| Railway pre-deploy command | **VERIFIED — PLATFORM DOCUMENTATION**; the service UI offers an unconfigured pre-deploy control. | Failure blocks the application deployment; execution uses a separate container and application variables. | Documentation says failures are not retried, but overlap, manual re-run, and operator approval require testing. | Uses application environment variables by default; separate credentials need separate variable design. Logs/exit evidence require confirmation. | Viable; **PROVISIONAL — ADR DECISION REQUIRED**. |
| Railway cron/scheduled service | **VERIFIED — PROVIDER CONSOLE OBSERVATION**; services expose a cron-schedule configuration control. | Designed for schedule, not release approval. | Repeat/schedule risk is intrinsically high for migrations. | Not evaluated for independent credentials/audit. | Not preferred; no current use authorized. |
| Dedicated migration service | **INFERRED — REQUIRES CONFIRMATION**; Railway can host services, but no migration service exists. | Could separate runtime from migration privileges. | Must prove it cannot overlap/retry silently. | Could receive service-specific variables, subject to verified variable semantics. | Candidate only; controlled test and owner approval required. |
| GitHub Actions invoking controlled runner | **VERIFIED — PROJECT CONFIGURATION** that no repository GitHub workflow was found; platform/account behavior was not inspected. | Could provide review/approval evidence outside Railway. | Concurrency, secrets, environment protection, and runner identity need explicit configuration. | Potential separation, not demonstrated. | Candidate only; provider/owner confirmation required. |
| Manual authorized operator runner | **VERIFIED — PROJECT CONFIGURATION** that no general runner currently exists; direct `pg` is a dependency. | Can preserve deliberate approval and redacted local evidence. | Human serialization alone is insufficient; proposed advisory lock must be tested. | Credential separation and operator audit remain unverified. | Viable fallback; **PROVISIONAL — ADR DECISION REQUIRED**. |

Railway documentation does not, by itself, verify a first-class one-off job/release-job capability configured for this project. That capability remains **NOT VERIFIED — OWNER OR PROVIDER CONFIRMATION REQUIRED**.

## 7. Runtime topology and concurrency

| Finding | Status | Observation / significance |
| --- | --- | --- |
| F-CON-001 | **VERIFIED — PROVIDER CONSOLE OBSERVATION** | Production is configured for one replica. This is not a cross-release serialization guarantee. |
| F-CON-002 | **VERIFIED — PROVIDER CONSOLE OBSERVATION** | The console offers multi-region replicas, teardown overlap, restart policy, serverless, and cron controls. |
| F-CON-003 | **VERIFIED — PLATFORM DOCUMENTATION** | Railway documents deployment overlap/draining and restart/redeploy behavior. |
| F-CON-004 | **VERIFIED — PROJECT CONFIGURATION** | `server/db.ts` constructs a `pg` `Pool` with maximum 10 connections; it also reconnects after connection failures. | A pooled application connection is not a suitable owner for a session-level migration lock. |
| F-CON-005 | **INFERRED — REQUIRES CONFIRMATION** | A startup-based migration could be triggered by restarts, a future replica count, deployment overlap, or independently deployed services. | Confirms the architectural prohibition; no platform serialization may substitute for the runner lock. |

## 8. Variables, credentials, and least privilege

The production service showed 25 masked service-variable names, including `DATABASE_URL`, application URLs, object-storage variables, session/JWT secrets, Stripe-related variables, and frontend map/Stripe public-key variables. Values were not revealed, copied, or inspected. No financial-execution enablement flag was visible in that name list; its absence is not proof of fail-closed runtime behavior.

| Finding | Status | Observation | Required follow-up |
| --- | --- | --- | --- |
| F-VAR-001 | **VERIFIED — PROVIDER CONSOLE OBSERVATION** | Railway supports service variables; the UI also links to project shared-variable configuration. | Verify source/scope/override metadata for `DATABASE_URL` in a separately approved, non-secret review. |
| F-VAR-002 | **VERIFIED — PLATFORM DOCUMENTATION** | Railway documents references such as `${{ServiceName.VARIABLE_NAME}}`, including `DATABASE_URL=${{Postgres.DATABASE_URL}}`. | Platform capability does not prove the production `DATABASE_URL` is a reference rather than a literal value. |
| F-VAR-003 | **NOT VERIFIED — CONTROLLED TEST REQUIRED** | Whether the current production application credential has schema-changing privileges cannot be determined without database evidence. | Authorized least-privilege/grant inspection. |
| F-VAR-004 | **NOT VERIFIED — OWNER OR PROVIDER CONFIRMATION REQUIRED** | Whether Railway's current project plan/account allows the exact desired service-specific, environment-specific, shared, override, rotation, and audit workflow was not established. | Owner/provider confirmation before selecting credential topology. |
| F-VAR-005 | **INFERRED — REQUIRES CONFIRMATION** | A separate migration service or non-application release executor could receive distinct variables if Railway reference/service-variable capabilities are applied intentionally. | Demonstrate on an isolated environment; never infer a role separation from variable names. |

## 9. PostgreSQL session and advisory-lock findings

| Finding | Status | Observation / significance |
| --- | --- | --- |
| F-LOCK-001 | **VERIFIED — PLATFORM DOCUMENTATION** | PostgreSQL session-level advisory locks are held until explicit release or session end. A transaction rollback does not release a session-level lock; session termination releases it. |
| F-LOCK-002 | **VERIFIED — PLATFORM DOCUMENTATION** | Transaction-level advisory locks are released at transaction end. They are suitable only for a transactional boundary, not a whole multi-transaction migration release. |
| F-LOCK-003 | **VERIFIED — PROJECT CONFIGURATION** | The repository's `pg` dependency and `pool.connect()` API permit obtaining a client. | This supports, but does not implement or prove, a dedicated-client runner design. |
| F-LOCK-004 | **INFERRED — REQUIRES CONFIRMATION** | Acquiring/releasing a session lock through unrelated pool connections would be unsafe because session-level locks belong to a session. A dedicated `pg` client must retain the session for the entire execution boundary. | Disposable PostgreSQL test required before implementation. |
| F-LOCK-005 | **NOT VERIFIED — CONTROLLED TEST REQUIRED** | The production connection path may use a provider proxy/pooler, connection limit, timeout, or TLS/network behavior affecting session affinity or long-running migration stability. | Test only on an authorized isolated connection path; do not test production in Phase F. |

The PostgreSQL facts support CTX-ARCH-008's dedicated direct session requirement. They do not verify the Railway/external production network path, provider pooler mode, or operational timeout policy.

## 10. Backup, PITR, and restoration findings

| Finding | Status | Observation / limitation |
| --- | --- | --- |
| F-REC-001 | **VERIFIED — PLATFORM DOCUMENTATION** | Railway documents volume backups and Railway PostgreSQL PITR. PITR archives WAL and base backups, and a restore provisions a new sibling PostgreSQL service; the source service is not modified by the restore. |
| F-REC-002 | **VERIFIED — PLATFORM DOCUMENTATION** | PITR starts only after enablement and first base backup; it is not retroactive. Restored services require a manual cutover and do not automatically continue PITR. |
| F-REC-003 | **VERIFIED — PROVIDER CONSOLE OBSERVATION** | Staging contains a Railway PostgreSQL service and persistent volume. | Backup/PITR state, retention, restore range, and usability were not inspected or tested. |
| F-REC-004 | **NOT VERIFIED — OWNER OR PROVIDER CONFIRMATION REQUIRED** | Production's target database is not confirmed to be Railway PostgreSQL. | Railway PITR documentation must not be treated as production recovery evidence. Confirm actual provider, plan, backup ownership, retention, and restore authority. |
| F-REC-005 | **NOT VERIFIED — CONTROLLED TEST REQUIRED** | Actual recoverability, recovery time, restoration workflow, and data/application cutover cannot be proven without a rehearsed restore. | A controlled restore rehearsal in a separately authorized isolated environment is mandatory for destructive/irreversible production adoption. |

**PITR gate:** **DOCUMENTED BUT NOT OPERATIONALLY TESTED** for Railway-hosted PostgreSQL; **UNKNOWN** for the current production database. It is not a go/no-go recovery proof.

## 11. Health and release-sequencing findings

Railway can support parts of the proposed sequence, but current project evidence does not prove end-to-end enforcement.

| CTX-ARCH-008 step | Evidence-supported platform capability | What still requires operator/CI/control |
| --- | --- | --- |
| Fresh preflight | No execution required. | Operator-controlled read-only preflight and redacted release evidence. |
| Approval and PITR evidence | Railway documents PITR for Railway PostgreSQL. | Actual production provider/PITR proof and explicit release approval. |
| Serialized migration execution | PostgreSQL documents advisory locks; Railway pre-deploy is documented. | Runner, dedicated session, lock test, exact executor, retry policy, and approval gate. |
| Catalog verification | No platform substitute. | Authorized database read-only verification through the approved release procedure. |
| Compatible application deployment | GitHub-connected automatic branch deployment is visible. | Explicit compatibility proof and promotion controls. |
| Health validation | Health-check configuration control exists. | Current configured path, timeout, failure behavior, and smoke scope. |
| Smoke, observation, closure | Deployment logs/history are available. | Human/operator control, durable release record, and financial fail-closed evidence. |

An application deployment can be blocked by a failing **pre-deploy command** according to Railway documentation. Whether it can be blocked by a separately executed job/runner is not verified. No evidence establishes automatic application rollback after failed health checks; Railway rollback is an application deployment action and does not roll back database state.

## 12. Logging and audit-evidence findings

- **VERIFIED — PROVIDER CONSOLE OBSERVATION:** service pages expose deployments, metrics, console, and project logs; observed history associates deployments with source/initiator labels and time.
- **VERIFIED — PROJECT CONFIGURATION:** startup code logs selected configuration state, including non-secret presence/host-derived fields. A future migration runner must not reuse patterns that log a connection string or secret.
- **NOT VERIFIED — OWNER OR PROVIDER CONFIRMATION REQUIRED:** log retention, export capability, retention policy, immutable audit events, exit-code preservation, and job-log availability.
- **Decision support:** provider logs can support a release record, but a database migration ledger remains required by CTX-ARCH-008 and CTX-DB-001.

## 13. Staging-parity assessment

**Classification: LOW.** Staging is a different application service with Railway PostgreSQL, a volume, and a bucket, whereas the inspected production environment visibly contains only the application service and a masked database variable. The two services also show distinct invalid-region configurations. Repository source and broad service settings structure are similar, but database-provider/path, variable parity, health settings, branch mapping, credentials, backups, and resource parity are unverified.

Staging may become suitable for a future isolated migration or restore rehearsal only after its region/deployment block, schema/version baseline, variable source, database provider/path, credential model, and parity purpose are explicitly established. This phase did not change or test any of them.

## 14. Controlled-test register

| ID | Question / why read-only evidence is insufficient | Lowest-risk environment and preconditions | Authorization / side effects / cleanup | Evidence / blocking status |
| --- | --- | --- | --- | --- |
| CT-F-001 | Does the intended dedicated `pg` client retain a session-level advisory lock across transactions and reject a concurrent runner? Documentation cannot prove repository wiring or connection path. | Disposable PostgreSQL database using the intended driver/version; no shared data. | Implementation/test authorization; creates and drops disposable test schema only. | Lock acquisition, contention, release-on-close; blocks implementation and production adoption. |
| CT-F-002 | Does the production-equivalent provider path preserve session affinity and avoid proxy/pooler timeout surprises? | Isolated provider database/path, not production. | Provider/owner authorization; no business data. | Connection topology, session ID behavior, timeouts; blocks production adoption. |
| CT-F-003 | Can a pre-deploy command fail closed, avoid unsafe retry, preserve logs/exit status, and be explicitly approved for this project? | Disposable Railway environment/service. | Railway change/deployment authorization; no production variables. Remove test config/service after evidence. | Ordered event/timing/log evidence; blocks ADR selection if pre-deploy remains a candidate. |
| CT-F-004 | Can a separate migration service/job have a distinct credential, manual invocation, redacted logs, one-at-a-time execution, and safe disablement? | Isolated Railway environment and disposable database. | Railway/service/credential authorization; cleanup service/variables. | Service topology, variables, logs, retry/overlap result; blocks ADR selection if selected. |
| CT-F-005 | What happens after a failed transactional and nontransactional migration execution? | Disposable PostgreSQL database with harmless test objects. | Explicit execution authorization; cleanup disposable objects. | Transaction rollback, partial-state evidence, retry stop behavior; blocks implementation and production adoption. |
| CT-F-006 | Is backup/PITR restoration usable and what is the actual recovery workflow/time? | Isolated Railway PostgreSQL service or actual production-provider-approved clone, never source production. | Backup/PITR/restore authorization; restore creates an isolated sibling service; delete it only under separate approval. | Restore range, catalog/data checks, timing, authority, cleanup; blocks destructive production adoption. |
| CT-F-007 | Does a compatible application deployment gate properly after migration success/failure and preserve prior healthy service behavior? | Isolated environment with reversible harmless schema fixture. | Deployment/test authorization; no financial flags/providers. | Deployment/health/rollback evidence; blocks production adoption. |
| CT-F-008 | Are migration credentials least-privilege and distinct from application credentials? | Disposable database roles and isolated application/migration services. | Security/database authorization; create/drop test roles only. | Denied/allowed operation matrix; blocks production adoption. |

## 15. Provider or owner-confirmation requirements

| ID | Required confirmation | Why | Blocking scope |
| --- | --- | --- |
| OC-F-001 | Current production database provider, target identity, support model, backups/PITR ownership, retention, and restore authority. | Production does not visibly include a Railway PostgreSQL service. | ADR recovery decision and production adoption. |
| OC-F-002 | Railway plan/account support and retention for backups/PITR, deployment history, logs, and any selected job/service mechanism. | Documentation is general and provider plans change. | ADR selected mechanism / production adoption. |
| OC-F-003 | Approved migration operator, release authority, financial-control verification owner, and emergency/PITR authority. | Single-operator roles must still be named in the release record. | Implementation and production adoption. |
| OC-F-004 | Intended environment-to-branch mapping and promotion policy. | UI showed automatic connected-branch deployment but not the exact branch mapping. | Production adoption. |

## 16. ADR decision-support matrix

| Architecture decision | What Phase F indicates | Remaining decision evidence |
| --- | --- | --- |
| Runner mechanism | Pre-deploy exists and fails the app deployment if its command fails; manual operator execution remains feasible conceptually. | Controlled tests for retries/overlap/logs/approval and provider confirmation for one-off/job support. |
| Ledger location/ownership | Railway logs are not a durable migration ledger. | ADR and security decision on database-adjacent ledger schema/owner. |
| Advisory-lock model | PostgreSQL semantics support a dedicated session-level lock for the release boundary. | Disposable and provider-path session-affinity tests; lock key/timeouts. |
| Credential separation | Railway supports variable references/service variables generically. | Verify present source/scope, database roles/grants, and separate credential feasibility. |
| Recovery/PITR | Railway documents backup/PITR for Railway PostgreSQL, including sibling restore. | Confirm production provider, enablement, retention, authority, and successful rehearsal. |
| Deployment gate | Automatic GitHub branch deployment is observed; pre-deploy can block deployment per documentation. | Exact branch/health configuration, compatibility gate, rollback behavior, and whether an independently run migration can gate promotion. |

**PROVISIONAL — ADR DECISION REQUIRED:** retain the architecture's operator-controlled, dedicated-session runner direction while comparing pre-deploy, separate-service, and manual execution only after the controlled evidence above exists. Phase F does not select an option.

## 17. Risk changes resulting from verification

| Risk | Change | Reason |
| --- | --- | --- |
| Startup migration concurrency | Reduced confidence in startup as a safe path; architectural prohibition reinforced. | One replica today does not prevent retries, overlap, or future scaling. |
| Railway release-hook uncertainty | Reduced, but unresolved. | Pre-deploy capability and failure gate are documented; project-specific operational behavior remains untested. |
| Staging rehearsal assumption | Increased. | Visible topology and invalid-region differences make parity LOW. |
| Production recovery posture | Increased. | Production database provider/binding/PITR state remain unknown. |
| Advisory-lock feasibility | Reduced at conceptual level only. | PostgreSQL semantics are clear; intended provider path remains untested. |
| Deployment readiness | Increased. | Both inspected application services currently report an invalid region that blocks deployments. |

## 18. Remaining unknowns

1. Exact production branch, deployed commit, health-check path/timeout, and complete deployment settings.
2. `DATABASE_URL` reference/literal source, actual production database provider, target fingerprint, network path, proxy/pooler, version, limits, and timeouts.
3. Database role ownership and least-privilege migration grants.
4. Production backup/PITR enabled state, retention, recovery window, restore authority, and verified recovery time.
5. Railway log/audit retention and exportability.
6. Project-specific one-off job/release-job capability, approval controls, overlap/retry behavior, and persistent-service implications.
7. Exact staging/production configuration parity and a safe rehearsal baseline.
8. Resolution of the currently visible invalid-region deployment blocks.

## 19. Readiness recommendation

**CONDITIONALLY READY FOR ADR.** The record supplies evidence about environment separation, visible topology, deployment controls, official platform capabilities, and PostgreSQL lock semantics sufficient to frame ADR options responsibly. It does not supply enough evidence to select a production runner or authorize implementation.

- **Implementation readiness:** **NOT AUTHORIZED**.
- **Production adoption readiness:** **NOT AUTHORIZED**.

Before an ADR selects a release mechanism, resolve the mechanism's controlled test and owner/provider confirmations. Before production adoption, all blocking controlled tests, credential/PITR evidence, target proof, release evidence, and compatibility gates must be complete under CTX-ARCH-008, CTX-DB-001, CTX-DEP-001, and CTX-OPS-001.

## 20. Evidence register

| ID | Question | Status | Evidence source / date | Environment/service | Exact observation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| F-ENV-001 | Are distinct environments available? | **VERIFIED — PROVIDER CONSOLE OBSERVATION** | Railway console, July 22, 2026 | Project / redacted | `production` and `staging` were listed. | Record exact branch mapping later. |
| F-ENV-002 | What is production topology? | **VERIFIED — PROVIDER CONSOLE OBSERVATION** | Railway Architecture view, July 22, 2026 | Production | One online app service visible. | Confirm external dependencies/provider. |
| F-ENV-003 | What is staging topology? | **VERIFIED — PROVIDER CONSOLE OBSERVATION** | Railway Architecture view, July 22, 2026 | Staging | App, Postgres, volume, bucket visible. | Establish rehearsal baseline/parity. |
| F-ENV-006 | Is deployment configuration currently healthy? | **VERIFIED — PROVIDER CONSOLE OBSERVATION** | Railway service settings, July 22, 2026 | Production and staging app services | Each settings page reported an invalid region blocking deployment. | Correct only under separately authorized configuration work. |
| F-DEP-001 | Does repository build/start run numbered migrations? | **VERIFIED — PROJECT CONFIGURATION** | `package.json`, `server/index.ts`, July 22, 2026 | Repository | Build/start do not invoke numbered SQL. | Reinspect external configuration per release. |
| F-DEP-005 | Does Railway have a deployment-gating pre-deploy command? | **VERIFIED — PLATFORM DOCUMENTATION** | [Railway pre-deploy docs](https://docs.railway.com/deployments/pre-deploy-command), accessed July 22, 2026 | Platform | Command runs between build/deploy; failure prevents deploy. | Controlled test. |
| F-LOCK-001 | Are session locks persistent across transaction boundaries? | **VERIFIED — PLATFORM DOCUMENTATION** | [PostgreSQL advisory-lock docs](https://www.postgresql.org/docs/current/functions-admin.html), accessed July 22, 2026 | PostgreSQL | Session locks release on unlock/session end, not transaction rollback. | Disposable test with intended `pg` client. |
| F-REC-001 | What does Railway PITR do? | **VERIFIED — PLATFORM DOCUMENTATION** | [Railway PITR docs](https://docs.railway.com/volumes/point-in-time-recovery), accessed July 22, 2026 | Railway PostgreSQL | Restore creates new sibling service; source is untouched. | Confirm applicability and rehearse. |
| F-VAR-002 | Are Railway service variable references supported? | **VERIFIED — PLATFORM DOCUMENTATION** | [Railway variable reference docs](https://docs.railway.com/integrations/api/manage-variables), accessed July 22, 2026 | Platform | `${{ServiceName.VARIABLE_NAME}}` syntax is documented. | Confirm actual production source without revealing value. |

## 21. References

- [CTX-ARCH-008 — Production Database Migration Architecture](../CTX-ARCH-008-production-database-migration-architecture.md)
- [CTX-ARCH-008 Architecture Approval Record](../approvals/CTX-ARCH-008-architecture-approval-record.md)
- [Phase B Discovery and Requirements](../production-database-migration-discovery-and-requirements.md)
- [CTX-DB-001 — Database Migration and Schema Governance](../../standards/CTX-DB-001-database-migration-and-schema-governance-standard.md)
- [CTX-DEP-001 — Production Deployment Protocol](../../standards/CTX-DEP-001-production-deployment-protocol.md)
- [CTX-OPS-001 — Production Release Checklist](../../operations/CTX-OPS-001-production-release-checklist.md)
- [Railway: Add a Pre-Deploy Command](https://docs.railway.com/deployments/pre-deploy-command) (accessed July 22, 2026)
- [Railway: Deployment Actions](https://docs.railway.com/deployments/deployment-actions) (accessed July 22, 2026)
- [Railway: Deployment Teardown](https://docs.railway.com/deployments/deployment-teardown) (accessed July 22, 2026)
- [Railway: PostgreSQL](https://docs.railway.com/databases/postgresql) and [Point-in-Time Recovery](https://docs.railway.com/volumes/point-in-time-recovery) (accessed July 22, 2026)
- [Railway: Variable References](https://docs.railway.com/integrations/api/manage-variables) (accessed July 22, 2026)
- [PostgreSQL: Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html) and [Advisory Lock Functions](https://www.postgresql.org/docs/current/functions-admin.html) (accessed July 22, 2026)

## 22. Safety boundary

This verification record is evidence only. It does not create an ADR, authorize implementation, select a final runner, authorize production adoption, or modify the current **CONDITIONALLY APPROVED — NOT AUTHORIZED FOR IMPLEMENTATION** status of CTX-ARCH-008.
