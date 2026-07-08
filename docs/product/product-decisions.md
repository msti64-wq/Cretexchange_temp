# Product Decisions

## PD-010 - Operational Events Become Business Intelligence

**Decision:** Every completed washout, check-in, tip, reward entry, and future rubble drop-off should generate useful insight for at least one stakeholder group.

**Rationale:** This turns CreteXchange from a transaction marketplace into an intelligence platform that helps drivers, owners, and administrators make better decisions.

**Status:** Active

**Implications:**

- Driver-facing experiences should preserve activity context, ticket history, and location history.
- Owner-facing experiences should summarize site attraction, repeat visits, and tipping performance.
- Admin-facing experiences should surface regional and site-level trends.
- Reporting should favor aggregation and role-aware visibility.

## PD-011 - Mobile-First Field Operations

**Decision:** The Driver Experience should be designed so that every core workflow can eventually run as a native iOS/Android experience while sharing the same backend, authentication, business rules, and operational data as the web platform.

**Rationale:** Drivers work in the field, often one-handed, outdoors, and with intermittent connectivity. Native mobile capabilities such as GPS, camera, push notifications, secure storage, biometrics, and offline queues can improve reliability and speed while keeping the platform architecture unified.

**Status:** Active

**Implications:**

- Driver workflows should stay touch-first and one-handed.
- Web and native experiences should share the same source of truth.
- Native mobile capabilities should extend the platform, not fork it.

## PD-012 - Driver Operating Modes

**Decision:** CreteXchange distinguishes Ready-Mix / Washout Drivers from Material Recovery Drivers because their daily workflows, destinations, and decision criteria are different.

**Rationale:** A single workflow model would blur distinct operational realities and make it harder to support each driver type well.

**Status:** Active

**Implications:**

- Product surfaces should preserve separate operating-mode language.
- Ready-mix workflow support should not be forced into material recovery assumptions.
- Material recovery capabilities should be added as an explicit mode, not a hidden variation.

## PD-013 - Material Recovery Exchange

**Decision:** CreteXchange will expand beyond washout into material recovery by matching recoverable construction materials with locations that can accept, recycle, or responsibly process them.

**Rationale:** This extends the platform into a broader field-operations and materials-recovery network while preserving the existing washout value proposition.

**Status:** Active

**Implications:**

- Product language should support recovery, recycling, and responsible disposal.
- Location metadata should eventually reflect accepted materials and recovery fit.
- Rewards and analytics should support both washout and recovery workflows.

## PD-014 - Material Catalog

**Decision:** Recoverable materials should eventually be represented by a catalog rather than hard-coded UI logic.

**Rationale:** A catalog makes material handling extensible, consistent, and easier to reuse across drivers, owners, and admin workflows.

**Status:** Active

**Implications:**

- Material names, status, and eligibility should become data-driven over time.
- UI should read from catalog values instead of fixed labels wherever practical.
- Owner and driver workflows can evolve without repeated hard-coded edits.

## PD-015 - Owner Material Acceptance

**Decision:** Owners should be able to define which materials each location accepts, along with tips, fees, restrictions, and instructions.

**Rationale:** Acceptance rules are central to matching drivers with the right recovery destination and to making the marketplace operationally useful.

**Status:** Active

**Implications:**

- Location setup should eventually include material acceptance controls.
- Driver matching should be able to respect location acceptance rules.
- Analytics can use acceptance data to identify market gaps and opportunities.

## PD-016 - Sticky Job Type Selection

**Decision:** Driver job type should be persisted locally during the first phase so the dashboard can remember the driver's working context across sessions without introducing backend storage.

**Rationale:** A lightweight local-only preference is the lowest-risk way to establish the workflow boundary between ready-mix / washout and material recovery before committing to database-backed persistence.

**Status:** Active

**Implications:**

- The dashboard can show the active job type immediately.
- Drivers can switch contexts without changing platform logic.
- A future database-backed preference can be added after the workflow is validated.

## PD-020 - Operational Events

**Decision:** Every meaningful owner interaction should become an operational event capable of generating business intelligence.

**Rationale:** Owner activity has operational meaning and should be represented as platform insight rather than treated only as a state change.

**Status:** Active

**Implications:**

- Owner actions should be modeled as business events where appropriate.
- Analytics should be able to consume owner operational events.
- Event history should support reporting, recommendations, and platform intelligence.

## PD-021 - Operational Lifecycle

**Decision:** Every platform persona should have a documented operational lifecycle. Features should support those lifecycles rather than exist independently.

**Rationale:** Lifecycle thinking keeps the platform aligned with how people actually operate in the field and across the business.

**Status:** Active

**Implications:**

- Product design should consider before, during, and after phases of work.
- Features should map to lifecycle decisions rather than isolated UI elements.
- Future capabilities should reinforce the operating flow of each persona.

## PD-022 - Documentation First

**Decision:** Documentation should precede implementation for all significant platform capabilities.

**Rationale:** Writing the decision down first reduces ambiguity, improves alignment, and creates a durable source of truth for later implementation and review.

**Status:** Active

**Implications:**

- Significant capabilities should not be built without a documented product intent.
- Product, governance, and operational context should be captured before code changes where practical.
- Documentation should be treated as part of the platform foundation, not as an afterthought.

## PD-023 - Product Traceability

**Decision:** Every significant feature should be traceable from Platform Vision through implementation.

**Rationale:** Traceability protects long-term quality and makes it easier to understand why a feature exists and how it fits the platform.

**Status:** Active

**Implications:**

- Product decisions should link back to the platform vision.
- Implementation should connect back to product and operational intent.
- Future contributors should be able to follow the decision trail.

## PD-024 - Preservation Principle

**Decision:** Enhance existing capabilities whenever practical rather than replacing stable functionality.

**Rationale:** Preserving working behavior reduces risk and keeps the platform stable while still allowing deliberate improvement.

**Status:** Active

**Implications:**

- Stable workflows should be retained unless a replacement is clearly superior.
- New work should respect existing user expectations and operational behavior.
- Rewrites should be avoided unless the product or architecture demands them.

## PD-025 - Construction Operations Focus

**Decision:** The platform should model how the construction industry operates rather than how software pages are organized.

**Rationale:** CreteXchange exists to support real field operations, so the product should follow operational reality instead of interface convenience.

**Status:** Active

**Implications:**

- Workflows should reflect how construction teams actually operate.
- Product terminology should align with field operations.
- Pages should serve the operating model rather than define it.

## PD-026 - Incremental Delivery

**Decision:** Major capabilities should be delivered through small, validated, independently deployable phases that preserve existing platform functionality while progressively expanding capability.

**Rationale:** Incremental delivery keeps risk low, allows validation at each step, and lets the platform evolve safely.

**Status:** Active

**Implications:**

- Large capabilities should be decomposed into manageable phases.
- Each phase should be testable and reviewable on its own.
- Existing functionality should remain intact while the platform expands.

## PD-028 - Financial Architecture Specification

**Decision:** CreteXchange financial behavior, billing calculations, wallet rules, and dashboard KPIs must follow CTX-ARCH-001. Financial changes require documentation updates before implementation.

**Rationale:** Financial behavior must remain conservative, auditable, and aligned across dashboards, reports, billing logic, Stripe interactions, and wallet ledgers.

**Status:** Active

**Implications:**

- Financial calculations should reference the canonical architecture specification before implementation.
- Dashboard KPIs must match the authoritative financial model and source of truth.
- Financial schema or reconciliation changes require documentation updates first.
