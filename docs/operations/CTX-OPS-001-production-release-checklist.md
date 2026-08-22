# CTX-OPS-001 - Production Release Checklist

- **Document ID:** CTX-OPS-001
- **Version:** 1.1
- **Status:** Approved
- **Owner:** V8 Industries LLC
- **Product:** CreteXchange
- **Effective Date:** August 2026

## Purpose

This checklist is the required operational release record for every CreteXchange production deployment. It implements [CTX-DEP-001 - Production Deployment Protocol](../standards/CTX-DEP-001-production-deployment-protocol.md) without replacing the governing standards, architecture, Product Decisions, or approved runbooks.

## Use

Complete every applicable item during the release. Record evidence by link, sanitized command result, deployment identifier, or concise result. Do not record credentials, connection strings, tokens, or other secret values.

## Release Identification

- [ ] Release date and time recorded.
- [ ] Release operator and approver recorded.
- [ ] Railway project, production environment, service, and production domain recorded.
- [ ] Release scope and governing documents recorded.

## Git Verification

- [ ] Intended repository remote verified.
- [ ] Current production branch verified from the production service configuration.
- [ ] Release branch verified.
- [ ] Previous production commit SHA recorded.
- [ ] Intended release commit SHA recorded.
- [ ] Promotion method recorded: fast-forward or reviewed merge.
- [ ] Working tree and staged scope reviewed; no unreviewed files included.

## Repository Verification

- [ ] Repository identity matches the production service source.
- [ ] Required release artifacts and documentation are present at the release commit.
- [ ] No generated files, credentials, logs, exports, or unrelated artifacts are included.

## Branch Verification

- [ ] Deployment branch is explicitly identified.
- [ ] Branch contains the approved release commit.
- [ ] No history rewrite or force-push is required.

## Commit SHA Recording

- [ ] Prior production commit SHA is recorded.
- [ ] Deployed commit SHA is recorded.
- [ ] Deployed commit SHA matches the source branch and Railway deployment evidence.

## Migration Discovery

- [ ] All migrations introduced since the prior production commit are enumerated.
- [ ] Each migration identifier, checksum, purpose, prerequisite, and execution method is recorded.
- [ ] Automatic startup, pre-deploy, release, and deployment migration commands are inspected.
- [ ] Any migration not authorized for this release is identified and remains unapplied.

## Migration Execution

- [ ] Each authorized migration has explicit production approval.
- [ ] Migrations run only against the intended production database.
- [ ] Execution result and any required read-only preflight are recorded.
- [ ] Unexpected preconditions, duplicate conditions, or errors caused a stop and escalation.

## Schema Validation

- [ ] Expected tables, columns, constraints, indexes, and migration state are verified.
- [ ] Verification uses only the minimum necessary metadata or aggregate evidence.
- [ ] No row-level sensitive data is included in the release record.

## Environment Variable Validation

- [ ] Production project, environment, service, domain, and region are verified.
- [ ] Database binding and variable reference sources are verified without exposing values.
- [ ] Required non-secret configuration is present.
- [ ] Secret values are not printed, logged, copied, or stored in this checklist.
- [ ] Financial execution flags are recorded with normalized safe states.
- [ ] Provider configuration is verified as required by the approved release, and no unauthorized provider mode is enabled.

## Build Validation

- [ ] Required focused tests pass.
- [ ] Type check passes.
- [ ] Production build passes.
- [ ] Required whitespace or diff checks pass.
- [ ] Any approved validation exception is recorded with owner and rationale.

## Railway Deployment

- [ ] Deployment targets the verified production service only.
- [ ] Deployment identifier is recorded.
- [ ] Repository, branch, and deployed commit shown by Railway match the release record.
- [ ] Build and startup complete successfully.
- [ ] No unapproved pre-deploy, release, or migration command ran.

## Health Verification

- [ ] Approved health endpoint or equivalent reports healthy.
- [ ] Database connectivity is healthy where applicable.
- [ ] Sanitized startup and deployment logs show no unaddressed release error.

## Driver Smoke Tests

- [ ] Public application and Driver login surfaces load.
- [ ] `npm run test:driver-golden-path` passes for every release changing client, API, readiness, localization, analytics, routing, storage, or deployment code.
- [ ] The authenticated Driver golden path passes: readiness, eligible facility display, GPS recovery and proximity, Check-In enablement, private photo upload, pending submission confirmation, and Driver activity history.
- [ ] An authorized Facility Owner can see the resulting pending activity without receiving private Driver data beyond the existing operational projection.
- [ ] When direct object-storage upload is configured, `npm run verify:photo-upload-cors -- <production-origin>` passes against the target environment before promotion.
- [ ] No destructive test data or unauthorized financial action is created.

## Owner Smoke Tests

- [ ] Facility Owner login surface loads.
- [ ] Released owner workflow is reachable and authorization boundaries hold.
- [ ] Pending operational activity is not misrepresented as a financial state.

## Admin Smoke Tests

- [ ] Authorized Admin or Super Admin surface loads.
- [ ] Released admin workflow is reachable.
- [ ] Unauthorized roles are denied where the release changes protected functionality.

## Notification Verification

- [ ] Release-affected notifications, announcements, or reminders are verified for the intended audience and workflow.
- [ ] No notification exposes secrets, payment identifiers, bank information, or unnecessary PII.
- [ ] No released workflow emits an unintended payment, payout, or financial-execution notification.

## Financial Operations Verification

- [ ] Operational verification remains independent from financial execution.
- [ ] Canonical financial workspace, if affected, is available and uses truthful lifecycle language.
- [ ] Draft, review, approval, scheduled, paid, and settled states are not conflated.
- [ ] No payment, transfer, payout, wallet, settlement, scheduler, or provider execution occurs unless separately authorized.

## Security Verification

- [ ] Authentication and authorization checks relevant to the release pass.
- [ ] No secrets, payment identifiers, bank information, or unnecessary PII are exposed.
- [ ] Logs and release evidence are sanitized.

## Release Record

- [ ] Validation, migration, schema, environment, deployment, health, and smoke-test evidence is linked or recorded.
- [ ] Known limitations, incident references, and follow-up work are recorded.
- [ ] Production completion criteria in CTX-DEP-001 are satisfied.

## Rollback Information

- [ ] Rollback decision owner and trigger conditions are recorded.
- [ ] Rollback or recovery procedure is recorded.
- [ ] Migration recovery posture is recorded; no unsafe destructive reversal is assumed.

## Final Production Sign-off

- [ ] Release operator confirms all applicable checklist items are complete.
- [ ] Release approver confirms production completion.
- [ ] Final production commit SHA, deployment identifier, and completion time are recorded.

## Completion Rule

Do not mark a release complete until pending authorized migrations are applied, schema verification succeeds, the application is healthy, and smoke tests pass. A release is not ready if Driver login, readiness, eligible facility display, GPS recovery, Check-In enablement, Check-In, private photo upload, washout submission, or activity confirmation fails.
