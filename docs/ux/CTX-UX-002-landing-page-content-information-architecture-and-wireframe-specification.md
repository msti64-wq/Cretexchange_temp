# CTX-UX-002 — Landing Page Content, Information Architecture, and Wireframe Specification

**Document ID:** CTX-UX-002

**Status:** Approved for Implementation Planning

**Product:** CreteXchange

**Scope:** Public landing-page information architecture, experience flow, content framework, navigation philosophy, and wireframe structure

## 1. Purpose

This document is the architectural blueprint for a future CreteXchange public landing page. It expands [CTX-UX-001 — First Impression and Onboarding Experience](./CTX-UX-001-first-impression-and-onboarding-experience.md) by defining the page's information hierarchy, content framework, experience flow, navigation philosophy, and layout structure.

The landing page is the first step in onboarding. Its job is to help a visitor understand the current operational value of CreteXchange, select the relevant role, and begin an appropriate next step. It is not a traditional marketing page whose success is measured only by attention or broad claims.

This is not an implementation specification, React design, route definition, or styling plan. Future implementation requires separately approved scope and validation.

### Approved decision — initial hero content

The following are approved content decisions for the initial landing-page implementation unless changed through subsequent UX review:

- **Headline:** “Connecting Construction Through Verified Material Recovery”
- **Supporting statement:** “CreteXchange connects drivers with participating material recovery facilities, helps facility operators manage verified activity, and builds the operational foundation for a more connected construction industry.”
- **Primary calls to action:** “Register as a Driver” and “Register as a Facility”
- **Secondary call to action:** “Learn More”

These decisions are intentionally limited to the initial public-page experience. They do not authorize new product claims, routes, workflows, or implementation.

## 2. Success Criteria

A first-time visitor should be able to understand within approximately 10–15 seconds:

- what CreteXchange is;
- who it serves today;
- why it provides practical value; and
- what action to take next.

The landing-page experience should also:

- make Driver and Facility Owner paths distinguishable without requiring account knowledge;
- use only supportable, current-MVP claims;
- provide a clear, role-appropriate registration or authentication entry point;
- maintain an understandable mobile reading order; and
- leave visitors with confidence that the platform is professional, operational, and trustworthy.

## 3. Audience Prioritization

### Primary audience

| Audience | Goals | Primary concerns | Desired first action |
| --- | --- | --- | --- |
| Concrete Drivers | Locate an eligible facility, understand the workflow, and record verified operational activity. | Wasted time, unclear instructions, eligibility uncertainty, and cumbersome signup. | Select the Driver path and begin or continue registration. |
| Facility Owners | Make a facility ready and discoverable, understand participation, and manage operational information. | Setup effort, loss of control, unclear value, and disruption to operations. | Select the Facility path and begin or continue registration. |

### Secondary audience

| Audience | Goals | Primary concerns | Desired first action |
| --- | --- | --- | --- |
| Ready Mix Producers | Understand whether the operational network can support current workflows. | Fit with existing operations and clear facility participation. | Review the current operational model; use the relevant participation path where applicable. |
| General Contractors | Understand the practical role of verified facility activity in construction operations. | Operational reliability and unsupported claims. | Learn the current scope; do not infer unimplemented contractor tooling. |
| Material Suppliers | Understand the network's direction and present operational foundation. | Relevance, governance, and future-marketplace assumptions. | Learn the current MVP boundary and future direction without expecting current integration. |

### Future audience

| Audience | Goals | Primary concerns | Desired first action |
| --- | --- | --- | --- |
| Municipalities | Understand the future potential for governed, aggregated operational insight. | Privacy, methodology, and public accountability. | Learn about the future direction only. |
| State Agencies | Understand possible future planning and recovery-data value. | Governance, procurement, and reliable evidence. | Learn about the future direction only. |
| Environmental Organizations | Understand the platform's evidence-oriented recovery direction. | Unsupported environmental claims and data quality. | Learn about the future direction only. |
| Researchers | Understand future opportunities for governed, traceable data. | Consent, data governance, and methodological rigor. | Learn about the future direction only. |
| Investors | Understand the practical MVP foundation and long-term network potential. | Unproven scale and overstated capabilities. | Understand the current MVP and strategic direction. |

Future-audience references must not displace the two primary onboarding paths or imply that future products are available today.

