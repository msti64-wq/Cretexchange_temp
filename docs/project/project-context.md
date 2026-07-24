# CreteXchange Project Context

This document is the onboarding summary for CreteXchange. It helps a new developer, AI assistant, or Codex session understand the current project state quickly, but it does not replace the authoritative architecture, standards, product, or protocol documents.

[Platform Vision](../vision/platform-vision.md) defines why CreteXchange exists.
[Platform Strategy](../vision/platform-strategy.md) defines the authoritative long-term strategic roadmap.
[Project Context](./project-context.md) defines the current implementation state.
[Business Model](../business/business-model.md) describes current and possible future business models without changing implementation.
[Customer Value Framework](../business/customer-value-framework.md) guides customer and value analysis for significant proposals.
[Investment Thesis](../business/investment-thesis.md) presents a qualified strategic narrative for external and internal audiences.
[Research Program](../research/README.md) defines proposed research, validation, and grant-readiness work without changing current implementation.

## 1. Project Summary

CreteXchange is a configurable construction and industrial materials exchange platform connecting drivers, contractors, yard owners, recycling facilities, disposal sites, and future material recovery partners.

The current production foundation began with concrete washout workflows. Broader material recovery and recycling operations are strategic direction or approved roadmap work only where explicitly identified by current Product Decisions and sprint documents.

## 2. Current Product Direction

CreteXchange is being built as:

- a construction operations platform
- a material recovery exchange
- a marketplace before payment processor
- an owner-configured yard network
- a driver material matching system
- an operational transparency layer
- a financially conservative reporting system
- a scalable industrial recycling ecosystem

These statements describe current product direction, not a claim that every broader marketplace or intelligence capability is implemented. Long-term evolution into the Construction Circular Economy Intelligence Platform is governed by Platform Strategy.

## 3. Current Phase

- Phase 1 Financial Foundation and Dashboard Reconciliation is complete.
- Governance Framework v1.0 is complete.
- Phase 2 is in progress.
- Sprint 2.1 is complete. Current sprint scope is defined by `docs/project/sprints/sprint-2.2.md` and remains separate from the long-term strategic roadmap.

## 4. Governing Documentation Hierarchy

Authoritative order:

1. `docs/vision/platform-vision.md`
2. `docs/vision/platform-strategy.md`
3. `docs/project/project-context.md` - canonical current-state summary within the hierarchy
4. `docs/standards/cretexchange-platform-standards.md`
5. CTX-ARCH documents
6. `docs/product/product-decisions.md`
7. `docs/product/data-strategy.md`
8. `docs/business/business-model.md` and related business documents
9. `docs/development-protocol.md`

This file is an onboarding guide, not the final authority when detailed architecture exists.

Platform Vision is the strategic North Star.
Platform Strategy is the authoritative long-term strategic roadmap.
Project Context defines the current product and implementation state.
Business documents guide business-model and customer-value evaluation but do not redefine the current state, override architecture, or authorize implementation.

Related references:

- `docs/vision/platform-vision.md`
- `docs/vision/platform-strategy.md`
- `docs/product/data-strategy.md`
- `docs/business/business-model.md`
- `docs/business/customer-value-framework.md`
- `docs/business/investment-thesis.md`
- `docs/research/README.md`
- `docs/development-protocol.md`
- `docs/standards/cretexchange-platform-standards.md`

## 5. Architecture Library

### CTX-ARCH-001 - Financial Architecture & KPI Specification
Defines the financial lifecycle, billing rules, owner receivables, driver incentives, platform revenue, wallet balances, Stripe/payment lifecycle, dashboard KPIs, reporting, and reconciliation. It is the authoritative source for financial behavior and KPI meaning.

### CTX-ARCH-002 - Owner Operations Architecture
Defines owner-facing workflows, location configuration, materials, capacity, compliance, operating rules, and owner KPI behavior. It is the authority for owner operational behavior.

### CTX-ARCH-003 - Driver Operations Architecture
Defines driver workflows, location discovery, check-in lifecycle, activity history, rewards, wallet visibility, and driver KPI behavior. It is the authority for driver-facing operations.

### CTX-ARCH-004 - Admin Operations Architecture
Defines admin oversight, support, reconciliation, configuration, auditability, compliance, and platform control behavior. It is the authority for admin-facing operations.

### CTX-ARCH-005 - Material Management Architecture
Defines the global material catalog, financial direction, settlement models, pricing, capacity, compliance, and material KPI behavior. It is the authority for material-specific behavior.

