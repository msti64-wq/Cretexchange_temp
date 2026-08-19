# CTX-DB-001 — Database Migration and Schema Governance Standard

- **Document ID:** CTX-DB-001
- **Version:** 1.0
- **Status:** Approved
- **Owner:** V8 Industries LLC
- **Product:** CreteXchange
- **Effective Date:** July 2026

## Purpose

This standard governs every CreteXchange schema change and migration release. It prevents application/schema drift, preserves operational truth, and requires an auditable production record without authorizing a particular migration tool or automation mechanism.

## Scope

This standard applies equally to manually executed and automated migrations, database repair, ledger adoption, backfills, indexes, constraints, schema rollback, and forward repair in every environment. It does not authorize a production migration, provider call, financial execution, or deployment by itself.

## Authority and precedence

CTX-STD-001 establishes platform-wide engineering requirements. This standard governs database schema and migration controls. CTX-DEP-001 governs deployment, and CTX-OPS-001 governs the operational release record. Applicable CTX-ARCH documents and Product Decisions remain authoritative for domain behavior; in particular, [CTX-ARCH-007](../architecture/CTX-ARCH-007-canonical-financial-batch-architecture.md) and [PD-051](../product/PD-051-driver-activity-and-payment-lifecycle.md) govern financial boundaries.

## Roles and terminology

- **Migration author**: documents the migration’s purpose, dependencies, compatibility, locking, idempotency, and recovery posture before release.
- **Release operator**: performs only authorized preflight or execution steps, records sanitized evidence, and stops on any failed condition.
- **Release approver**: authorizes the exact production scope after reviewing the release package and preflight; approval is not transferable to another migration or environment.
- **Migration**: one immutable, numbered repository artifact that changes schema or data under an approved release plan.
- **Ledger**: the durable record of actual migration execution; it is not inferred from filenames or deployment history.
- **Preflight**: fresh, read-only validation of the intended target immediately before execution.
- **Executor**: the approved operator or approved automation identity that runs one migration.
- **Release approver**: the person authorized to allow the specific production DDL operation.
- **Schema drift**: any difference between required repository schema and actual catalog state.

## Source-of-truth and compatibility rules

1. Repository migration order is authoritative unless an explicitly reviewed release plan documents why an already-applied migration is skipped.
2. Application code MUST NOT be deployed to an environment before every schema change it requires is present and verified.
3. Application startup MUST NOT perform uncontrolled schema migration. Production migrations MUST run separately from ordinary application startup.
4. Railway auto-deployment is not evidence that a database migration ran.
5. Empty-state presentation MUST NOT conceal a missing required schema object. A runtime `500` or `503` caused by absent schema is a release defect, not an expected operating state.
6. Applied migration files are immutable. A correction requires a new migration; an already-applied file MUST NOT be edited.

## Migration creation and ordering

Migration filenames MUST use the ordered repository convention (`NNNN_descriptive_name.sql`), describe their effect, declare dependencies and transactional requirements in comments, and identify whether they are additive, destructive, backfilling, concurrent, or non-transactional. A migration release MUST include the repository commit SHA and SHA-256 for each file.

Migration authors SHALL prefer expand-and-contract evolution: add compatible schema, deploy compatible application behavior, migrate/backfill under approval, verify, then separately retire obsolete structures. Existing application and schema compatibility before and after the change MUST be documented.

## Schema safety controls

Additive changes are preferred. Destructive operations, including data deletion, column removal, type narrowing, global-index retirement, and irreversible transformation, require heightened approval, a documented recovery posture, and a forward-repair plan.

Backfills require scoped row-count evidence, idempotency behavior, data-integrity checks, and expected duration. Foreign keys, defaults, nullability, checks, and unique constraints MUST be validated against existing data. Indexes SHALL be created concurrently where PostgreSQL supports it and the approved plan requires availability; commands that require autocommit MUST be explicitly marked.

Every migration MUST state its idempotency expectation. A partially existing object, unexpected constraint, checksum mismatch, unknown dependency, or unexpected row count is a stop condition, not a reason to retry blindly.

## Migration ledger and evidence

Every production migration MUST have a durable record containing at least the migration identifier, filename, repository commit SHA, immutable file checksum, environment, execution start and finish times, executor/automation identity, outcome, error status, approval reference, and verification evidence.

Ledger adoption for an existing database is a controlled reconciliation activity. A ledger MUST NOT be fabricated from numbering assumptions. Missing ledger entries with present catalog objects are reconciled historical state only after object-by-object catalog verification and explicit approval; they are never silently treated as normal automated application.

## Promotion, preflight, and execution

Each environment promotion requires a fresh schema preflight immediately before production execution. The preflight MUST check ledger state, object existence and definitions, dependencies, partial objects, table size, lock and timeout posture, foreign-key/orphan risk, and application compatibility.

Approval to perform a preflight is not approval to execute DDL. Production execution requires separate explicit authorization, a documented window where appropriate, one migration at a time, sanitized command evidence, and post-migration catalog, health, and focused-route verification.

Migration failure MUST prevent release of incompatible application code. If an application deploy precedes required schema and fails, the condition is a release incident and requires controlled repair under this standard.

## Financial and provider safety

Financial migrations preserve fail-closed execution controls. They MUST NOT enable a provider, issue rewards, move funds, charge Facilities, settle Drivers, mutate wallets, or invoke a scheduler unless separately authorized by the applicable architecture, Product Decision, and release record.

## Rollback, repair, and emergency changes

Release records MUST distinguish application rollback, schema rollback, forward repair, and data restoration. Schema rollback MUST NOT be promised where it is irreversible or would destroy valid production data. In that case, the approved recovery is a forward repair.

Emergency migrations remain subject to a documented minimum preflight, explicit authorization, command evidence, catalog verification, and post-release review. No emergency bypass permits secret disclosure, uncontrolled startup migration, or unapproved financial execution.

## Drift detection, audit, and retention

Post-migration verification MUST compare actual tables, columns, indexes, constraints, defaults, nullability, and relevant data/backfill evidence to the approved migration package. Release records, catalog evidence, checksums, and approvals are retained according to the project operational-retention policy and must remain available for audit.

## Compliance requirements

Every production release that changes or depends on schema MUST comply with this standard, CTX-DEP-001, and CTX-OPS-001. A release without a verified migration record, catalog evidence, application health result, and focused smoke evidence is incomplete. Repeated or material noncompliance requires incident review and corrective governance work before a subsequent affected release.

## Prohibited practices and exceptions

The following are prohibited: broad “run all migrations” repair commands without approval; rerunning known applied migrations to restore sequence appearance; manually marking a migration applied without proving every expected effect; altering applied files; treating deployment success as migration success; and continuing after an unexpected database error.

An exception requires written scope, risk acceptance, approval identity, compensating controls, expiry, and a follow-up architecture decision. It cannot override financial fail-closed controls.

## Document governance

This standard changes only through a reviewed documentation change consistent with the documentation hierarchy. The unresolved selection of a migration runner, ledger schema, release mechanism, approval integration, secret handling, and backup/PITR evidence requires a future architecture decision record: **proposed CTX-ADR — Production Database Migration Execution Architecture**.

## Revision history

| Version | Date | Change |
| --- | --- | --- |
| 1.0 | July 2026 | Initial migration and schema governance standard following production schema-drift audit. |
