# CTX-UX-006 — Facility Workspace Experience

**Status:** Experience-architecture specification

**Product:** CreteXchange

**Scope:** The participating Facility Workspace as the primary operational workspace for Facility Operators

## 1. Purpose

This specification defines how the Facility Workspace should behave as the operational command center for a participating Facility. It governs future workspace enhancements; it does not describe, certify, or authorize the current implementation.

Within five seconds, a Facility Operator should know:

- Am I approved to participate?
- Are Drivers waiting for me?
- Is activity awaiting review?
- Are any locations inactive, hidden, or otherwise unavailable?
- What should I do next?

The Workspace must support timely, fair, evidence-based operations. It is not an administrative portal or a collection of equally important cards.

## 2. Authority and Relationship

This specification extends and must be read with:

- [Project Context](../project/project-context.md)
- [CTX-UX-001 — First Impression and Onboarding Experience](./CTX-UX-001-first-impression-and-onboarding-experience.md)
- [CTX-UX-002 — Landing Page Content, Information Architecture, and Wireframe Specification](./CTX-UX-002-landing-page-content-information-architecture-and-wireframe-specification.md)
- [CTX-UX-003 — First-Time User Journey and Pilot Readiness](./CTX-UX-003-first-time-user-journey-and-pilot-readiness.md)
- [CTX-UX-004 — First-Time User Onboarding Experience](./CTX-UX-004-first-time-user-onboarding-experience.md)
- [CTX-UX-005 — Driver Dashboard Experience](./CTX-UX-005-driver-dashboard-experience.md)
- [PD-050 — Facility Operational Access and Billing Readiness](../product/PD-050-facility-operational-access-and-billing-readiness.md)
- [PD-051 — Driver Activity and Payment Lifecycle](../product/PD-051-driver-activity-and-payment-lifecycle.md)
- [PD-052 — Marketplace Trust, Administrative Activity Review, and Dispute Resolution](../product/PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md)
- [CTX-ARCH-002 — Owner Operations Architecture](../architecture/owner-operations-architecture.md)
- [CTX-ARCH-003 — Driver Operations Architecture](../architecture/driver-operations-architecture.md)
- [CTX-ARCH-004 — Admin Operations Architecture](../architecture/admin-operations-architecture.md)
- [CTX-ARCH-006 — Driver Incentive and Financial Settlement Architecture](../architecture/driver-incentive-and-financial-settlement-architecture.md)

Public-facing terminology is **Facility** and **Participating Facility**. Existing implementation may retain Owner role names where required. This document does not authorize new APIs, schemas, financial behavior, evidence storage, tracking, or implementation.

## 3. Design Philosophy

The Facility Workspace starts with current operational responsibility. It should guide the Operator toward the next authorized action: complete readiness, maintain an eligible location, review a pending Driver activity fairly, or respond to a legitimate Platform Operations request.

### Principles

- **Operational-first:** Approval, profile, location availability, and Driver review take priority over financial setup and optional detail.
- **Timely Driver support:** A Driver waiting for authorized review is a real operational responsibility and should be visible without searching.
- **Fair evidence review:** Decisions are based on authorized operational evidence, not assumption, reputation, convenience, or financial preference.
- **Marketplace trust:** Clear readiness, transparent review status, and accountable recovery pathways strengthen participation.
- **Progressive disclosure:** The Workspace summarizes the next responsibility and links to purpose-built Location, Activity, Notification, Profile, and support views.
- **Financial separation:** Billing, wallet, Stripe, payout, and settlement readiness remain distinct from Facility operational access under PD-050.
- **Mobile-first:** A Facility Operator must be able to identify and complete an urgent review or location-status action on a phone.
- **Accessibility by default:** Review state, urgency, and location availability must not rely on color or animation alone.
- **Bilingual by design:** English and Spanish must provide functionally equivalent operations, recovery instructions, and review meaning.

## 4. Canonical Information Architecture

The Workspace should follow this priority order. A missing source must be unavailable, not treated as a zero, complete, approved, or empty state.

