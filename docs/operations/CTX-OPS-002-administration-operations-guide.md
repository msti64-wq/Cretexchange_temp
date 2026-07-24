# CTX-OPS-002 — Administration Operations Guide

- **Document ID:** CTX-OPS-002
- **Version:** 0.1
- **Status:** Draft
- **Owner:** V8 Laboratories
- **Product:** CreteXchange
- **Effective Date:** July 2026
- **Classification:** Internal
- **Review Frequency:** Review when a supported administrative workflow or governing authority changes; otherwise annually.
- **Approval Authority:** Procedure not yet formally defined

## 1. Purpose

This guide describes routine, safe operating practices for authorized CreteXchange administrators and Platform Operations personnel. It explains the administrative capabilities currently supported by the platform and the boundaries that protect operational truth, privacy, auditability, and financial safety. It does not replace an applicable architecture, Product Decision, runbook, or production release record.

## 2. Scope

This guide covers current administrative review of accounts, facilities and locations, driver activity, operational exceptions, non-executing financial review, reporting evidence, and the read-only Administration Repository. It does not authorize code deployment, database repair, configuration changes, payment collection, payout, wallet mutation, settlement, fraud determination, or a new business rule.

Detailed task procedures remain in the [Assisted-Pilot Operations Runbook](../project/pilot/assisted-pilot-operations-runbook.md). A procedure absent from this guide and its governing sources is **Procedure not yet formally defined**.

## 3. Intended Audience

This guide is for authorized Admin and Super Admin users, Platform Operations personnel acting through an authorized administrative account, approved pilot-support personnel, and release or financial reviewers where the applicable governing document permits their participation. It does not grant access to a user or expand an existing role.

## 4. Governing Principles

- **Least privilege:** use only the authorized view and the minimum information needed for the task.
- **Evidence before assumption:** use the authoritative record; do not infer fault, payment, or completion from an incomplete record.
- **Truthful lifecycle language:** pending, verified, rejected, obligation, draft, ready for review, approved, paid, and settled have different meanings.
- **Operational and financial separation:** operational verification is not financial execution; batch approval is not collection, payment, or settlement.
- **Auditability:** material authorized actions require the applicable recorded reason, actor, timestamp, and durable audit evidence.
- **Privacy minimization:** do not copy secrets, credentials, connection strings, full payment details, protected financial identifiers, or unnecessary personal information into notes, exports, or incident records.
- **Escalate rather than improvise:** stop and use the governing procedure when a capability, authority, or data state is uncertain.

## 5. Administrative Roles and Boundaries

| Supported actor | Current responsibility | Prohibited shortcut | Escalation boundary |
| --- | --- | --- | --- |
| Admin | Review authorized operational, account, facility, activity, reporting, and non-executing financial workspaces. | Do not bypass authorization, directly alter production data, or represent an operational outcome as a payment outcome. | Escalate security, data-integrity, financial-execution, or policy conflicts. |
| Super Admin | Use the same authorized administrative surfaces, including explicitly permitted elevated review actions. | Do not treat elevated access as permission for deployment, migration, configuration, or financial execution. | Escalate actions not expressly supported by the governing source. |
| Platform Operations personnel | Perform support and review work through the authorized Admin or Super Admin access path. | Do not assume a separate application role or authority that is not documented. | Use the assigned escalation path for account, evidence, or financial exceptions. |
| Approved pilot support personnel | Follow the assisted-pilot support procedure using the least-privileged view. | Do not request unnecessary evidence or use direct production-data edits. | Escalate any authorization override, security, database repair, or financial/Stripe request. |

Role assignment, role changes, and a formal separation-of-duties procedure are **Procedure not yet formally defined** for this guide unless separately authorized.

## 6. Platform Operations Center Overview

Current administrative areas include account and operational oversight, activity and owner/facility context, reports, the non-executing Financial Workspace / Financial Operations surfaces, and the Administration Repository. The Administration Repository is the read-only operational knowledge center: Git remains authoritative for content, history, and change control.

