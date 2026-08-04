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
| CTX-ARCH-008 | [Production Database Migration Architecture](./CTX-ARCH-008-production-database-migration-architecture.md) | Production database migration governance, baseline, execution, verification, and recovery boundaries | Draft architecture; implementation adoption separately governed |
| CTX-ARCH-009 | [Operations Library and Knowledge Management Architecture](./CTX-ARCH-009-operations-library-and-knowledge-management-architecture.md) | Operations Library source-of-truth, lifecycle, security, and publication boundaries | Draft; not approved for implementation |
| CTX-ARCH-010 | [Administration Repository Architecture](./CTX-ARCH-010-administration-repository-architecture.md) | Repository-authoritative Administration Repository boundaries, derived metadata, and synchronization constraints | Draft; implementation adoption separately governed |
| CTX-ARCH-011 | [Administration Repository Documentation Refresh Design](./CTX-ARCH-011-administration-repository-documentation-refresh-design.md) | Controlled refresh of derived documentation inventory and freshness state | Draft; Version 1 implementation exists in repository, while architecture approval and production adoption remain separate |
| CTX-ARCH-012 | [Platform Intelligence Layer](./CTX-ARCH-012-platform-intelligence-layer.md) | Immutable operational analytics events, canonical metrics, aggregation, and role-scoped read APIs | Approved for Phase 2 Sprint 2 foundation implementation |
| CTX-ARCH-013 | [Notification and Communication Center](./CTX-ARCH-013-notification-and-communication-center.md) | Structured recipient notifications, safe workflow intents, localization, RBAC, read/archive state, and future channel boundary | Approved for Phase 5 Sprint 1 implementation |
| CTX-ARCH-014 | [Facility Owner Operational Dashboard](./CTX-ARCH-014-owner-operational-dashboard.md) | Action-first Owner work, bounded canonical summaries, Facility selection, privacy, and workflow links | Approved for Phase 5 Sprint 2 implementation |
| CTX-ARCH-015 | [Photo Review Retention and Integrity Routing](./CTX-ARCH-015-photo-review-retention-and-integrity-routing.md) | Retained private evidence, active/history classification, platform rejection routing, and dispute readiness | Implemented; Founder-approved workflow preserved |
| CTX-ARCH-016 | [Canonical Facility Geofence Architecture](./CTX-ARCH-016-canonical-facility-geofence-architecture.md) | Versioned radius/polygon boundaries, server-authoritative evaluation, operational exceptions, privacy, and rollout | Approved and effective as architecture governance; no implementation authority |
| CTX-MET-001 | [Platform Metric Registry](./CTX-MET-001-platform-metric-registry.md) | Canonical operational metric, journey, and drop-off definitions | Approved for Phase 2 Sprint 2 foundation implementation |

## Supporting Architecture Records

- [CTX-ARCH-008-APPROVAL-RECORD — Architecture Approval Record](./approvals/CTX-ARCH-008-architecture-approval-record.md) — Evidence record for the stated CTX-ARCH-008 conditional approval; it is not the architecture itself.
- [CTX-ARCH-008-VERIFICATION — Railway Platform and Database Recovery Verification](./verification/CTX-ARCH-008-railway-platform-and-database-recovery-verification.md) — Supporting verification evidence; it does not independently authorize implementation or production adoption.
- [CTX-ARCH-009-REVIEW — Operations Library and Knowledge Management Architecture Review](./reviews/CTX-ARCH-009-architecture-review.md) — Independent review evidence; it is not an approval record.
- [ADR-031 — Production Database Migration Execution Architecture](./ADR-031-production-database-migration-execution-architecture.md) — Accepted decision record supporting CTX-ARCH-008; it does not supersede architecture or release authority.
- [ADR-032 — Pilot Billing and Driver Tip Settlement Architecture](./ADR-032-pilot-billing-and-driver-tip-settlement-architecture.md) — Draft record of superseding CEO initial-launch billing direction; it requires architecture, compliance, implementation, and release approval before financial execution.

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