## 4. Experience Flow

```text
Visitor
↓
Landing Page
↓
Driver or Facility selection
↓
Registration
↓
Profile completion
↓
Operational Dashboard
↓
First Verified Activity
↓
Continued Engagement
```

The page should progressively move a visitor from orientation to role selection. Registration and profile completion are distinct steps: the public experience should not imply that a visitor is operationally ready before the applicable profile and configuration requirements are complete. Continued engagement is supported by the relevant authenticated workspace, not by the public page.

## 5. Messaging Framework

The following framework summarizes message intent. The approved Hero and section-content decisions in this document are authoritative for initial implementation; minor implementation copy may refine wording only when it preserves those approved meanings and remains supported by current functionality.

| Page section | Objective | Primary message | Desired visitor understanding | Desired action |
| --- | --- | --- | --- | --- |
| Header | Establish orientation and entry points. | `[Brand]`, `[role paths]`, `[sign in]`. | CreteXchange has clear paths for participants. | Navigate or sign in. |
| Hero | Explain the product and immediate next step. | `[Trusted operational network for construction professionals and verified facilities]`. | The platform is operational, construction-focused, and relevant today. | Select Driver or Facility path. |
| Value Proposition | State the practical benefit without hyperbole. | `[Clearer facility participation and verified operational activity]`. | The platform reduces uncertainty in real workflows. | Continue learning or select a role. |
| How It Works | Make the process credible and simple. | `[Choose role → complete setup → use the workflow → record verified activity]`. | The journey is understandable and role-aware. | Begin the applicable path. |
| Driver Benefits | Address driver needs directly. | `[Find eligible facilities and complete verified activity]`. | Driver value is practical and field-oriented. | Start as a Driver. |
| Facility Benefits | Address owner needs directly. | `[Prepare, configure, and participate as a facility]`. | Facility participation is controllable and operational. | Start as a Facility Owner. |
| Operational Trust | Explain why the experience is credible. | `[Clear workflows, verified operational activity, and transparent terms]`. | Trust is based on practical process, not unsupported claims. | Continue with confidence. |
| Future Vision | Place the MVP in a long-term context. | `[Today's operational foundation supports a future intelligence platform]`. | Future direction exists but is not a present feature claim. | Understand the direction; do not expect a product action. |
| Footer | Provide durable support and trust references. | `[Support, legal, accessibility, and essential navigation]`. | Practical information remains available. | Access the relevant resource. |

## 6. Landing Page Information Architecture

### Header

| Item | Definition |
| --- | --- |
| Purpose | Establish brand recognition, orientation, and authenticated entry. |
| Target audience | All visitors, especially returning drivers and facility owners. |
| Content summary | Brand, concise primary navigation, sign-in entry, and role-aware registration access. |
| Primary CTA | `Sign in` or a role-selection entry point, depending on visitor context. |
| Visual intent | Calm, persistent orientation without competing with the hero. |

### Hero

| Item | Definition |
| --- | --- |
| Purpose | Explain what CreteXchange is and prompt a role-aware decision. |
| Target audience | Concrete Drivers and Facility Owners. |
| Content summary | Short product definition, practical operational value, and two clearly differentiated role actions. |
| Primary CTA | `Register as a Driver` or `Register as a Facility`; each action begins its respective journey. |
| Visual intent | Professional construction operations, coordination, and confidence. |

### Value Proposition

The Value Proposition immediately follows the Hero. It answers, **“Why should I use CreteXchange?”** through three equally weighted cards. It explains practical operational value available in today's MVP; it does not describe implementation details or overstate future capabilities.

#### Card One — Keep Projects Moving

| Item | Definition |
| --- | --- |
| Objective | Make the practical driver and construction-operations value clear and motivate registration. |
| Audience | Drivers and construction operations. |
| Visitor question answered | How does CreteXchange help me keep work moving? |
| Headline | Keep Projects Moving. |
| Supporting message | CreteXchange helps reduce uncertainty around participating material-recovery locations and verified activity so drivers and projects can continue moving. |
| Key benefits | Find participating facilities; reduce operational uncertainty; complete verified activity; maintain an operational record; return to work with confidence. |
| Primary CTA | Register as a Driver. |
| Visual intent | Professional construction operations emphasizing movement, confidence, and productivity. |
| Success criteria | A first-time driver immediately understands the operational value and is encouraged to begin registration. |

