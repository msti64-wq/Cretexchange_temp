# Architecture Decision Records

## Document Metadata

| Field | Value |
| --- | --- |
| Purpose | Record the major architectural decisions that define current production behavior. |
| Scope | Production decisions only; no speculative roadmap decisions. |
| Version | 1.0 |
| Status | Active |
| Last Updated | 2026-06-25 |
| Maintained By | CreteXchange engineering and operations |

## Revision History

| Date | Version | Author | Notes |
| --- | --- | --- | --- |
| 2026-06-25 | 1.0 | Codex | Initial ADR log created. |

## What Is an ADR?

An Architecture Decision Record (ADR) is a short, durable record of a technical decision that materially affects the product or platform. ADRs are useful because they capture:

- what was decided
- why it was decided
- what the tradeoffs were
- what downstream consequences to expect

This ADR log captures current known production decisions for CreteXchange.

## ADR Log

| ADR | Status | Date | Decision |
| --- | --- | --- | --- |
| ADR-001 | Accepted | Unknown | Migration from Replit to Railway |
| ADR-002 | Accepted | Unknown | Railway as production host |
| ADR-003 | Accepted | Unknown | Neon PostgreSQL as production database |
| ADR-004 | Accepted | Unknown | Cloudflare as DNS provider for the production domain |
| ADR-005 | Accepted | Unknown | GitHub repository strategy for production changes |
| ADR-006 | Accepted | 2026-06 | Shared billing ledger calculator in `shared/billingPolicy.ts` |
| ADR-007 | Accepted | 2026-06 | Completed billing batches included in owner wallet accounting |
| ADR-008 | Accepted | 2026-06 | Driver tips sourced from `washout_activities.amount` |
| ADR-009 | Accepted | 2026-06 | Design-system rollout for production UI primitives |
| ADR-010 | Accepted | 2026-06 | High-contrast industrial UI standard for dark surfaces |
| ADR-011 | Accepted | 2026-06 | Documentation-first engineering workflow |
| ADR-031 | Accepted — implementation not yet authorized | 2026-07-22 | [Production Database Migration Execution Architecture](../architecture/ADR-031-production-database-migration-execution-architecture.md) |

## ADR Details

### ADR-001 - Migration from Replit to Railway

| Field | Value |
| --- | --- |
| Decision | Production moved from Replit-based hosting to Railway. |
| Status | Accepted |
| Date | Unknown |
| Context | The production system needed a stable deployment target with a clearer deployment and verification workflow. |
| Decision | Use Railway as the production host for the live application. |
| Consequences | Production work now targets the Railway-tracking repository and deployment line. |

### ADR-002 - Railway as Production Host

| Field | Value |
| --- | --- |
| Decision | Railway is the production hosting platform. |
| Status | Accepted |
| Date | Unknown |
| Context | The app requires a consistent runtime host for the current production line. |
| Decision | Keep Railway as the host for the current production application. |
| Consequences | Production verification uses Railway runtime commit hashes. |

### ADR-003 - Neon PostgreSQL as Production Database

| Field | Value |
| --- | --- |
| Decision | Neon PostgreSQL is the production database. |
| Status | Accepted |
| Date | Unknown |
| Context | The application needs a durable production data store for billing, wallet, legal, and operational data. |
| Decision | Use Neon as the live relational database for production state. |
| Consequences | Current production truth comes from Neon rows, not local state. |

### ADR-004 - Cloudflare DNS

| Field | Value |
| --- | --- |
| Decision | Cloudflare manages DNS for the production domain. |
| Status | Accepted |
| Date | Unknown |
| Context | The public production domain needs DNS routing in front of the Railway host. |
| Decision | Use Cloudflare for `cretexchange.app` DNS. |
| Consequences | DNS and hosting are separate operational concerns. |

### ADR-005 - GitHub Repository Strategy

