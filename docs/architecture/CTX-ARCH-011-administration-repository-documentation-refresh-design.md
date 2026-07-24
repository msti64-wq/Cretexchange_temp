# CTX-ARCH-011 — Administration Repository Documentation Refresh Design

- **Document ID:** CTX-ARCH-011
- **Version:** 0.2
- **Status:** Draft — Not Yet Approved for Implementation
- **Owner:** Documentation and Operations Governance
- **Product:** CreteXchange
- **Effective Date:** Not applicable until approved
- **Classification:** Internal
- **Review Frequency:** Event-driven after a material Administration Repository, source-integrity, authorization, or publication-lifecycle change.
- **Approval Authority:** Michael Loren Stiger, CreteXchange Project Owner — approval pending
- **Last Reviewed:** July 23, 2026 — implementation-status reconciliation
- **Next Review:** Event-driven after architecture approval, a material refresh-control change, or release-readiness review

## 1. Purpose and Status

This design defines the controlled capability behind an Administration Repository action labelled **Refresh Documentation Library**. It preserves Git as the authoritative source and describes the Version 1 implementation boundary for refresh of derived repository metadata, inventory, relationships, search visibility, and lifecycle evidence.

This design does not itself authorize production adoption, deployment change, document editing, publication approval, scheduled synchronization, Git mutation, or any financial action. The protected refresh API, management UI, synchronization engine, audit logging, concurrency protection, and query invalidation are implemented in the repository; their environment-specific use remains separately authorized.

## 2. Problem Statement and Verified Current State

New governed Markdown files do not automatically appear in the Operations Library because the current application reads a persisted derived inventory, while source discovery and persistence run only through the manually invoked `admin-repository:sync` script. That script scans the documentation files available to the running service, validates them, and persists results only after explicit target and source-commit guards succeed.

The running service does not synchronize at build, startup, or deployment. It now exposes an authorized manual refresh API and management UI; search still begins with persisted inventory, so a document cannot become a search result until a separately authorized refresh completes. The design preserves that explicit freshness boundary without making the database authoritative for document content.

## 3. Scope and Exclusions

### In scope after approval

- discover eligible new or changed governed documents from the immutable source available to the deployed service;
- validate identity, lifecycle, classification, metadata, paths, checksums, links, and relationships;
- reconcile derived inventory, source versions, category navigation, relationships, and search visibility;
- disclose outcomes, source commit, validation failures, freshness, and audit evidence to authorized users; and
- support a safe, explicit administrator-initiated refresh request.

### Out of scope

- document authoring, editing, upload, publishing approval, or Git history rewrite;
- a CMS, public library, arbitrary Git-host access, AI retrieval, or document-body persistence as an authoritative copy;
- bypassing source-integrity, authentication, authorization, classification, production, or financial controls; and
- automatic deployment, migration, or financial execution.

## 4. Architectural Principles

1. **Git remains authoritative.** Refresh creates only derived, checksum-verifiable operational metadata.
2. **Immutable deployed source only.** A refresh may use only the source commit available to the running service and must record that immutable commit identity.
3. **Validate before publish.** No partial or invalid candidate set may replace a last known good derived set.
4. **Fail closed.** Integrity, authorization, classification, lifecycle, path, relationship, or source-commit uncertainty blocks the affected refresh.
5. **Read-only library.** Refresh does not create document-editing or metadata-mutation capabilities for users.
6. **Explicit authority and auditability.** An authorized request, actor, target, source commit, result, and material reconciliation outcome must be attributable.
7. **Least privilege.** The job receives only the private service filesystem and database access already needed for controlled synchronization; it must not require broad Git credentials or public database access.

## 5. Proposed User Experience

The Administration Repository home would show a single primary administrative action: **Refresh Documentation Library**. The normal library remains read-only.

Before execution, the user must see a clear confirmation containing the immutable source commit, environment, last successful refresh, and statement that refresh rebuilds derived inventory only. The result view must distinguish completed, completed with safe no-op, blocked by validation, failed before persistence, and failed after a recoverable job error. It must show counts for discovered, added, changed, moved, withdrawn, unchanged, relationships rebuilt, validation failures, and the retained last known good set.

The present code has an Admin-gated refresh endpoint, confirmation UI, shared CLI/API production authorization, PostgreSQL advisory-lock serialization, and audit logging. The production authorization is configuration-controlled: it requires matching explicit `production` target and Railway environment identities, a valid immutable deployed-source commit, and a separate authorization value exactly equal to that commit. The user interface never accepts or displays that authorization value.

