# Sprint 2.2 — MVP Operational Readiness

**Status:** Active / Next
**Validation Level:** Risk-based; Level 2 by default, raised when scope affects security, privacy, payments, wallets, Stripe, database integrity, migration, deployment, or release reliability.
**Scope:** First production-user readiness

## 1. Objective

Sprint 2.2 prepares CreteXchange to successfully serve its first production users. Its purpose is to increase confidence that the next driver can onboard, the next facility can become operationally ready and discoverable, and the next eligible transaction can complete through the verified workflow.

It is a readiness sprint, not a major new-capability sprint.

## 2. MVP Decision Filter

Every proposed task must answer:

> **“Does this increase the probability that we successfully onboard the next driver, the next facility, or complete the next verified transaction?”**

If the answer is no, defer the work unless a higher-priority reliability, security, privacy, financial-integrity, or release requirement requires it.

## 3. Guiding Principles

- Prefer completion, clarity, reliability, and operational support over feature expansion.
- Preserve the current verified-transaction foundation and configuration-first workflows.
- Reuse canonical APIs, helpers, and role-scoped data before proposing new infrastructure.
- Keep field workflows mobile-first, understandable, and resilient to expected pilot conditions.
- Maintain strict separation between operational status and payment, billing, wallet, Stripe, or settlement state.
- Use the least-cost validation that provides proportionate confidence; raise validation for high-risk changes.
- Do not represent future marketplace, regional, government, or CCEI capabilities as current MVP functionality.

## 4. Success Criteria

Sprint 2.2 is complete when the approved readiness work demonstrates that:

- a new driver can complete the approved onboarding and account-readiness path;
- a new facility/owner can complete the approved configuration and visibility path;
- drivers can find an eligible, driver-accessible facility using the current discovery workflow;
- an eligible transaction can complete its existing verified operational lifecycle with clear status and recovery guidance;
- pilot-facing screens have appropriate loading, unavailable, empty, validation, and error states;
- operational support can identify and triage the expected onboarding, facility, and verification exceptions using existing authorized tools;
- no new financial, settlement, wallet, Stripe, accounting, or billing behavior is introduced without separate approval; and
- each completed batch receives risk-based validation and a documented handoff.

## 5. Planned Phases

### Phase 1 — Driver Onboarding and Account Readiness

Audit and strengthen the existing driver registration, login, profile, required acknowledgements, and account-readiness experience for pilot clarity and recoverability. This phase does not authorize Stripe, wallet, or settlement redesign.

#### Engineering Closeout — Pilot Visual Validation Pending

**Disposition:** Engineering Complete — Pilot Visual Validation Pending.

Phase 1 engineering is complete. The internal implementation work packages used to deliver this existing phase established the following evidence without creating additional governing sprint phases:

- **Server-authoritative Driver readiness** — protected operational submissions require the Driver role, an owned Driver profile, required profile completeness, current terms acceptance, and a valid active system material. Commit: `93a07912637a42bfbe3cbf532346d1b1d2059421`.
- **Server-authoritative facility submission eligibility** — current and legacy submission paths enforce active and visible facility eligibility, the Driver's persisted material association, stale/direct facility-ID denial, and a safe non-disclosing recovery contract. Commit: `657186cc7ccc64d25d4612b8547d79c2b307524b`.
- **Truthful onboarding and readiness UX** — the Driver experience provides action-specific readiness CTAs, evidence-based GPS presentation, material-filtered recommendations, distinct unavailable versus valid zero/empty states, and operational-first configured-incentive presentation. Commit: `74db2e7a5a13f52606bdbaf717900ab899ddac46`.
- **English/Spanish onboarding and recovery parity** — registration, login, readiness, terms guidance, material recovery, Check-In, photo/upload, and submission recovery are localized. Driver errors use structured safe presentation; HTTP 401 revalidates root authentication. Legal-document content and acceptance behavior remain unchanged. Commit: `0cdd5e5fe5ea39ab1f131089cc062b86ec492080`.

Validation evidence for the completed Phase 1 engineering work includes focused tests across the internal work packages, non-incremental TypeScript validation, Production builds, a full suite with 119 passing tests, and Production health confirmation after each release. The database remained connected and financial execution remained disabled. No schema, migration, financial-calculation, legal-document, or Production-data change was introduced by this Phase 1 work.

**Remaining pilot/release checkpoint:** authenticated Driver visual validation remains outstanding because no controlled authenticated Driver account was available. No uncontrolled Production identity was used. Phase 1 must not be represented as fully pilot-validated or fully complete until that evidence is obtained.

Phase 2 — Facility Onboarding and Marketplace Readiness may begin because Phase 1 engineering is complete. The pending authenticated visual validation remains tracked as a pilot/release checkpoint.

### Phase 2 — Facility Onboarding and Marketplace Readiness

Audit and strengthen the existing owner/facility configuration, active/visible state, discovery eligibility, and operational instructions needed for a facility to be ready for pilot use.

### Phase 3 — Verified Transaction Completion

Audit the existing check-in, evidence, submission, verification, and activity-status experience for user-visible blockers, clear next steps, and operational recoverability. Financial completion remains outside this phase unless separately authorized.

### Phase 4 — Pilot Operations and Release Readiness

Prepare approved pilot support procedures, role-appropriate operational checks, known-limit documentation, and a proportionate release-readiness checklist. Deployment, migration, financial, security, or privacy changes require their applicable higher-risk protocol.

## 6. Scope Boundaries

Sprint 2.2 does not authorize:

- major Construction Circular Economy Intelligence Platform expansion;
- recovered-material marketplace expansion, listings, reservations, or new material commerce flows;
- enterprise, regional, government, research, or Construction Circular Economy Index implementation;
- new pricing, billing, payment, wallet, Stripe, Treasury, accounting, or settlement behavior;
- schema redesign, migrations, or broad platform rewrites; or
- unapproved backend endpoints or duplicate business logic.

Platform Vision and Platform Strategy remain the long-term direction. Sprint 2.2 preserves that architecture by strengthening the verified operational foundation rather than implementing future strategic layers prematurely.

## 7. Validation Approach

Use the [CreteXchange Development Protocol](../../development-protocol.md) and assign validation before each batch:

- Level 1 for isolated copy, layout, or documentation corrections;
- Level 2 for feature-area onboarding, facility-readiness, and verified-workflow changes;
- Level 3 for authentication, authorization, privacy, payments, wallets, Stripe, settlement, schema, migration, deployment, or release-sensitive work.

Run focused tests, type checks, builds, diff review, and authenticated/manual workflow checks when appropriate to the approved change. Do not rerun broad commands when prior valid results remain unaffected; do not reduce safeguards for high-risk work.

## 8. Architecture References

- [Platform Vision](../../vision/platform-vision.md)
- [Platform Strategy](../../vision/platform-strategy.md)
- [Project Context](../project-context.md)
- [Platform Standards](../../standards/cretexchange-platform-standards.md)
- [Product Decisions](../../product/product-decisions.md)
- [Data Strategy](../../product/data-strategy.md)
- Applicable CTX-ARCH documents, especially Driver, Owner, Admin, Financial, and settlement architecture where relevant

## 9. Delivery Boundary

This document plans Sprint 2.2. It does not itself authorize implementation, production deployment, financial changes, external claims, or expansion of the MVP scope.
