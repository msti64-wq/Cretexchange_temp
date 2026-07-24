# CTX-RB-009 — Daily Operations Checklist

- **Document ID:** CTX-RB-009
- **Version:** 0.1
- **Status:** Draft
- **Owner:** V8 Laboratories
- **Product:** CreteXchange
- **Effective Date:** July 2026
- **Classification:** Internal
- **Review Frequency:** Daily, plus additional review after a production deployment, reported incident, provider outage, material operational anomaly, or marketplace-trust escalation.
- **Approval Authority:** To be formally assigned

## 1. Purpose

This checklist supports the routine daily operational review performed by an authorized CreteXchange administrator or Platform Operations user. It helps the reviewer confirm normal operation, identify exceptions, review operational activity and marketplace-trust concerns, review financial queues without execution, preserve evidence, escalate material issues, and record completion.

It is not a production deployment checklist, incident-response runbook, financial-execution procedure, database-administration procedure, or substitute for [CTX-OPS-001](./CTX-OPS-001-production-release-checklist.md) or [CTX-OPS-002](./CTX-OPS-002-administration-operations-guide.md).

## 2. Scope

This checklist covers visible platform health, authorized administrative surfaces, operational queues, Driver and Facility/Owner concerns, neutral activity review, non-executing financial review, documentation awareness, and safe escalation. It excludes deployment, migration, synchronization, configuration, feature-flag, database, payment, payout, refund, wallet, settlement, and destructive-data actions.

## 3. Intended Audience

Use this checklist only through an authorized Admin or Super Admin account, or by Platform Operations personnel acting through that authorized access path. It does not create a separate role, approval right, or access entitlement.

## 4. Frequency and Timing

Complete one review each operating day. No mandatory clock time, staffing schedule, weekend policy, or service-level target is established by this runbook. Perform an additional review after a production deployment, reported incident, provider outage, material operational anomaly, or marketplace-trust escalation when the applicable authority permits it.

## 5. Roles and Responsibilities

| Role | Responsibility | Permitted action | Escalation boundary |
| --- | --- | --- | --- |
| Admin | Review authorized operational and non-executing financial surfaces. | Record findings, use supported operational actions, and escalate. | Do not deploy, migrate, alter data directly, or execute financial actions. |
| Super Admin | Perform the same authorized review, including any explicitly supported elevated review action. | Use only the present authorized interface and durable audit path. | Elevated access does not authorize production change or financial execution. |
| Platform Operations personnel | Carry out daily review through authorized Admin or Super Admin access. | Follow this checklist and linked pilot procedures. | A separate application role or escalation authority is **Procedure not yet formally defined**. |
| Approved pilot support personnel | Support first-activity issues with the least-privileged view. | Follow the pilot runbook and record sanitized evidence. | Escalate security, data-integrity, authorization, and financial concerns. |

## 6. Prerequisites

- [ ] Authorized account and access to the Platform Operations / Admin surfaces are available.
- [ ] The Administration Repository is available for governing-document lookup.
- [ ] Known incidents, releases, and prior unresolved operational items are available through approved records where they exist.
- [ ] Approved support or incident channel is known. If none is formally defined, record the documentation gap and escalate rather than invent a channel.

## 7. Start-of-Review Record

Record only the minimum operational evidence:

| Field | Record |
| --- | --- |
| Review date | |
| Start time | |
| Reviewer | |
| Environment | |
| Relevant production commit or release reference, if applicable | |
| Known incident or maintenance reference | |
| Prior unresolved operational items | |

Do not include credentials, secrets, connection strings, full payment details, bank information, or unnecessary personal information.

## 8. Platform Health Review

For each available surface, record one outcome: **normal**, **degraded**, **unavailable**, or **requires escalation**.

