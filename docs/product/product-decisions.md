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
