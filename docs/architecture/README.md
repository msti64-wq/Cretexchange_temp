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

## Planned Contents

- High-level system diagrams
- Frontend application structure
- Server and service boundaries
- Mobile and responsive architecture decisions
- Deployment topology and Railway environment notes
- Infrastructure dependencies and integration points
- Security boundaries and trust assumptions

## Maintenance Note

Keep this folder focused on durable architecture decisions. Update it when the system shape changes, not for every implementation detail.