#### Card Two — Connect with Participating Drivers

| Item | Definition |
| --- | --- |
| Objective | Make the facility participation value clear and motivate registration. |
| Audience | Facility Owners. |
| Visitor question answered | Why should I participate? |
| Headline | Connect with Participating Drivers. |
| Supporting message | Participating facilities can receive drivers, review verified activity, manage locations, and gain operational visibility. |
| Key benefits | Welcome participating drivers; manage facility locations; review and verify activity; configure driver incentives where applicable; view operational intelligence. |
| Primary CTA | Register as a Facility. |
| Visual intent | Professional facility operations emphasizing coordination, management, and trusted participation. |
| Success criteria | A facility owner understands the operational benefits and is encouraged to register. |

#### Card Three — Why Verification Matters

| Item | Definition |
| --- | --- |
| Objective | Explain the network-level value of verified activity without making future capabilities a current claim. |
| Audience | All Visitors. |
| Visitor question answered | Why should I trust this platform? |
| Headline | Why Verification Matters. |
| Supporting message | Verified activity creates a more trustworthy operational record and strengthens the network for drivers, facilities, and platform operators. |
| Key benefits | Clear workflows; reviewed activity; consistent operational records; trusted network participation; better operational visibility. |
| Primary CTA | Continue to How It Works or return to the applicable registration action. |
| Visual intent | Connected operations and trusted participation, not technology for its own sake. |
| Success criteria | Visitors understand why verified activity differentiates CreteXchange and how it supports the platform's long-term direction. Verification is operational; it does not imply payment, settlement, compliance certification, or a government guarantee. |

### Section-level success criteria

After this section, visitors understand how CreteXchange helps drivers today, how it helps facilities today, why verified activity is its defining characteristic, and why registration is worthwhile. The section naturally guides visitors to registration before they continue to How It Works.

### How It Works

| Item | Definition |
| --- | --- |
| Purpose | Reduce uncertainty by showing a simple journey. |
| Target audience | Visitors evaluating whether onboarding is manageable. |
| Content summary | Role selection, registration, profile completion, operational workflow, and verified activity. |
| Primary CTA | Begin the applicable role path. |
| Visual intent | Sequential, readable steps with no implication that every step is instantaneous. |

### Driver Benefits

| Item | Definition |
| --- | --- |
| Purpose | Make the driver use case specific and credible. |
| Target audience | Concrete Drivers. |
| Content summary | Facility discovery, clearer workflow context, and verified operational activity. |
| Primary CTA | `Get started as a Driver`. |
| Visual intent | Mobile-capable field operations and professional logistics. |

### Facility Benefits

| Item | Definition |
| --- | --- |
| Purpose | Make facility participation specific and credible. |
| Target audience | Facility Owners. |
| Content summary | Operational readiness, configuration, discoverability, and appropriate activity visibility. |
| Primary CTA | `Get started as a Facility Owner`. |
| Visual intent | Organized facilities, infrastructure, and operational control. |

### Operational Trust

| Item | Definition |
| --- | --- |
| Purpose | Build confidence through accuracy and process clarity. |
| Target audience | All visitors. |
| Content summary | Verified operational activity, transparent terminology, clear workflows, and professional standards. |
| Primary CTA | Return to the relevant registration path. |
| Visual intent | Clear, restrained, and evidence-oriented. |

### Future Vision

| Item | Definition |
| --- | --- |
| Purpose | Connect the MVP to the long-term mission without overstating the present. |
| Target audience | Secondary and future audiences; primary audiences seeking context. |
| Content summary | Today's trusted operational network is a foundation for future Construction Circular Economy Intelligence Platform direction. |
| Primary CTA | Learn more only if an approved, accurate strategic reference exists. |
| Visual intent | Broad construction ecosystem and infrastructure—not speculative product imagery. |

### Footer

| Item | Definition |
| --- | --- |
| Purpose | Provide supporting navigation and trust resources. |
| Target audience | All visitors. |
| Content summary | Essential links, support, legal information, privacy, accessibility, and role-aware entry points. |
| Primary CTA | Contextual support or authenticated entry; no competing promotional action. |
| Visual intent | Stable, readable closure to the experience. |

## 7. Wireframe Specification

