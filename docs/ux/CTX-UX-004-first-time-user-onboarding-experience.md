# CTX-UX-004 — First-Time User Onboarding Experience

**Status:** Experience-architecture specification
**Product:** CreteXchange
**Scope:** First-time Driver and Participating Facility onboarding through first verified activity

## 1. Purpose

This document defines the complete first-time onboarding experience for every participant entering CreteXchange. It describes how a first-time Driver and first-time Facility progress from registration to successful participation.

The objective is to minimize confusion, reduce abandonment, shorten Time to First Verified Activity (TFVA), and build participant confidence. It defines experience architecture, not implementation, and does not assert that any proposed guidance, tracker, notification, or recovery state is already implemented.

## 2. Relationship and Authority

CTX-UX-004 extends:

- [CTX-UX-001 — First Impression and Onboarding Experience](./CTX-UX-001-first-impression-and-onboarding-experience.md)
- [CTX-UX-002 — Landing Page Content, Information Architecture, and Wireframe Specification](./CTX-UX-002-landing-page-content-information-architecture-and-wireframe-specification.md)
- [CTX-UX-003 — First-Time User Journey and Pilot Readiness](./CTX-UX-003-first-time-user-journey-and-pilot-readiness.md)
- [PD-050 — Facility Operational Access and Billing Readiness](../product/PD-050-facility-operational-access-and-billing-readiness.md)

CTX-UX-003 remains the MVP first-time journey and pilot-readiness authority. This document provides the next level of onboarding detail for future approved work. It remains subordinate to [Platform Vision](../vision/platform-vision.md), [Platform Strategy](../vision/platform-strategy.md), [Project Context](../project/project-context.md), [Platform Standards](../standards/cretexchange-platform-standards.md), applicable [architecture documents](../architecture/README.md), [Product Decisions](../product/product-decisions.md), and the [Development Protocol](../development-protocol.md).

## 3. Primary UX Principles

- **One step at a time.** Present the next meaningful action before optional detail.
- **Explain before requesting.** State why information, permission, or evidence is needed before asking for it.
- **Never surprise the participant.** Make prerequisites, status changes, and consequences visible in plain language.
- **Always show progress.** Identify the current step, the next step, and the remaining milestones.
- **Celebrate success.** Confirm meaningful progress with encouraging, operationally accurate language.
- **Recover gracefully.** Treat a blocked state as a clear, actionable exception—not participant failure.
- **Mobile-first.** Make essential field and facility actions easy to understand and complete on a phone.
- **English and Spanish support.** Keep both language experiences functionally equivalent.
- **Operational readiness before financial readiness.** Do not represent payment, billing, wallet, Stripe, or settlement state as a prerequisite for operational location access unless separately authorized.
- **Reduce TFVA.** Remove real friction while preserving evidence, eligibility, privacy, and verification quality.

## 4. Onboarding Philosophy

The first experience should feel like guided participation rather than software configuration.

Participants should always know:

- where they are;
- why a step matters;
- what happens next;
- how many steps remain; and
- how to recover if something fails.

The journey must distinguish operational activity states from payment or settlement. Registration, submission, review, and verification each have their own operational meaning; none alone promises a financial outcome.

## 5. Journey Tracker

### Purpose

The Journey Tracker is temporary onboarding guidance that makes readiness and the next action visible. It is not a permanent dashboard widget and should automatically disappear after the applicable onboarding completion condition is met.

### Experience contract

- Show a small role-aware sequence with the current milestone, completed milestones, and one recommended next action.
- Explain a blocked milestone in participant language and link only to an authorized recovery path.
- Do not use a progress percentage when the platform cannot accurately determine progress.
- Do not expose payment, billing, wallet, Stripe, or settlement information as a shortcut for operational readiness.
- After completion, remove the tracker and retain contextual guidance only when a participant encounters a real exception or new required step.

## 6. Driver Journey