| Field | Value |
| --- | --- |
| Decision | Use GitHub repositories as the source of truth for production changes. |
| Status | Accepted |
| Date | Unknown |
| Context | Production changes must be reviewable, traceable, and deployable from git history. |
| Decision | Keep the production line tied to the production GitHub repository and branch. |
| Consequences | Local worktrees must match the production repository before promotion. |

### ADR-006 - Shared Billing Ledger Calculator

| Field | Value |
| --- | --- |
| Decision | Use a shared canonical billing ledger calculator. |
| Status | Accepted |
| Date | 2026-06 |
| Context | Dry-run billing and live billing must produce consistent amounts. |
| Decision | Keep billing calculations centralized in `shared/billingPolicy.ts`. |
| Consequences | Dry-run and live billing are compared against the same ledger rules. |

### ADR-007 - Completed Billing Batches in Owner Wallet Accounting

| Field | Value |
| --- | --- |
| Decision | Include completed billing batches in owner wallet/accounting totals and history. |
| Status | Accepted |
| Date | 2026-06 |
| Context | Owner accounting must reflect actual completed charges for operational and tax records. |
| Decision | Merge completed `billing_batches` into owner spend, totals, and transaction history. |
| Consequences | Owner wallet analytics are based on accounting truth rather than pending work. |

### ADR-008 - Driver Tips from `washout_activities.amount`

| Field | Value |
| --- | --- |
| Decision | Use `washout_activities.amount` as the driver tip source. |
| Status | Accepted |
| Date | 2026-06 |
| Context | Driver tip values must match the live schema and the current production billing model. |
| Decision | Read driver tip cents from the washout activity amount field. |
| Consequences | The driver-tip source is stable, auditable, and aligned across dry-run and live billing. |

### ADR-009 - Design-System Rollout

| Field | Value |
| --- | --- |
| Decision | Adopt shared design-system primitives for production UI surfaces. |
| Status | Accepted |
| Date | 2026-06 |
| Context | Owner, driver, and admin pages needed consistent presentation and contrast behavior. |
| Decision | Standardize on reusable primitives such as `DSCard`, `DSKpiCard`, `DSStatusChip`, `DSSectionHeader`, and `DSTableShell`. |
| Consequences | New UI work should use the shared design system instead of one-off styling. |

### ADR-010 - High-Contrast Industrial UI Standard

| Field | Value |
| --- | --- |
| Decision | Use a high-contrast industrial dark-theme UI standard. |
| Status | Accepted |
| Date | 2026-06 |
| Context | Production pages must remain readable on dark slate/black backgrounds. |
| Decision | Require white/off-white/bright accent text on dark surfaces and visible default-state buttons. |
| Consequences | Dark-text-on-dark-background regressions are treated as production defects. |

### ADR-011 - Documentation-First Engineering Workflow

| Field | Value |
| --- | --- |
| Decision | Maintain a documentation-first engineering workflow for production changes. |
| Status | Accepted |
| Date | 2026-06 |
| Context | The system needs a stable operational reference for production behavior. |
| Decision | Record current production truth in the Knowledge Base before or alongside implementation work. |
| Consequences | Engineers can verify the current architecture, operating rules, and production behavior before making changes. |

### ADR-031 - Production Database Migration Execution Architecture

| Field | Value |
| --- | --- |
| Decision | Establish the repository-owned manifest, direct-SQL Node/TypeScript runner, PostgreSQL ledger, dedicated-session advisory lock, evidence-based reconciliation, and separately controlled execution architecture. |
| Status | Accepted — implementation not yet authorized |
| Date | 2026-07-22 |
| Context | CTX-ARCH-008 requires a durable production migration model while preserving external platform and recovery unknowns as explicit gates. |
| Record | [ADR-031 — Production Database Migration Execution Architecture](../architecture/ADR-031-production-database-migration-execution-architecture.md) |
| Consequences | Implementation, controlled tests, platform confirmation, credential validation, recovery evidence, and production adoption each require separate authorization. |

## Scope Note

This ADR log captures the known current production decisions that shape the live platform. It should be expanded when a new architectural decision materially changes production behavior.
