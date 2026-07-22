# Architecture

## Purpose

This section documents the technical architecture of CreteXchange.

[Platform Strategy](../vision/platform-strategy.md), [Data Strategy](../product/data-strategy.md), [Business Model](../business/business-model.md), and [Customer Value Framework](../business/customer-value-framework.md) provide long-term strategic, data, and customer-value context. CTX-ARCH documents remain authoritative for implementation within their domains; these references do not redesign architecture, authorize sprint work, or imply that future capabilities are implemented.

## What Belongs Here

- System architecture
- Frontend architecture
- Backend architecture
- Mobile architecture
- Deployment architecture
- Infrastructure notes
- Security architecture

## What Does Not Belong Here

- Product roadmap or feature prioritization
- UI design patterns or visual standards
- API endpoint contracts as implementation references
- Changelog entries or release summaries
- Active development notes that belong in engineering docs

## Canonical Architecture Documents

| Document ID | Title | Domain | Status |
| --- | --- | --- | --- |
| CTX-ARCH-001 | [Financial Architecture & KPI Specification](./financial-architecture-and-kpi-specification.md) | Financial lifecycle, billing, receivables, wallet, Stripe/payment lifecycle, reporting, and KPIs | Approved |
| CTX-ARCH-002 | [Owner Operations Architecture](./owner-operations-architecture.md) | Owner configuration, location operations, approval, capacity, and owner KPIs | Approved |
| CTX-ARCH-003 | [Driver Operations Architecture](./driver-operations-architecture.md) | Driver workflows, location discovery, activity, wallet visibility, rewards, and driver KPIs | Approved |
| CTX-ARCH-004 | [Admin Operations Architecture](./admin-operations-architecture.md) | Administrative oversight, support, reconciliation, and governance | Approved |
| CTX-ARCH-005 | [Material Management Architecture](./material-management-architecture.md) | Material taxonomy, financial direction, settlement models, pricing, and capacity | Approved |
| CTX-ARCH-006 | [Driver Incentive and Financial Settlement Architecture](./driver-incentive-and-financial-settlement-architecture.md) | Incentive snapshot, financial obligation, owner charge, wallet settlement, Stripe payout, idempotency, and recovery | Approved; PD-045 Active; runtime remediation pending |
| CTX-ARCH-007 | [Canonical Financial Batch Architecture](./CTX-ARCH-007-canonical-financial-batch-architecture.md) | Canonical obligation versioning, batch identity, weekly periods, frozen membership/totals, append-only audit, discovery queues, legacy isolation, and Phase 3B non-execution | Approved architecture direction; implementation pending |
| CTX-ARCH-008 | [Production Database Migration Architecture](./CTX-ARCH-008-production-database-migration-architecture.md) | Proposed controlled migration lifecycle, manifest, runner, ledger, reconciliation, release gates, recovery, and evidence model | **Conditionally approved — not authorized for implementation** |

## Planned Contents

- High-level system diagrams
- Frontend application structure
- Server and service boundaries
- Mobile and responsive architecture decisions
- Deployment topology and Railway environment notes
- Infrastructure dependencies and integration points
- Security boundaries and trust assumptions

## Supporting Architecture Evidence

- [Production Database Migration Discovery and Requirements](./production-database-migration-discovery-and-requirements.md) — preserved Phase B evidence supporting the CTX-ARCH-008 draft; it is not the architecture decision.
- [CTX-ARCH-008 Architecture Approval Record](./approvals/CTX-ARCH-008-architecture-approval-record.md) — conditional approval of direction only; implementation and production adoption remain blocked.
- [CTX-ARCH-008 Railway Platform and Database Recovery Verification](./verification/CTX-ARCH-008-railway-platform-and-database-recovery-verification.md) — Phase F verification evidence; not architecture, an ADR, implementation authorization, or production authorization.
- [ADR-031 — Production Database Migration Execution Architecture](./ADR-031-production-database-migration-execution-architecture.md) — accepted decision record; implementation and production adoption remain blocked.

## Maintenance Note

Keep this folder focused on durable architecture decisions. Update it when the system shape changes, not for every implementation detail.