The overall operational workspace is governed by [CTX-ARCH-004](../architecture/admin-operations-architecture.md) and [CTX-UX-007](../ux/CTX-UX-007-platform-operations-center-experience.md). Those sources describe broader architecture and experience direction; this guide does not represent every described capability as currently available.

## 7. Daily Administration Workflow

1. Confirm that the platform health surface and the authorized administrative session are available. If either is unavailable, record a sanitized symptom and escalate; do not use a workaround that changes production.
2. Review current operational queues and recent verified or pending activity using the authorized workspace. Treat an empty queue as an observed state, not proof that no issue exists.
3. Review unresolved exceptions, owner/facility readiness, and driver issues visible in the authorized views.
4. Review administrative alerts and support requests. Preserve the relevant sanitized identifier, route, timestamp, current state, and next authorized action.
5. Review financial queues only as non-executing operational evidence. Do not charge, pay, fund a wallet, schedule a payment, settle a batch, or call a provider.
6. Record or escalate material issues using the applicable durable incident, release, or support record. Do not include secrets or unnecessary participant data.

Formal alert-triage ownership, service-level targets, and a consolidated daily queue procedure are **Procedure not yet formally defined**.

## 8. User Administration

### Driver accounts

Use the authorized Driver record and activity history to confirm the account context, current operational status, and visible activity evidence. For login, GPS, photo-upload, submission, status-history, or location issues, follow the applicable scenario in the [Assisted-Pilot Operations Runbook](../project/pilot/assisted-pilot-operations-runbook.md). A verified activity is an operational result; it does not by itself prove a payment, payout, wallet credit, or settlement.

### Facility Owner accounts

Review the authorized owner record, facility/location relationship, location operational status, and pending-review queue. Payment-method readiness is separate from operational authorization under [PD-050](../product/PD-050-facility-operational-access-and-billing-readiness.md); do not change payment data to resolve a location-access issue.

### Admin accounts

Use existing authenticated administrative access only. Account creation, role changes, sensitive-profile changes, and a formal account-suspension procedure are **Procedure not yet formally defined** unless an authorized feature and governing procedure expressly provide them. Escalate identity, fraud, legal, security, and payment concerns.

## 9. Facility and Location Administration

1. Confirm the authorized owner and the intended facility/location relationship.
2. Review the location’s visible operational status, accepted materials, capacity, hours, restrictions, and pricing only where the authorized interface provides them.
3. Keep operational readiness separate from payment-method or billing readiness as required by [PD-050](../product/PD-050-facility-operational-access-and-billing-readiness.md).
4. For a missing submission, confirm the activity’s location and owner relationship before escalating. Do not silently remap an activity or change a record directly.
5. Escalate location disputes, conflicting relationships, inactive-location questions, or unsupported configuration requests.

Bulk location remediation and a formal facility-dispute procedure are **Procedure not yet formally defined**.

## 10. Driver Administration

Review registration and account context, current activity history, visible verification status, and the authorized operational evidence. For GPS or photo evidence, preserve the distinction between an unavailable source and negative evidence. Do not submit an activity manually, bypass duplicate protections, invent fallback coordinates, or promise a financial outcome.

Restriction, suspension, and exception-handling authority must follow an approved procedure. Where no such procedure is available, **Procedure not yet formally defined**; escalate the case with sanitized evidence.

## 11. Administrative Activity and Photo Review

Administrative review follows [PD-052](../product/PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md): it is neutral, evidence-based, privacy-aware, and operationally separate from payment outcomes.

1. Confirm the reviewer’s authorization and the activity’s authoritative status and context.
2. Inspect available submitted evidence, photos, timestamps, driver, owner, facility, and location context only as authorized.
3. Record the supported reason when an authorized workflow requires it. Do not characterize unavailable evidence as proof of fault.
4. Preserve disputed evidence and escalate conflicting, missing, or insufficient records rather than inventing a conclusion.
5. State the operational outcome truthfully: pending, verified, or rejected is not paid, scheduled, collected, wallet-funded, or settled.

