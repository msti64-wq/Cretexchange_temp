# PD-052 — Marketplace Trust, Administrative Activity Review, and Dispute Resolution

**Status:** Active policy decision; implementation requires separately approved scope

**Date:** 2026-07-14

**Scope:** Administrative authority, operational evidence, trust protections, and fair dispute resolution

## 1. Purpose

This Product Decision defines the administrative authority, evidence standards, trust protections, and dispute-resolution policy for CreteXchange. It establishes how the Platform Operations Center protects marketplace integrity while remaining fair to both Drivers and Participating Facilities.

It also defines when administrative intervention in submitted activity is appropriate. This document governs policy, not implementation. It creates no database fields, APIs, evidence-storage capability, automated decision process, disciplinary automation, payment action, or legal process.

## 2. Relationship and Authority

This decision extends and must be read with:

- [PD-050 — Facility Operational Access and Billing Readiness](./PD-050-facility-operational-access-and-billing-readiness.md)
- [PD-051 — Driver Activity and Payment Lifecycle](./PD-051-driver-activity-and-payment-lifecycle.md)
- [CTX-UX-004 — First-Time User Onboarding Experience](../ux/CTX-UX-004-first-time-user-onboarding-experience.md)
- CTX-UX-005 — Platform Operations Center Experience, a planned UX document not yet published
- [Project Context](../project/project-context.md)
- [CTX-ARCH-002 — Owner Operations Architecture](../architecture/owner-operations-architecture.md)
- [CTX-ARCH-003 — Driver Operations Architecture](../architecture/driver-operations-architecture.md)
- [CTX-ARCH-004 — Admin Operations Architecture](../architecture/admin-operations-architecture.md)
- [CTX-ARCH-001 — Financial Architecture and KPI Specification](../architecture/financial-architecture-and-kpi-specification.md)
- [CTX-ARCH-006 — Driver Incentive and Financial Settlement Architecture](../architecture/driver-incentive-and-financial-settlement-architecture.md)
- [Platform Standards](../standards/cretexchange-platform-standards.md)

The Platform Operations Center is the preferred architectural term for the administrator experience. Existing implementation may still use “Admin Dashboard” until separately approved UX cleanup.

This decision is subordinate to the governing documentation hierarchy. In particular, financial authority remains with the applicable financial architecture and Product Decisions; an operational review does not itself authorize billing, wallet, Stripe, settlement, tax, accounting, or collection action.

## 3. Guiding Principles

- **Marketplace trust is essential.** Participants must be able to rely on a fair, understandable operational review process.
- **Operational evidence is authoritative.** Determinations rely on the available, authorized evidence and recorded workflow history—not assumption, reputation, or a participant’s role alone.
- **Administrative review is impartial.** Platform Operations protects both Drivers and Participating Facilities and must not favor either party without evidence.
- **Administrative intervention is auditable.** Each review, material evidence access, determination, and authorized correction must have an appropriate record.
- **Every decision is evidence-based.** The decision record must explain the operational basis, the authority used, and the participant-facing outcome.
- **Patterns trigger investigation, not punishment.** A pattern indicates that review may be warranted; it does not establish fraud, fault, or an automatic penalty.
- **Minimum necessary access.** Review access is limited to authorized personnel, evidence, and purpose.
- **Operational and financial states remain separate.** Verification, rejection, or an administrative determination must not be portrayed as payment or settlement completion.

## 4. Administrative Authority

Platform Operations may review operational activity when necessary to:

- investigate a participant complaint;
- resolve an operational dispute;
- investigate suspected fraud or platform abuse;
- investigate repeated rejection patterns;
- investigate suspicious approval patterns;
- assist pilot participants through an authorized support path; or
- protect marketplace integrity, safety, privacy, or compliance with applicable platform policy.

Administrative review must not be arbitrary. Before a determination, the authorized reviewer should identify the review purpose, relevant evidence, applicable operational policy, and the least invasive available action. An administrative review is not a substitute for ordinary Facility review, Driver responsibility, or clear participant workflows.

### Separation of duties

Where practical, the person who opens or investigates a review should not be the sole authority for a material outcome when a second authorized reviewer is available. Escalate conflicts of interest, unresolved evidence conflicts, potential legal concerns, suspected systemic abuse, and any proposed financial action to the appropriate authorized process.

## 5. Activity Evidence

Administrative review may consider the minimum relevant evidence available through authorized platform records, including:

