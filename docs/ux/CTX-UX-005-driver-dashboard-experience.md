# CTX-UX-005 — Driver Dashboard Experience

**Status:** Experience-architecture specification

**Product:** CreteXchange

**Scope:** The Driver Dashboard as the primary operational workspace for Drivers

## 1. Purpose

This specification defines how the Driver Dashboard should behave as the Driver's operational command center. It governs future dashboard enhancements; it does not describe, certify, or authorize the current implementation.

Within five seconds, the Dashboard should help a Driver answer:

- Am I ready to work?
- What should I do next?
- Is anything blocking me?
- Is anything waiting on me?
- Has anything changed?

The Dashboard must reduce uncertainty, avoid unsupported financial claims, and reduce avoidable support contact. It is not a collection of equally important cards.

## 2. Authority and Relationship

This specification extends and must be read with:

- [Project Context](../project/project-context.md)
- [CTX-UX-001 — First Impression and Onboarding Experience](./CTX-UX-001-first-impression-and-onboarding-experience.md)
- [CTX-UX-002 — Landing Page Content, Information Architecture, and Wireframe Specification](./CTX-UX-002-landing-page-content-information-architecture-and-wireframe-specification.md)
- [CTX-UX-003 — First-Time User Journey and Pilot Readiness](./CTX-UX-003-first-time-user-journey-and-pilot-readiness.md)
- [CTX-UX-004 — First-Time User Onboarding Experience](./CTX-UX-004-first-time-user-onboarding-experience.md)
- [PD-050 — Facility Operational Access and Billing Readiness](../product/PD-050-facility-operational-access-and-billing-readiness.md)
- [PD-051 — Driver Activity and Payment Lifecycle](../product/PD-051-driver-activity-and-payment-lifecycle.md)
- [CTX-ARCH-003 — Driver Operations Architecture](../architecture/driver-operations-architecture.md)
- [CTX-ARCH-006 — Driver Incentive and Financial Settlement Architecture](../architecture/driver-incentive-and-financial-settlement-architecture.md)

This document is subordinate to the governing documentation hierarchy. It does not authorize new APIs, schemas, payment behavior, wallet behavior, Stripe behavior, settlement behavior, tracking, or analytics.

## 3. Design Philosophy

The Driver Dashboard is operational-first. It should lead a Driver toward a real field outcome: becoming ready, finding a participating Facility, completing an activity, understanding review status, or responding to a real exception.

### Principles

- **Operational-first:** Field readiness, location discovery, activity status, and required recovery actions take precedence over optional or financial detail.
- **Financial information follows operational progress:** Financial information may be shown only after the applicable operational state and authoritative financial evidence support it.
- **One recommended next action:** Present one primary recommendation, not a menu of competing priorities.
- **Truthful lifecycle presentation:** Pending Review, Verified, Pending Payment, Scheduled, Paid, and Exception must retain their defined meanings under PD-051.
- **Minimal cognitive load:** Summarize routine information; expose detail when the Driver asks for it or when action is genuinely required.
- **Mobile-first:** A Driver must be able to identify and complete the next core action with one hand on a phone.
- **Trust through transparency:** Explain what is known, what is unavailable, who acts next, and what the Driver can do.
- **Progressive disclosure:** Dashboard summaries link to purpose-built views for Activity, Locations, Wallet, Notifications, Rewards, and Profile.
- **Bilingual by design:** English and Spanish must provide equivalent actions, recovery paths, and lifecycle meaning.
- **Accessibility by default:** Status, priority, and completion must never depend on color, animation, or device-specific input alone.

## 4. Canonical Information Architecture

The Dashboard should use this order. A section may be compact, unavailable, or omitted when its authoritative input is unavailable or irrelevant; it must not be replaced with a fabricated zero.