This section specifies hierarchy and arrangement only. It does not prescribe styling, components, breakpoints, or implementation technology.

| Section | Desktop arrangement | Mobile arrangement |
| --- | --- | --- |
| Header | Brand at the start; concise navigation and sign-in/registration entry at the end. | Brand and essential entry visible; secondary navigation collapses into an accessible menu pattern. |
| Hero | Product definition and role actions alongside a construction-operations visual or supporting visual field. | Product definition first, role actions immediately after, supporting visual below or between nonessential supporting content. |
| Value Proposition | Short lead statement followed by a small number of scannable operational-value points. | Lead statement followed by vertically stacked, scannable points. |
| How It Works | Sequential steps read left to right or top to bottom with a clear progression. | Steps read top to bottom; each step retains its order and simple action relationship. |
| Driver Benefits | Driver message and role CTA paired with supporting operational context. | Driver message, supporting context, then Driver CTA in a single clear flow. |
| Facility Benefits | Facility message and role CTA paired with supporting operational context. | Facility message, supporting context, then Facility CTA in a single clear flow. |
| Operational Trust | Concise trust principles grouped for scanning. | Principles stack in the same logical order with no hidden meaning. |
| Future Vision | Restrained context statement separated from MVP actions. | Context statement after core MVP paths; it remains visually and semantically secondary. |
| Footer | Grouped support and legal links arranged for scanning. | Links stack in logical groups with accessible touch targets. |

Across layouts, role-selection actions must remain easy to find, text must precede decorative content where needed for comprehension, and the mobile path must not require horizontal reading or visual inference.

## 8. Navigation Philosophy

### Header behavior

The header should provide persistent orientation without becoming a second landing page. It should remain concise, preserve access to authentication, and avoid presenting future product areas as current navigation destinations.

### Primary navigation

Primary navigation should prioritize a small set of public, current-MVP destinations. It should support comprehension of the Driver and Facility paths rather than mirror every authenticated workspace or internal operational area.

### Authentication entry points

Returning users need an obvious, consistently named sign-in entry. Authentication should not be conflated with registration, and public messaging should not assume a visitor already has an account.

### Registration entry points

Registration should begin with explicit role selection when the role materially changes the onboarding path. Each entry point should explain enough to support a decision without requiring a visitor to study all role-specific detail first.

### Future navigation expansion

Future navigation may add approved participant or information areas only when they have a current product, authorization, and supported public claim. Navigation expansion must not lead the platform strategy or imply future marketplace, government, research, enterprise, or intelligence offerings are available.

## 9. Visual Language

The public experience should represent construction as a coordinated operational ecosystem. Appropriate visual direction includes:

- construction operations and field coordination;
- practical technology supporting real work;
- logistics, infrastructure, and organized facility activity;
- multiple construction vehicle types and participant roles; and
- professional environments, materials, equipment, and people.

Avoid imagery centered exclusively on concrete mixer trucks. CreteXchange serves today's concrete workflow, but the visual system should make room for the broader construction ecosystem and future platform direction without creating a false claim of present-day capability.

Future implementation should use visual hierarchy, spacing, typography, and accessible contrast to reinforce professionalism and clarity in accordance with the [Design documentation](../design/README.md).

## 10. Content Style Guide

### Preferred terminology

Use clear, specific language such as:

- verified
- participating
- trusted
- operational
- network
- material recovery
- facility
- driver
- workflow
- activity

Use role names and operational states consistently across the public experience and authenticated product.

### Language to avoid unless objectively supported

Do not use claims such as:

- industry-leading
- largest
- revolutionary
- AI-powered
- world-class

Avoid broad environmental, financial, settlement, scale, or performance claims unless the relevant governing documentation and current implementation support them. Prefer concrete explanations of the visitor's next step over promotional abstraction.

## 11. Trust Strategy

The landing page builds confidence through:

- a professional presentation that respects construction work;
- clear role-specific onboarding paths;
- accurate references to verified operational activity;
- transparent terminology and no hidden assumptions about readiness;
- simple, explainable workflows; and
- a consistent handoff into registration and authenticated workspaces.

Trust is weakened when the experience substitutes vague promises for operational clarity. The page must not imply payment completion, settlement, facility certification, environmental outcomes, or intelligence capabilities that are not supported by the current product.

