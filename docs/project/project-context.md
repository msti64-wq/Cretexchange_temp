# CreteXchange Project Context

This document is the onboarding summary for CreteXchange. It helps a new developer, AI assistant, or Codex session understand the current project state quickly, but it does not replace the authoritative architecture, standards, product, or protocol documents.

## 1. Project Summary

CreteXchange is a configurable construction and industrial materials exchange platform connecting drivers, contractors, yard owners, recycling facilities, disposal sites, and future material recovery partners.

The platform began with concrete washout workflows and is expanding into broader material recovery and recycling operations.

## 2. Product Vision

CreteXchange is being built as:

- a construction operations platform
- a material recovery exchange
- a marketplace before payment processor
- an owner-configured yard network
- a driver material matching system
- an operational transparency layer
- a financially conservative reporting system
- a scalable industrial recycling ecosystem

## 3. Current Phase

- Phase 1 Financial Foundation and Dashboard Reconciliation is complete.
- Governance Framework v1.0 is complete.
- Phase 2 Owner Operations / Material Marketplace work is beginning.

## 4. Governing Documentation Hierarchy

Authoritative order:

1. `docs/README.md`
2. `docs/project/project-context.md`
3. `docs/standards/cretexchange-platform-standards.md`
4. CTX-ARCH documents
5. `docs/product/product-decisions.md`
6. `docs/development-protocol.md`

This file is an onboarding guide, not the final authority when detailed architecture exists.

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

## 9. Owner Operations Summary

CTX-ARCH-002 defines owners as operators of facilities, not just locations. Owners configure locations, materials, pricing, capacity, rules, hours, instructions, and compliance. The owner dashboard separates pending review from current receivables, and owner operations feed driver matching and reporting.

## 10. Driver Operations Summary

CTX-ARCH-003 defines driver workflows as mobile-first. Drivers use sticky job type selection, material selection, eligible location discovery, check-in, photo capture, and activity submission. Activity earnings, paid history, and wallet balance remain separate, and rewards are additive rather than replacements for incentives.

## 11. Admin Operations Summary

CTX-ARCH-004 defines admin as the platform control tower. Admins oversee users, owners, drivers, locations, billing, reconciliation, materials, rewards, compliance, feature flags, and reporting. Administrative actions require auditability and separation of duties.

## 12. Material Management Summary

CTX-ARCH-005 defines a global material catalog and owner/location material configuration. Materials can be configured with financial directions such as `OWNER_PAYS_PROVIDER`, `PROVIDER_PAYS_OWNER`, `NO_CHARGE`, and `QUOTE_REQUIRED`. Settlement models include platform managed, direct settlement, ACH, check, cash, invoice, purchase order, and existing account. The default platform fee is $5.00 per completed material transaction unless exempted, and platform revenue is independent of material economics. Material KPIs apply across owner, driver, admin, and reporting dashboards.

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

Known caution:

- driver wallet and Stripe payout behavior should be treated separately from activity earnings and receivables
- historical bad financial rows may require reconciliation and should not be charged without review

## 15. Phase 2 Sprint Roadmap

### Sprint 2.1 - Material Catalog Foundation
- global material catalog
- categories
- units of measure
- material attributes
- financial direction
- settlement model
- platform fee policy

### Sprint 2.2 - Owner Material Configuration
- owner selects accepted materials
- owner defines incentives, acceptance fees, settlement method, instructions, restrictions, capacity

### Sprint 2.3 - Location Material Configuration
- per-location material availability
- hours
- capacity
- temporary suspension
- material-specific instructions

### Sprint 2.4 - Driver Material Workflow
- driver selects job type/material
- eligible location matching
- material-aware check-in
- material-specific photo requirements

### Sprint 2.5 - Material-Aware Dashboards
- owner material KPIs
- driver material KPIs
- admin material KPIs
- reporting by material

## 16. Long-Term Vision

CreteXchange may expand into:

- quarries
- landfills
- transfer stations
- recycling centers
- aggregate plants
- asphalt plants
- municipal recycling
- environmental cleanup
- enterprise accounts
- ERP integration
- scale tickets
- electronic manifests
- AI material recommendations
- capacity forecasting
- regional marketplace analytics

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

> We are continuing development of CreteXchange. Use `docs/project/project-context.md` as onboarding context and follow the documentation hierarchy. Before making recommendations or implementation plans, treat CTX-STD-001, the applicable CTX-ARCH documents, `docs/product/product-decisions.md`, and `docs/development-protocol.md` as authoritative. We are currently beginning Phase 2 material marketplace development.

## 20. Maintenance Rules

- Update this document when project phase, sprint roadmap, or high-level product direction changes.
- Do not duplicate detailed architecture.
- Link to authoritative documents instead.
- Keep it concise enough for fast onboarding.

