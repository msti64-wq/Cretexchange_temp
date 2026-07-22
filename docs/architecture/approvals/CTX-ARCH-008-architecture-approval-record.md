# CTX-ARCH-008 Architecture Approval Record

- **Record ID:** CTX-ARCH-008-AR-2026-07-22
- **Related architecture:** [CTX-ARCH-008 — Production Database Migration Architecture](../CTX-ARCH-008-production-database-migration-architecture.md)
- **Related discovery:** [Phase B Discovery and Requirements](../production-database-migration-discovery-and-requirements.md)
- **Approval status:** **CONDITIONALLY APPROVED — ARCHITECTURAL DIRECTION**
- **Approval date:** July 22, 2026
- **Architecture version / commit:** Version 0.1 as reviewed and refined at `f44da63247ed1c023eb697b1ffdb4e3039fdf63e`
- **Repository / branch:** `cretexchange-phasea-clean` / `feature/cutoff-and-rewards-controls`
- **Architecture review:** Phase D, commit `f44da63247ed1c023eb697b1ffdb4e3039fdf63e`; outcome: **APPROVE WITH MAJOR CHANGES**
- **Architecture owner:** Michael Loren Stiger
- **Business owner / approver:** Michael Loren Stiger
- **Operating model:** Single-Operator Startup; the owner, business owner, and approver roles are explicitly held by one individual.
- **Implementation authorization:** **Not authorized**
- **Production authorization:** **Not authorized**
- **Future ADR status:** Required before implementation; title proposed as *Production Database Migration Execution Architecture*. ADR numbering remains unresolved.

## 1. Approval statement

CTX-ARCH-008 is conditionally approved as the governing architectural direction for the CreteXchange production database migration capability. This approval accepts its core principles, logical component model, safety boundaries, migration lifecycle, reconciliation model, deployment sequencing, financial controls, recovery posture, and staged implementation approach.

This approval does **not** authorize implementation, deployment, production adoption, database modification, migration execution, or an ADR decision. It authorizes architecture decision-making and separately authorized external platform verification only.

## 2. Approved architectural principles

The following direction is accepted:

- Migrations do not run during normal application startup.
- Production migration activity fails closed.
- Migrations are repository-controlled and checksum-verified; accepted historical files are immutable.
- Migration execution is distinct from application deployment and serialized to one logical runner.
- The runner holds its advisory lock through a dedicated direct database session.
- Expand-and-contract is the default compatibility model.
- Application rollback does not imply database rollback; forward remediation is preferred where reversal is unsafe.
- Legacy history is reconciled from evidence; uncertain migrations are not silently marked applied.
- Financial execution remains independently controlled and fail closed.
- Production evidence and release records are retained.
- Railway behavior remains unverified until separately confirmed.

## 3. Review disposition and accepted findings

The Phase D review found no critical findings and no redesign-level defect. It judged the architecture technically sound as a draft foundation. The review corrected three material ambiguities:

1. Nontransactional work has at-most-one serialized execution attempt plus explicit recovery; it does not claim universal exactly-once execution.
2. Advisory locking is held by a dedicated direct database session, not a general application pool connection.
3. Ledger bootstrap and dual non-secret target proof are explicit prerequisites rather than implied implementation details.

The review’s **APPROVE WITH MAJOR CHANGES** outcome means that major decisions and external verification remain before implementation. It is not a rejection of the architectural direction.

## 4. Accepted strengths

- Alignment with database, deployment, operations, and financial governance standards.
- Separation of migration, deployment, recovery, and financial execution boundaries.
- Explicit protection against rerunning migration `0028`.
- Evidence-based legacy reconciliation and honest transactional/nontransactional semantics.
- Defined stop conditions, auditable release evidence, and clear fact/assumption/unknown boundaries.

## 5. Conditions before implementation authorization

Implementation remains blocked until all applicable conditions below are approved, verified, or formally deferred in a subsequent implementation-readiness record.

