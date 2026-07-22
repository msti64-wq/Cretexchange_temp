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

**Decision:** Recoverable materials are represented by a canonical catalog rather than hard-coded UI logic.

**Rationale:** A catalog makes material handling extensible, consistent, and easier to reuse across drivers, owners, and admin workflows.

**Status:** Active

**Implications:**

- Material names, status, and eligibility are data-driven through stable catalog entries.
- UI should read from catalog values instead of fixed labels wherever practical.
- Owner and driver workflows can evolve without repeated hard-coded edits.

## PD-015 - Owner Material Acceptance

**Decision:** Owners can define which materials each location accepts through standardized catalog entries or facility-scoped custom materials. Tips, fees, restrictions, and advanced instructions require separately approved phases.

**Rationale:** Acceptance rules are central to matching drivers with the right recovery destination and to making the marketplace operationally useful.

**Status:** Active

**Implications:**

- Location setup includes owner-scoped material acceptance controls; custom materials remain local to the selected facility.
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

**Decision:** Every significant feature should be traceable from Platform Vision and, where long-term direction applies, Platform Strategy through implementation.

**Rationale:** Traceability protects long-term quality and makes it easier to understand why a feature exists and how it fits the platform.

**Status:** Active

**Implications:**

- Product decisions should link back to Platform Vision and applicable Platform Strategy direction.
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

## PD-029 - Owner Operations Architecture

**Decision:** Owner operational behavior shall follow CTX-ARCH-002. New owner features require updates to the architecture specification before implementation.

**Rationale:** Owner-facing functionality must remain configuration-driven, operationally coherent, and traceable as the platform expands into more materials, capacity models, and compliance workflows.

**Status:** Active

**Implications:**

- Owner configuration, workflows, and operational KPIs should reference the canonical owner operations architecture.
- New owner features should update CTX-ARCH-002 before implementation.
- Operational schema or workflow changes should preserve extensibility and clear ownership boundaries.

## PD-030 - Driver Operations Architecture

**Decision:** Driver operational behavior shall follow CTX-ARCH-003. New driver-facing capabilities require architecture updates before implementation.

**Rationale:** Driver workflows, KPI labels, location discovery, rewards, wallet visibility, and activity history must remain coherent, mobile-first, and traceable as the platform expands.

**Status:** Active

**Implications:**

- Driver workflows and dashboard KPIs should reference the canonical driver operations architecture.
- New driver-facing features should update CTX-ARCH-003 before implementation.
- Driver schema or workflow changes should preserve extensibility, safety, and clear separation between activity, earnings, wallet, and payout history.

## PD-031 - Admin Operations Architecture

**Decision:** Admin operational behavior shall follow CTX-ARCH-004. New admin-facing capabilities require architecture updates before implementation.

**Rationale:** Admin workflows must remain auditable, separation-of-duties aware, financially supervised, and consistent with the platform’s architecture-driven governance model.

**Status:** Active

**Implications:**

- Admin workflows and dashboard KPIs should reference the canonical admin operations architecture.
- New admin-facing features should update CTX-ARCH-004 before implementation.
- Admin configuration, reconciliation, and oversight changes should preserve auditability and architectural separation between operational and financial concerns.

## PD-032 - Material Management Architecture

**Decision:** The Material Management Architecture (CTX-ARCH-005) governs all material definitions, financial direction, settlement models, platform revenue, capacity, and operational behavior.

**Rationale:** Material handling must remain configuration-driven, auditable, and extensible as the platform grows beyond concrete washout into broader material exchange use cases.

**Status:** Active

**Implications:**

- Material definitions and behavior should reference the canonical material management architecture.
- New material-facing capabilities should update CTX-ARCH-005 before implementation.
- Material configuration, pricing, and settlement changes should preserve extensibility and clear ownership of financial direction.

## PD-033 - CreteXchange Platform Standards

**Decision:** CTX-STD-001 establishes the mandatory engineering and governance standards for all future development. All architecture documents, runtime implementations, and documentation shall conform to this standard.

**Rationale:** A single platform standard ensures consistent decision-making across architecture, implementation, documentation, security, financial behavior, and extensibility.

**Status:** Active

**Implications:**