The consolidated photo-review console with advanced Driver, Owner, and date-range filtering described by [CTX-UX-008](../ux/CTX-UX-008-administrative-activity-review-experience.md) is planned, not an operationally available capability. [CTX-RB-007 — Administrative Photo Review Runbook](./CTX-RB-007-administrative-photo-review-runbook.md) documents the current procedural boundary; it does not establish the planned console or authorize unsupported capability.

## 12. Marketplace Trust and Dispute Handling

Use neutral review and preserve the record. Do not retaliate, assume misconduct, or use a participant’s role, reputation, missing data, GPS anomaly, photo, or prior outcome as proof by itself. Keep an activity-review outcome separate from a payment outcome. Capture only the authorized evidence, limitations, actor, timestamp, and escalation reference. Formal fraud-investigation and dispute-resolution procedures beyond the supported activity review are **Procedure not yet formally defined**.

## 13. Financial Oversight

Financial behavior is governed by [CTX-ARCH-001](../architecture/financial-architecture-and-kpi-specification.md), [CTX-ARCH-007](../architecture/CTX-ARCH-007-canonical-financial-batch-architecture.md), and [PD-053](../product/PD-053-canonical-financial-batch-lifecycle-and-approval-policy.md). Administrators may review authorized canonical obligations, discovery queues, draft batches, approved batches, exceptions, and append-only audit context where the current workspace provides them.

| Term | Operational meaning | Does not mean |
| --- | --- | --- |
| Verified activity | Operational review completed. | Collection, payment, payout, or settlement. |
| Canonical obligation | One frozen unpaid financial record linked to an eligible verified activity. | A provider charge or a Driver wallet credit. |
| Draft / ready for review batch | A non-executing grouping for authorized review. | Collection, payment, or settlement. |
| Approved batch | A reasoned lifecycle decision for a later separately authorized workflow. | Scheduled, paid, collected, wallet-funded, or settled. |
| Paid / settled | Financial completion terms requiring authoritative financial evidence. | An activity status or a batch-review outcome. |

Current canonical batch review is non-executing. Stripe billing, provider execution, transfers, payouts, wallet mutation, settlement, failed-payment recovery, refunds, and reconciliation must not be represented as active from this guide. A Financial Operations Guide and Payment Reconciliation Runbook are planned; they are not substitutes for separately authorized financial procedures.

## 14. Administration Repository Operations

The Administration Repository provides a read-only, synchronized view of governed documentation. Use **Start Here** to open the repository guide; browse categories, search verified content, open a document, use related-document navigation, and use the supported print or export actions. The interface does not authorize create, edit, delete, upload, publish, approval, or metadata mutation.

Use the synchronized document’s identifier, status, source version, checksum-verified content, and relationships. Where documents conflict or an authority is unclear, return to the [Documentation Library](../README.md) and follow the hierarchy rather than relying on memory or prior chat. Do not treat a rendered repository copy as a replacement for Git authority.

### Controlled refresh troubleshooting

Refresh is a separately authorized administrative operation, not routine browsing. The CLI remains staging-only; the protected HTTP route may additionally serve explicitly named development, test, or local environments. In each permitted non-production environment, the synchronization target and Railway environment identity must match. In production, the same shared guard additionally requires a valid immutable deployed commit and a separate production authorization value that exactly matches that commit; the application never accepts that value from a browser user or displays it. An authorization-denied response, `synchronization_in_progress`, validation failure, or inventory-generation failure must be recorded with sanitized evidence and escalated. Do not retry by changing feature flags, environment values, source files, Git history, database state, or financial controls.

Only one refresh may run across service replicas. PostgreSQL releases the lock if its owning database session ends; an unexpected prior failure therefore is not a reason to perform a manual lock or database repair. A failed refresh retains the last successfully synchronized inventory. A source document’s lifecycle remains Git-authoritative; a synchronized inventory generation does not publish or alter source documentation.

## 15. Reporting and Audit Evidence

Record only evidence needed for the authorized operational purpose: sanitized identifiers, timestamps, route or deployment references, current state, and the governing document or escalation reference. Use durable release and incident records when applicable. Do not include secrets, credentials, connection strings, full payment details, protected financial identifiers, or unnecessary personal information. Retention periods are **Procedure not yet formally defined** unless an approved policy supplies them.