| Condition | Destination | Status |
| --- | --- | --- |
| Supporting ADR and ADR numbering convention | ADR / governance approval | Required |
| Ledger schema/table ownership and bootstrap artifact | ADR / owner approval | Required |
| Initial legacy-reconciliation scope and evidence standard | ADR / governance approval | Required |
| Manifest format and checksum workflow | ADR / implementation design | Required |
| Runner location, execution model, and direct SQL versus Drizzle choice | ADR | Required |
| Credential-separation approach | ADR / security approval | Required |
| Production-target proof and lock namespace/timeout policy | ADR / implementation design | Required |
| Emergency migration authority and operations ownership | Operations procedure / owner approval | Required |
| Railway release-job/controlled-execution options, deployment/rollback, topology/restarts, health behavior, and environment mapping | External platform verification | Not verified |
| Database credential/grant behavior, backup/PITR evidence, restore process, and staging parity | External platform verification | Not verified |
| Final implementation-readiness review and explicit scoped authorization | Governance approval | Required |

## 6. Authorized next work

This record authorizes only:

- creation and review of the supporting ADR;
- resolution of the ADR numbering convention;
- separately authorized Railway/platform verification;
- implementation-planning documentation;
- refinement of CTX-ARCH-008 based on approved decisions; and
- preparation of the Operations Library roadmap, without implementation unless separately authorized.

## 7. Work not authorized

This record does not authorize creating the ledger, executing a ledger bootstrap, historical production reconciliation, building or running a runner, changing migration files, changing application code/dependencies/CI/Railway configuration, connecting to staging or production, DDL/DML, any migration including `0028`, deployment, financial execution, synthetic production financial data, or production adoption.

## 8. External verification register

Each item is **NOT VERIFIED — SEPARATE AUTHORIZATION REQUIRED**:

- Railway release-hook and one-off/controlled-execution support;
- deployment sequencing, failed-deployment behavior, application rollback, and health-check behavior;
- service topology, replicas/scaling, and restart behavior;
- environment-to-branch mapping and database credential sources;
- runtime/migration grant feasibility and advisory-lock behavior on the intended connection path;
- backup/PITR status, evidence, and restore process; and
- staging parity.

## 9. Decision register summary

| Decision | Expected destination |
| --- | --- |
| Ledger schema/table and bootstrap artifact | ADR and owner approval |
| Manifest/checksum workflow | ADR and implementation design |
| Runner execution location and SQL execution API | ADR |
| Credential separation and production-target proof | ADR and security approval |
| Lock namespace/timeouts | Implementation design under ADR limits |
| Railway execution mechanism | External verification then ADR/operations procedure |
| Emergency process and operational ownership | Operations procedure and owner approval |
| ADR numbering convention | Governance approval |

## 10. Future authorization gates

### Implementation gate

Implementation may begin only when a subsequent explicit record confirms that the conditions above are satisfied or formally deferred, the ADR is approved, blocking external verification is complete, CTX-ARCH-008 metadata is updated as appropriate, and the implementation scope, stage, branch, and change controls are authorized. This record does not satisfy that gate.

### Production-adoption gate

Production adoption requires implementation completion, code review, automated tests, staging rehearsal, legacy-reconciliation approval, ledger-bootstrap approval, PITR verification, production preflight, an authorized release record, observation, and closure. Architecture approval alone is never production authorization.

## 11. Approval limitations and change control

This record is based on repository evidence, Phase B discovery, Phase C drafting, Phase D review, and completed 0027/0029 release evidence. It does not certify unverified Railway or production-console facts.

Substantive changes to accepted architecture direction require review. Accepted-decision changes may require an ADR update or a new ADR. Permitted implementation details may be delegated only within approved architecture boundaries. Emergency exceptions require documented scope, risk acceptance, expiry, and follow-up review. This record remains linked to the architecture version/commit it approved.

## 12. Sign-off

| Approver | Role | Decision | Date | Conditions acknowledged |
| --- | --- | --- | --- | --- |
| Michael Loren Stiger | Architecture Owner, Business Owner, Approver | Conditionally approve architectural direction only | July 22, 2026 | Yes — implementation and production adoption remain blocked |