- Architecture, implementation, and documentation should reference CTX-STD-001 when making platform-wide decisions.
- New features should validate compliance with CTX-STD-001 before implementation.
- Standards updates should be documented before platform behavior changes when practical.

## PD-034 - Sprint 2.1 Driver Experience and Operational Intelligence

**Decision:** Sprint 2.1 will prioritize Driver Rewards, Driver Dashboard Intelligence, and the foundation for Owner/Admin operational intelligence while reusing existing platform infrastructure wherever possible.

**Rationale:** The platform already contains wallet, rewards, location, GPS, notification, and Stripe foundations. Sprint 2.1 should turn these into a more useful driver-facing operational experience before adding complex new backend systems.

**Status:** Active

**Implications:**

- Sprint planning should prioritize driver-facing operational intelligence features.
- Existing rewards, wallet, notification, GPS, location, and Stripe infrastructure should be reused wherever practical.
- New Sprint 2.1 implementation tasks should avoid duplicate business logic and update documentation as appropriate.

## PD-035 - Construction Circular Economy Intelligence Platform

**Context:** CreteXchange needs a durable long-term identity that connects its concrete washout launch to broader construction-material recovery and intelligence without implying that future capabilities exist today.

**Decision:** CreteXchange's long-term strategic direction is to become the Construction Circular Economy Intelligence Platform while preserving the current concrete washout and verified-drop launch model as the initial operational and revenue foundation.

**Rationale:** Driver-to-facility discovery and verified concrete washouts establish a focused operational pattern for trusted participation, transaction volume, facility relationships, recovery data, liquidity, data quality, and credibility. A durable platform identity keeps future growth centered on discovery, recovery, reuse, movement, verification, and measurement rather than disconnected features.

**Status:** Active

**Date:** 2026-07-11

**Current Implications:**

- Long-term product direction should connect operational utility, transaction verification, material recovery, and intelligence.
- Product language must distinguish implemented capabilities from future strategic direction.
- Current architecture and stable workflows should be extended deliberately rather than replaced by a strategy-driven rewrite.
- Platform Strategy is the canonical roadmap for this evolution.

**Current Scope:** The launch foundation is driver-to-facility discovery, verified concrete washouts and approved material-recovery drops, trusted participation, the $5 platform fee per verified drop, verification, duplicate prevention, owner confirmation, dispute controls, and operational data from real transactions. Current production implementation remains the concrete washout foundation defined by Project Context and applicable CTX-ARCH documents; broader recovery workflows require approval and implementation.

**Future Scope:** Broader recovered-material commerce, multi-material networks, Enterprise SaaS, government intelligence, premium intelligence, and index capabilities require separate Product Decisions, architecture, governance, implementation, and validation.

**Deferred Implications:** Research models, broader marketplaces, enterprise and public-sector products, and national benchmarking remain deferred until validation and separate approval.

**Explicit Non-Goals:** This decision does not change Sprint 2.1, implement a new workflow, modify architecture, approve a revenue stream, or claim that the complete platform exists.

**Guardrails:** Do not replace or disrupt the current launch model without an explicit Product Decision. Do not treat the North Star as permission to expand an approved sprint or describe future capabilities as implemented.

**Related Documents:** [Platform Vision](../vision/platform-vision.md), [Platform Strategy](../vision/platform-strategy.md), [Project Context](../project/project-context.md), [Business Model](../business/business-model.md).

## PD-036 - Multi-Revenue Platform Strategy

**Context:** The verified-drop network creates value for several participants, but long-term platform sustainability should not depend on charging only one transaction type or imposing friction on users who generate network value.

**Decision:** CreteXchange adopts a stakeholder-value and layered platform-economics model: identify who receives measurable value, charge an appropriate beneficiary where justified, keep network-generating participation low-friction, and support multiple complementary revenue streams rather than relying exclusively on the $5-per-verified-drop fee.

**Rationale:** A trusted operational network may create distinct value through transactions, enterprise software, governed intelligence, public-sector programs, benchmarks, and approved financial services. Diversification can support durable platform economics when each revenue stream is tied to real participant value.

**Status:** Active

**Date:** 2026-07-11

**Current Implications:**

- Potential revenue categories should remain modular, transparent, and governed.
- Financial behavior must continue to follow CTX-ARCH-001 and canonical accounting sources.
- Strategic revenue ideas must not be embedded in operational calculations before approval.
- Pricing, billing, tax, regulatory, and revenue-recognition questions require explicit decisions.

