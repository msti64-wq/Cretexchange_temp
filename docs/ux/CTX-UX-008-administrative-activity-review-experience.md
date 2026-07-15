# CTX-UX-008 — Administrative Activity Review Experience

**Status:** Experience-architecture specification

**Product:** CreteXchange

**Scope:** Dedicated Platform Operations experience for authorized review of disputed or exceptional Driver activities

## 1. Purpose

This specification defines how authorized Platform Operations personnel should review an individual disputed or exceptional Driver activity. It governs future evidence-review interfaces for maintaining marketplace trust, documenting an operational determination, and communicating an appropriate outcome.

The reviewer is not an advocate for either the Driver or the Facility. The reviewer represents marketplace integrity through evidence-based, impartial, privacy-aware operational review.

This specification does not describe, certify, or authorize the current implementation. It does not create a case system, evidence viewer, administrative action, or stored lifecycle state.

## 2. Authority and Relationship

This specification extends and must be read with:

- [Project Context](../project/project-context.md)
- [CTX-UX-001 — First Impression and Onboarding Experience](./CTX-UX-001-first-impression-and-onboarding-experience.md)
- [CTX-UX-002 — Landing Page Content, Information Architecture, and Wireframe Specification](./CTX-UX-002-landing-page-content-information-architecture-and-wireframe-specification.md)
- [CTX-UX-003 — First-Time User Journey and Pilot Readiness](./CTX-UX-003-first-time-user-journey-and-pilot-readiness.md)
- [CTX-UX-004 — First-Time User Onboarding Experience](./CTX-UX-004-first-time-user-onboarding-experience.md)
- [CTX-UX-005 — Driver Dashboard Experience](./CTX-UX-005-driver-dashboard-experience.md)
- [CTX-UX-006 — Facility Workspace Experience](./CTX-UX-006-facility-workspace-experience.md)
- [CTX-UX-007 — Platform Operations Center Experience](./CTX-UX-007-platform-operations-center-experience.md)
- [PD-050 — Facility Operational Access and Billing Readiness](../product/PD-050-facility-operational-access-and-billing-readiness.md)
- [PD-051 — Driver Activity and Payment Lifecycle](../product/PD-051-driver-activity-and-payment-lifecycle.md)
- [PD-052 — Marketplace Trust, Administrative Activity Review, and Dispute Resolution](../product/PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md)
- [CTX-ARCH-002 — Owner Operations Architecture](../architecture/owner-operations-architecture.md)
- [CTX-ARCH-003 — Driver Operations Architecture](../architecture/driver-operations-architecture.md)
- [CTX-ARCH-004 — Admin Operations Architecture](../architecture/admin-operations-architecture.md)
- [CTX-ARCH-006 — Driver Incentive and Financial Settlement Architecture](../architecture/driver-incentive-and-financial-settlement-architecture.md)

**Relationship to CTX-UX-007:** CTX-UX-007 governs the overall Platform Operations Center workspace, marketplace health, queues, alerts, and operational priority. CTX-UX-008 governs the dedicated investigation experience opened for one activity. PD-052 governs the marketplace-trust policy, administrative authority, evidence, privacy, and dispute-resolution boundaries that this experience must follow.

## 3. Design Philosophy

Every administrative review must be:

- evidence-based;
- impartial;
- auditable;
- repeatable;
- least-privilege;
- transparent about the available record and its limitations; and
- operationally separate from payment, settlement, billing, and other financial outcomes.

### Five-second goals

Within five seconds, an authorized reviewer should know:

- why the activity requires review;
- the current review state;
- what authoritative evidence is available;
- who has already acted; and
- what authorized action, if any, is required next.

## 4. Guiding Principles

- **Evidence before opinion:** Begin with the available authorized operational record. A reviewer must not substitute reputation, role, assumption, or convenience for evidence.
- **Operational neutrality:** Do not favor the Driver, Facility, or Platform Operations interests without a documented operational basis.
- **No automatic assumptions:** A complaint, pattern, missing data, GPS anomaly, photo, or prior outcome may justify review; it does not by itself establish misconduct or fault.
- **Least privilege:** Show only the minimum participant information, evidence, and history necessary for the authorized review purpose.
- **Complete audit trail:** A material review action must be attributable, timestamped, and explainable through its authorized future record.
- **Transparency:** Clearly distinguish evidence, supplemental context, uncertainty, reviewer observation, and final operational outcome.
- **Privacy:** Do not expose participant information, private evidence, or internal notes beyond the authorized audience and purpose.
- **Consistency:** Similar evidence and circumstances should be reviewed through the same documented policy and workflow, while allowing context-sensitive human judgment.

