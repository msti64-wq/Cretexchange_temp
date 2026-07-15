# CTX-UX-007 — Platform Operations Center Experience

**Status:** Experience-architecture specification

**Product:** CreteXchange

**Scope:** The Platform Operations Center (POC) as the primary operational workspace for authorized CreteXchange administrators

## 1. Purpose

The Platform Operations Center is the operational command center for CreteXchange administrators. Its purpose is to maintain marketplace integrity, operational continuity, participant trust, and pilot success.

It is not simply an administrative dashboard. It helps authorized operators understand the health of the marketplace, identify the one most urgent operational need, and take or assign an appropriate evidence-based action.

Within five seconds, Platform Operations should know:

- current marketplace health;
- Driver and Facility participation at a summary level;
- whether activities await review and are aging;
- whether a trust issue, escalation, or operational incident requires attention; and
- what immediate intervention, if any, is authorized.

This specification governs future Platform Operations interfaces. It does not describe, certify, or authorize the current implementation.

## 2. Authority and Relationship

This specification extends and must be read with:

- [Project Context](../project/project-context.md)
- [CTX-UX-001 — First Impression and Onboarding Experience](./CTX-UX-001-first-impression-and-onboarding-experience.md)
- [CTX-UX-002 — Landing Page Content, Information Architecture, and Wireframe Specification](./CTX-UX-002-landing-page-content-information-architecture-and-wireframe-specification.md)
- [CTX-UX-003 — First-Time User Journey and Pilot Readiness](./CTX-UX-003-first-time-user-journey-and-pilot-readiness.md)
- [CTX-UX-004 — First-Time User Onboarding Experience](./CTX-UX-004-first-time-user-onboarding-experience.md)
- [CTX-UX-005 — Driver Dashboard Experience](./CTX-UX-005-driver-dashboard-experience.md)
- [CTX-UX-006 — Facility Workspace Experience](./CTX-UX-006-facility-workspace-experience.md)
- [PD-050 — Facility Operational Access and Billing Readiness](../product/PD-050-facility-operational-access-and-billing-readiness.md)
- [PD-051 — Driver Activity and Payment Lifecycle](../product/PD-051-driver-activity-and-payment-lifecycle.md)
- [PD-052 — Marketplace Trust, Administrative Activity Review, and Dispute Resolution](../product/PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md)
- [CTX-ARCH-002 — Owner Operations Architecture](../architecture/owner-operations-architecture.md)
- [CTX-ARCH-003 — Driver Operations Architecture](../architecture/driver-operations-architecture.md)
- [CTX-ARCH-004 — Admin Operations Architecture](../architecture/admin-operations-architecture.md)
- [CTX-ARCH-006 — Driver Incentive and Financial Settlement Architecture](../architecture/driver-incentive-and-financial-settlement-architecture.md)

Platform Operations Center is the preferred architectural term for the administrator experience. Existing implementation may retain “Admin Dashboard” terminology until separately approved UX cleanup.

This document does not authorize new APIs, schemas, evidence storage, financial behavior, privacy-sensitive analytics, automation, or implementation.

## 3. Design Philosophy

The POC is operational-first. It should make marketplace conditions clear without turning every metric into an alert or every pattern into a finding of fault.

### Guiding principles

- **Operational-first:** Marketplace continuity, participant readiness, pending work, and real exceptions take precedence over optional administration.
- **Trust through transparency:** Show what is known, unavailable, aging, assigned, acknowledged, and resolved without inventing certainty.
- **Evidence before action:** A signal may justify review or escalation; it does not by itself establish fault, fraud, or a financial outcome.
- **Least privilege:** Show only the minimum participant, evidence, and financial context needed for the Operator's authorized purpose.
- **Progressive disclosure:** The POC summarizes operational state; detailed review, investigation, and specialized tools belong in dedicated experiences.
- **Accessibility by default:** Alert severity, work ownership, and status must never rely on color or visual density alone.
- **Bilingual readiness:** Operator-facing English and Spanish must preserve state, urgency, authority, and recovery meaning.
- **Operational efficiency:** One primary recommendation, targeted queues, concise summaries, and durable filters reduce unnecessary navigation and support work.
- **Auditability:** Material administrative actions must be explainable, attributable, and recorded through authorized future workflows.