## 6. Controlled Refresh Lifecycle

1. Confirm the feature is enabled and the requester has the approved refresh authority.
2. Bind the request to the target environment and immutable deployed source commit; reject a branch name or mutable reference as identity.
3. Acquire a single-refresh lock and capture a pre-refresh audit record.
4. Discover only allowlisted governed paths from the deployed source.
5. Parse and validate the complete candidate set before any derived inventory is made current.
6. Build a reconciliation plan: new, unchanged, changed, moved/renamed, withdrawn/removed, lifecycle/classification changes, and relationship changes.
7. Persist a new verified derived inventory generation atomically, or retain the last known good generation with an explicit stale/blocked outcome.
8. Refresh server-side search/relationship/category derivations and invalidate only the affected application read caches.
9. Record an immutable result, per-document outcome, and audit evidence. Return a read-only summary to the user.

This is a controlled lifecycle model, not an implementation procedure or authorization to perform it.

## 7. Required Reconciliation Semantics

| Change | Required future behavior | Current limitation |
| --- | --- | --- |
| New document | Validate, create derived inventory and immutable source version, then expose through normal authorized navigation. | Supported only after manual synchronization. |
| Changed document | Create a new source-version record for the immutable commit; retain prior provenance. | Current persistence supports a new source version per new commit. |
| Move or rename | Preserve stable identifier and history after a validated source-path transition. | Current persistence stops on an identifier/path conflict. |
| Removed document | Preserve historical/audit evidence and withdraw or mark stale under approved lifecycle rules; never silently delete. | Current persistence does not reconcile absences. |
| Relationship change | Rebuild the affected relationship set after full validation; remove obsolete derived edges only with audit evidence. | Current persistence adds with conflict-ignore and can leave stale edges. |
| Category/type change | Derive category from an approved family/type model and refresh navigation and filters. | Current type derivation recognizes only a limited identifier/path set. |

## 8. Validation, Integrity, and Inventory-Generation Boundaries

The refresh design must validate unique identifiers, allowlisted paths, metadata conflicts, lifecycle state, classification vocabulary, checksum consistency, declared relationship targets, supported document families, and internal links before an updated set is exposed.

The current parser recognizes `Document ID` metadata for discovery but uses limited patterns for heading identity and relationship extraction. CTX-GOV, CTX-POL, CTX-RB, CTX-UX, and other valid families therefore require an approved parser/relationship-model expansion before a refresh can claim complete cross-document relationship coverage.

The derived inventory must never become the source of truth. A document-level `publication_state` remains source-declared lifecycle metadata; `repository_only` does not mean an inventory generation failed or is invisible. A successful refresh creates a verified derived inventory generation and manifest for the internal Administration Repository, represented by `inventoryStatus: synchronized`. It does not publish a new authoritative document set or change a document’s source lifecycle. A failed validation or persistence attempt creates no new generation and leaves the prior synchronized inventory usable; a successfully reconciled absence marks the previously derived record withdrawn while preserving its historical/audit evidence. The refresh result retains source path, immutable commit, checksum, validation state, lifecycle disclosure, and generation/rollback provenance. A checksum mismatch between a record and the service source must withhold that content rather than render it as current.

## 9. Execution Location and Dependencies

| Concern | Current verified state | Design requirement |
| --- | --- | --- |
| Source access | Synchronizer reads the service’s deployed local documentation files. | Refresh must bind to the deployed immutable source; remote Git retrieval is not required or authorized by this design. |
| Database | Synchronization persists derived metadata in Administration Repository tables. | Refresh requires a controlled transactional persistence path and no public database exposure. |
| Search | Current search starts from persisted inventory and reads verified source bodies for those records. | Refresh must make a completed inventory update visible to search and invalidate relevant read caches. |
| Relationship/category navigation | Derived from parser output and persisted records. | Refresh must rebuild validated relationships/categories, including controlled stale-edge removal. |
| Restart | No current evidence requires a restart after the derived database state changes. | Do not require a restart unless a future implementation introduces a justified cache dependency. |
| Deployment | No current automatic synchronization hook exists. | Refresh must not silently run on every deployment unless separately designed and approved. |

## 10. Security, Authorization, and Operational Controls