## 5. Canonical Information Architecture

The review experience should present the following hierarchy. A missing source must be unavailable, not treated as negative evidence, proof of fault, or a completed review.

| Section | Purpose and inclusion rule |
| --- | --- |
| Review Summary | State why the review exists, its current lifecycle state, assignment, authority, and required next action. |
| Case Timeline | Show the ordered operational and administrative history relevant to the review. |
| Driver Information | Show minimum necessary Driver context for the authorized purpose. |
| Facility Information | Show minimum necessary Facility and participating-location context for the authorized purpose. |
| Evidence Gallery | Provide an ordered view of authorized evidence, its source, timestamps, and availability limitations. |
| Photo Viewer | Provide accessible, controlled review of authorized activity photos. |
| Location Context | Show authorized location, GPS, and operational-location context without unsupported geographic inference. |
| Activity Details | Show the submitted activity’s authoritative operational fields and status history. |
| Decision Support | Present applicable policy, evidence checklist, uncertainty, and permitted action paths; never a predetermined outcome. |
| Administrative Notes | Support authorized, auditable reviewer context with clear visibility boundaries. |
| Related Cases | Surface only authorized, relevant related review history; patterns are triggers, not conclusions. |
| Notifications | Show participant and Operations communications relevant to the case. |
| Outcome | Present the current operational determination, follow-up, and participant-facing message intent. |
| Audit History | Preserve who accessed, assigned, changed, or resolved the review when such records are separately implemented. |

## 6. Case Lifecycle

The following lifecycle is an experience model, not authorization to add stored case statuses without separate policy, schema, and implementation approval.

| State | Purpose | Reviewer experience |
| --- | --- | --- |
| Open | A reviewable concern or exception has been accepted for authorized intake. | Show review reason, initiating source, scope, and whether assignment is needed. |
| Assigned | An authorized reviewer or queue owns the next action. | Show owner, role, assignment time, and handoff context. |
| Under Review | Evidence and relevant operational history are being assessed. | Present the evidence checklist, timeline, and recorded uncertainty. |
| Awaiting Information | The current record cannot support a fair determination and an authorized information request or support follow-up is pending. | State what is missing and which authorized party or team acts next. |
| Decision Pending | Evidence review is complete enough to prepare an authorized determination or required second review. | Surface decision options, policy reference, and audit requirements. |
| Resolved | An authorized operational outcome and follow-up have been recorded. | Show outcome, rationale summary, participant notification status, and any allowed next action. |
| Closed | No further ordinary review action is pending. | Preserve history and route a new concern through authorized intake. |
| Reopened | A permitted new fact, correction path, or authorized escalation requires renewed review. | Clearly identify the reopening basis and preserve prior history. |

Case state must never be presented as activity payment status, wallet status, payout status, settlement status, or a substitute for the canonical persisted activity state in PD-051.

## 7. Evidence Model

### Authoritative operational evidence

Authoritative evidence is the authorized platform record relevant to the activity and applicable workflow. It may include:

- submitted photos and their authorized metadata;
- GPS coordinates or authorized location metadata;
- activity timestamps and status history;
- submitted activity metadata;
- participating Facility and location context;
- Facility review outcome and authorized review history; and
- auditable administrative history when separately implemented.

### Supplemental context

Supplemental context may help a reviewer understand the operational situation but is not proof by itself. It may include relevant support communications, authorized related-case context, system availability information, or policy guidance. The interface must label supplemental context as such and identify limitations.

### Evidence rules

- Evidence ordering should favor the review reason, time sequence, and clear source attribution.
- Missing evidence is a limitation, not proof of wrongdoing.
- A single signal must not automatically determine a review outcome.
- Evidence access must be limited to the least necessary scope and logged when the applicable future implementation supports it.
- Financial data is not evidence of operational validity unless separately governed and authorized; activity verification remains operational under PD-051.

## 8. Photo Review Experience

The Photo Viewer should help an authorized reviewer inspect evidence without losing review context.