| Priority | Section | Purpose and inclusion rule |
| --- | --- | --- |
| 1 | Dashboard Purpose | Establish that this is the Driver's field workspace and orient the Driver to the current operational context. |
| 2 | Driver Next Action Card | Show the one highest-priority action that the Driver can take now. |
| 3 | Operational Readiness | Summarize prerequisites for participation, including profile, accepted terms, and workflow-relevant GPS readiness. |
| 4 | Current Operational Status | Surface a real blocking, waiting, submitted, pending-review, verified, rejected, or Platform Operations state. |
| 5 | Location Discovery | Help the Driver find an eligible participating Facility without representing configured incentives as payment. |
| 6 | Activity Lifecycle | Separate Awaiting Review from Verified — Awaiting Payment and other financial states. |
| 7 | Notifications | Surface only the most relevant unread updates and link to Message Center. |
| 8 | Wallet Preview | Show the authoritative wallet balance separately from activity and payment-obligation counts. |
| 9 | Rewards | Show concise, non-financial reward-program information when the program is active or action-relevant. |
| 10 | Recent Activity | Show a concise, operationally labeled summary and link to Activity history. |
| 11 | Support | Offer a clear recovery path for a real unresolved problem. |
| 12 | Secondary Information | Preferences, history summaries, optional instruments, and low-frequency detail belong below the action-oriented content or in their dedicated destinations. |

The first screenful on a phone should contain the current operational context, the Next Action Card, and the primary location-discovery path. Financial and optional information must not displace a Driver's immediate field workflow.

## 5. Driver Next Action Card

### Purpose

The Driver Next Action Card is the canonical prioritization surface. It explains what is happening, why the action matters, and where to go. It has one primary CTA and may include one secondary support or detail link.

### Priority engine

Use the first applicable condition. An unavailable source may not be treated as an unmet condition.

1. Respond to an explicit Platform Operations request or a supported safety, account, or operational exception.
2. Resolve a verified canonical payment exception when authoritative financial evidence identifies one.
3. Address a rejected activity when the authorized correction or support path exists.
4. Complete missing required Driver profile information.
5. Accept current required terms.
6. Enable or recover GPS when the next relevant check-in workflow requires it.
7. Complete a partially uploaded or unsubmitted first activity where safe recovery state exists.
8. Find a participating Facility when the Driver is operationally ready and has no current activity requiring attention.
9. Review a newly verified operational activity or a newly available notification.
10. Present no action card when the Driver is current; use a concise “You are ready to find a participating Facility” operational state instead.

The card must not recommend payout setup, a debit card, wallet actions, or financial configuration merely because those states are incomplete. Those actions may appear only when they are optional, directly relevant, and not in conflict with the higher-priority operational path.

## 6. Operational and Financial Boundaries

### Operational information

Operational Dashboard information includes:

- profile and participation readiness;
- accepted terms;
- GPS availability for the applicable workflow;
- eligible participating Facilities;
- submitted, Pending Review, Verified, and Rejected activities;
- activity evidence or recovery guidance;
- notifications and Platform Operations notices.

### Financial information

Financial information includes:

- Verified — Awaiting Payment only when a verified activity has authoritative unpaid-obligation or pending-entitlement evidence;
- authoritative wallet balance;
- Payment Exception only when authoritative financial processing identifies it;
- future scheduled payments only when a canonical schedule exists; and
- payment or settlement history only when canonical reconciled evidence exists.

Under PD-051, verification is operational validity, not payment completion. A configured Facility incentive, activity amount, reward entry, Stripe account readiness, debit-card status, or wallet balance must not be presented as proof of a payment obligation, payment schedule, paid history, or settlement.

Under PD-050, Facility operational participation and financial readiness remain separate. Dashboard messaging must not imply that a Facility payment method is necessary for a Driver to discover or use an eligible participating Facility.

## 7. First-Time Driver Experience

### Immediately after account onboarding

The Dashboard should show the Next Action Card and Operational Readiness. It should explain the remaining operational prerequisite in plain language and provide one route to resolve it.

### After first activity submission

The Dashboard should confirm that the activity is **Pending Review**, state that the Facility or authorized reviewer acts next, and state that review is not payment confirmation. Temporary first-activity guidance may remain while the activity is pending.

### After first verified activity

The full first-time tracker and submission celebration should disappear. The Dashboard should retain permanent operational summaries, recent activity, location discovery, notifications, and contextual exception guidance.