## 4. Canonical Information Architecture

The POC should use the following hierarchy. Sections may be unavailable, compact, or omitted when no authoritative source is available; they must never be replaced by fabricated zeroes or unsupported assurances.

| Priority | Section | Purpose and inclusion rule |
| --- | --- | --- |
| 1 | Platform Health | Establish current marketplace and pilot health at an aggregate, non-financial level. |
| 2 | Immediate Actions | Show one highest-priority authorized operational action. |
| 3 | Marketplace Activity | Summarize activity throughput, pending review, review aging, and operational latency. |
| 4 | Driver Operations | Summarize Driver participation, readiness blockers, and support demand without exposing private financial information. |
| 5 | Facility Operations | Summarize Facility approval, location participation, availability, and review backlog without conflating financial setup. |
| 6 | Activity Review Queue | Direct Operators to outstanding, authorized review work. |
| 7 | Trust Indicators | Present investigation triggers and evidence availability neutrally, never as automatic findings. |
| 8 | Operational Alerts | Surface acknowledged and unacknowledged incidents, their owner, severity, and recovery state. |
| 9 | Notifications | Surface relevant pilot, administrative, and operational updates. |
| 10 | Support | Show pilot support demand, authorized escalation, and participant-impact context. |
| 11 | Analytics | Provide governed aggregate operational analysis and links to dedicated reports. |
| 12 | Administrative Tools | Provide role-authorized routes to configuration and management tools without displacing urgent operations. |
| 13 | Future Modules | Reserve clearly labeled space for separately approved capabilities; do not imply their current availability. |

## 5. Operational Priority Engine

### Purpose

The Immediate Actions surface explains the one operational priority that needs attention now, why it matters, what evidence or condition supports the recommendation, and the authorized next route. It has one primary CTA and may include one secondary detail or escalation link.

### Priority order

Use the first applicable authoritative condition. An unavailable source is not an incident, backlog, or completed state.

1. Critical operational incident affecting marketplace availability, participant safety, privacy, integrity, or an approved pilot continuity threshold.
2. Time-sensitive authorized evidence review or escalation where delay could materially affect a pending activity, participant fairness, or marketplace trust.
3. Facility review backlog or aging activity that exceeds an approved operational target.
4. Driver backlog, onboarding blocker, or supported pilot issue that prevents ordinary participation.
5. System outage or a material service-degradation state with a documented operational recovery path.
6. Facility approval queue or named operational-profile correction requiring authorized action.
7. Unacknowledged operational alert with an assigned or assignable owner.
8. Pilot observation or support follow-up that is actionable but not urgent.
9. A concise “Marketplace is operating normally” state when no action is required.

The POC must not elevate financial, billing, Stripe, wallet, or settlement setup to an operational emergency unless a separately approved policy establishes an actual marketplace-impacting incident and authorized response.

## 6. Marketplace Health

Marketplace Health is an aggregate, operational summary. It may include:

- Driver participation and active operational accounts;
- Facility participation, approval, and location availability;
- activity throughput by an approved time range;
- pending-review volume and aging;
- review completion and operational latency;
- location coverage and availability; and
- pilot health indicators based on approved operational definitions.

Marketplace Health must distinguish activity, configuration, review, and financial state. It must not label verified activity as paid, use configured incentives as revenue, or report settlement completeness without the separately authoritative financial source.

## 7. Driver and Facility Operations

### Driver Operations

Driver Operations provides aggregate operational summaries: registration and profile readiness, active participation, activities awaiting review, rejected-activity support demand, notification needs, and authorized pilot blockers.

Under PD-051, the POC may distinguish operational activity from financial state only when each has the appropriate source. It must not expose private wallet, payout, payment instrument, Stripe, Treasury, settlement, tax, or other private financial information in broad Driver summaries.

### Facility Operations

Facility Operations provides aggregate operational summaries: approval status, profile readiness, first-location progress, active and visible locations, availability concerns, review backlog, and support needs.

Under PD-050, Facility operational authorization and financial readiness remain separate. The POC must not treat a payment method, billing status, wallet, Stripe, or payout state as a proxy for Facility operational access or location eligibility.