## 12. Current MVP Positioning

### Today's operational capabilities

The public landing page should position current MVP value around participant onboarding, facility participation and discoverability, operational workflows, and verified activity. It should direct primary visitors to the Driver or Facility Owner path.

### Future platform evolution

The future Construction Circular Economy Intelligence Platform is a long-term direction governed by [Platform Vision](../vision/platform-vision.md) and [Platform Strategy](../vision/platform-strategy.md). The landing page may acknowledge that direction in a restrained Future Vision section, but it must not present future products, intelligence, or outcomes as current functionality.

## 13. Deliberate Exclusions

The landing page intentionally excludes detailed discussion of:

- government reporting;
- grant programs;
- Treasury;
- payments;
- settlement;
- advanced analytics;
- AI;
- enterprise intelligence; and
- Construction Circular Economy Intelligence Platform implementation details.

These topics may be referenced only as future direction where appropriate and never as an implied current capability. Financial, settlement, wallet, Stripe, billing, and related behavior remain governed by their applicable architecture and are not public landing-page claims.

## 14. UX Decision Filter

Every future landing-page change should answer:

- Does this improve first impressions?
- Does it reduce confusion?
- Does it increase trust?
- Does it encourage driver registration?
- Does it encourage facility registration?
- Does it support today's MVP?
- Does it preserve tomorrow's vision?

It should also answer whether it makes only supportable current-MVP claims. If the answer is no, defer the change unless it is necessary for accessibility, legal compliance, safety, or a separately approved operational requirement.

## 15. Future UX Architecture

The following planned documents establish UX as a governed architectural discipline:

| Document | Focus |
| --- | --- |
| [CTX-UX-001 — First Impression and Onboarding Experience](./CTX-UX-001-first-impression-and-onboarding-experience.md) | Foundational public-experience, first-impression, and onboarding philosophy. |
| CTX-UX-002 — Landing Page Content, Information Architecture, and Wireframe Specification | Public landing-page structure, content framework, navigation philosophy, and wireframe arrangement. |
| CTX-UX-003 — Driver Onboarding Experience | Planned driver onboarding architecture. |
| CTX-UX-004 — Facility Owner Onboarding Experience | Planned facility-owner onboarding architecture. |
| CTX-UX-005 — Platform Operations Center Experience | Planned administrator experience architecture. |
| CTX-UX-006 — Design System and Interaction Guidelines | Planned design-system and interaction guidance. |

Together, these documents define a governed UX architecture family. They inform future work but do not independently authorize implementation, new claims, or changes to product scope. [Sprint 2.2](../project/sprints/sprint-2.2.md) remains the current readiness-scope reference, and the [Development Protocol](../development-protocol.md) governs execution and validation.

## 16. Approved Hero Direction

### Purpose and audience focus

The hero is the page's orientation and decision point. Within approximately 10–15 seconds, it must help a first-time visitor understand what CreteXchange is, who it serves today, why it provides value, and what to do next.

It speaks first to drivers and participating facility operators. Other construction stakeholders should feel included by the construction-wide visual and respectful language, but the hero must remain optimized for initial MVP participants rather than attempting to address every future audience.

### Visual direction

The approved visual concept is **a modern construction environment representing multiple construction disciplines and material movements, combined with subtle technology overlays suggesting connected operations and verified activity.**

The visual may balance ready-mix or concrete operations, flatbed or tractor-trailer steel delivery, dump trucks or aggregate movement, cranes or structural construction, excavation or infrastructure work, workers coordinating activity, and a participating material recovery facility. Subtle network connections, location indicators, verification signals, or operational-data overlays may support the concept.

It must communicate **Construction + Connectivity + Trust**. Avoid a single concrete mixer truck as the dominant subject, equipment-catalog drama, futuristic or unrealistic effects, excessive dust or danger, visual clutter, or imagery that resembles a trucking company, concrete producer, or equipment dealer. The outcome should feel professional, modern, industrial, coordinated, technology-enabled, believable, and broad enough for future material-recovery expansion.

## 17. Language Accessibility

Multilingual support is an MVP onboarding requirement, not a future enhancement.

