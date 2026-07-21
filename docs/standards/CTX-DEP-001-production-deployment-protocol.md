# CTX-DEP-001 - Production Deployment Protocol

- **Document ID:** CTX-DEP-001
- **Version:** 1.0
- **Status:** Approved
- **Owner:** V8 Laboratories
- **Product:** CreteXchange
- **Effective Date:** July 2026

## Purpose

This document defines the mandatory protocol for every CreteXchange production deployment. It establishes the release controls required to preserve operational truth, financial safety, security, and a verifiable production state.

## Scope

This protocol applies to every production release, including application changes, configuration changes, schema migrations, dependency changes, emergency fixes, and manual deployment actions. It applies whether a release is initiated through Git, Railway, or another approved production mechanism.

## Governance

This protocol operates under [CTX-STD-001 - CreteXchange Platform Standards](./cretexchange-platform-standards.md), the [Development Protocol](../development-protocol.md), applicable CTX-ARCH documents, Product Decisions, and approved runbooks. It does not authorize a change that those governing documents prohibit.

The release operator SHALL use [CTX-OPS-001 - Production Release Checklist](../operations/CTX-OPS-001-production-release-checklist.md) to record completion of this protocol. Where a release affects financial processing, the operator MUST also apply the operational-before-financial boundaries in [PD-051](../product/PD-051-driver-activity-and-payment-lifecycle.md) and the applicable canonical financial architecture, including [CTX-ARCH-007](../architecture/CTX-ARCH-007-canonical-financial-batch-architecture.md) where batch behavior is in scope.

## Source of Truth Verification

Before a release, the operator MUST identify the governing architecture, Product Decisions, standards, implementation source of truth, and approved release scope. The release SHALL not introduce an alternate calculation, lifecycle, authorization rule, or operational workflow that contradicts those authorities.

## Repository / Branch / Commit Verification

Before deployment, the operator MUST verify and record:

- the repository and remote that power the production service;
- the production deployment branch;
- the exact commit SHA to be deployed;
- the current production commit SHA;
- whether the promotion is a fast-forward or a reviewed merge; and
- that no unreviewed working-tree changes are included.

The deployment target MUST be verified from the production service configuration. A branch name alone SHALL NOT be treated as proof of the production source.

## Migration Discovery (Mandatory)

Before every production deployment, the operator MUST discover all migrations introduced between the current production commit and the release commit. Discovery MUST include migrations that are not invoked automatically by application startup.

For each discovered migration, the operator SHALL record its identifier, checksum, purpose, execution method, prerequisites, rollback or recovery posture, and post-execution verification. A release MAY NOT represent a migration as applied merely because the application build or container deployment succeeded.

## Migration Execution

Migrations MUST be executed only with explicit release authorization and only against the intended production database. The operator SHALL use the approved execution method, capture the result, and stop on an unexpected precondition, duplicate condition, checksum mismatch, or database error.

No migration that can affect financial obligations, balances, payments, settlement, or historical records may be executed without its required architecture, Product Decision, and release-specific safeguards.

## Schema Verification

After each approved migration, the operator MUST verify the expected production schema state using the least-privileged method appropriate to the release. Verification SHALL confirm the required tables, columns, constraints, indexes, and migration state without exposing sensitive row-level data unnecessarily.

## Environment Verification

Before deployment, the operator MUST verify the exact production project, environment, service, domain, database binding, region, build command, start command, and any pre-deploy or release command.

Secrets SHALL NOT be printed, logged, or copied into release records. The operator MUST verify variable names, sources, references, and safe normalized states without disclosing secret values. Production financial execution controls MUST default to fail closed unless a separately authorized release explicitly enables them.

## Build Validation

The release commit MUST pass the validation level required by the Development Protocol and the governed change. At minimum, the operator SHALL record the applicable focused tests, type check, build result, and whitespace or diff validation. A failed required validation blocks production release unless an approved incident procedure expressly records the exception.

## Application Startup

After deployment, the application MUST start successfully using the intended production configuration. The operator SHALL inspect sanitized startup evidence for configuration failures, unexpected migration execution, and unauthorized provider initialization.

## Health Verification

The operator MUST verify the production health endpoint or approved equivalent and confirm database connectivity where applicable. A successful deployment status alone SHALL NOT satisfy health verification.

## Production Smoke Tests

The release operator SHALL run the smallest non-destructive smoke tests that cover the released surface and the applicable role boundaries. For a release affecting operational workflows, smoke tests MUST cover the relevant Driver, Facility Owner, and Admin paths. For a release affecting financial operations, smoke tests MUST confirm the canonical financial workspace and its execution controls without creating an unauthorized payment, transfer, wallet action, settlement, or provider operation.

## Financial Safety Controls

Operational verification and financial processing MUST remain independent. A production release SHALL NOT enable direct provider execution, payment, transfer, payout, wallet mutation, settlement, reconciliation, or scheduler behavior unless that action is separately authorized by the governing financial architecture, Product Decisions, and release record.

The operator MUST confirm that historical, draft, review, approval, scheduled, paid, and settled states are not conflated in the deployed user interface or release evidence.

## Deployment Report Requirements

Each production release MUST have a durable release record containing:

- release date, operator, project, environment, service, and deployment identifier;
- repository, branch, prior production commit, and deployed commit SHA;
- migration discovery, execution, schema-verification, and checksum results;
- environment and financial-control verification without secret values;
- validation, build, startup, health, and smoke-test results;
- known limitations, incidents, exceptions, and rollback information; and
- final production sign-off.

## Rollback Requirements

Before release, the operator MUST identify the rollback method, decision owner, and conditions that require rollback. Rollback SHALL preserve data integrity and must not apply an unreviewed destructive schema reversal. When a migration cannot be safely reversed, the release record MUST identify the recovery procedure and the point at which release escalation is required.

## Completion Criteria

A production deployment is **not complete** until:

- pending migrations have been applied;
- schema verification succeeds;
- the application is healthy; and
- smoke tests pass.

Until every applicable criterion is documented in CTX-OPS-001, the release remains in progress and SHALL NOT be represented as production complete.