- **Thumbnail view:** show ordered thumbnails with clear selection, source, and available timestamp context.
- **Full-screen view:** provide a focused, dismissible view with the activity and evidence identity retained in accessible text.
- **Zoom and navigation:** support keyboard, touch, and visible controls for zoom, previous, next, and close; do not rely on gesture-only interaction.
- **Metadata:** disclose only authorized metadata needed for the review purpose and label unavailable or unverifiable values clearly.
- **Side-by-side comparison:** permit comparison only when it is relevant, authorized, and does not imply automated similarity, fraud, or a predetermined outcome.
- **Evidence ordering:** use documented chronology or review relevance; do not silently reorder evidence to favor an outcome.
- **Accessibility:** provide meaningful image alternatives, keyboard navigation, focus management, reduced-motion behavior, and text equivalents for important nonvisual evidence context.

The viewer must not add image processing, AI analysis, new evidence collection, or participant-visible evidence access without separate authorization.

## 9. Decision Workflow

The review workflow should guide an authorized reviewer through these actions:

1. **Review:** confirm the review reason, authority, scope, timeline, and available evidence.
2. **Document findings:** record neutral evidence observations, limitations, and the applicable policy basis; separate fact from interpretation.
3. **Request additional information:** when the current record cannot fairly support a determination, use an authorized, minimum-necessary request or support follow-up.
4. **Escalate:** route conflicts of interest, evidence conflict, safety/privacy concern, potential legal concern, financial implication, or authority gap to the authorized process.
5. **Resolve:** record an authorized operational determination, rationale, authority, supporting evidence references, and participant-facing outcome intent.
6. **Close:** close ordinary review work only after required communication and follow-up are recorded through the approved future workflow.
7. **Reopen:** reopen only through an authorized correction, newly available fact, or escalation path; preserve rather than overwrite prior history.

The interface must never make a determination appear complete merely because a reviewer opened evidence, typed a note, or selected a preliminary option.

## 10. Outcomes and Communication

### Outcome examples

Examples of possible operational outcomes include:

- Driver submission confirmed;
- Facility decision confirmed;
- evidence insufficient for a current determination;
- operational exception requiring support follow-up;
- authorized administrative correction; and
- future monitoring or policy follow-up without a finding against a participant.

These examples do not define implementation rules, stored statuses, legal remedies, financial actions, or automatic outcomes. Administrative verification or rejection must remain consistent with PD-051’s canonical activity-status boundaries.

### Participant and Operations communication

- **Driver notification:** explain the current operational outcome, available correction or support route, and any next permitted action without exposing Facility-private evidence, notes, or financial implication.
- **Facility notification:** explain the current operational outcome and Facility next action without exposing Driver-private evidence, notes, or financial implication.
- **Platform Operations visibility:** show assignment, escalation, outcome, and follow-up records only to authorized personnel.
- **Escalation:** clearly state the reason, authority boundary, current owner, and whether ordinary review is paused or continues.

Participant communication must remain neutral. It must not imply fault, payment, settlement, disciplinary action, or legal conclusion beyond the authorized operational determination.

## 11. Privacy and Least Privilege

The review experience must apply PD-052’s minimum-necessary access rule.

- Limit PII display to the minimum required for authorized operational review.
- Restrict evidence visibility to authorized reviewers and documented purposes.
- Separate participant-visible rationale from internal administrative notes.
- Avoid exposing another participant’s account context, communication, private evidence, or internal review history.
- Require an authorized escalation for sensitive, legal, financial, security, or privacy matters.
- Do not reuse review evidence for marketing, unsupported profiling, surveillance, or automated scoring.

## 12. Auditability

Every material future review record should contain:

- current decision or case state;
- timestamp;
- authorized reviewer or owner;
- stated review reason;
- operational rationale and applicable authority;
- supporting evidence references and known limitations;
- participant communication record or intended communication state; and
- immutable or auditable history of material assignment, access, determination, correction, closure, and reopening events.

Auditability means preserving what occurred and why. It does not permit silent overwrite, hidden correction, or broad access to sensitive information.

## 13. Data States and Recovery

### Empty states

Required empty states include no evidence available, no related cases, no administrative notes, no participant notification, no assigned reviewer, and no authorized next action. Each must distinguish absence of a source from proof that no issue exists.

### Unavailable states

Unavailable photos, metadata, location context, history, or system data must be labeled unavailable. The interface must not turn unavailable evidence into a negative inference, a final outcome, or a fabricated zero.

### Loading states

Use section-level loading states for independent evidence and history. Preserve the Review Summary, authority boundary, and safe navigation while additional authorized data loads. Avoid layouts that cause a reviewer to lose their place or assume a result from a placeholder.

### Recovery states