- English and Spanish are supported from the public landing page.
- English is the default unless a remembered preference exists.
- The header shows a visible language selector on desktop and an equally easy-to-find control on mobile.
- Labels use `English` and `Español`; flag icons alone are insufficient because language and nationality are not interchangeable.
- The selected language persists through registration, onboarding, and authenticated sessions wherever translations are available.
- Landing-page content, CTAs, validation messages, registration copy, and onboarding instructions support both languages.
- Translation preserves meaning and tone rather than relying on literal substitution.
- The architecture permits future languages without redesigning navigation or page structure.
- Missing translations fall back safely to English without exposing untranslated keys.
- Changing language must not reset or interrupt an in-progress registration flow.

## 18. Approved Page-Level Content Framework

This is the approved initial information order. Each section has one primary purpose and a mobile behavior; it does not prescribe a component or CSS implementation.

| Order and section | Purpose and visitor question | Primary audience and key message | Desired action | Visual intent and mobile behavior |
| --- | --- | --- | --- | --- |
| 1. Header | Where am I and how do I begin or return? | All visitors; CreteXchange has clear public and account entry points. | Navigate, sign in, register, or change language. | Sparse public header; essential controls remain visible or accessible through thumb-friendly targets. |
| 2. Hero | What is this, who is it for, and what should I do now? | Drivers and facility operators; approved hero content and role actions. | Register as a Driver, Register as a Facility, or Learn More. | Broad construction-and-connectivity visual; text and actions precede nonessential imagery on mobile. |
| 3. Value proposition | Why should I use CreteXchange? | Drivers, facility owners, and all visitors; three equally weighted cards explain current operational value. | Register as a Driver or Register as a Facility, then continue to How It Works. | Three balanced cards; vertically stacked cards with the same reading order on mobile. |
| 4. Immediate trust/value strip | Why should I take this seriously? | All visitors; Verified Activity, Participating Facilities, Built for Construction Professionals, Operational Visibility. | Continue to understand the workflow. | Concise concept strip; stacks into readable items on mobile. |
| 5. How It Works | How does participation work? | Drivers and facility operators; a role-aware, understandable path. | Begin the applicable path. | Sequential steps; top-to-bottom steps on mobile. |
| 6. Driver experience | What does a driver gain? | Drivers; identify participating facilities, reduce uncertainty, complete verified activity, maintain an operational record, and keep moving. | Register as a Driver. | Practical field/logistics context; message and CTA remain adjacent in reading order. |
| 7. Facility experience | What does a facility gain? | Facility operators; participate, receive and review activity, manage locations and configured incentives, and view operational intelligence. | Register as a Facility. | Organized facility and operating context; single-column flow on mobile. |
| 8. Operational trust | Why is the network credible? | All visitors; clear workflows, verified operational activity, and transparent terminology. | Continue with confidence. | Restrained, evidence-oriented content; no sensitive or unsupported metrics. |
| 9. Current platform and future direction | What exists now and what is only direction? | All visitors; current MVP first, future vision second. | Understand context, not a new product action. | Future direction remains visually secondary and lower on the page. |
| 10. Final registration CTA | What should I do next? | Drivers and facility operators; trusted participation begins with the applicable role. | Register as a Driver or Register as a Facility. | Clear closing choice; stacked, large actions on mobile. |
| 11. Footer | Where can I find support and essential information? | All visitors; approved practical references only. | Access the relevant resource. | Stable grouped links that stack without horizontal overflow. |

The immediate trust/value strip contains messaging concepts, not performance claims. It must not show user counts, facility counts, nationwide coverage, transaction counts, or recovery volumes unless a live value is accurate and approved for public display.

### How It Works framework

The MVP workflow is: (1) Register as a Driver or Facility, (2) Complete Profile and Location Setup, (3) Find or Manage a Participating Facility, (4) Submit and Review Verified Activity, and (5) Continue Using the Operational Network. The final design may present three or four visible steps for clarity, but must distinguish driver and facility paths where necessary and must not imply support for all material categories.

## 19. Header and Application Continuity

The public header contains the CreteXchange logo or wordmark, limited About or How It Works navigation, Login, a Register entry point, and the visible `English / Español` selector. It avoids mega menus, dense product navigation, financial or administrative links, government or enterprise navigation, and links to unimplemented capabilities.

On mobile, language selection, login, and registration remain easy to find; menu targets are large and thumb-friendly; and horizontal overflow is prohibited.

