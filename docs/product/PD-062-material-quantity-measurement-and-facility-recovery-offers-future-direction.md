# PD-062 — Material Quantity, Measurement, and Facility Recovery Offers — Future Direction

- **Document ID:** PD-062
- **Version:** 1.0
- **Status:** Approved Future Product Direction — Not Authorized for Current Implementation
- **Owner:** CreteXchange Product
- **Approval Authority:** Michael Loren Stiger, CreteXchange Project Owner
- **Product:** CreteXchange
- **Effective Date:** 2026-08-04
- **Classification:** Internal
- **Review Frequency:** Event-driven before architecture, implementation, legal, financial, or Production approval
- **Last Reviewed:** 2026-08-04
- **Next Review:** Before Phase 6 architecture or sprint authorization

## 1. Decision and authority boundary

The Founder approves **Phase 6 — Material Quantity and Recovery Economics** as future CreteXchange product direction. Phase 6 is divided into three separately governed sprints:

1. Material Quantity and Measurement Foundation;
2. Facility Material Recovery Offers; and
3. Recovery Offer Settlement and Pilot Readiness.

This decision preserves direction only. It does not authorize implementation, schema or migration work, APIs, financial calculations, payment obligations, wallet value, billing, settlement, Stripe or provider activity, feature activation, Production data changes, or deployment. Each sprint requires its own later scope and applicable architecture, Product Decision, implementation, validation, and release authority.

Existing operational and financial architecture remains unchanged. In particular, [CTX-ARCH-001](../architecture/financial-architecture-and-kpi-specification.md), [CTX-ARCH-005](../architecture/material-management-architecture.md), [CTX-ARCH-006](../architecture/driver-incentive-and-financial-settlement-architecture.md), PD-045, [Driver Activity and Payment Lifecycle](./PD-051-driver-activity-and-payment-lifecycle.md), and [Canonical Financial Visibility and Obligation Workflow](./PD-054-canonical-financial-visibility-and-obligation-workflow.md) continue to govern current behavior.

## 2. Phase 6 Sprint 1 — Material Quantity and Measurement Foundation

### Purpose

Establish the future authoritative operational record of how much material was delivered, recovered, recycled, or otherwise transferred.

### Future scope

Sprint 1 is expected to define:

- canonical material identity;
- Driver-submitted quantity and unit of measure;
- measurement method, source, and timestamp;
- estimated-versus-measured classification;
- Driver-supplied evidence, including photo and scale-ticket or weight-ticket evidence;
- Owner-confirmed quantity, recorded separately from the Driver value;
- immutable original submissions and auditable corrections;
- Administrative Review and dispute readiness;
- material-specific permitted units;
- quantity reporting;
- Facility capacity and target tracking;
- data lineage and confidence; and
- privacy, authorization, retention, and minimum-necessary access.

Potential units include load, cubic yard, ton, pound, container, pallet, item, or unit. Potential measurement methods include Driver estimate, Owner estimate, known container capacity, Facility scale, third-party certified scale ticket, item count, and a future separately approved automated measurement method.

### Governing rules

1. The Driver's original submission must not be silently overwritten.
2. The Owner's confirmed quantity must be retained as a separate value.
3. Corrections require append-only or equivalently auditable history.
4. Estimated values remain explicitly identified as estimates throughout reporting and downstream use.
5. Weight-based payment must not be calculated from an unverified volume estimate unless a separately governed conversion and verification policy permits it.
6. Data lineage must identify the material, actor, source, method, time, unit, evidence, confidence, and correction history needed to explain a value.
7. Sprint 1 is operational and nonfinancial. It creates no payment obligation, wallet value, settlement, billing, or financial execution.

## 3. Phase 6 Sprint 2 — Facility Material Recovery Offers

### Purpose and terminology

Allow an authorized Facility Owner to publish a material-specific incentive above and beyond any optional tip. The primary customer-facing term is **Material Recovery Offer**. **Material Incentive** may be used where appropriate. “Bounty” is internal planning language only and is not the primary customer-facing term.

### Future scope

Sprint 2 is expected to define:

- Facility-specific and material-specific offers;
- per-load, per-ton, per-cubic-yard, per-container, per-pallet, per-item, or per-unit rates;
- a fixed bonus for an eligible material;
- minimum and maximum quantity;
- quantity targets and Facility capacity;
- material condition and contamination rules;
- evidence and measurement requirements;
- Driver eligibility;
- effective and expiration dates;
- offer availability and whether an offer may be combined with a tip;
- Owner funding and financial-readiness requirements;
- Driver visibility before Facility selection;
- a server-accepted immutable offer snapshot;
- Owner verification, corrections, and dispute handling; and
- privacy, authorization, idempotency, and audit history.

### Governing rules

1. A Material Recovery Offer is separate from a tip.
2. A Material Recovery Offer is separate from the platform fee.
3. A later Facility offer change must not alter an offer already accepted for an activity.
4. A quantity-based payment requires an eligible and verified quantity under the future Sprint 1 policy.
5. Offer creation does not itself create or authorize a payment obligation or financial execution.
6. Financial execution remains disabled unless separately authorized.
7. Product, legal, tax, promotional, weights-and-measures, privacy, security, and financial requirements require review before Production activation.

## 4. Phase 6 Sprint 3 — Recovery Offer Settlement and Pilot Readiness

### Purpose

Connect a verified quantity and accepted Material Recovery Offer to a separately governed financial lifecycle.

### Future scope

Sprint 3 is expected to govern the immutable accepted-offer snapshot, verified-quantity qualification, Owner payment obligation, Driver wallet entitlement, platform-fee separation, idempotency, reversals, corrections, disputes, reconciliation, financial reporting, pilot qualification, controlled rollout, Production activation gates, and legal and financial review.

The directional future policy is:

```text
Base Driver Incentive
+ Material Recovery Offer
+ Optional Owner Tip
= Total Driver Incentive Obligation

Platform Fee remains separately governed
```

This formula is not authority to change current calculations or create a current obligation. Sprint 3 requires separate architecture, Product Decisions, schema and migration approval, Level 3 implementation validation, Level 4 release validation, and explicit Founder Production authorization.

## 5. Required sequence

The intended roadmap sequence is:

1. complete geofencing, validation, documentation, and Founder acceptance;
2. Phase 5 Sprint 3 — Two-Factor Authentication;
3. Phase 5 Sprint 4 — Internal Participant Communications, as planned future direction until separately governed;
4. Phase 6 Sprint 1 — Material Quantity and Measurement Foundation;
5. Phase 6 Sprint 2 — Facility Material Recovery Offers;
6. Phase 6 Sprint 3 — Recovery Offer Settlement and Pilot Readiness; and
7. later external communication channels, including SMS, email, push, webhooks, and related adapters.

No later item begins merely because an earlier item appears in this sequence. Geofence acceptance and each later sprint retain their own authority and release gates.

## 6. Strategic rationale and claim limits

Verified material quantity can provide a governed foundation for future Facility capacity management, material availability, Driver compensation, recovery-market pricing, diversion and reuse reporting, environmental-impact calculations, regional material-flow intelligence, government and grant reporting, recovered-material marketplace development, and Construction Circular Economy Intelligence.

These are future uses, not present capabilities or claims. Environmental, scientific, financial, grant, and commercial statements must be supported by traceable evidence, qualified methodology, appropriate review, and truthful confidence classification before use.

## 7. Required future governance

Before implementation, the applicable sprint must define and approve:

- canonical data ownership, lifecycle, correction, and retention rules;
- authorization and minimum-necessary participant/Admin access;
- architecture and source-of-truth boundaries;
- schema and migration design where applicable;
- evidence, measurement-confidence, unit, and material rules;
- idempotency, replay, dispute, and reconciliation behavior;
- legal, tax, promotional, weights-and-measures, privacy, security, and financial requirements appropriate to the scope;
- English/Spanish, accessibility, mobile, and operational-support expectations;
- implementation validation and release gates; and
- explicit Founder authority for Production activation.

## 8. Related documents

- [Sprint Roadmap](../project/sprint-roadmap.md)
- [Epic Roadmap](../project/epic-roadmap.md)
- [Project Context](../project/project-context.md)
- [Material Recovery Exchange](./material-recovery-exchange.md)
- [Data Strategy](./data-strategy.md)

## 9. Change history

| Version | Date | Change |
| --- | --- | --- |
| 1.0 | 2026-08-04 | Recorded the Founder-approved Phase 6 material quantity, measurement, Recovery Offer, and future settlement direction without granting implementation or Production authority. |