### CTX-ARCH-006 - Driver Incentive and Financial Settlement Architecture
Defines the server-accepted immutable driver-incentive snapshot, approval-time payment obligation, owner-charge formula, settlement exclusivity, wallet/Stripe relationship, idempotency, recovery, historical treatment, and financial reporting contract. It specializes CTX-ARCH-001 for driver incentive and settlement behavior. Active PD-045 makes the Driver Wallet the canonical driver settlement ledger and Stripe Connect the external payout rail. Existing mixed Stripe-plus-wallet approval behavior is not the approved target and requires separately authorized remediation.

## 6. Platform Standards

CTX-STD-001 is the mandatory engineering and development standard for the platform. It establishes:

- architecture before implementation
- configuration before customization
- canonical helpers
- no duplicate financial logic
- no hardcoded materials or pricing
- documentation before financial or architectural changes
- source-of-truth verification before implementation

## 7. Development Protocol

The Development Protocol is the execution workflow for every engineering task. It requires:

- mandatory preflight
- architecture discovery
- source-of-truth verification
- validation with `npm run check` and `npm run build`
- separate documentation/runtime commits when practical
- completion reporting

## 8. Financial Model Summary

CTX-ARCH-001 defines a financially conservative model:

- pending review is operational, not receivable
- approved, verified, and completed billable washouts create receivables
- driver incentive = `payments.amount`
- platform fee = `payments.processing_fee`
- owner charge = `amount + processing_fee`
- wallet balance is ledger-based, not activity earnings
- activity, payments, and wallet ledgers are separate systems of record
- accepted driver incentive is frozen at the Server-Accepted Check-In Submission under CTX-ARCH-006
- owner charge uses the frozen incentive plus the applicable platform fee exactly once
- one driver incentive may create only one withdrawable economic entitlement

## 9. Owner Operations Summary

CTX-ARCH-002 defines owners as operators of facilities, not just locations. Owners configure locations, materials, pricing, capacity, rules, hours, instructions, and compliance. The owner dashboard separates pending review from current receivables, and owner operations feed driver matching and reporting.

## 10. Driver Operations Summary

CTX-ARCH-003 defines driver workflows as mobile-first. Drivers use one persisted active material selection, server-filtered eligible location discovery, check-in, photo capture, and activity submission. Activity earnings, paid history, and wallet balance remain separate, and rewards are additive rather than replacements for incentives.

## 11. Platform Operations Center Summary

CTX-ARCH-004 defines admin as the platform control tower. The preferred architectural term for the evolving administrator intelligence experience is the **Platform Operations Center**; existing implementation names may continue to use “Admin Dashboard” until a separately approved UX cleanup. Admins oversee users, owners, drivers, locations, billing, reconciliation, materials, rewards, compliance, feature flags, and reporting. Administrative actions require auditability and separation of duties.

## 12. Material Management Summary

CTX-ARCH-005 defines a global material catalog and owner/location material configuration. The current approved phases provide operational facility acceptance configuration plus one persisted driver active system-material intent. Locations consume that same intent through server-side filtering to facilities with an active matching association; facility-scoped custom materials remain non-global. Existing washout locations are backfilled with Concrete Washout without changing activities or financial records. Financial directions such as `OWNER_PAYS_PROVIDER`, `PROVIDER_PAYS_OWNER`, `NO_CHARGE`, and `QUOTE_REQUIRED`, settlement models, material pricing, capacity, and material KPIs remain separately governed and are not enabled by this phase.

## 13. Current Technical Stack

- React
- Vite
- TypeScript
- Express
- Drizzle ORM
- PostgreSQL / Neon
- Stripe
- Railway
- Tailwind / Radix UI
- React Query
- JWT/session auth as currently implemented

## 14. Current Product Status

Completed areas:

- driver check-in and activity history
- owner location management
- owner dashboard financial KPI model
- admin billing preview
- financial architecture documented
- owner, driver, admin, and material architectures documented
- platform standards documented
- development protocol updated
- Administration Repository implementation and production hardening are **Engineering Complete**. Repository-local validation passed with 19 focused tests passing, 0 failing, and 1 PostgreSQL integration test skipped because an isolated validation database is unavailable. Its release disposition is **Validation Pending — External Environment Required**; it does not block continued platform development, but production deployment remains gated by [AR-RG-001](./sprint-roadmap.md#ar-rg-001--administration-repository-external-validation-gate).

Known caution:

- driver wallet and Stripe payout behavior should be treated separately from activity earnings and receivables
- historical bad financial rows may require reconciliation and should not be charged without review
- active PD-045 selects the Driver Wallet as the canonical settlement ledger and Stripe Connect as the external payout rail; current mixed behavior requires separately approved remediation

## 15. Current Sprint Roadmap

The [Sprint 2.1](./sprints/sprint-2.1.md) closeout is complete: Driver Rewards, Driver Dashboard Intelligence, Owner Operational Intelligence, and the [Platform Operations Center](./sprints/sprint-2.1.4.md) were delivered within approved scope. [Sprint 2.2 — MVP Operational Readiness](./sprints/sprint-2.2.md) is the current delivery focus for first production-user readiness.

[Sprint Roadmap](./sprint-roadmap.md) provides directional milestone sequencing, and [Epic Roadmap](./epic-roadmap.md) organizes related bodies of work. Neither document authorizes implementation or overrides the governing documentation hierarchy.

Sprint 2.1 focuses on Driver Experience and Operational Intelligence while reusing existing production infrastructure. Its documented progression includes:

- completed Driver Rewards Experience
- completed Driver Dashboard Intelligence
- completed Owner Operational Intelligence
- completed Platform Operations Center foundation
- MVP Operational Readiness for first production users

This summary does not change sprint scope. Detailed milestones, exclusions, and validation requirements remain governed by the sprint document. Material Marketplace capabilities remain product direction and backlog unless separately approved.

## 16. Future Strategic Direction

Platform Strategy defines the directional progression from Verified Transactions through Verified Data, Operational Intelligence, a Recovered-Material Marketplace, Enterprise SaaS, Government Intelligence, and the future Construction Circular Economy Index. This progression is not an automatic sprint sequence and does not change the active Sprint 2.2 roadmap.

Those layers are strategic direction only. They do not represent current implementation, approved sprint work, commercial commitments, or available product capabilities.

The staged [Long-Term Roadmap](../vision/long-term-roadmap.md), [Platform Definition](../vision/construction-circular-economy-intelligence-platform.md), and [Research Roadmap](../research/research-roadmap.md) provide supporting detail. Research plans are proposed work, not implemented models, scientific results, or production features.

The current launch model remains unchanged: drivers locate participating facilities, document eligible drops, facilities verify eligible transactions, driver rewards and the current transaction workflow remain the immediate focus, and the current $5 platform fee applies per verified load drop under governing architecture and implemented rules.

## 17. Product Principles

- marketplace before payment processor
- configuration before code
- architecture before implementation
- financially conservative reporting
- operational and financial separation
- material economics are configurable
- platform fee independent of financial direction
- dashboards must use canonical sources
- no hardcoded materials
- no duplicate billing math

## 18. Open Design Decisions

- enterprise pricing and subscription tiers
- material-specific tax handling
- direct settlement evidence requirements
- dispute resolution workflow
- driver/company account model
- mobile offline workflow
- owner invoicing support
- automated collection policy
- failed payment fee enforcement
- AI recommendation engine

## 19. New Chat Kickoff Prompt

> We are continuing development of CreteXchange. Read Platform Vision for the enduring North Star, Platform Strategy for long-term direction, and Project Context for current implementation and sprint context. Follow CTX-STD-001, the applicable CTX-ARCH documents, Product Decisions, Data Strategy, relevant Business Architecture documents, and the Development Protocol. Do not treat future strategic capabilities as implemented or expand current sprint scope without approval.

## 20. Maintenance Rules

- Update this document when project phase, sprint roadmap, or high-level product direction changes.
- Do not duplicate detailed architecture.
- Do not duplicate Platform Strategy; reference it for long-term direction.
- Clearly distinguish current implementation from future strategy.
- Link to authoritative documents instead.
- Keep it concise enough for fast onboarding.

## 21. Facility Operational Access Policy

[PD-050 — Facility Operational Access and Billing Readiness](../product/PD-050-facility-operational-access-and-billing-readiness.md) is authoritative for approved Facility operational location access: saved-payment-method readiness is separate from location-management authorization. The implementation remains pending the authorized Level 3 remediation; PD-050 does not change financial behavior.

## 22. Canonical Financial Batch Governance

[CTX-ARCH-007](../architecture/CTX-ARCH-007-canonical-financial-batch-architecture.md) is the canonical non-executing financial batch architecture, and [PD-053](../product/PD-053-canonical-financial-batch-lifecycle-and-approval-policy.md) is Active for assisted-pilot batch policy. Phase 3B implementation remains pending. Phase 3A financial execution remains disabled; no batch construction, review, or approval authorizes collection, settlement, wallet entitlement, or provider execution.