- [ ] Application health surface responds normally, where available.
- [ ] Authentication surface is available.
- [ ] Driver surface is reachable.
- [ ] Facility Owner surface is reachable.
- [ ] Admin surface is reachable.
- [ ] Administration Repository is reachable and remains read-only.
- [ ] Recent deployment status is reviewed when relevant.
- [ ] Visible errors or abnormal behavior are recorded with a sanitized route, timestamp, and symptom.

Do not run invasive diagnostics or change configuration as part of a daily review. If a surface is degraded or unavailable, preserve the observation and escalate.

## 9. Operational Queue Review

- [ ] Review available pending operational activity and pending-review items.
- [ ] Review visible activity-review exceptions and unresolved disputes.
- [ ] Review visible user, account, facility, or location issues.
- [ ] Review administrative alerts and unresolved prior-day items.
- [ ] Record any material item’s sanitized identifier, current state, supporting evidence, and next authorized action.

A consolidated daily queue is not formally defined. Use the currently available authorized workspace; an empty queue is an observed state, not proof that no issue exists.

## 10. Driver Review

- [ ] Review recent visible access or account concerns.
- [ ] Review disputed activity, evidence concerns, abnormal patterns visible in current tools, and unresolved support needs.
- [ ] Confirm activity status and Driver ownership before providing support.
- [ ] Use the [Assisted-Pilot Operations Runbook](../project/pilot/assisted-pilot-operations-runbook.md) for GPS, photo upload, submission, history, and location scenarios.

Do not alter identity, role, payment status, or a financial record. A formal restriction or suspension procedure is **Procedure not yet formally defined** unless a separately authorized source provides it.

## 11. Facility and Location Review

- [ ] Review visible operational readiness and unresolved Owner or Facility issues.
- [ ] Review location availability or status where the authorized interface provides it.
- [ ] Review evidence or activity disputes and Driver/Owner/location relationship concerns.
- [ ] Keep operational authorization separate from payment-method readiness as required by [PD-050](../product/PD-050-facility-operational-access-and-billing-readiness.md).

Do not change payment readiness to resolve operational access and do not silently remap a submitted activity.

## 12. Administrative Activity and Photo Review

Follow [PD-052](../product/PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md) and the current capability boundaries in [CTX-OPS-002](./CTX-OPS-002-administration-operations-guide.md).

- [ ] Review pending activity evidence and photos where available and authorized.
- [ ] Confirm Driver, Facility, location, timestamps, and operational status where available.
- [ ] Use neutral, evidence-based reasons in an authorized decision path.
- [ ] Preserve evidence and escalate an ambiguous, conflicting, or disputed record.
- [ ] Do not make a fraud conclusion from an incomplete record or unavailable evidence.

The consolidated advanced photo-review console with Driver, Owner, and date-range filtering described by [CTX-UX-008](../ux/CTX-UX-008-administrative-activity-review-experience.md) is planned, not an operationally available capability.

## 13. Marketplace Trust and Disputes

- [ ] Review unresolved disputes, repeated evidence concerns, conflicting Driver and Facility reports, and possible misuse that requires escalation.
- [ ] Preserve neutral treatment, evidence limitations, and the separation between activity review and financial outcome.
- [ ] Do not retaliate or take unsupported administrative action.

Formal fraud-investigation and dispute-resolution procedures beyond supported operational review are **Procedure not yet formally defined**.

## 14. Financial Review

Review only the non-executing financial surfaces governed by [CTX-ARCH-001](../architecture/financial-architecture-and-kpi-specification.md), [CTX-ARCH-007](../architecture/CTX-ARCH-007-canonical-financial-batch-architecture.md), [PD-051](../product/PD-051-driver-activity-and-payment-lifecycle.md), and [PD-053](../product/PD-053-canonical-financial-batch-lifecycle-and-approval-policy.md).

- [ ] Review canonical obligation or financial-review queues where available.
- [ ] Review draft or ready-for-review batches and visible unresolved exceptions.
- [ ] Check that lifecycle terms are not being represented incorrectly as paid or settled.
- [ ] Record missing or inconsistent financial evidence and escalate it through the authorized process.
- [ ] Verify financial-execution flags only when an approved non-secret verification method is available.