### Permanent information

Location discovery, activity lifecycle, notifications, wallet preview, support, and concise recent activity remain permanent. A temporary tracker must not become a permanent source of clutter.

## 8. Returning and High-Volume Drivers

At approximately ten activities, recent activity and the current lifecycle state remain useful. At approximately one hundred activities, the Dashboard should emphasize counts, exceptions, last activity, and location discovery instead of a growing activity feed. At approximately five hundred activities, Activity is the canonical destination for filtering, history, exports, and detailed review.

The Dashboard should summarize:

- current pending-review count;
- current verified-unpaid count when authoritative;
- current financial exception count when authoritative;
- most recent activity and status;
- unread notification count and highest-priority notifications; and
- the recommended participating Facility or facility-discovery route.

It should not attempt to render a long history, all reward entries, all notifications, or financial totals that require reconciliation beyond the Dashboard's source contracts.

## 9. Location Discovery

Location discovery should lead with operational suitability.

- **Nearest Participating Facility:** nearest eligible active and visible Facility when valid Driver location and Facility coordinates are available.
- **Recommended Facility:** a clearly explained operational recommendation, based only on approved and disclosed criteria such as distance, active/visible eligibility, operating information, and workflow relevance.
- **Featured Facility:** an explicitly labeled, policy-governed placement that must not masquerade as an objective recommendation.

“Highest Nearby Driver Incentive” must not be the primary Dashboard recommendation. A configured incentive is not an earned, payable, settled, or wallet-available value. If displayed at all, it must be secondary, clearly configuration-labeled, and must not use payout-oriented wording.

## 10. Activity Lifecycle and Recent Activity

The Activity Lifecycle surface should contain:

- **Awaiting Review:** canonical pending activity only;
- **Verified — Awaiting Payment:** verified activity plus authoritative unpaid financial evidence only;
- **Payment Exception:** authoritative financial exception only; and
- **Payment Scheduled** and **Payment History:** explicit unavailable states until canonical Driver-scoped sources exist.

Recent Activity should normally show one to three recent activities. Each item should show Facility name, date, and an operational status label. It should link to Activity for all history, rejected activity context, photos where authorized, filters, and detail.

## 11. Notifications, Wallet, Rewards, and Support

### Notifications

Notifications are ordered by actionability, then recency. High-priority operational and supported financial exceptions appear before informational or reward notices. The Dashboard may show up to three unread items, with a count badge and a Message Center link. Aging notices should remain visible only while relevant; an old unread informational notice must not outrank a current action.

### Wallet Preview

Wallet Preview may show the current authoritative wallet balance and a route to Wallet. It must label unavailable information as unavailable, never zero. It must not derive balance from activities, configured incentives, rewards, or payment rows.

### Rewards

Rewards are secondary to field work. The Dashboard may show active-program state and concise entry visibility, but reward participation must not be portrayed as payment, earnings, or settlement.

### Support

Support should appear after the Driver can identify the next operational action. It should identify the authorized support path and preserve role-appropriate privacy. Support messaging must not become a shortcut around evidence, review, financial, or authorization rules.

## 12. Data States and Recovery

### Empty states

Required empty states include no eligible Facilities, no nearby ranked Facility, no activities, no pending review, no verified-unpaid obligations, no unread notifications, no rewards, and no recent activity. Each must explain the condition, avoid blame, and offer one relevant next action.

### Unavailable states

Unavailable data must be shown as unavailable, not zero, complete, paid, or not started. The message should name the affected domain, for example “Activity information unavailable” or “Payment information unavailable,” and keep unaffected Dashboard sections usable.

### Loading states

Use compact section-level skeletons for independent data. Avoid blocking the full Dashboard after the primary operational shell has loaded. Preserve layout stability and never expose raw keys or placeholder financial values.

### Error recovery

Retries should be targeted to the failed source. A retry must not create repeated automatic requests, financial side effects, duplicate activity submissions, or an implication that a failed request was completed. Explain what failed, what remains available, and what the Driver can do next.

## 13. Responsive, Accessibility, and Bilingual Requirements