## 16. Incident Recognition and Escalation

| Issue category | Immediate safe action | Governing source or gap |
| --- | --- | --- |
| Security concern or suspected unauthorized access | Preserve sanitized evidence, stop unsafe activity, escalate. | Detailed incident-response runbook is **Procedure not yet formally defined**. |
| Production outage | Record health, route, time, and visible symptom; use release governance for changes. | [CTX-DEP-001](../standards/CTX-DEP-001-production-deployment-protocol.md), [CTX-OPS-001](./CTX-OPS-001-production-release-checklist.md). |
| Data-integrity concern | Preserve identifiers and observed discrepancy; do not repair data directly. | Detailed database-repair procedure is **Procedure not yet formally defined**. |
| Payment or financial anomaly | Stop at the non-executing review boundary and escalate. | [CTX-ARCH-007](../architecture/CTX-ARCH-007-canonical-financial-batch-architecture.md), [PD-053](../product/PD-053-canonical-financial-batch-lifecycle-and-approval-policy.md). |
| Marketplace-trust dispute | Use neutral, evidence-based review and preserve limitations. | [PD-052](../product/PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md). |
| Documentation conflict | Follow the documentation hierarchy and report the conflict. | [Documentation Library](../README.md), [CTX-STD-002](../standards/CTX-STD-002-documentation-governance-metadata-lifecycle-authority-and-relationships.md). |

## 17. Production Change Boundaries

Routine administration does not authorize code deployment, schema migration, synchronization, environment-variable or feature-flag changes, direct production-data modification, payment collection, payout, transfer, wallet action, settlement, or provider execution. Production changes require the controls in [CTX-DEP-001](../standards/CTX-DEP-001-production-deployment-protocol.md) and the release record in [CTX-OPS-001](./CTX-OPS-001-production-release-checklist.md).

## 18. Escalation Matrix

| Issue type | First reviewer | Escalation authority | Governing document | Prohibited shortcut |
| --- | --- | --- | --- | --- |
| Pending or disputed activity | Authorized Facility / Platform Operations reviewer | Authority beyond the current reviewer is **Procedure not yet formally defined**. | [PD-052](../product/PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md) | Do not verify, reject, or alter data without authority and evidence. |
| Facility or location access issue | Authorized Admin / Platform Operations reviewer | Escalate unsupported access or data repair. | [PD-050](../product/PD-050-facility-operational-access-and-billing-readiness.md) | Do not change payment readiness or directly edit data. |
| Driver activity or evidence issue | Authorized Admin / Platform Operations reviewer | Escalate a missing authority or conflicting record. | [PD-051](../product/PD-051-driver-activity-and-payment-lifecycle.md) | Do not create a manual activity or promise payment. |
| Financial exception | Authorized Admin or Super Admin using the non-executing workspace | Separate financial-execution authority is required. | [PD-053](../product/PD-053-canonical-financial-batch-lifecycle-and-approval-policy.md) | Do not charge, pay, settle, repair, or use a legacy execution route. |
| Production release concern | Release operator | Business / technical approver recorded in the release record. | [CTX-DEP-001](../standards/CTX-DEP-001-production-deployment-protocol.md), [CTX-OPS-001](./CTX-OPS-001-production-release-checklist.md) | Do not deploy or migrate from routine administration. |

## 19. Recurring Checklists

### Daily

- [ ] Confirm platform health and authorized administrative access.
- [ ] Review current queues, exceptions, pending activity, and urgent support concerns.
- [ ] Review disputed or incomplete records using neutral evidence and the least-privileged view.
- [ ] Review financial queues only as non-executing evidence.
- [ ] Record or escalate material issues with sanitized references.

### Weekly

- [ ] Review unresolved support, activity, owner, facility, and access cases.
- [ ] Review operational trends and financial-review exceptions visible in authorized workspaces.
- [ ] Identify documentation gaps, stale procedures, or authority conflicts.
- [ ] Confirm that no unsupported financial or direct-data action has been used as a workaround.

### Monthly