| Milestone | Objective | Expected actions | Success criteria |
| --- | --- | --- | --- |
| Welcome | Establish relevance and confidence. | Select the Driver path; understand that CreteXchange helps locate participating facilities and record verified operational activity. | The Driver can identify the next action without needing to understand Facility or administrative workflows. |
| Account Created | Confirm a usable account. | Complete registration and correct any validation issue. | The Driver receives a clear confirmation or a specific recovery action. |
| Profile Completed | Capture the information needed for operational participation. | Complete required profile fields and acknowledgements where applicable. | The Driver sees a clear ready state or named missing information. |
| GPS Enabled | Prepare for location-aware operational verification. | Review the purpose notice and allow location access when the applicable workflow needs it. | The Driver understands whether GPS is available and can continue or recover. |
| First Activity Submitted | Create an operational submission with required evidence. | Follow photo guidance, confirm evidence upload, and submit the activity once ready. | The Driver sees submission confirmation and understands that the activity is **Pending Review**, not paid or settled. |
| First Activity Verified | Close the first verified operational loop. | Review the verification outcome, activity history, available notifications, and rewards visibility where present. | The Driver can see the verified activity and identify the next operational action. |

### GPS guidance

Before requesting GPS, explain that it supports the applicable operational verification workflow and is requested only when relevant. Use a short privacy explanation that describes purpose, not technical implementation. If permission is denied, explain that the Driver can enable location access in device or browser settings, return to the relevant screen, and retry; do not propose fabricated coordinates or a bypass of required evidence.

### Activity-submission guidance

Photo guidance should explain the required evidence in concise field language, show upload progress, and confirm whether an upload succeeded. Submission confirmation must explain that the item is awaiting operational review. It must never imply payment, earnings, settlement, regulatory certification, or material-quality assurance.

### Driver completion condition

Driver onboarding is complete when the Driver has an operationally ready profile, has completed the applicable GPS/evidence steps, and can see their first verified activity. A later failed, unavailable, or rejected activity should reopen only the relevant contextual recovery guidance—not restore the full tracker by default.

## 7. Facility Journey

Public-facing terminology is **Facility** or **Participating Facility**. Existing authenticated role names may remain **Owner** where required by the current product.

| Milestone | Objective | Expected actions | Success criteria |
| --- | --- | --- | --- |
| Welcome | Establish the Facility’s operational role. | Select the Facility path and understand that participation includes location management and operational activity review. | The participant can identify the correct registration action. |
| Account Created | Confirm a usable Facility account. | Complete registration and address any validation issue. | The Facility receives a clear confirmation or recovery action. |
| Administrative Approval | Make the authorized review state clear. | Wait for Platform Operations review; respond to named operational-profile corrections when needed. | The Facility understands the current approval status and next step. |
| Profile Completed | Provide the minimum operational profile required for participation. | Complete the named required fields. | The Facility sees a complete state or a specific correction path. |
| First Location Created | Configure the first participating location. | Provide the required address and operating details; make the intended active and visible choices. | The Facility has a clearly configured operational location or a specific correction path. |
| First Driver Activity Received | Prepare to review incoming activity. | Open the authorized review queue and understand the item’s current status. | The Facility can identify whether review is needed and what happens next. |
| First Activity Verified | Complete the first review outcome. | Verify or reject through the approved operational workflow and review the resulting status. | The Facility can see the completed operational outcome and continue participation. |

### Administrative approval

Platform Operations reviews Facility readiness. While approval is pending, the participant should see the current status, any named operational-profile correction, and the expected next step. Guidance must not promise a review time or imply that approval is automatic.

### First-location setup

The first-location experience should request only the minimum information required by the existing workflow, including a complete address and the appropriate active and visibility settings. It must explain that active and visible are separate operational concepts. Under [PD-050](../product/PD-050-facility-operational-access-and-billing-readiness.md), an approved Facility with a complete operational profile may create and manage locations; financial readiness is separate and must not be portrayed as a location-access prerequisite.

