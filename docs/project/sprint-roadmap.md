# CreteXchange Sprint Roadmap

## Purpose

This roadmap provides a high-level sequence of completed, active, and planned CreteXchange delivery milestones.

It is directional: individual sprint documents define approved scope; future sprint names and ordering may change through Product Decisions; and a roadmap entry does not authorize implementation outside an approved sprint. Current production capability must remain distinct from future strategy.

## Status Labels

- **Complete:** Delivered and recorded in the relevant sprint closeout.
- **Active / Next:** The current approved implementation focus.
- **Planned:** Expected direction that requires a separately approved sprint.
- **Future / Exploratory:** Strategic direction, research, or opportunity that is not approved implementation work.

## Completed Milestones

### Sprint 2.1.1 — Driver Rewards

**Status:** Complete

- Rewards summary and current drawing
- Ticket ledger and reward notifications
- Driver-safe drawing history and fulfillment status

### Sprint 2.1.2 — Driver Dashboard Intelligence

**Status:** Complete

- Account readiness, wallet preview, notification summary, and rewards summary
- Recommended location and nearby-incentive intelligence
- Canonical Stripe status convergence and related hardening

### Sprint 2.1.3 — Owner Operational Intelligence

**Status:** Complete

- Owner Dashboard Intelligence
- Owner Location Intelligence
- Owner Driver Intelligence
- Owner Reporting Intelligence

See [Sprint 2.1](./sprints/sprint-2.1.md) for the closeout record.

### Sprint 2.1.4 — Admin Intelligence Foundation / Platform Operations Center

**Status:** Complete

Delivered Platform Operations Center phases:

- Phase 1 — Platform Growth — complete;
- Phase 2 — Trust & Verification — complete;
- Phase 3 — Platform Activity — complete; and
- Phase 4 — Marketplace Health — complete.

See [Sprint 2.1.4 — Admin Intelligence Foundation](./sprints/sprint-2.1.4.md). The preferred architectural term is Platform Operations Center. The delivered scope is operational-only and did not authorize wallet, settlement, Stripe, accounting-ledger, or Treasury implementation.

## Active / Next Milestone

### Sprint 2.2 — MVP Operational Readiness

**Status:** Active / Next

Sprint 2.2 prepares CreteXchange for its first production users by improving onboarding, facility readiness, verified-transaction completion, and pilot operational support. It does not authorize major new platform capabilities or CCEI expansion.

See [Sprint 2.2 — MVP Operational Readiness](./sprints/sprint-2.2.md).

## Planned Milestones

The following are cautious, nonbinding directions. They require separately approved scope, architecture review, and validation before implementation.

### Financial Architecture Implementation

**Status:** Planned

Governed by [PD-045](../product/product-decisions.md#pd-045---canonical-driver-settlement-rail) and [CTX-ARCH-006](../architecture/driver-incentive-and-financial-settlement-architecture.md).

Expected focus includes immutable incentive snapshots, owner-approval obligations, wallet-authoritative settlement ledger behavior, Stripe payout rail integration, idempotency and recovery, billing/reporting/KPI alignment, and historical qualification.

### Recovered-Material Marketplace Foundation

**Status:** Planned

Expected focus includes broader material categories, listings, buyers and sellers, inventory and availability, matching and discovery, marketplace trust and verification, and approved transaction or reservation workflows.

### Enterprise and Contractor Intelligence

**Status:** Planned

Expected focus includes project-level material tracking, procurement intelligence, diversion and reuse reporting, multi-project administration, enterprise integrations, and contractor/facility network management.

### Regional Intelligence

**Status:** Future / Exploratory

Expected focus includes aggregated material-flow insight, capacity and infrastructure gaps, regional participation, and planning analytics.

### Government Intelligence

**Status:** Future / Exploratory

Expected focus includes municipality, county, state, and federal reporting; policy-support analytics; privacy-governed public intelligence; and APIs or contracted reporting.

### Construction Circular Economy Index

**Status:** Future / Exploratory

Expected focus includes transparent methodology, verified and modeled data classifications, regional and industry benchmarking, scorecards, reports, and research products.

## Strategic Progression

```text
Verified Transactions
→ Verified Data
→ Operational Intelligence
→ Recovered-Material Marketplace
→ Enterprise Intelligence
→ Regional and Government Intelligence
→ Construction Circular Economy Index
```

This sequence follows [Platform Strategy](../vision/platform-strategy.md). It is not a claim that future capabilities are implemented or a replacement for approved sprint scope.

## Dependencies and Gates

- Financial implementation requires PD-045 and CTX-ARCH-006 compliance.
- Government and research products require Data Strategy privacy, authorization, aggregation, methodology, and governance controls.
- Environmental claims require traceable, qualified evidence and documented methodology.
- Marketplace expansion should follow validation of the verified transaction network.
- Future intelligence must not expose confidential company-specific data without authorization.

## Authority Boundary

This roadmap guides sequencing only. It does not override [Platform Vision](../vision/platform-vision.md), [Platform Strategy](../vision/platform-strategy.md), [Project Context](./project-context.md), Platform Standards, CTX-ARCH documents, or Product Decisions.