**Current Scope:** The current $5 platform fee per verified drop remains the initial revenue foundation. Existing production revenue and payment behavior remains unchanged and is governed by current financial architecture and implemented business rules.

**Future Scope:** Potential categories include facility subscriptions, marketplace fees, Enterprise SaaS, government and regional services, premium intelligence, integrations, governed licensing, research, and legally appropriate referrals. None is authorized for implementation by this decision alone.

**Deferred Implications:** Specific pricing, packaging, subscriptions, commissions, professional services, public-sector agreements, data licensing, and index products remain deferred pending customer evidence and explicit approval.

**Explicit Non-Goals:** This decision does not alter current billing, accounting, wallet, payout, reward, or Stripe behavior and does not approve any future revenue layer for implementation.

**Guardrails:** Charge parties receiving measurable value while keeping participation friction low for drivers and other network-value generators. Do not reduce liquidity, alter canonical billing, sell confidential company-specific information, or introduce a revenue stream without approval.

**Related Documents:** [Platform Strategy](../vision/platform-strategy.md), [Revenue Architecture](../business/revenue-architecture.md), [Customer Value Framework](../business/customer-value-framework.md), [CTX-ARCH-001](../architecture/financial-architecture-and-kpi-specification.md).

## PD-037 - Verified Transaction Network First

**Decision:** The verified transaction network must be validated before the platform overbuilds advanced intelligence, marketplace, enterprise, government, or index capabilities.

**Rationale:** Intelligence and market coordination are only defensible when underlying identities, activities, locations, evidence, and outcomes are reliable. Verification creates participant trust and a durable data advantage.

**Status:** Active

**Implications:**

- Transaction lifecycle, identity, provenance, evidence, and exception handling should remain explicit.
- Failed verification and ambiguous records must not silently become trusted data.
- New workflow types should define what verification means before contributing to strategic analytics.
- Marketplace growth should strengthen rather than dilute data quality.

**Current Scope:** Current production workflows and their existing verification mechanisms remain unchanged. The immediate work is to validate participation, transaction quality, trusted facility relationships, and repeatable operations within approved scope.

**Future Scope:** Broader material transactions and intelligence products should build on governed verification standards approved for each domain after the initial network is validated.

**Guardrails:** Do not infer trusted data from failed or ambiguous verification. Do not use long-term opportunity to justify premature marketplace, analytical, or index implementation.

**Related Documents:** [Platform Strategy](../vision/platform-strategy.md), [Data Strategy](./data-strategy.md), [Platform Flywheel](../business/platform-flywheel.md), [Customer Value Framework](../business/customer-value-framework.md).

## PD-038 - Strategic Data Governance Principles

**Decision:** Operational data must be governed through participant consent, role-based access, data minimization, confidentiality, aggregation, anonymization, retention, auditability, ownership terms, and licensing controls.

**Rationale:** Data becomes a competitive advantage only when participants and decision-makers can trust its meaning and use. Poorly governed data creates operational, legal, reputational, and analytical risk.

**Status:** Active

**Implications:**

- Canonical sources and data lineage must be preserved.
- Personal and commercially sensitive data should be minimized and protected.
- Aggregates, estimates, and inferred outcomes must be labeled accurately.
- Published or commercial intelligence requires documented coverage, methodology, and access controls.
- Participant value and legitimate use should guide data-product decisions.
- Environmental claims must be evidence-based, traceable, and qualified.
- Company-specific information must not be disclosed or sold without proper authorization.

**Current Scope:** Existing authorization, privacy, architecture, and data-handling rules remain in force. This decision does not create a data product, sharing program, or new collection requirement.

**Future Scope:** Enterprise, government, research, licensing, benchmark, and index uses require separate governance, legal, security, methodology, and product approval.

**Guardrails:** Collect and retain only data justified by an approved purpose. Apply access and disclosure controls before reuse. Data licensing remains subject to consent, privacy, ownership, licensing, confidentiality, aggregation, and anonymization requirements.

**Related Documents:** [Data Strategy](./data-strategy.md), [Platform Strategy](../vision/platform-strategy.md), [Revenue Architecture](../business/revenue-architecture.md), [Customer Value Framework](../business/customer-value-framework.md).