- Preserve existing feature-gate default-closed behavior.
- Require authenticated, server-enforced authorization before any refresh request is accepted.
- Require a separate explicit production confirmation/authorization bound to the immutable deployed commit and production target; do not treat an Admin role alone as production refresh authority. The CLI and HTTP route SHALL invoke the same guard and return stable, non-secret denial codes when it fails.
- Use a PostgreSQL session advisory lock as the authoritative single-job lock across replicas. A rejected contender receives `synchronization_in_progress`; explicit release occurs on success or failure, and PostgreSQL releases a lost session’s lock.
- Record requested, authorization-denied, lock-acquired, lock-rejected, completed, and failed refresh events with actor, normalized environment class, source commit identifier where available, timing, counts, and stable reason codes. Never record raw authorization values, connection strings, or document bodies.
- Do not expose document metadata, validation outcomes, relationship targets, or source paths to unauthenticated users.
- Do not allow refresh to change feature flags, financial controls, application configuration, source files, Git history, or document content.
- Retain last known good derived visibility with an explicit stale/blocked disclosure when an update cannot validate safely.

## 11. Testing and Acceptance Criteria

The implementation and future changes must prove, at minimum:

- authorization denial, anonymous denial, feature-gate denial, and production-confirmation denial;
- discovery of a newly added valid document at the immutable deployed commit;
- changed-document source-version preservation and idempotent repeat refresh;
- safe handling of valid move, withdrawn source, malformed metadata, duplicate identity, unsafe path, bad link, invalid lifecycle, checksum mismatch, and invalid relationship;
- atomicity or last-known-good retention under a failed refresh;
- category, relationship, search, previous/next navigation, viewer, print, and export behavior after a successful refresh;
- no editing controls, no public exposure, no Git mutation, no financial action, and no unrelated configuration change; and
- complete audit evidence and observable user outcome.

## 12. Remaining Decisions and Implementation Gates

The Version 1 refresh control resolves shared production authorization, lock ownership, source-commit binding, and last-known-good retention. Move/rename policy, full link-validation scope, metadata-normalization rollout, retention policy, cache invalidation strategy, scheduled/deployment-triggered refresh, and a formally approved rollback-selection procedure remain deferred. Production adoption still requires its own controlled release authorization.

Implementation requires a reviewed architecture decision, a narrow authorization/security review, operational ownership, migration/data-lifecycle review for derived-state reconciliation, focused tests, and release governance. Production adoption requires its own controlled release authorization.

## 13. Engineering Completion and Production Validation Gate

The Version 1 implementation and Production Hardening Sprint are **Engineering Complete**: approved implementation scope, shared CLI/API authorization, PostgreSQL advisory-lock design, derived inventory-generation semantics, repository-local focused tests, type checking, build validation, and documentation are complete. The focused repository-local result is 19 passed, 0 failed, and 1 skipped test.

The skipped test and remaining real HTTP/persistence coverage require an isolated PostgreSQL validation environment that is not currently available. The resulting status is **Validation Pending — External Environment Required**. This is a deferred production release gate, not an implementation failure or a prohibition on other approved CreteXchange development.

Before Administration Repository production deployment is approved, [AR-RG-001 — Administration Repository External Validation Gate](../project/sprint-roadmap.md#ar-rg-001--administration-repository-external-validation-gate) requires real PostgreSQL advisory-lock/session-loss execution, real HTTP authorization-route integration, transactional rollback and stale-inventory preservation evidence, and isolated-database end-to-end refresh/idempotency evidence. No production deployment approval is implied by Engineering Complete status.

## 14. Related Documents and Change History

- [CTX-GOV-001](../standards/CTX-GOV-001-documentation-governance-standard.md)
- [CTX-GOV-002](../standards/CTX-GOV-002-documentation-program-health-assessment.md)
- [CTX-STD-002](../standards/CTX-STD-002-documentation-governance-metadata-lifecycle-authority-and-relationships.md)
- [CTX-ARCH-009](./CTX-ARCH-009-operations-library-and-knowledge-management-architecture.md)
- [CTX-ARCH-010](./CTX-ARCH-010-administration-repository-architecture.md)
- [CTX-OPS-002](../operations/CTX-OPS-002-administration-operations-guide.md)

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | July 2026 | Initial refresh-capability design; implementation and production adoption remain unauthorized. |
| 0.2 | July 2026 | Reconciled implemented shared production guard, advisory locking, derived inventory-generation semantics, and audit/failure behavior. |
| 0.3 | July 2026 | Recorded Engineering Complete status and the deferred isolated-environment production validation gate. |