> **Caution:** review does not authorize execution. Approval does not equal payment; scheduled does not equal paid; paid does not necessarily equal settled. Stripe billing, payment execution, refunds, payouts, wallet actions, and settlement remain unavailable unless separately implemented and authorized.

## 15. Administration Repository Review

- [ ] Confirm the Administration Repository is available and read-only.
- [ ] Review newly added or recently revised operational documents when relevant to current work.
- [ ] Use the Documentation Library and linked governing documents rather than memory or prior chat.
- [ ] Record broken links, missing relationships, stale guidance, and documentation gaps.
- [ ] Do not attempt to edit governed documents through the read-only application.

If Documentation Management reports an authorization denial, a refresh in progress, validation failure, or inventory-generation failure, record only the stable code, route, time, and affected environment classification. Do not retry a refresh, change configuration, or repair database state from this daily checklist. Follow [CTX-OPS-002](./CTX-OPS-002-administration-operations-guide.md#controlled-refresh-troubleshooting) and the production-release protocol when a production change is proposed.

## 16. Security and Access Review

- [ ] Record unexpected access failures, unauthorized-role access, suspicious login or permission reports, or exposure of sensitive information visible through authorized work.
- [ ] Preserve only sanitized evidence and stop unsafe activity.
- [ ] Escalate security or authorization concerns through the formally supported path when one exists.

This is a daily observation, not a complete access audit. Security monitoring capability and incident-response ownership beyond this boundary are **Procedure not yet formally defined**.

## 17. Notifications and Support Issues

- [ ] Review currently available operational communications or reports.
- [ ] Record blocked Driver, Facility, Owner, or Admin workflows using the minimum authorized context.
- [ ] Use the assisted-pilot support scenarios when applicable.

Do not assume a ticketing platform, notification center, or formal support ownership exists. Where the channel or authority is undefined, record the gap and escalate.

## 18. Exceptions and Escalation

| Condition | Immediate action | Prohibited action | Escalation destination | Governing document |
| --- | --- | --- | --- | --- |
| Platform unavailable | Record route, time, symptom, and health observation. | Do not change configuration or redeploy. | Release/incident authority: **Procedure not yet formally defined**. | [CTX-DEP-001](../standards/CTX-DEP-001-production-deployment-protocol.md) |
| Suspected security issue or unauthorized access | Preserve sanitized evidence and stop unsafe activity. | Do not investigate by expanding access or exposing data. | Security authority: **Procedure not yet formally defined**. | [CTX-STD-001](../standards/cretexchange-platform-standards.md) |
| Data-integrity concern | Preserve identifiers and observed discrepancy. | Do not repair data directly. | Data-repair authority: **Procedure not yet formally defined**. | [CTX-DEP-001](../standards/CTX-DEP-001-production-deployment-protocol.md) |
| Disputed operational activity | Review neutral evidence and preserve limitations. | Do not make an unsupported fraud finding. | Authorized review boundary or documentation gap. | [PD-052](../product/PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md) |
| Financial-state inconsistency or provider issue | Stop at the non-executing review boundary. | Do not charge, refund, pay, settle, or use a legacy route. | Separate financial-execution authority required. | [PD-053](../product/PD-053-canonical-financial-batch-lifecycle-and-approval-policy.md) |
| Unclear authority or documentation conflict | Follow the documentation hierarchy and record the conflict. | Do not improvise a policy or permission. | Documentation owner / authority: **Procedure not yet formally defined**. | [Documentation Library](../README.md) |

## 19. Completion Review

- [ ] All applicable checklist sections were reviewed.
- [ ] Exceptions and sanitized evidence were recorded.
- [ ] Unresolved items were assigned or escalated where authority exists.
- [ ] No unauthorized changes, financial execution, or direct production-data modification occurred.
- [ ] Documentation gaps and authority conflicts were recorded.
- [ ] Completion time was recorded.

## 20. Daily Review Record

| Field | Record |
| --- | --- |
| Review date | |
| Reviewer | |
| Result: normal / degraded / escalated | |
| Exceptions found | |
| Escalation references | |
| Unresolved items | |
| Follow-up owner, if formally assigned | |
| Completion time | |

## 21. Weekly Roll-Up

At the end of a week, summarize recurring exceptions, unresolved disputes, recurring access issues, operational trends, financial-review anomalies, and documentation gaps found through daily reviews. This is not a full weekly operations guide and does not create metrics, targets, or new authority.

## 22. Known Limitations and Documentation Gaps

- Consolidated advanced photo review remains planned.
- Formal account and role administration and suspension procedures are not established here.
- Incident response, database recovery, business continuity, disaster recovery, financial reconciliation, failed-payment handling, refund handling, fraud investigation, customer-support escalation, retention requirements, and formal escalation authorities require approved procedures where no linked source resolves them.

## 23. Related Documents

- [CTX-POL-003 — Data Retention Policy](../standards/CTX-POL-003-data-retention-policy.md)
- [CTX-POL-004 — Incident Response Policy](../standards/CTX-POL-004-incident-response-policy.md)
- [CTX-POL-008 — Access Control Policy](../standards/CTX-POL-008-access-control-policy.md)
### Governing documentation

- [Documentation Library](../README.md)
- [Project Context](../project/project-context.md)
- [Development Protocol](../development-protocol.md)

### Operations guides and runbooks

- [Operations Runbook Framework](./README.md)
- [CTX-OPS-001 — Production Release Checklist](./CTX-OPS-001-production-release-checklist.md)
- [CTX-OPS-002 — Administration Operations Guide](./CTX-OPS-002-administration-operations-guide.md)
- [Assisted-Pilot Operations Runbook](../project/pilot/assisted-pilot-operations-runbook.md)

### Standards and architecture

- [CTX-STD-001 — CreteXchange Platform Standards](../standards/cretexchange-platform-standards.md)
- [CTX-DEP-001 — Production Deployment Protocol](../standards/CTX-DEP-001-production-deployment-protocol.md)
- [CTX-ARCH-001 — Financial Architecture & KPI Specification](../architecture/financial-architecture-and-kpi-specification.md)
- [CTX-ARCH-002 — Owner Operations Architecture](../architecture/owner-operations-architecture.md)
- [CTX-ARCH-003 — Driver Operations Architecture](../architecture/driver-operations-architecture.md)
- [CTX-ARCH-004 — Admin Operations Architecture](../architecture/admin-operations-architecture.md)
- [CTX-ARCH-007 — Canonical Financial Batch Architecture](../architecture/CTX-ARCH-007-canonical-financial-batch-architecture.md)

### Product Decisions and UX specifications

- [PD-050](../product/PD-050-facility-operational-access-and-billing-readiness.md)
- [PD-051](../product/PD-051-driver-activity-and-payment-lifecycle.md)
- [PD-052](../product/PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md)
- [PD-053](../product/PD-053-canonical-financial-batch-lifecycle-and-approval-policy.md)
- [CTX-UX-007 — Platform Operations Center Experience](../ux/CTX-UX-007-platform-operations-center-experience.md)
- [CTX-UX-008 — Administrative Activity Review Experience](../ux/CTX-UX-008-administrative-activity-review-experience.md)

## 24. Governance

- **Owner:** V8 Laboratories
- **Approval Authority:** To be formally assigned
- **Status:** Draft
- **Last Reviewed:** July 2026
- **Next Scheduled Review:** July 2027, or earlier when a supported operational workflow or governing source changes.
- **Review Frequency:** Daily for use; annually and event-driven for document review.

### Change History

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | July 2026 | Initial Draft. |