### Responsive behavior

- **320px:** one-column order follows Dashboard priority; one primary action is visible without horizontal scrolling; secondary destinations are collapsed or moved to More.
- **390px:** retain one-handed primary action, concise badges, and readable status summaries.
- **Tablet:** use two-column grouping only when it preserves the priority sequence.
- **Desktop:** use wider layouts to group related operational summaries, not to make every available card equally prominent.

### Accessibility

- Use one page-level `h1`, then ordered `h2` sections and `h3` card headings.
- Use native buttons and links with clear labels, visible focus, and logical keyboard order.
- Announce actionable status changes, unavailable data, errors, and successful retry results through appropriate live-region behavior.
- Pair color with text and meaningful icons; respect reduced-motion preferences for pulsing or loading indicators.
- Ensure controls, status chips, notification badges, and location recommendations have screen-reader names and contextual descriptions.

### Bilingual experience

English and Spanish must provide equivalent Dashboard hierarchy, CTAs, lifecycle labels, unavailable states, and recovery instructions. Translations must preserve the distinction between Pending Review, Verified, unpaid obligation, scheduled payment, paid history, and unavailable information. Missing translations must fall back safely without exposing a raw key. Final fluent Spanish review remains required before public release.

## 14. Platform Operations Touchpoints

Future Platform Operations Center capabilities should connect through explicit, role-appropriate states: Facility review backlog, Driver profile correction, activity exception, supported dispute or correction path, payment exception, and pilot-support follow-up. Dashboard UI must identify the state and next authorized action without exposing administrative queues, other participants’ data, internal notes, or unsupported review promises.

## 15. Component Architecture Guidance

Future implementation should prefer these canonical boundaries:

- `DriverNextActionCard`
- `DriverOperationalReadinessCard`
- `DriverLifecycleSummary`
- `DriverNotificationPreview`
- `DriverWalletPreview`
- `DriverLocationRecommendationCard`
- `DriverRecentActivityCard`
- `DashboardDataState`
- `useDriverDashboardQueries`
- `useDriverLocationRecommendations`

These components should consume documented canonical APIs and helpers. They must not duplicate lifecycle calculations, location-rate conversion, authorization decisions, financial calculations, or source-of-truth rules.

## 16. UX Success Metrics

Subject to separate privacy and instrumentation approval, pilot observation may assess:

- time from Dashboard arrival to first meaningful action;
- Time to First Activity and Time to First Verified Activity;
- profile, terms, and GPS recovery completion;
- location-discovery-to-check-in completion;
- pending-review and rejected-activity comprehension;
- notification acknowledgement and escalation frequency;
- support contacts attributable to unclear next steps;
- mobile task completion at 320px and 390px; and
- English/Spanish functional equivalence.

These are observation goals, not authorization to add tracking.

## 17. Implementation Roadmap

Each phase must be independently scoped, audited, and validated.

1. **Information hierarchy and terminology:** establish the page-level hierarchy; remove duplicated summaries; align operational and financial language with PD-051.
2. **Next-action and readiness experience:** implement the priority engine and temporary first-time guidance using existing authoritative sources where possible.
3. **Lifecycle, exception, and recovery refinement:** improve operational, financial, unavailable, and targeted-retry presentation without changing financial behavior.
4. **Location and notification refinement:** implement transparent recommendation presentation, notification priority, and Message Center handoff.
5. **Responsive and accessibility closeout:** complete keyboard, focus, reduced-motion, screen-reader, bilingual, and narrow-screen verification.

## 18. Out of Scope

This specification does not authorize or define:

- Treasury;
- Stripe implementation;
- settlement engine behavior;
- payment calculations;
- wallet implementation or entitlement calculations;
- Admin Dashboard or Platform Operations Center implementation;
- Facility Dashboard implementation;
- backend, API, storage, schema, migration, routing, or authentication changes; or
- future Construction Circular Economy Intelligence Platform capabilities.

## 19. Decision Filter

Before changing the Driver Dashboard, ask:

> Does this help the Driver identify a truthful next operational action without confusing operational progress with financial completion?