| Priority | Section | Purpose and inclusion rule |
| --- | --- | --- |
| 1 | Workspace Purpose | Establish the Facility's active operational context and responsibility. |
| 2 | Facility Next Action | Show the single highest-priority authorized action. |
| 3 | Operational Readiness | Show approval, profile, and location readiness separately from financial setup. |
| 4 | Pending Driver Reviews | Surface the review queue and its oldest actionable item. |
| 5 | Location Management | Summarize location availability, active/visible status, and the direct management route. |
| 6 | Recent Driver Activity | Present concise, status-labeled operational history with an Activity route. |
| 7 | Notifications | Surface relevant Platform Operations, Driver, location, and marketplace updates. |
| 8 | Operational Health | Summarize workload, location availability, and review timeliness without presenting financial outcomes as operations. |
| 9 | Support | Provide an authorized recovery or escalation route. |
| 10 | Secondary Information | Low-frequency configuration, extended history, and optional financial setup belong below core actions or in dedicated views. |

The first mobile screen should contain the current operational context, the Facility Next Action, and the review or location-management route that is most relevant now.

## 5. Facility Next Action Engine

### Purpose

The Facility Next Action card explains what requires attention, why it matters, and where the Operator can act. It contains one primary CTA and may include one secondary detail or support link.

### Priority order

Use the first applicable, authoritative condition. Unavailable information is not an incomplete requirement.

1. Respond to an explicit Platform Operations request, supported safety issue, privacy concern, or authorized operational exception.
2. Review the oldest pending Driver activity that is available for authorized Facility review.
3. Address a supported activity correction, rejection follow-up, or dispute-awareness action through the authorized path.
4. Complete a required Facility profile correction.
5. Await administrative approval when approval is pending; show the current state and named correction, not an unsupported approval promise.
6. Create the first location once the Facility has operational authorization and required profile readiness.
7. Restore a location that should be available but is inactive, hidden, incomplete, or temporarily closed.
8. Review an operational notification or recent Driver activity when no higher-priority action exists.
9. Present a concise current state when the Facility is operationally ready and has no active obligation.

Financial setup, billing, wallet, Stripe, payout profile, and payment method state must not become the primary recommendation solely because they are incomplete.

## 6. Operational Readiness and Financial Separation

### Operational readiness

Operational readiness determines whether a Facility can participate in the approved workflow. It includes:

- authenticated and authorized Facility access;
- administrative approval where required;
- required Facility profile completion;
- first-location creation and required location information;
- active and visible location configuration; and
- applicable operational eligibility rules.

### Financial setup

Financial readiness includes billing, invoices, payment methods, Stripe, wallets, payouts, Treasury, collections, and settlement. It is separate from the operational readiness checklist.

Under PD-050, a saved payment method is not an operational prerequisite for an approved, operationally complete Facility to create, edit, activate, and manage locations. The Workspace must never imply otherwise. Financial setup may have its own clearly labeled destination when authorized, but it must not block first-location creation or ordinary Driver activity review.

## 7. Location Management

Location Management must present locations as operational availability, not as a static directory.

### Core actions

- **Create:** create a first or additional participating location only after the applicable operational authorization is satisfied.
- **Edit:** correct address, operating information, and other authorized operational configuration without obscuring current availability.
- **Activate:** make a location operationally active when its required configuration and eligibility conditions are met.
- **Visibility:** independently control whether an active location is discoverable to Drivers.
- **Availability:** show active and visible as distinct concepts; neither should be inferred from the other.
- **Temporary closure:** provide a clear, reversible operational state for a location that should not receive Drivers temporarily.
- **Location status:** summarize active, inactive, visible, hidden, incomplete, and temporarily unavailable states in plain language.

Future capacity, material intent, scheduled availability, multi-site delegation, and advanced operations are future extensions. They require separately approved product and architecture work.

## 8. Driver Review Experience

### Review queue

The review queue should prioritize actionable pending activity using a transparent policy, such as oldest pending first, with clear location and time context. It must not silently prioritize based on a configured incentive, account type, reputation, or unsupported scoring.

### Review action

The Workspace should help an Operator:

- identify that a Driver activity is awaiting operational review;
- access only the authorized evidence and context needed for a fair decision;
- verify or reject through the approved operational workflow;
- understand that verification is not payment, settlement, or material-quality certification;
- identify the participant-facing outcome and permitted next action; and
- route uncertainty, conflict, or evidence insufficiency through the authorized Platform Operations path.

### Evidence, comments, and communication

Evidence visibility must use minimum necessary access and respect the privacy, auditability, and authorization principles in PD-052. Comments, private notes, reason capture, and Driver communication require separately approved policy and implementation authority; future UI must distinguish participant-visible rationale from internal operational context.

### Time expectations

The Workspace may communicate an approved review target or aging state when one exists. It must not promise an unsupported turnaround time, automatically characterize a delayed review as misconduct, or create a payment implication. Aged work should receive an actionable reminder and, where authorized, Platform Operations escalation.

## 9. Trust, Fairness, and Accountability

Facility review affects Driver confidence and marketplace integrity. The Workspace should therefore:

- make pending workload visible without shaming the Operator;
- present evidence and review status neutrally;
- discourage arbitrary or convenience-based rejection;
- preserve a clear distinction between technical failure, insufficient evidence, duplicate concern, operational disagreement, and supported misconduct;
- make the authorized support or administrative-escalation path visible for real uncertainty; and
- avoid presenting any single signal as conclusive fault.

PD-052 governs the fairness, minimum-necessary evidence, impartiality, auditability, and dispute-awareness boundaries. Investigation triggers are not findings, and a rejected submission is not automatically fraudulent.

## 10. First-Time Facility Experience

### After registration

The Workspace should state whether administrative approval or named profile correction remains. It should explain the next operational step without suggesting that payment setup controls access.

### After approval

The Next Action becomes first-location creation. The Operator should understand address, operating information, active state, and visibility as practical participation choices.

### After first location

The Workspace should confirm the location's separate active and visible states and direct the Operator to maintain the information that Drivers need to discover and use it.

### After the first Driver activity

The review queue becomes primary. The Operator should understand that the item is awaiting operational review and should be handled fairly through the authorized workflow.

### After the first completed review

Temporary onboarding guidance disappears. Permanent workspace summaries remain: readiness, current pending reviews, locations, notifications, recent Driver activity, and contextual exception guidance.

## 11. High-Volume Facility Experience

At 100+ Driver submissions, the Workspace should emphasize open review count, oldest actionable work, location workload, exceptions, and filters rather than an expanding card feed. At 1,000+ submissions, queues, date/location/status filters, bulk-safe navigation, and review ownership become more important than dashboard detail. At 5,000+ submissions, dashboard content remains summarized; detailed operational reporting and review work belong in dedicated purpose-built views.

The Workspace must not attempt to display every Driver, submission, photo, notification, or review history item in the dashboard surface.

## 12. Notifications, Data States, and Recovery

### Notifications

Notifications are ordered by actionability, then recency. Appropriate categories include pending Driver review, Platform Operations request, location availability issue, supported activity exception, marketplace announcement, and informational update. The Workspace may show a concise unread preview and must link to the complete Notification or Message Center experience.

### Empty states

Required empty states include no pending Driver reviews, no locations, no active locations, no visible locations, no recent Driver activity, no notifications, and no support requests. Each state must explain the condition and offer one relevant operational action without blame or financial implication.

### Unavailable states

Unavailable information must be presented as unavailable, not zero, approved, inactive, paid, or complete. A failed review, location, notification, or readiness source must not disable unrelated Workspace functions.

### Loading states

Use compact, section-level loading placeholders for independent data. The primary operational shell should remain usable once it has enough authoritative information to direct the next action.

### Recovery states

Every recovery state answers: what happened, what remains available, what authorized action can be taken, and when to contact Platform Operations. Retries must be targeted, must not create duplicate reviews or submissions, and must never imply that a failed action completed.

## 13. Responsive, Accessibility, and Bilingual Requirements

### Responsive behavior