Every recovery state should answer what failed, what remains available, what action is safe, who owns the next step, and when escalation is necessary. Retry must be targeted and idempotent; it must not duplicate a decision, notification, assignment, or correction.

## 14. Responsive, Accessibility, and Bilingual Requirements

### Responsive behavior

- **Mobile:** support urgent acknowledgement, review summary, limited evidence inspection, and escalation; route dense evidence comparison and extensive history to appropriate focused views.
- **Tablet:** preserve timeline, evidence, and decision context without forcing horizontal scrolling or losing the current case state.
- **Desktop:** support an accessible multi-panel review layout that keeps review summary, selected evidence, and decision context visible without implying that every panel has equal priority.

### Accessibility

- Use one page-level `h1`, ordered section headings, and descriptive component headings.
- Preserve native controls, logical keyboard order, visible focus, and predictable focus return from image viewers, dialogs, and decision actions.
- Announce case-state changes, evidence availability, failed or successful targeted retries, and completed authorized actions through appropriate live-region behavior.
- Pair status color with text, iconography, and an accessible severity or state label; respect reduced-motion preferences.
- Provide screen-reader names and contextual descriptions for evidence controls, timelines, reviewer ownership, assignment, notes visibility, outcomes, and audit-history items.

### Bilingual readiness

English and Spanish must provide equivalent review lifecycle, evidence limitation, escalation, outcome, privacy, and recovery meaning. Translations must distinguish evidence from supplemental context, administrative review from a final outcome, and operational validity from financial completion. Missing translations must fall back safely without exposing raw keys. Final fluent Spanish review remains required before public release.

## 15. Component Architecture Guidance

Future implementation should prefer reusable, policy-aware components:

- `AdministrativeReviewSummary`
- `ReviewCaseTimeline`
- `ReviewParticipantContext`
- `ReviewEvidenceGallery`
- `ReviewPhotoViewer`
- `ReviewLocationContext`
- `ReviewActivityDetails`
- `ReviewDecisionSupport`
- `ReviewAdministrativeNotes`
- `ReviewRelatedCases`
- `ReviewCommunicationPreview`
- `ReviewOutcomePanel`
- `ReviewAuditHistory`
- `ReviewDataState`
- `useAdministrativeReviewCase`
- `useReviewEvidenceAccess`

These components must consume canonical, role-authorized sources and must not duplicate activity-status, financial, settlement, authorization, evidence, or trust-determination logic.

## 16. UX Success Metrics

Subject to separate privacy, product, and instrumentation approval, pilot observation may assess:

- reviewer comprehension of the review reason, authority, and next action;
- time to acknowledge, assign, and resolve authorized review work;
- evidence availability and evidence-insufficiency handling;
- correction and escalation routing accuracy;
- participant-notification clarity and support follow-up;
- consistency of comparable reviews under approved policy;
- audit-record completeness for material decisions;
- mobile, tablet, and desktop task completion; and
- English/Spanish functional equivalence.

These are observation goals, not authorization to add tracking, automated enforcement, participant scoring, or AI decision-making.

## 17. Implementation Roadmap

Each phase must be independently scoped, audited, and validated.

1. **Review hierarchy and authority:** establish review summary, lifecycle presentation, policy references, and truthful data states.
2. **Evidence and timeline experience:** implement role-authorized evidence context, chronology, accessible photo review, and limitation labeling without adding evidence collection.
3. **Decision and communication guidance:** implement neutral decision support, outcome presentation, escalation routes, and participant-communication boundaries without changing authority or activity status.
4. **Auditability and related-context refinement:** add authorized assignment, note visibility, related-case context, and audit-history presentation only with approved source and privacy controls.
5. **Responsive and accessibility closeout:** complete keyboard, focus, reduced-motion, screen-reader, bilingual, mobile, tablet, and desktop verification.

## 18. Out of Scope

This specification does not authorize or define:

- Treasury;
- Stripe;
- settlement;
- billing, payment, wallet, payout, accounting, or financial calculations;
- database administration;
- developer tooling;
- automated AI decisions, fraud scoring, or automatic disciplinary action;
- legal policy, legal proceedings, or law-enforcement integration;
- backend, API, storage, schema, migration, routing, authentication, or authorization changes; or
- future Construction Circular Economy Intelligence Platform capabilities.

## 19. Decision Filter

Before changing the Administrative Activity Review experience, ask:

> Does this help an authorized reviewer reach a fair, evidence-based, privacy-aware operational outcome without assuming fault, bypassing authority, or confusing operational review with financial completion?