## PD-039 - Construction Circular Economy Index

**Context:** A sufficiently representative and governed transaction network may eventually support benchmarking, but premature index claims would create methodological, privacy, environmental-claim, and reputational risk.

**Decision:** CreteXchange recognizes the Construction Circular Economy Index (`CCEI`) as a proposed future analytical product that must distinguish reported, corroborated, verified, estimated, and modeled data. It is not a current implemented capability, and the name remains subject to future legal and branding review.

**Rationale:** A credible index could help industry and public stakeholders understand material movement, recovery participation, regional capacity, operational efficiency, and circular-economy progress. Its value depends on trust, coverage, and methodological discipline.

**Status:** Active

**Date:** 2026-07-11

**Current Implications:**

- Index inputs must be traceable to governed definitions and verified data.
- Coverage limitations, uncertainty, methodology, revisions, and conflicts of interest must be transparent.
- Published measures must identify sources, confidence, and qualification language.
- Participant privacy and commercially sensitive information must be protected through aggregation and access controls.
- Index publication, licensing, benchmarking, or policy use requires independent approval and validation.

**Current Scope:** No Construction Circular Economy Index, score, benchmark methodology, publication process, or index product is currently implemented or approved for release.

**Future Scope:** Index development may begin only after the platform has sufficient representative coverage and approved methodology, governance, legal review, architecture, product scope, and validation.

**Deferred Implications:** Scorecards, reports, sponsored studies, benchmarking subscriptions, recognition programs, and licensed index products remain deferred.

**Explicit Non-Goals:** This decision does not establish a score, methodology, environmental result, official benchmark, published ranking, or approved commercial index product.

**Guardrails:** Do not merge different confidence classes, overstate coverage, expose confidential participant information, or make unsupported environmental or performance claims. Disclose methodology, limitations, revisions, funding, and conflicts.