## 8. Activity Review Queue and Trust

The Activity Review Queue directs authorized Operators to operational work needing attention. It should summarize queue size, aging, assignment state, and a transparent order such as approved policy-based urgency followed by oldest actionable work.

The POC does not replace the dedicated review experience. **CTX-UX-007 governs the overall Platform Operations workspace. CTX-UX-008 governs the dedicated Administrative Activity Review experience used when an Operator opens an individual investigation.**

### Trust indicators

Trust indicators may identify that an authorized review or escalation could be warranted, including evidence gaps, repeated complaints, unusual rejection patterns, supported technical anomalies, or review backlog. They must:

- state the signal and available evidence limitation;
- avoid language that assumes fraud, fault, bad faith, or financial liability;
- provide the authorized next operational route; and
- preserve PD-052’s evidence-based, neutral, minimum-necessary, auditable approach.

No automated trust score, fraud score, disciplinary outcome, or AI determination is authorized by this specification.

## 9. Alerts, Notifications, and Support

### Operational alerts

Every alert should have a visible severity, current state, owner where assigned, acknowledgement state, escalation route, and resolution status.

| Level | Meaning | Expected POC behavior |
| --- | --- | --- |
| Critical | Immediate marketplace integrity, continuity, safety, privacy, or approved pilot-impact concern | Elevate as the single primary action and provide an authorized response or escalation. |
| High | Material backlog, outage, or participant-impacting exception | Show prominently with owner and target follow-up. |
| Moderate | Needs planned operational attention without immediate marketplace interruption | Include in the queue or operational summary. |
| Informational | Context, announcement, or completed state | Keep visible only when useful; do not compete with action-required work. |

Acknowledge means an authorized Operator has recognized the alert; it does not mean the condition is resolved. Resolution requires the appropriate documented operational outcome and, where applicable, an auditable record.

### Notifications

POC notifications may include pilot notices, administrative requests, participant-support needs, location issues, review workload, marketplace announcements, and current operational incidents. They should be ordered by actionability, then recency, and route to the appropriate authorized workspace.

### Support

Support summarizes operational demand and helps route an issue to the appropriate authorized owner. It must not provide shortcuts around evidence, review, authorization, privacy, payment, or settlement requirements.

## 10. First-Time Platform Operator Experience

The first POC experience should explain the workspace’s purpose, the Operator’s authorized role, the current marketplace state, and the next approved action. It should identify where to:

- understand Platform Health;
- find assigned or unassigned operational work;
- distinguish a review trigger from an administrative finding;
- view current Facility and Driver operational summaries;
- use approved support and escalation paths; and
- identify unavailable information without assuming a marketplace state.

Guidance must not grant authority that the Operator’s role does not possess. It should disappear once the Operator has completed the relevant onboarding and leave contextual help for genuine exceptions.

## 11. High-Volume Marketplace Experience

At approximately 10,000 Drivers, POC summary views should emphasize aggregate participation, queues, aging, assignment, and exception rates rather than individual record lists. At approximately 100,000 Drivers, regional or organizational segmentation, durable filters, role-aware queues, and trend summaries become essential. At millions of activities, the POC remains a concise operational command center while specialized reports, review tooling, and approved analytics handle detail.

The POC must not attempt to render all Drivers, Facilities, activities, notifications, evidence, or support records at once. Aggregate summaries and explicit drill-down routes preserve responsiveness and least privilege.

## 12. Data States and Recovery

### Empty states

Required empty states include no pending reviews, no aging work, no current incidents, no Facility approval backlog, no Driver onboarding blocker, no relevant support requests, no marketplace alerts, and no current notifications. Each must explain the condition and avoid representing absence of data as proof of marketplace health.

### Unavailable states

Unavailable data must be labeled unavailable, not zero, healthy, complete, approved, resolved, paid, or settled. A source failure must preserve the usability of unrelated POC sections and state the affected domain.

### Loading states

Use compact, section-level placeholders for independent data. The POC shell and an authoritative current priority should remain usable whenever enough information is available. Avoid large, shifting dashboards that obscure the queue or current incident during loading.

### Recovery states

Every recovery state should answer what happened, what remains available, who owns the next step, what authorized action is available, and when escalation is required. Retrying must be targeted and idempotent; it must not repeat an administrative action or imply success when a request failed.