- [ ] Review the need for authorized access, policy, runbook, and documentation updates.
- [ ] Review available operational metrics and audit evidence without inventing targets.
- [ ] Review supported vendor or service health evidence where available.
- [ ] Identify upcoming documentation reviews and unresolved escalation themes.

## 20. Known Limitations and Documentation Gaps

- A consolidated photo-review console with advanced Driver, Owner, and date-range filtering is planned; [CTX-UX-008](../ux/CTX-UX-008-administrative-activity-review-experience.md) is an experience specification, not proof of current availability.
- Stripe billing enablement, payment reconciliation, refunds, failed-payment recovery, provider operations, payouts, wallet execution, and settlement procedures are not defined by this guide.
- Fraud investigation, incident response, database recovery, business continuity, disaster recovery, and customer-support escalation ownership require dedicated approved procedures where none is linked above.
- Formal account-role management, suspension, retention duration, and escalation authorities require governing documentation before use.

## 21. Related Documents

### Governing sources

- [Documentation Library](../README.md)
- [Project Context](../project/project-context.md)
- [Development Protocol](../development-protocol.md)

### Architecture

- [CTX-ARCH-001 — Financial Architecture & KPI Specification](../architecture/financial-architecture-and-kpi-specification.md)
- [CTX-ARCH-002 — Owner Operations Architecture](../architecture/owner-operations-architecture.md)
- [CTX-ARCH-003 — Driver Operations Architecture](../architecture/driver-operations-architecture.md)
- [CTX-ARCH-004 — Admin Operations Architecture](../architecture/admin-operations-architecture.md)
- [CTX-ARCH-007 — Canonical Financial Batch Architecture](../architecture/CTX-ARCH-007-canonical-financial-batch-architecture.md)

### Product Decisions

- [PD-050 — Facility Operational Access and Billing Readiness](../product/PD-050-facility-operational-access-and-billing-readiness.md)
- [PD-051 — Driver Activity and Payment Lifecycle](../product/PD-051-driver-activity-and-payment-lifecycle.md)
- [PD-052 — Marketplace Trust, Administrative Activity Review, and Dispute Resolution](../product/PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md)
- [PD-053 — Canonical Financial Batch Lifecycle and Approval Policy](../product/PD-053-canonical-financial-batch-lifecycle-and-approval-policy.md)

### UX specifications

- [CTX-UX-007 — Platform Operations Center Experience](../ux/CTX-UX-007-platform-operations-center-experience.md)
- [CTX-UX-008 — Administrative Activity Review Experience](../ux/CTX-UX-008-administrative-activity-review-experience.md)

### Standards and operations

- [CTX-STD-001 — CreteXchange Platform Standards](../standards/cretexchange-platform-standards.md)
- [CTX-STD-002 — Documentation Governance, Metadata, Lifecycle, Authority, and Relationship Standard](../standards/CTX-STD-002-documentation-governance-metadata-lifecycle-authority-and-relationships.md)
- [CTX-DEP-001 — Production Deployment Protocol](../standards/CTX-DEP-001-production-deployment-protocol.md)
- [CTX-OPS-001 — Production Release Checklist](./CTX-OPS-001-production-release-checklist.md)
- [CTX-RB-006 — Driver Verification Runbook](./CTX-RB-006-driver-verification-runbook.md)
- [CTX-RB-007 — Administrative Photo Review Runbook](./CTX-RB-007-administrative-photo-review-runbook.md)
- [CTX-RB-008 — Marketplace Trust & Fraud Escalation Runbook](./CTX-RB-008-marketplace-trust-and-fraud-escalation-runbook.md)
- [CTX-RB-009 — Daily Operations Checklist](./CTX-RB-009-daily-operations-checklist.md)
- [Assisted-Pilot Operations Runbook](../project/pilot/assisted-pilot-operations-runbook.md)

## 22. Governance

- **Owner:** V8 Laboratories
- **Approval Authority:** Procedure not yet formally defined
- **Status:** Draft
- **Last Reviewed:** July 2026
- **Next Scheduled Review:** July 2027, or earlier when a supported administrative workflow or governing source changes.
- **Review Frequency:** Annually and event-driven.

### Change History

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | July 2026 | Initial Draft. |