- submitted photos;
- GPS coordinates or authorized location metadata;
- timestamps;
- Driver identity and authorized account context;
- Facility identity and authorized account context;
- participating location context;
- activity status history;
- verification history;
- administrative history; and
- relevant system audit information.

Evidence must be assessed in context. A single signal—such as GPS proximity, an image, an account attribute, or a prior complaint—does not by itself establish misconduct unless the governing workflow and evidence clearly support that conclusion.

Future evidence types may be added through separately approved policy and implementation work without changing this decision’s core requirements: authorized purpose, minimum necessary access, evidence-based determination, participant fairness, privacy, and auditability.

## 6. Administrative Activity Review Lifecycle

```text
Complaint or operational concern received
↓
Evidence review
↓
Administrative determination
↓
Outcome recorded
↓
Participant notification
```

| Stage | Purpose | Required policy behavior |
| --- | --- | --- |
| Complaint or operational concern received | Capture a reviewable concern without assuming fault. | Record the source, scope, affected activity when known, and any immediate safety/privacy concern. Provide an authorized support path. |
| Evidence review | Assess relevant operational records. | Use the minimum necessary evidence, preserve impartiality, identify gaps, and avoid unsupported inference. |
| Administrative determination | Decide the operational outcome or required next step. | Apply the documented policy, state the evidence basis, and identify any limitation or uncertainty. |
| Outcome recorded | Preserve an auditable operational record. | Record authority, determination, rationale, date/time, and any authorized follow-up. Do not overwrite prior history without an auditable correction process. |
| Participant notification | Communicate the result fairly. | State the current operational outcome and next permitted action without exposing another participant’s private information or implying financial completion. |

### Possible outcomes

An authorized review may result in:

- Facility decision upheld;
- Driver submission upheld;
- administrative verification;
- administrative rejection;
- additional information required; or
- support follow-up.

An outcome must be proportionate to the available evidence. “Additional information required” and “support follow-up” are valid outcomes where the record cannot support a fair operational determination. An administrative verification or rejection follows the lifecycle and source-of-truth boundaries in PD-051; it must be recorded through an authorized process and must not be fabricated as an informal UI label.

## 7. Marketplace Trust and Investigation Triggers

Repeated or material patterns may trigger administrative review. Examples include:

- repeated rejection of apparently legitimate activities;
- repeated approval of apparently invalid activities;
- suspected fraudulent submissions;
- suspected fraudulent approvals;
- suspected abuse of configured incentives;
- suspected GPS manipulation;
- suspected photo manipulation;
- suspected identity abuse; and
- repeated participant complaints.

These examples are investigation triggers, not automatic conclusions, penalties, suspensions, financial assessments, or participant trust scores. The reviewer must consider evidence quality, alternative explanations, context, error conditions, and the appropriate participant response before taking action.

No automated fraud detection, confidence score, or AI-assisted prioritization is authorized by this decision. Any future prioritization capability must undergo separate product, privacy, security, architecture, and implementation review and may assist triage only; it must not replace accountable human determination unless separately approved.

## 8. Administrative Actions

Subject to authorized policy, evidence, proportionality, and applicable law, possible administrative actions include:

- educational guidance;
- warning;
- administrative verification;
- administrative rejection;
- retroactive operational correction through an auditable correction process;
- temporary suspension;
- permanent removal; and
- referral for legal review when appropriate.

An administrative correction must preserve the original evidence and history, identify the authority and rationale for the correction, and follow the current operational and financial source-of-truth rules. It must not silently rewrite an activity, bypass authorization, or automatically reopen financial settlement.

Assessment of applicable platform fees or charges may occur only when supported by the platform’s governing agreements, valid evidence, applicable law, and the separately governing financial architecture. It is not an automatic consequence of an administrative review, complaint, verification, rejection, suspension, or removal.

## 9. Facility Responsibilities

Participating Facilities are expected to:

- review submitted activities honestly and promptly;
- avoid arbitrary rejection;
- avoid abuse of verification authority;
- maintain operational integrity; and
- cooperate with authorized investigations.

Repeated bad-faith behavior may result in administrative review and proportionate authorized action. A delayed review, isolated error, participant disagreement, or technical issue is not automatically bad faith. Public-facing agreements, terms, and applicable law govern any enforceable obligations or remedies.

## 10. Driver Responsibilities

Drivers are expected to:

- submit genuine activities;
- provide accurate evidence required by the applicable workflow;
- avoid duplicate submissions;
- avoid fraudulent submissions;
- cooperate with authorized investigations; and
- maintain operational integrity.

A failed, incomplete, duplicate-flagged, or rejected submission is not automatically fraudulent. Administrative review must distinguish an operational error, a technical problem, insufficient evidence, and supported misconduct before an outcome is determined.

## 11. Platform Operations Center Policy Requirements

Future Platform Operations Center capabilities should support, at minimum:

- administrative activity review;
- an authorized evidence viewer;
- evidence filtering;
- Facility filtering;
- Driver filtering;
- status filtering;
- date filtering;
- complaint filtering;
- administrative notes;
- audit history; and
- administrative outcome history.

These are policy requirements for future approved implementation, not a claim that all controls or views exist today. Any implementation must enforce role-based access control, least privilege, audit logging, privacy protections, and the appropriate review authority.

## 12. Activity Evidence Viewer

A future Activity Evidence Viewer should enable authorized Platform Operations personnel to review evidence associated with an operational activity. Typical evidence may include photos, GPS or authorized location metadata, timestamps, Facility and Driver context, verification timeline, and administrative history.

The viewer exists to support authorized investigations, operational support, compliance, and fair dispute resolution—not participant surveillance. It should minimize exposure, avoid unnecessary secondary use, redact or restrict information where appropriate, and preserve access auditability. It must not create a new evidence-collection requirement, store evidence outside its approved lifecycle, or expose evidence to unauthorized participants.

## 13. Privacy and Evidence Access

Administrative evidence access must follow least-privilege principles:

- access is limited to authorized Platform Operations personnel with a documented operational, investigative, compliance, or support purpose;
- reviewers access only the minimum evidence required for the decision;
- evidence is not used for unrelated participant surveillance, marketing, profiling, or unsupported scoring;
- administrative evidence access and material actions should be logged and auditable;
- participant communications disclose only the information appropriate to that participant and must not reveal another participant’s private evidence, notes, or account context; and
- retention, disclosure, export, and legal-response requirements require separate policy and implementation authority.

## 14. Notifications

Notifications should communicate a current operational status and a next authorized action. They must remain neutral and must not imply fault, payment, or settlement.

| Audience | Notification | Required meaning |
| --- | --- | --- |
| Driver | Administrative review opened | Additional operational review is underway; the current activity status and next available action are clear. |
| Driver | Administrative review completed | The operational outcome and any permitted next action are clear. |
| Facility | Administrative review opened | A relevant operational review is underway without disclosing unnecessary Driver information. |
| Facility | Administrative review completed | The operational outcome and Facility next action are clear. |
| Operations | Complaint received | An authorized review intake requires triage. |
| Operations | Review assigned | A reviewer or authorized queue owns the next step. |
| Operations | Review overdue | The review exceeds an approved operational target and requires follow-up. |
| Operations | Investigation completed | An auditable determination and any required follow-up are recorded. |

Current notification behavior must not be represented as implementing every event above until separately approved and validated.

## 15. Metrics

Future approved operational measurement may consider:

- complaint rate;
- administrative review rate;
- administrative verification rate;
- administrative rejection rate;
- average investigation time;
- repeated complaint frequency;
- Facility trust indicators;
- Driver trust indicators; and
- operational-integrity trends.

These metrics support operational improvement and must not be treated as automated disciplinary scores, a basis for automatic penalties, or a substitute for an evidence-based review. Any metric definition, data collection, retention, participant disclosure, or automated use requires separate privacy, product, architecture, and implementation approval.

## 16. Out of Scope

This decision does not authorize:

- implementation;
- database changes;
- APIs;
- evidence storage;
- image processing;
- AI image analysis;
- automated fraud detection;
- financial implementation;
- legal proceedings; or
- law-enforcement integration.

It also does not create contractual remedies, permit the collection of new evidence, alter payment/settlement state, or permit direct production-data edits outside a separately approved and auditable process.

## 17. Decision Filter

> **Does this action improve marketplace trust through evidence-based, fair, and auditable administrative review?**

If not, reconsider whether it belongs within Platform Operations authority.

## 18. Implementation Boundary

Any implementation derived from this decision requires separately approved scope, source-of-truth verification, privacy and security review, authorization design, auditability controls, participant communication design, and risk-based validation under the Development Protocol. This policy changes no current implementation behavior.