## 13. Responsive, Accessibility, and Bilingual Requirements

### Responsive behavior

- **Mobile:** prioritize the single Immediate Action, alert acknowledgement, and assigned queue access; use concise summary cards and dedicated drill-down pages for detail.
- **Tablet:** retain alert, queue, and marketplace-health context without forcing horizontal scrolling or dense table-only interaction.
- **Desktop:** use wider layouts for related operational summaries, filters, and assignment context; do not make all modules equally prominent.

### Accessibility

- Use a page-level `h1`, ordered section headings, and descriptive card headings.
- Preserve keyboard navigation, visible focus, predictable focus return, and native control semantics.
- Announce new critical alerts, targeted retry outcomes, queue changes, and unavailable states through appropriate live-region behavior.
- Pair severity color with text, iconography, and a clear status label; respect reduced-motion preferences.
- Provide screen-reader names and contextual descriptions for badges, filters, acknowledgements, assignments, and drill-down actions.

### Bilingual readiness

English and Spanish must provide equivalent workflow, urgency, authority, alert, review, and recovery meaning. Translation must distinguish a review trigger, evidence limitation, administrative review, determination, unavailable state, and resolved state. Missing translations must fall back safely without exposing raw keys. Final fluent Spanish review remains required before public release.

## 14. Component Architecture Guidance

Future implementation should prefer reusable, role-aware boundaries:

- `PlatformHealthSummary`
- `PlatformImmediateActionCard`
- `MarketplaceActivitySummary`
- `DriverOperationsSummary`
- `FacilityOperationsSummary`
- `ActivityReviewQueuePreview`
- `TrustIndicatorPreview`
- `OperationalAlertCenter`
- `PlatformNotificationPreview`
- `PlatformSupportQueuePreview`
- `OperationalAnalyticsSummary`
- `PlatformDataState`
- `usePlatformOperationsQueries`
- `usePlatformOperationalPriority`

These components must consume documented canonical sources, enforce role-aware data minimization, and avoid duplicating authorization, lifecycle, financial, evidence, or trust-determination logic.

## 15. UX Success Metrics

Subject to separate privacy, product, and instrumentation approval, pilot observation may assess:

- time from POC arrival to acknowledgement or assignment of the highest-priority item;
- review queue aging and time to authorized resolution;
- Facility approval and location-availability turnaround;
- Driver and Facility operational blocker resolution;
- support escalation routing accuracy;
- alert acknowledgement versus verified resolution time;
- operator comprehension of evidence limitation and administrative neutrality;
- mobile, tablet, and desktop task completion; and
- English/Spanish functional equivalence.

These are observation goals, not authorization to add tracking, profiling, automated enforcement, or participant scoring.

## 16. Implementation Roadmap

Each phase must be independently scoped, audited, and validated.

1. **POC hierarchy and terminology:** establish operational-first information hierarchy, aggregate marketplace health, and truthful unavailable states.
2. **Priority and queue experience:** implement the single operational priority engine, immediate-action card, and review-backlog summary using existing authoritative sources where possible.
3. **Driver, Facility, and alert summaries:** add role-appropriate aggregate operations, assignment, acknowledgement, and escalation presentation without expanding administrative authority.
4. **Trust and support integration:** refine neutral trust indicators, support routing, notifications, and links to the dedicated administrative review experience.
5. **Responsive and accessibility closeout:** complete keyboard, focus, reduced-motion, screen-reader, bilingual, mobile, tablet, and desktop verification.

## 17. Out of Scope

This specification does not authorize or define:

- evidence viewer implementation;
- Treasury;
- Stripe implementation;
- settlement engine behavior;
- payment, billing, wallet, payout, or accounting calculations;
- database tools;
- developer tools;
- automated fraud, trust, disciplinary, or AI decision systems;
- backend, API, storage, schema, migration, routing, authentication, or authorization changes; or
- future Construction Circular Economy Intelligence Platform capabilities.

## 18. Decision Filter

Before changing the Platform Operations Center, ask:

> Does this help an authorized Operator identify and take one truthful, evidence-based operational action while preserving least privilege, neutrality, and auditability?