### Facility completion condition

Facility onboarding is complete when the Facility is administratively approved, operationally complete, has an active configured location suitable for the approved workflow, and has completed its first authorized activity-review outcome. This is an operational condition, not a payment, billing, or settlement condition.

## 8. Platform Operations Journey

Platform Operations supports the first-time journey by:

- approving Facilities through the authorized operational workflow;
- monitoring readiness and known onboarding blockers;
- assisting Drivers with authorized recovery guidance;
- resolving or escalating pilot issues within the correct role and authority; and
- helping the first verified activity complete without bypassing eligibility, evidence, authorization, or review requirements.

Use the [Assisted-Pilot Operations Runbook](../project/pilot/assisted-pilot-operations-runbook.md) for operational support scenarios. Operators should explain the current state and next authorized action, preserve role-appropriate privacy, and escalate security, data integrity, financial, Stripe, or policy matters rather than improvising a workaround.

## 9. First Success Moments

Success messaging should be encouraging but operationally accurate. It must never imply payment or settlement.

| Participant | Moment | Confirmation intent |
| --- | --- | --- |
| Driver | First Activity Submitted | Confirm that the activity was submitted and is awaiting review; state what happens next. |
| Driver | First Activity Verified | Confirm that the activity was verified and is now visible in the appropriate operational history. |
| Facility | First Location Active | Confirm that the location is active; describe visibility separately when relevant. |
| Facility | First Verified Activity | Confirm that the Facility completed an authorized operational review outcome. |
| Platform Operations | First Successfully Completed Marketplace Transaction | Recognize that the first end-to-end verified operational workflow completed; do not label it paid, billed, or settled. |

## 10. Empty States

Every empty state should explain the condition, guide the participant, offer one next action, and avoid blame.

| State | Explain | Guide and next action |
| --- | --- | --- |
| No Locations | No eligible location is available in the current view. | Refresh, adjust the authorized search or filter, or return when a participating location is available. |
| No Activities | No activity is present in the current history or queue. | Direct the participant to the next applicable discovery, check-in, or review action. |
| No Notifications | No new operational update is available. | Explain that the participant can continue using the primary workflow. |
| Pending Approval | Facility administrative review is not complete. | State the pending condition and show any authorized profile correction. |
| Pending Review | Submitted activity is awaiting authorized operational review. | Explain who acts next and avoid a payment implication. |
| Rejected Activity | The activity did not receive a verified outcome. | State the authorized reason when available and the permitted correction or support path. |
| GPS Unavailable | Location access is unavailable or not ready. | Explain device/settings recovery and offer retry. |
| Upload Failure | Required evidence did not upload successfully. | Preserve the distinction between upload and submission; offer safe retry guidance. |
| No Rewards Yet | No reward visibility is available for the participant. | Keep the message separate from payment, earnings, and settlement; direct attention to operational participation. |
| No Verified Activities | The participant has no verified activity in the current view. | Explain the applicable next operational action without treating verification as a financial result. |

## 11. Recovery Experience

Every recovery flow must answer: **What happened? Why? How do I recover? What should I do next?**

| Situation | Recovery guidance |
| --- | --- |
| GPS denied | Explain that the applicable verification workflow needs location access; direct the Driver to device/browser permissions, then retry from the same workflow. |
| Poor connectivity | Explain that the action was not confirmed; preserve entered work where safely supported, show upload/submission state, and guide a retry when connection returns. |
| Upload failure | Identify that evidence upload did not complete, give supported photo/connectivity guidance, and offer retry without representing the activity as submitted. |
| Approval delay | Explain that Platform Operations review is pending, show any named operational correction, and provide the authorized support path if the delay exceeds pilot expectations. |
| Rejected activity | Explain the authorized operational reason, the available correction or support path, and whether a new submission is permitted. |
| Incomplete profile | Name the missing operational information and return the participant to the relevant profile step. |
| No participating Facilities nearby | Explain that no eligible result is currently available; offer the current discovery or support path without promising coverage. |
| No Driver activity received | Explain that no submission currently needs review; direct the Facility to keep its location’s operational configuration accurate and return when activity arrives. |