**Related Documents:** [Platform Strategy](../vision/platform-strategy.md), [Data Strategy](./data-strategy.md), [Investment Thesis](../business/investment-thesis.md), [Strategic Data Governance Principles (PD-038)](#pd-038---strategic-data-governance-principles).

## PD-040 - Customer Value Framework

**Decision:** Every significant platform capability must identify its primary customer, value delivered, paying party, potential revenue model, strategic objective, data required, privacy implications, and current or future status.

**Rationale:** A platform serving many participants can drift into feature accumulation or charge the users who create network value. Explicit customer and value analysis ties product investment to evidence, clarifies who should pay, protects participation, and surfaces data and governance requirements before implementation.

**Status:** Active

**Implications:**

- Major proposals should identify secondary beneficiaries and measurable evidence of value in addition to the required decision fields.
- Revenue may come from a different party than the user performing the operational workflow.
- Non-revenue strategic benefits must still be explicit and tied to an approved objective.
- Product proposals must distinguish implemented functionality, approved near-term scope, future strategy, and exploratory options.
- Required data and privacy implications must be evaluated before collection, reuse, integration, or commercialization.

**Current Scope:** This decision adds a proposal and planning requirement only. It does not authorize a feature, pricing change, data collection, revenue stream, or sprint expansion.

**Future Scope:** Approved product templates, roadmap reviews, investment decisions, and business-model validation may incorporate the framework after documentation and workflow approval.

**Guardrails:** Do not treat a completed framework as approval. Preserve the current $5 verified-drop foundation, low-friction driver participation, canonical architecture, privacy, and approved sprint scope.

**Related Documents:** [Customer Value Framework](../business/customer-value-framework.md), [Revenue Architecture](../business/revenue-architecture.md), [Platform Strategy](../vision/platform-strategy.md), [Development Protocol](../development-protocol.md).

## PD-041 - Preserve the Verified-Drop Launch Model

**Context:** Long-term marketplace, research, enterprise, government, and intelligence opportunities could distract from or unintentionally alter the operational model currently being validated.

**Decision:** Preserve the current launch model—driver discovery of participating washout and recycling facilities, documented eligible drops, facility verification, driver rewards, current transaction controls, and the $5 platform fee per verified load drop—until an explicit Product Decision authorizes a change.

**Rationale:** The launch model is the current participation, trust, transaction, revenue, and data-generation foundation. Changing it before validation would introduce operational and financial risk and weaken the evidence needed for later strategy.

**Status:** Active

**Date:** 2026-07-11

**Current Implications:**

- Driver rewards and the current transaction workflow remain the immediate product focus.
- Current financial behavior remains governed by CTX-ARCH-001, CTX-ARCH-005, and implemented canonical rules.
- Documentation must identify broader recovery workflows and revenue models as future unless they are separately approved and implemented.

**Deferred Implications:** Other transaction fees, marketplace economics, subscriptions, Enterprise SaaS, professional services, public-sector agreements, intelligence products, and index products remain deferred.

**Explicit Non-Goals:** This decision does not change pricing configuration, billing logic, driver incentives, rewards, wallet or payout behavior, Stripe behavior, APIs, schemas, or Sprint 2.1.

**Current Scope:** Documentation and roadmap protection of the implemented concrete washout launch foundation.

**Future Scope:** A later Product Decision may change the launch economics or workflow only with customer evidence, architecture, financial definitions, transition planning, and approved delivery scope.

**Guardrails:** Strategy documents cannot alter canonical accounting. The phrase “verified drop” must be interpreted through current implemented statuses and applicable architecture, not as a new billing rule.

**Related Documents:** [Project Context](../project/project-context.md), [Platform Strategy](../vision/platform-strategy.md), [Platform Economics](../research/platform-economics.md), [CTX-ARCH-001](../architecture/financial-architecture-and-kpi-specification.md), [CTX-ARCH-005](../architecture/material-management-architecture.md).

## PD-042 - Research and Grant-Readiness Program

**Context:** Evidence-confidence scoring, material classification, constraint-aware matching, anomaly detection, geospatial recommendations, and environmental measurement contain technical and methodological uncertainty that ordinary product development cannot resolve by assertion.

**Decision:** Establish a continuing research and grant-readiness documentation program supporting technical validation, NSF and other aligned opportunities, controlled pilots, university collaboration, public-sector and industry partnerships, commercialization diligence, and responsible reporting.

**Rationale:** A reusable program improves research quality and funding readiness while separating hypotheses, prototypes, validation, and scientific results from current production claims.

**Status:** Active — Documentation Program; Research Execution Not Yet Approved

**Date:** 2026-07-11

**Current Implications:**

- Maintain research questions, hypotheses, methods, data governance, pilot readiness, commercialization, funding, and advisory-board documentation.
- Verify every current funding opportunity through official sources before action.
- Clearly label research artifacts as proposed, draft, validated, inconclusive, or complete.

**Deferred Implications:** Grant submission, funded research, data collection, model development, field pilots, production integration, and commercialization remain subject to opportunity-specific approval, partners, resources, and governance.

**Explicit Non-Goals:** This decision does not assert program eligibility, funding, scientific novelty, model performance, environmental impact, partner commitment, or production readiness.

**Current Scope:** Documentation, readiness assessment, partner planning, and preliminary research design only.

**Future Scope:** Separately approved proposals and studies may execute bounded research under applicable legal, ethical, privacy, security, publication, and architecture controls.

**Guardrails:** Research access must be purpose-limited and authorized. Negative and inconclusive findings must be reported accurately. Research work must not change production behavior without the normal Product Decision and architecture process.

**Related Documents:** [Research Program](../research/README.md), [Grant-Readiness Roadmap](../research/grant-readiness-roadmap.md), [NSF Project Pitch](../research/nsf-project-pitch.md), [NSF Phase I Research Plan](../research/nsf-phase1-research-plan.md).

## PD-043 - Defer Project Atlas Naming

**Context:** `Project Atlas` is being considered as an internal transformation-program name, but no trademark, market-conflict, legal, domain, or brand-architecture review has been completed.

**Decision:** Defer adoption of `Project Atlas` as an official program name pending trademark, legal, market-conflict, and branding review. CreteXchange remains the product name; Construction Circular Economy Intelligence Platform remains the long-term platform description; and `CCEI` remains the proposed index name subject to its own review.

**Rationale:** Premature adoption could create legal conflict, brand confusion, migration cost, or inconsistent authoritative documentation.

**Status:** Active — Name Deferred

**Date:** 2026-07-11

**Current Implications:**

- Use `Project Atlas` only when necessary to describe the provisional candidate and label it as provisional.
- Do not use it in product UI, public claims, legal agreements, repository naming, or authoritative program titles.
- Consider alternative names during the review.

**Deferred Implications:** Trademark applications, domains, visual identity, public launch, program renaming, and market positioning remain deferred.

**Explicit Non-Goals:** This decision does not reserve, clear, register, endorse, or adopt the name and does not rename CreteXchange or the Construction Circular Economy Intelligence Platform.

**Current Scope:** Documentation control and a future-action requirement only.

**Future Scope:** A separately approved naming decision may follow documented legal and market review.

**Guardrails:** Avoid shorthand that could imply official adoption. Record search jurisdiction, classes, markets, domains, alternatives, and legal advice before a naming decision.

**Related Documents:** [Mission and Values](../vision/mission-and-values.md), [Platform Definition](../vision/construction-circular-economy-intelligence-platform.md), [Research Program](../research/README.md).

## PD-044 - Driver Incentive Snapshot Timing

**Context:** A driver check-in can span arrival, evidence capture, submission, validation, and durable activity creation. Using a mutable location rate after acceptance or trusting a client-submitted amount creates financial and data-lineage risk.

**Decision:** The configured driver incentive is frozen at the Server-Accepted Check-In Submission: after authentication, transaction/location eligibility, required evidence, and financial configuration validation, immediately before the transactional activity insert. `washout_activities.amount` is the immutable dollar-denominated agreed incentive snapshot for the accepted activity.

**Rationale:** Completed server acceptance is durable and auditable, while arrival signals and drafts may be stale or fail validation. Freezing at acceptance prevents later location changes from altering the agreement and removes client authority over the financial amount.

**Status:** Active

**Date:** 2026-07-12

**Implications:** Authenticated driver identity, initial activity status, and acceptance timestamp are server-authoritative. Approval, payment creation, owner billing, settlement, reporting, and KPIs consume the frozen snapshot rather than current location configuration.

**Current Scope:** Architecture and test contract only. Existing audited runtime conflicts are not represented as remediated.

**Guardrails:** Do not recompute accepted transactions from a later location rate. Do not treat historical client-controlled amounts as automatically trusted.

**Related Documents:** [CTX-ARCH-006](../architecture/driver-incentive-and-financial-settlement-architecture.md), [CTX-ARCH-001](../architecture/financial-architecture-and-kpi-specification.md), [Data Strategy](./data-strategy.md).

## PD-045 - Canonical Driver Settlement Rail

**Context:** CTX-ARCH-001 permits Stripe Connect or wallet settlement depending on the configured payout path, while the financial audit found paths capable of creating both an external transfer and internal wallet value for one incentive.

**Decision:** The CreteXchange Driver Wallet is the canonical settlement ledger for driver incentives. Stripe Connect is the external payout rail used to withdraw or disburse wallet funds. A driver incentive may create only one withdrawable entitlement.

**Rationale:** The platform already presents wallet pending and available balances to drivers. A wallet-authoritative model provides one internal ledger for obligations, settlement state, retries, reversals, reporting, and reconciliation. Direct Stripe transfer at owner approval plus a wallet credit can duplicate compensation. Separating the internal settlement ledger from the external payout rail improves auditability and recovery and supports future payout schedules, payout methods, holds, disputes, and other financial rails without changing the underlying driver entitlement.

**Status:** Active

**Date:** 2026-07-12

**Current Scope:** Applies to verified driver incentives arising from washout or material-recovery activity. Owner approval creates the payment obligation. Owner billing funds the platform's obligation. The driver incentive is credited exactly once to the canonical wallet ledger. Stripe Connect is used only to disburse wallet funds. Platform fees remain separate from driver incentives. Existing runtime behavior must be remediated and validated before it is represented as compliant.

**Future Scope:** Additional payout rails and scheduled, automatic, or driver-initiated withdrawals may be supported. Other material-recovery transactions may use the same settlement architecture. Future marketplace seller settlements require separate Product Decisions where their entitlement model differs.

**Guardrails:** Do not directly transfer an incentive through Stripe during approval if that incentive is also credited to the wallet. Do not credit the wallet after an incentive has already been directly settled through another rail. Wallet balance changes require corresponding ledger transactions, and wallet ledger writes must be atomic and idempotent. Stripe payout requests must reference the canonical wallet debit or withdrawal record. Stripe failures must not reduce wallet value unless the payout state is safely recoverable. A payout retry must not create a second debit or Stripe transfer. Activity verification must not be labeled as payment completion. Platform fees must never enter the driver wallet. No historical transaction may be re-settled solely because this architecture changed.

**Implications:** Immediate Stripe destination transfers from owner approval must be removed or disabled for driver incentives. Approval creates a payment obligation and wallet entitlement, not a direct external payout. Pending and available wallet states require a separately approved transition rule. Scheduled settlement must create compatible pending-ledger records. Driver withdrawal through Stripe must be idempotent and reconciled. Reporting must distinguish driver incentive, platform fee, owner charge, wallet settlement state, and external Stripe payout state.

**Related Documents:** [CTX-ARCH-006](../architecture/driver-incentive-and-financial-settlement-architecture.md), [CTX-ARCH-001](../architecture/financial-architecture-and-kpi-specification.md), [CTX-ARCH-003](../architecture/driver-operations-architecture.md), [Project Context](../project/project-context.md), [Platform Strategy](../vision/platform-strategy.md), [Data Strategy](./data-strategy.md).

## PD-046 - Zero-Incentive Payment Representation

**Context:** A location may intentionally configure a zero driver incentive while the approved transaction still owes a platform fee and requires idempotent financial reporting.

**Decision:** Approval of an otherwise eligible zero-incentive activity creates one payment obligation with `payments.amount = 0.00` and the applicable platform fee. The owner is charged only the platform fee. No driver transfer or wallet value is created. The eligible reward entry remains amount-independent.

**Rationale:** A zero-dollar payment row preserves the one-obligation-per-activity relationship, owner-charge components, reporting lineage, and idempotency without fabricating driver value.

**Status:** Active

**Date:** 2026-07-12

**Current Scope:** Architecture and test contract only; no runtime or schema change is authorized.

**Guardrails:** Do not omit the owner-charge representation, infer a non-zero incentive, or create a zero-value transfer/wallet credit.

**Related Documents:** [CTX-ARCH-006](../architecture/driver-incentive-and-financial-settlement-architecture.md), [CTX-ARCH-001](../architecture/financial-architecture-and-kpi-specification.md).

## PD-047 - Driver Earnings and KPI Definitions

**Context:** Pending activity, approved obligations, paid settlement, and wallet balance answer different business questions. Unqualified earnings labels can imply payment before settlement.

**Decision:** Driver financial KPIs must distinguish Pending Review, Approved Incentives, Pending Earnings, Paid, Lifetime Paid, Wallet Pending, and Wallet Available. Pending activities are not earnings; verified activity does not prove payment; paid totals require canonical settlement evidence; wallet balances derive only from the wallet ledger. Avoid unqualified `Total Earned` when unpaid approvals are included.

**Rationale:** Honest labels protect driver trust and prevent activity, payment, settlement, and wallet values from being double-counted or conflated.

**Status:** Active

**Date:** 2026-07-12

**Current Scope:** Architecture, reporting, and future UI/test contract. Existing UI is not represented as compliant until remediated and validated.

**Guardrails:** Do not add a payment amount and a derived alias of the same incentive. Do not display `verified` as `paid`.

**Related Documents:** [CTX-ARCH-006](../architecture/driver-incentive-and-financial-settlement-architecture.md), [CTX-ARCH-003](../architecture/driver-operations-architecture.md), [CTX-ARCH-001](../architecture/financial-architecture-and-kpi-specification.md).

## PD-048 - Historical Financial Record Treatment

**Context:** Historical activity amounts may have been client-controlled and therefore do not all carry the provenance of a server-authoritative snapshot.

**Decision:** Preserve historical records, qualify uncertain activity amounts as legacy/unverified, quarantine uncertain unbilled records from automatic billing, and use an existing canonical payment as the financial reporting source when present. Do not recompute history from current location rates. Once money moved, changes require transaction-level reconciliation and an auditable correction or reversal.

**Rationale:** Silent recomputation destroys provenance and can create retroactive charges or payouts unsupported by the original agreement.

**Status:** Active

**Date:** 2026-07-12

**Current Scope:** Documentation and future reconciliation policy. No migration, backfill, or production repair is authorized.

**Guardrails:** Require data inventory, evidence, dry run, idempotency, authorization, and rollback/reconciliation planning before historical repair.

**Related Documents:** [CTX-ARCH-006](../architecture/driver-incentive-and-financial-settlement-architecture.md), [Data Strategy](./data-strategy.md), [Strategic Data Governance Principles (PD-038)](#pd-038---strategic-data-governance-principles).

## PD-049 - Financial Idempotency and Recovery Requirements

**Context:** External charges, local payment creation, wallet updates, rewards, webhooks, and retries can fail at different boundaries. Ordinary status checks alone do not prevent duplicate financial side effects.

**Decision:** Every approved activity, owner charge, driver settlement, wallet credit, reward entry, and Stripe operation must have a stable semantic identity and produce at most one active outcome under repeat or concurrent execution. External success followed by local failure must be recoverable under the same idempotency key without creating another charge or transfer. Balance and wallet-transaction writes must be atomic.

**Rationale:** Financial integrity requires deterministic recovery, not merely best-effort duplicate checks.

**Status:** Active

**Date:** 2026-07-12

**Current Scope:** Architecture and mandatory test contract. Future schema constraints or idempotency records require separate data inventory and migration approval.

**Guardrails:** Preserve audit history, support dry-run reconciliation, deduplicate webhooks, inspect unknown Stripe outcomes before retry, and never mutate a balance before securing the unique ledger source.

**Related Documents:** [CTX-ARCH-006](../architecture/driver-incentive-and-financial-settlement-architecture.md), [CTX-ARCH-001](../architecture/financial-architecture-and-kpi-specification.md), [CTX-STD-001](../standards/cretexchange-platform-standards.md).

## PD-050 - Facility Operational Access and Billing Readiness

**Decision:** The authoritative policy is documented in [PD-050 — Facility Operational Access and Billing Readiness](./PD-050-facility-operational-access-and-billing-readiness.md). An approved, operationally complete Facility may create, edit, activate, and manage participating locations without a saved payment method. Operational authorization and financial readiness are separate lifecycle states.

**Status:** Active

**Date:** 2026-07-14

**Current Scope:** Product policy only. Authorized Level 3 remediation is required before the legacy location payment-method gate changes in implementation.

**Guardrails:** Preserve authentication, administrative approval, profile completeness, ownership validation, address and location eligibility, active/visible controls, verification requirements, and auditability. Do not introduce a hidden override, administrative bypass, or financial mutation.

**Related Documents:** [PD-050 — Facility Operational Access and Billing Readiness](./PD-050-facility-operational-access-and-billing-readiness.md), [Project Context](../project/project-context.md), [CTX-UX-003](../ux/CTX-UX-003-first-time-user-journey-and-pilot-readiness.md), [CTX-ARCH-001](../architecture/financial-architecture-and-kpi-specification.md), [CTX-ARCH-006](../architecture/driver-incentive-and-financial-settlement-architecture.md), [PD-045 — Canonical Driver Settlement Rail](#pd-045---canonical-driver-settlement-rail).

## PD-053 - Canonical Financial Batch Lifecycle and Approval Policy

**Decision:** [PD-053](./PD-053-canonical-financial-batch-lifecycle-and-approval-policy.md) governs canonical weekly Facility periods, batch construction, review, approval, cancellation, Platform Operations authority, zero-fee waivers, late obligations, exception handling, and strict Phase 3B non-execution.

**Status:** Active

**Scope:** Assisted-pilot product and operational policy only. It does not authorize Facility collection, Driver settlement, wallet entitlement, provider execution, reconciliation mutation, migration, or production-data repair.

**Related Documents:** [CTX-ARCH-007](../architecture/CTX-ARCH-007-canonical-financial-batch-architecture.md), [PD-051](./PD-051-driver-activity-and-payment-lifecycle.md), [PB-001](../project/pilot/PB-001-cretexchange-pilot-baseline-v1.0.md), and [Assisted-Pilot Operations Runbook](../project/pilot/assisted-pilot-operations-runbook.md).

## PD-054 - Canonical Financial Visibility and Obligation Workflow

**Decision:** [PD-054](./PD-054-canonical-financial-visibility-and-obligation-workflow.md) defines the sole canonical non-executing financial destination, single verified-activity obligation model, structured creation reason, and truthful canonical visibility.
