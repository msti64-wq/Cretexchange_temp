# PB-001 — CreteXchange Pilot Baseline v1.0

**Status:** Active pilot baseline
**Scope:** First assisted CreteXchange pilot
**Purpose:** Authoritative definition of “Pilot Ready”

## 1. Purpose

PB-001 defines the minimum approved functionality, governance, UX, architecture, operational readiness, validation, and release criteria for the first assisted CreteXchange pilot. It is a release gate, not an implementation plan or authorization for financial execution.

## 2. Authority

PB-001 follows [Platform Vision](../../vision/platform-vision.md), [Platform Strategy](../../vision/platform-strategy.md), [Project Context](../project-context.md), [Development Protocol](../../development-protocol.md), [CTX-STD-001](../../standards/cretexchange-platform-standards.md), applicable CTX-ARCH documents, [PD-050](../../product/PD-050-facility-operational-access-and-billing-readiness.md), [PD-051](../../product/PD-051-driver-activity-and-payment-lifecycle.md), [PD-052](../../product/PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md), [PD-053](../../product/PD-053-canonical-financial-batch-lifecycle-and-approval-policy.md), applicable CTX-UX specifications, and the [Assisted-Pilot Operations Runbook](./assisted-pilot-operations-runbook.md).

## 3. Pilot objectives

- Successfully onboard the next Driver and the next participating Facility.
- Complete the next verified activity through the authorized operational workflow.
- Maintain operational truth, evidence-based review, privacy, and least privilege.
- Observe assisted-pilot friction without bypassing authorization, verification, or financial controls.

The MVP decision filter is:

> Does this increase the probability that we successfully onboard the next driver, the next facility, or complete the next verified transaction?

## 4. Pilot scope

Included pilot capabilities are Driver and Facility onboarding, participating-location operations, evidence-backed activity submission, authorized verification/rejection, Driver activity visibility, Platform Operations support, administrative review, and bilingual public/onboarding readiness where implemented.

Operational verification is not payment, settlement, wallet entitlement, certification, or a guarantee of material quality.

## 5. Pilot readiness scorecard

| Category | Minimum ready condition |
| --- | --- |
| Governance | Applicable architecture, Product Decisions, UX specifications, and runbook are current and non-conflicting |
| Architecture | Canonical sources, authorization boundaries, privacy, and financial separation are documented |
| Driver experience | A Driver can register, discover an eligible location, submit evidence, and understand operational status |
| Facility experience | An approved Facility can manage eligible locations and perform authorized review without a financial-readiness workaround |
| Platform Operations | Authorized operators can support, review, escalate, and preserve evidence/record integrity |
| Administrative review | Least-privilege, evidence-based review and dispute policy are available |
| Testing | Approved risk-based validation evidence exists for the affected pilot workflows |
| Pilot validation | Assisted walkthrough and known-risk review are complete |
| Release approval | Open blockers are explicitly accepted or resolved by the authorized owner |

## 6. Included capabilities

- Registration and role-appropriate onboarding.
- Approved Facility operational access and participating-location management.
- Driver location discovery, check-in, evidence upload, activity submission, and operational status visibility.
- Facility verification/rejection and authorized administrative review.
- Platform Operations support and the assisted-pilot operational runbook.
- Operational dashboards and intelligence that preserve payment/settlement separation.
- Phase 2 canonical unpaid-obligation recording only where separately authorized.
- Phase 3A financial-execution fencing.

## 7. Explicitly excluded capabilities

- Payment-enabled pilot testing.
- Stripe collection, Treasury settlement, wallet funding, payout execution, withdrawal, or payment scheduling.
- Financial reconciliation mutation and production-data repair.
- Government intelligence, Construction Circular Economy Index implementation, and major marketplace expansion.
- Any use of legacy execution routes as a pilot workaround.

## 8. Required Product Decisions