- **320px:** show one prioritized action and a one-column sequence; avoid horizontal scrolling; move low-frequency destinations to More or dedicated screens.
- **390px:** preserve readable review status, touch-friendly actions, and a visible next step.
- **Tablet:** use two-column grouping only where it preserves the action hierarchy and review clarity.
- **Desktop:** use space for related operational summaries and review context, not to elevate all secondary information equally.

### Accessibility

- Use one page-level `h1`, followed by ordered `h2` sections and `h3` cards.
- Use native buttons and links with visible focus and predictable keyboard order.
- Announce actionable queue changes, errors, unavailable states, and successful retries through appropriate live-region behavior.
- Pair color with text, status labels, and meaningful icons; respect reduced-motion preferences.
- Give review actions, status chips, notification badges, and location controls accessible names and contextual descriptions.
- Maintain logical focus when opening, completing, or recovering a review.

### Bilingual experience

English and Spanish must provide equivalent actions, readiness states, location states, review meaning, error recovery, and escalation guidance. Translation must preserve the difference between Pending Review, Verified, Rejected, unavailable information, and financial states. Missing translations must fall back safely without exposing raw keys. Final fluent Spanish review remains required before public release.

## 14. Platform Operations Touchpoints

Platform Operations is a role-appropriate partner, not an invisible override. Future touchpoints include approval review, profile correction, location eligibility issue, aged operational review, participant complaint, supported activity exception, dispute-awareness intake, privacy or safety escalation, and marketplace-support follow-up.

The Workspace should expose only the current state, the Operator's authorized action, and the available support route. It must not expose administrative queues, private Driver evidence, internal notes, other Facilities’ data, or unsupported promises about administrative outcomes.

## 15. Component Architecture Guidance

Future implementation should prefer these reusable boundaries:

- `FacilityNextActionCard`
- `FacilityOperationalReadinessCard`
- `FacilityReviewQueuePreview`
- `FacilityLocationStatusSummary`
- `FacilityRecentDriverActivityCard`
- `FacilityNotificationPreview`
- `FacilityOperationalHealthSummary`
- `WorkspaceDataState`
- `useFacilityWorkspaceQueries`
- `useFacilityReviewQueue`
- `useFacilityLocationReadiness`

These components should consume documented canonical authorization, activity-status, and evidence sources. They must not duplicate financial calculations, review authority, location eligibility logic, or settlement rules.

## 16. UX Success Metrics

Subject to separate privacy and instrumentation approval, pilot observation may assess:

- time from Workspace arrival to first meaningful operational action;
- Facility approval and first-location completion;
- time from Driver submission to Facility review;
- pending-review backlog and aging;
- active and visible location maintenance;
- rejection comprehension and authorized correction/escalation use;
- support contacts attributable to unclear readiness or review steps;
- mobile completion of urgent review and location-status tasks; and
- English/Spanish functional equivalence.

These are observation goals, not authorization to add tracking or automated scoring.

## 17. Implementation Roadmap

Each phase must be independently scoped, audited, and validated.

1. **Workspace hierarchy and terminology:** establish operational-first hierarchy and make financial separation explicit.
2. **Next action and readiness:** implement one authoritative next-action path and an operational-readiness card using existing sources where possible.
3. **Review queue and trust experience:** refine pending review, evidence context, rejection guidance, and Platform Operations escalation without changing review authority.
4. **Location operations and notifications:** refine location availability summaries, targeted alerts, and notification handoff.
5. **Responsive and accessibility closeout:** complete keyboard, focus, reduced-motion, screen-reader, bilingual, and narrow-screen validation.

## 18. Out of Scope

This specification does not authorize or define:

- Treasury;
- Stripe implementation;
- settlement behavior or settlement engine work;
- billing, payment, wallet, or payout calculations;
- Admin evidence viewer implementation;
- Platform Operations Center implementation;
- Driver Dashboard implementation;
- backend, API, storage, schema, migration, routing, authentication, or authorization changes; or
- future Construction Circular Economy Intelligence Platform capabilities.

## 19. Decision Filter

Before changing the Facility Workspace, ask:

> Does this help a Facility Operator complete a truthful, fair, authorized operational action without confusing operational readiness or review with financial setup or settlement?