The landing page should feel continuous with the Driver Dashboard, Owner Dashboard, and Platform Operations Center when a visitor moves into registration or the authenticated application. Future implementation should align with the established typography, spacing, card language, button treatment, iconography, status patterns, surface hierarchy, and responsive behavior. It should not copy dashboard density; the public page remains open, inviting, and less dense.

## 20. Content Tone and Current/Future Boundary

The approved voice is clear, direct, respectful, confident, practical, professional, construction-aware, and free of unnecessary technical language. Preferred words include **verified, participating, trusted, operational, construction, network, facility, driver, material recovery, activity,** and **connected**. Use **marketplace, sustainability, compliance, circular economy,** and **intelligence** cautiously and only where supported.

Avoid unsupported language including **revolutionary, disruptive, industry-leading, largest, nationwide, AI-powered, world-class, guaranteed,** and **fully compliant**.

### Current platform

The current MVP begins with drivers, facility operators, participating washout and material-recovery locations, verified operational activity, and Driver, Owner, and Platform Operations Center experiences. Financial or payout messaging is excluded unless the relevant workflow is stable, approved, and intended for public communication.

### Future direction

CreteXchange is designed to support broader construction material recovery and future Construction Circular Economy Intelligence capabilities. Present this briefly and honestly near the lower part of the page, without dates, guarantees, or implementation claims. Do not lead with government intelligence, grant strategy, regional analytics, marketplace expansion, AI, forecasting, the Construction Circular Economy Index, or enterprise APIs.

## 21. Accessibility, Performance, and Measurement Requirements

### Accessibility

Future implementation must provide semantic heading order, keyboard-accessible navigation, visible focus states, sufficient contrast, accessible CTA labels, meaningful alternative text, no critical information embedded only in imagery, reduced-motion support, large mobile tap targets, readable text without zoom, no horizontal scrolling, and appropriate language-attribute updates when the selected language changes.

### Performance

The first public page should load quickly on mobile networks. Prefer optimized responsive images, defer noncritical visuals, avoid unnecessarily large hero assets and heavy animation libraries, avoid autoplay video, render meaningful content before decorative effects, preserve usability if the hero image fails, and never block registration navigation on optional visual assets. This document establishes no hard performance budget.

### Measurement without invasive tracking

Potential future events are Driver Registration selected, Facility Registration selected, Login selected, Learn More selected, Language changed, Registration started, and Registration completed. Any analytics requires separate approval and must minimize data, avoid unnecessary personal data and sensitive form data, and align with privacy requirements.

## 22. Footer Scope, Acceptance Test, and Implementation Readiness

The initial footer includes only approved useful links: About, Contact, Privacy, Terms, Login, and an optional secondary language selector. It excludes inactive social-media links, unsupported resources, and future product pages.

### First-time visitor acceptance test

Within approximately 15 seconds, a new visitor can answer:

- What is CreteXchange?
- Is it relevant to me?
- What does it do today?
- Why should I trust it?
- What should I do next?
- Can I use it in English or Spanish?

Also verify that a driver immediately finds driver registration, a facility operator immediately finds facility registration, the visual direction does not imply one vehicle or material type, and future vision does not obscure current MVP functionality.

### Implementation readiness criteria

Landing-page coding should not begin until this document contains approved hero content, CTAs, section order, audience priorities, language-accessibility behavior, visual direction, MVP/future boundary, desktop/mobile wireframe requirements, accessibility expectations, and acceptance criteria. Those requirements are now recorded.

## 23. One Question Rule

Every landing-page section answers one primary visitor question. A section must not attempt to answer multiple unrelated questions or repeat the entire platform story.

| Section | Primary visitor question |
| --- | --- |
| Hero | What is this? |
| Value Proposition | Why should I care? |
| Immediate Trust / Value Strip | What makes this credible and relevant? |
| How It Works | How do I get started? |
| Driver Experience | What is in it for me as a driver? |
| Facility Experience | Why should my facility participate? |
| Operational Trust | Can I trust the process? |
| Future Direction | Where is this platform going? |
| Final Call to Action | What should I do next? |

## 24. Approved Section Content Decisions

### How It Works

**Headline:** “Getting Started Is Simple”

**Supporting statement:** “Whether you are a driver looking for participating facilities or a facility ready to receive verified activity, getting started takes just a few simple steps.”

