# PD-050 — Facility Operational Access and Billing Readiness

**Status:** Active
**Date:** 2026-07-14
**Decision type:** Product policy

## Decision

CreteXchange distinguishes operational authorization from financial readiness for participating Facilities.

An approved, operationally complete Facility may create, edit, activate, and manage its participating locations without a saved payment method. A saved payment method is not an operational prerequisite.

Operational authorization depends on:

- authenticated ownership;
- approved Facility status;
- required profile completion;
- ownership validation; and
- existing operational eligibility rules.

Operational authorization must not be used as a proxy for financial authorization unless a future Product Decision explicitly authorizes that relationship.

## Background

Earlier platform concepts included recurring location fees, and a saved payment method was used to gate location creation. That approach was aligned with the then-current billing flow.

The MVP has since evolved toward low-friction Facility participation, marketplace adoption, and verified operational activity before financial collection. The owner-location access review identified the saved-payment-method gate as legacy billing behavior rather than an active, approved product policy. This decision updates the product policy without criticizing the earlier implementation or its historical context.

## Policy Statement

### Operational Readiness

Operational Readiness governs whether a participating Facility may:

- create locations;
- edit locations;
- activate and configure locations; and
- participate in approved operational workflows.

### Financial Readiness

Financial Readiness governs:

- billing and invoicing;
- collections and subscriptions;
- payment methods and Stripe;
- wallets and Treasury;
- settlements; and
- future financial operations.

These are separate policy domains. Location-management access does not itself grant billing, payment, collection, wallet, Stripe, Treasury, or settlement authority.

## Scope

This decision applies only to operational authorization for participating Facilities and their locations.

It does not authorize changes to billing, Stripe, wallets, Treasury, settlements, collections, subscriptions, financial calculations, or incentive calculations. Those domains remain governed by the applicable financial architecture and future Product Decisions.

## Rationale

Facilities should be able to experience operational value before completing financial onboarding whenever platform integrity permits. Separating operational readiness from financial readiness:

- reduces avoidable onboarding friction;
- improves Facility adoption;
- supports pilot success;
- improves Time to First Verified Activity (TFVA); and
- aligns with the Facility journey and operational boundaries in [CTX-UX-003](../ux/CTX-UX-003-first-time-user-journey-and-pilot-readiness.md).

This approach supports the current marketplace direction: enable an approved Facility to configure a usable participating location, allow Drivers to discover eligible locations, and preserve verification quality and operational trust.

## Guardrails

Implementation of this decision must preserve:

- authentication;
- ownership validation;
- administrative approval;
- address validation;
- location eligibility;
- active and visible controls;
- the verification workflow; and
- operational auditability.

It must not introduce hidden bypasses, administrative shortcuts, financial side effects, or weakened authorization. Administrative tools must not become an undocumented alternative to the canonical operational authorization rule.

## Future Financial Enforcement

The following decisions are intentionally deferred and require separate Product Decisions:

- when payment information becomes required;
- billing-cycle enforcement;
- collections and invoicing behavior;
- subscription lifecycle;
- failed-payment handling; and
- treatment of suspended Facilities.

This decision does not select a later financial enforcement event and does not change existing financial behavior.

## Impact

### Drivers

Drivers can more readily discover an approved, active, visible participating location once the Facility completes operational setup. Existing eligibility, evidence, and verification safeguards remain in force.

### Facilities

Facilities can configure and operate a participating location before being asked to complete financial readiness steps that are not required for location management.

### Platform Operations Center

Operators retain approved administrative, support, and location-eligibility controls. Operational readiness and financial readiness should be presented as separate states rather than implied by one another.

### Pilot onboarding and marketplace growth

This removes an avoidable blocker from the Facility path to first-location configuration, improves the probability of completing a pilot workflow, and supports marketplace participation without representing registration or configuration as guaranteed revenue.

### TFVA and operational trust

Reducing the first-location setup blocker can shorten TFVA while preserving required profile, eligibility, evidence, review, and verification controls. Verification remains operational and is not payment, settlement, certification, or a guarantee of material quality.

### Future Construction Circular Economy Intelligence Platform evolution

Trusted operational participation and verified activity remain the foundation for future intelligence. This decision does not claim that future marketplace, enterprise, government, or Construction Circular Economy Intelligence capabilities are implemented.

## Relationship to Existing Documents

This decision is consistent with:

- [Project Context](../project/project-context.md), which identifies the current MVP operational foundation and financial separation;
- [CTX-UX-003](../ux/CTX-UX-003-first-time-user-journey-and-pilot-readiness.md), which defines the first-time Facility journey and pilot-readiness boundaries;
- [CTX-ARCH-001 — Financial Architecture and KPI Specification](../architecture/financial-architecture-and-kpi-specification.md), which governs financial lifecycle and reporting behavior;
- [CTX-ARCH-006 — Driver Incentive and Financial Settlement Architecture](../architecture/driver-incentive-and-financial-settlement-architecture.md), which governs driver incentive, payment-obligation, wallet, payout, and settlement boundaries; and
- [Canonical Driver Settlement Rail](./product-decisions.md#pd-045---canonical-driver-settlement-rail) (PD-045), which governs the driver settlement rail.

PD-050 complements these financial authorities. It does not replace them, alter their financial contract, or represent runtime financial remediation as complete.

## Implementation Guidance

Implementation should:

- replace the legacy payment-method location gate with canonical operational authorization;
- maintain one canonical authorization helper used by client and server consumers;
- eliminate inconsistent client/server and location-lifecycle enforcement;
- avoid schema changes unless genuinely required; and
- preserve all financial systems unchanged.

Any implementation must use Level 3 validation because it changes shared authorization behavior. It must specifically demonstrate that no payment, wallet, Stripe, Treasury, billing, settlement, or incentive mutation is introduced by operational location access.

## Out of Scope

This decision does not authorize:

- Stripe redesign;
- billing redesign;
- wallet redesign;
- Treasury redesign;
- settlement redesign;
- subscription redesign;
- financial analytics; or
- marketplace pricing.

## Success Criteria

After implementation:

- approved Facilities can configure participating locations;
- Drivers can discover eligible participating locations;
- operational workflows remain secure and ownership-scoped;
- financial behavior remains unchanged; and
- existing billing architecture remains intact.

## Decision Boundaries

PD-050 governs product policy for Facility operational location access. It does not itself implement the policy, alter financial architecture, approve production data changes, or authorize deployment.