## 12. Dashboard Transition

Onboarding ends when the role-specific completion condition is satisfied. At that point, the Journey Tracker disappears and the normal dashboard becomes the primary workspace. Participants should receive contextual guidance only when a real exception, new required action, or newly relevant workflow requires it.

The normal workspace must continue to distinguish activity, configuration, payment, and settlement concepts. Completing onboarding does not change any financial lifecycle state.

## 13. Notifications During Onboarding

Notifications should communicate a current operational state and the next action, not act as an unsupported promise.

| Audience | Appropriate notification |
| --- | --- |
| Driver | Profile complete |
| Driver | GPS enabled |
| Driver | Activity submitted |
| Driver | Activity verified |
| Facility | Approved |
| Facility | First location active |
| Facility | Activity awaiting review |
| Facility | Activity verified |
| Platform Operations | Approval required |
| Platform Operations | Support request |
| Platform Operations | Pilot exception |

Notification wording must identify whether a state is pending, verified, rejected, unavailable, or actionable. It must not turn verification into a payment or settlement claim.

## 14. Mobile Experience

- Support one-handed operation for the core next action.
- Use large, clearly labeled tap targets.
- Minimize typing and request information only when relevant.
- Keep progress and recovery guidance visible without unnecessary scrolling.
- Preserve outdoor readability through clear hierarchy, adequate contrast, and concise language.
- Keep the field workflow focused: discovery, check-in, evidence, submission, and recovery should not compete with unrelated dashboard content.

## 15. Accessibility

- Announce current step, completion, error, and recovery state clearly to screen readers.
- Preserve keyboard navigation and visible focus for every action.
- Do not communicate status through color alone; pair color with text and meaningful iconography.
- Use simple, direct language and explain unfamiliar operational terms.
- Ensure icons clarify an adjacent label or have an accessible text alternative.
- Preserve logical reading and focus order on narrow screens.

## 16. Bilingual Experience

English and Spanish must remain functionally equivalent. No onboarding step, recovery path, or required action may exist in one language but not the other.

Translations should preserve operational meaning, tone, and the distinction between submitted, pending review, verified, rejected, unavailable, and financial states. A missing translation must fall back safely without exposing a raw translation key. Final fluent Spanish review remains required before public release.

## 17. Out of Scope

This document does not define or authorize:

- implementation, database changes, APIs, or routes;
- billing, Stripe, wallet, Treasury, payment, or settlement behavior;
- future AI assistants, analytics, or data collection;
- future Construction Circular Economy Intelligence Platform operational intelligence; or
- any product capability outside approved sprint scope.

## 18. UX Success Metrics

Pilot observation and any future approved measurement may consider:

- registration completion;
- profile completion;
- GPS enablement;
- first location creation;
- time to first activity;
- Time to First Verified Activity;
- Driver abandonment;
- Facility abandonment;
- support requests;
- approval turnaround; and
- pilot completion rate.

These are recommended operational measurements, not a mandate to add tracking. Any instrumentation or analytics requires separate privacy, product, and implementation approval.

## 19. UX Decision Filter

> **Does this change reduce confusion, increase participant confidence, or improve the probability that the next Driver or Facility successfully completes their first verified activity?**

If the answer is no, it likely belongs in a later sprint.

## 20. Document Boundaries

This specification is documentation only. It does not change current implementation, onboarding completion logic, notifications, analytics, role access, financial policy, or any future platform capability. Any implementation derived from it requires separately approved scope, source-of-truth verification, and risk-based validation under the Development Protocol.