The approved four-step flow is:

1. **Join the Network** — Choose whether you are registering as a Driver or a Facility and create your account.
2. **Complete Your Profile** — Add the information needed to participate and begin using CreteXchange.
3. **Connect Through Verified Activity** — Drivers locate participating facilities. Facilities review and verify submitted activity. Each verified activity strengthens the operational network.
4. **Keep Projects Moving** — Continue using the network with confidence while CreteXchange provides operational visibility and trusted records.

The visible design may condense this to three or four steps and distinguish Driver and Facility paths. It must feel simple rather than procedural. Financial, wallet, Stripe, payout, reporting, and administrative details are excluded.

### Driver Experience

**Title:** “Built for Drivers”

**Primary question:** What is in it for me as a driver?
**CTA:** “Register as a Driver”

Use concise outcome-oriented content: find participating facilities, reduce uncertainty, complete verified activity, maintain a clear activity history, and keep moving. Do not lead with Stripe, wallet, rewards, payout timing, analytics, or compliance guarantees; those may be explained only later in appropriate onboarding or authenticated contexts.

### Facility Experience

**Title:** “Built for Participating Facilities”

**Primary question:** Why should my facility participate?
**CTA:** “Register as a Facility”

Approved themes are receiving participating drivers, managing locations, reviewing submitted activity, verifying operational activity, configuring supported incentives, gaining operational visibility, and strengthening a trusted recovery network. **Facility** is the preferred public term; **owner** may be used in registration or authenticated role terminology. Public copy must not imply guaranteed inbound business or revenue.

### Operational Trust

**Headline:** “Trust Begins with Verification”

**Primary question:** Can I trust the process?

Approved concepts are verified operational activity, transparent workflows, participating facilities, consistent operational records, professional platform operations, and clear role-based experiences. Verification is operational only: it is not payment, regulatory certification, a material-quality guarantee, or a legal/compliance claim.

### Future Direction

**Primary question:** Where is this platform going?

Approved language:

> CreteXchange begins by connecting drivers and participating material recovery facilities. As the network grows, it is designed to support broader construction material recovery and the long-term vision of the Construction Circular Economy Intelligence Platform.

Place this concise statement near the lower part of the page. It distinguishes future direction from current functionality and includes no dates, promises, grant strategy, government proposals, advanced analytics, AI claims, or detailed roadmap items. It must not overshadow the MVP.

### Final Call to Action

**Headline:** “Ready to Get Started?”

**Supporting direction:** “Choose the path that is right for you.”

Repeat only “Register as a Driver” and “Register as a Facility.” The closing section reinforces ease, trust, and current operational value, without introducing a competing CTA, and must work clearly in English and Spanish.

## 25. Approved Learn More Behavior

The Hero's “Learn More” action is approved to scroll to the **Value Proposition** on the same page. It must not route to a separate placeholder page. This target follows the approved information hierarchy and lets the visitor answer “Why should I care?” before continuing to How It Works.

## 26. Remaining Implementation-Readiness Items

The experience architecture is approved. The following are implementation-readiness items, not reasons to reopen it:

- confirm Driver registration route;
- confirm Facility registration route;
- confirm Login route;
- confirm About or How It Works anchor behavior;
- confirm Contact, Privacy, and Terms destinations;
- select or approve the CreteXchange logo or wordmark asset;
- approve or create the Hero visual asset;
- complete fluent Spanish copy review;
- verify public registration and onboarding translations; and
- confirm analytics events through a separate privacy review.

Final Spanish translations and destination URLs remain implementation-readiness items. Spanish copy requires fluent review before public release. Coding may begin only after these items are confirmed; language selection and translation behavior remain approved architecture.

## 27. CTX-UX-002 Approval

CTX-UX-002 is **Approved for Implementation Planning**. The experience architecture, approved Hero, section order, major messaging, audience priorities, multilingual requirements, visual direction, accessibility principles, and acceptance criteria are authoritative for the initial landing-page implementation.

Future implementation must not introduce unsupported capabilities or contradict the MVP/future boundary. Minor copy refinements may occur during implementation review only when they preserve the approved meaning and tone and remain consistent with [CTX-UX-001](./CTX-UX-001-first-impression-and-onboarding-experience.md) and this document. Material changes require owner UX review.