- [PD-050](../../product/PD-050-facility-operational-access-and-billing-readiness.md): Facility operational access is separate from financial readiness.
- [PD-051](../../product/PD-051-driver-activity-and-payment-lifecycle.md): operational and financial activity states remain distinct.
- [PD-052](../../product/PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md): trust, review, and dispute boundaries.
- [PD-053](../../product/PD-053-canonical-financial-batch-lifecycle-and-approval-policy.md): non-executing canonical batch policy.

## 9. Required UX specifications

Pilot experience follows [CTX-UX-001](../../ux/CTX-UX-001-first-impression-and-onboarding-experience.md) through [CTX-UX-008](../../ux/CTX-UX-008-administrative-activity-review-experience.md), as applicable to the approved pilot workflow.

## 10. Required architecture

The applicable architecture includes [CTX-ARCH-001](../../architecture/financial-architecture-and-kpi-specification.md), [CTX-ARCH-002](../../architecture/owner-operations-architecture.md), [CTX-ARCH-003](../../architecture/driver-operations-architecture.md), [CTX-ARCH-004](../../architecture/admin-operations-architecture.md), [CTX-ARCH-005](../../architecture/material-management-architecture.md), [CTX-ARCH-006](../../architecture/driver-incentive-and-financial-settlement-architecture.md), and [CTX-ARCH-007](../../architecture/CTX-ARCH-007-canonical-financial-batch-architecture.md).

## 11. Required operational runbooks

The [Assisted-Pilot Operations Runbook](./assisted-pilot-operations-runbook.md) is required for support, escalation, and participant communication. Any financial exception is escalated; it is not repaired through a live-provider action or direct production-data edit.

## 12. Pilot operational principles

- Operational truth.
- Operational before financial.
- Evidence-based review.
- Marketplace trust.
- Least privilege.
- Accessibility.
- Bilingual readiness.

## 13. Pilot exit criteria

The pilot may exit only when the approved first-user workflows have been observed, support issues have authorized owners, material privacy/security/data-integrity findings are resolved or accepted, and the owner approves the exit evidence.

## 14. Validation requirements

Use the [Development Protocol](../../development-protocol.md) risk-based validation level. Documentation requires link/hierarchy review; feature changes require focused tests and applicable type/build validation; financial, authorization, schema, migration, and release actions require Level 3 evidence and explicit approval.

## 15. Release gates

Before release, confirm the scorecard, open blockers, operational runbook, least-privilege access, participant communication, and validation evidence. No unresolved blocker may be silently converted into an operational workaround.

## 16. Known pilot blockers

### Payment Trigger Defect

Current legacy behavior initiated Stripe payment immediately after Facility approval. This conflicts with PD-051. The approved lifecycle is: Facility verification → payment obligation recorded → scheduled weekly payout or explicit administrator-authorized payment run. This is an implementation blocker, not a policy change.

### Payment Amount Defect

Observed behavior initiated a $1.00 Stripe payment request instead of the platform-defined amount. Payment calculation and payout pipeline require investigation and correction before pilot release. This is an implementation blocker, not a policy change.

Phase 3A disables legacy financial execution. Payment-disabled operational testing is conditionally safe only while those controls remain disabled.

## 17. Deferred capabilities

Major Construction Circular Economy Intelligence Platform expansion, financial execution, settlement, public invoicing, government intelligence, enterprise analytics, and marketplace expansion are deferred. They require later policy, architecture, implementation, and validation.

## 18. Pilot versioning strategy

PB-001 establishes the first assisted-pilot baseline. A later baseline must be versioned as PB-002, PB-003, and so on, document additions/removals and known blockers, and preserve prior baseline history. A new baseline does not silently alter a prior release decision.

## 19. Future baseline evolution

Future baselines may incorporate approved financial collection, reconciliation, wallet entitlement, expanded operational intelligence, and marketplace capabilities only after their governing decisions, architecture, migration gates, validation, and release approval are complete.
