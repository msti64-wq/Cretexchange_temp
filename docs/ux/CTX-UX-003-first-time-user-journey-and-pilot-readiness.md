# CTX-UX-003 — First-Time User Journey & Pilot Readiness

**Subtitle:** Operational User Experience Specification
**Status:** MVP UX decision authority through pilot launch
**Product:** CreteXchange
**Scope:** First-time operational journeys for Drivers, Participating Facilities, and the Platform Operations Center

## 1. Purpose

This document defines the operational first-time experience required for CreteXchange's MVP: from discovery through successful, verified platform participation. It is the UX decision authority for remaining MVP work through pilot launch.

The MVP objective is not feature completeness. The objective is successful adoption: a new Driver can begin and complete an eligible activity, a Participating Facility can become ready and verify activity, and a Platform Operator can support the workflow without unnecessary manual intervention.

This document governs operational journeys, not page layouts, implementation details, APIs, or financial behavior. [CTX-UX-001](./CTX-UX-001-first-impression-and-onboarding-experience.md) governs first impression and onboarding philosophy; [CTX-UX-002](./CTX-UX-002-landing-page-content-information-architecture-and-wireframe-specification.md) governs public landing-page presentation.

### Guiding principle

Every UX decision should answer:

> **Does this increase the probability that a new Driver, Facility, or Platform Operator successfully completes their first verified material recovery activity?**

If the answer is no, the work should generally be deferred until after pilot unless it is required for platform stability or security.

## 2. UX Philosophy

- **Simplicity over feature count.** Present the next meaningful action before optional capability.
- **Reduce uncertainty.** Explain what will happen, what is required, and what the participant should do next.
- **Build confidence before commitment.** Give participants enough practical context to choose the appropriate path.
- **Explain why information is requested.** Ask only for information necessary for participation, support, verification, security, or approved operations.
- **Mobile-first.** Driver and facility workflows must remain understandable and actionable in field conditions.
- **One primary objective per screen.** Do not make users choose among competing tasks when one next action is required.
- **Confirm meaningful actions.** Registration, profile completion, location readiness, submission, review, and verification require clear confirmation or recovery guidance.
- **Operational clarity over marketing language.** Use accurate, practical terms for facilities, activity, status, and verification.
- **Trust through transparency.** Do not represent verification as payment, settlement, regulatory certification, material-quality assurance, or a government approval.
- **Progress toward first verified activity.** Every interaction should remove a real blocker or move a participant closer to the first verified activity.

## 3. Driver Journey

The Driver journey is a mobile-first operational path. It must not imply that registration alone, account configuration alone, or activity submission alone guarantees verification.

| Phase | User goal | Platform responsibility | Success criteria | Potential friction | UX mitigation |
| --- | --- | --- | --- | --- | --- |
| Discovery | Understand whether CreteXchange is relevant. | Present current operational value and a clear Driver path. | Driver can identify the Driver registration action. | Unclear purpose or role. | Use concise, role-specific public language. |
| Landing page | Choose the appropriate next action. | Distinguish Driver registration, Facility registration, and login. | Driver selects Driver registration or login without ambiguity. | Competing calls to action. | Keep primary actions limited and labeled. |
| Registration | Create an account. | Request only necessary account information and show validation/recovery states. | Account creation completes or a clear correction path is shown. | Form length, errors, password uncertainty. | Explain requirements, preserve entered information where safe, and use direct errors. |
| Email verification, if enabled | Confirm account access. | Explain why confirmation is needed and provide a recoverable next step. | Driver understands whether confirmation is complete or still needed. | Delayed message or unclear status. | Use clear status and resend/recovery guidance when available. |
| Profile completion | Provide the information needed for operational participation. | Separate required readiness information from optional enhancements. | Driver reaches a clearly identified ready or next-step state. | Unclear reason for requested information. | Explain why each required category matters. |
| Terms acceptance | Understand and accept applicable participation terms. | Present required terms accessibly and record the accepted action. | Driver can confirm acceptance and continue. | Dense legal content. | Identify required action plainly; avoid hiding the consequence of declining. |
| GPS permission | Enable location-aware discovery or check-in where required. | Request permission only at a relevant moment and explain the operational reason. | Driver understands the result of granting, declining, or later changing permission. | Privacy concern or device prompt fatigue. | Provide purpose, fallback guidance, and a nontechnical explanation. |
| Facility discovery | Find an eligible participating facility. | Show available operational information without promising acceptance or availability. | Driver can identify a relevant facility and next action. | Incomplete information, distance, eligibility uncertainty. | Use clear facility status, instructions, and empty/unavailable states. |
| Arrival | Confirm the arrival workflow. | Explain what check-in or arrival evidence is needed. | Driver knows the next required action. | On-site uncertainty or poor connectivity. | Keep instructions short and make recovery/support paths visible. |
| Activity submission | Record an eligible operational activity. | Validate required information and distinguish draft, submitted, and unavailable states. | Submission is confirmed or a specific correction path is provided. | Missing details, duplicate concern, uncertain completion. | Use field-level guidance and a clear confirmation state. |
| Photo upload | Provide evidence when the applicable workflow requires it. | Explain why evidence is requested and show upload progress or failure recovery. | Driver knows whether evidence was attached successfully. | Slow connection, camera access, image uncertainty. | Support retry and avoid treating upload intent as completion. |
| Verification | Understand the operational review outcome. | Communicate submitted, pending, verified, rejected, or unavailable status accurately. | Driver can understand the current status and next step. | Waiting, rejection, or ambiguous status. | Use status-specific explanations and support escalation where authorized. |
| Dashboard | See the next operational action. | Prioritize readiness, current activity state, and facility discovery over unrelated information. | Driver can continue participation without searching for the workflow. | Dense information or stale expectations. | Surface the next action and meaningful empty states. |
| Return experience | Complete later activity with less friction while preserving trust. | Remember only approved preferences and keep status/history understandable. | Driver voluntarily returns and can repeat the workflow. | Relearning the process. | Preserve clear navigation and familiar terminology. |

## 4. Participating Facility Journey

Public-facing terminology is **Facility** or **Participating Facility**. Existing authenticated role and route terminology may continue to use **Owner** where required. Facility readiness does not imply guaranteed driver volume, revenue, or mandatory incentive configuration.

| Phase | User goal | Platform responsibility | Success criteria | Potential friction | UX mitigation |
| --- | --- | --- | --- | --- | --- |
| Discovery | Understand practical participation value. | Explain facility operations, activity review, and readiness without unsupported promises. | Operator can identify the Facility registration path. | Concern about disruption or unclear value. | Use concise, operational outcomes. |
| Registration | Create the facility account. | Request required account information and provide clear validation/recovery. | Registration completes or a specific correction path is shown. | Form friction or role confusion. | Use Facility language publicly and clear registration labels. |
| Business profile | Identify the participating business. | Explain required profile information and avoid unnecessary collection. | Operator understands profile completion status. | Unclear purpose for requested details. | Tie each required category to facility operations or support. |
| Facility setup | Create and configure an operational location. | Guide operators through the minimum configuration needed for participation. | Facility configuration reaches a clear ready or next-step state. | Many fields or unclear dependencies. | Group setup by operational purpose and show progress. |
| Hours | Define practical operating availability. | Make hours understandable and editable. | Drivers can receive accurate operating context where current data supports it. | Exceptions or uncertain schedules. | Use clear status language and avoid implying guaranteed availability. |
| Visibility | Control whether an eligible location is discoverable. | Distinguish active operational state from public/driver visibility. | Operator understands the effect of the selected state. | Confusing status terminology. | Explain active and visible as separate concepts. |
| Operational preferences | Set supported instructions, rules, and optional incentives. | Keep configuration-first options clear and distinguish optional settings. | Operator can configure approved preferences without treating them as payment completion. | Optional complexity or fear of commitment. | Label optional fields and explain their operational meaning. |
| Receive Driver | Prepare for a participating driver's arrival. | Surface facility instructions and applicable location context. | Operator can receive the driver according to configured operations. | On-site uncertainty. | Keep instructions current, concise, and visible in the relevant workflow. |
| Review activity | Review submitted activity. | Present review context and status without exposing unnecessary information. | Operator can determine whether action is needed. | Ambiguous evidence or review backlog. | Provide clear review states and a defined next action. |
| Verify activity | Confirm qualifying operational activity. | Make the verification action, effect, and exception path clear. | Operator can verify or reject according to the approved workflow. | Concern about incorrect confirmation. | Use explicit confirmation and distinguish verification from financial settlement. |
| Dashboard | Monitor facility readiness and activity. | Prioritize operational context, exceptions, and actionable next steps. | Operator can identify what requires attention. | Dense operational data. | Use clear operational labels and loading/empty states. |
| Reports | Review authorized operational history. | Present reporting as operational insight, not payment or settlement reporting. | Operator can understand participation patterns and review needs. | Misreading activity as financial completion. | Keep activity, configuration, payment, and settlement concepts distinct. |
| Return experience | Maintain a ready, trusted facility presence. | Make recurring configuration and review tasks easy to resume. | Operator voluntarily returns to manage operations. | Forgetting status or setup context. | Preserve predictable navigation and status language. |

## 5. Platform Operations Center Journey

The Platform Operations Center supports and improves platform operations. It does not replace Driver or Facility responsibility, and it must not become a substitute for clear participant workflows.

| Operational area | Operator goal | UX expectation |
| --- | --- | --- |
| New users | Identify whether new participants can progress. | Surface readiness and support needs without exposing unnecessary personal information. |
| New facilities | Confirm facility readiness and discoverability. | Distinguish account, location, active, and visible state clearly. |
| Verification queue | Identify review workload and aging exceptions. | Present current operational status, not payment or settlement status. |
| Marketplace health | Understand participation and readiness. | Use approved aggregate operational indicators without unsupported geographic or market claims. |
| Operational support | Resolve expected participant blockers. | Provide role-appropriate context, recovery guidance, and auditable actions. |
| Exception handling | Identify missing, conflicting, unavailable, or stalled states. | Make the exception and next authorized action explicit; do not silently convert uncertainty into completion. |

Success means the Operations Center can observe an end-to-end workflow, support participants, detect recurring friction, and require minimal manual intervention for normal pilot activity.

## 6. Friction Map

This is a living operational document. Likelihood and impact are working pilot hypotheses and must be updated from observed pilot behavior, not assumed as measured results.

| Decision point | Why it creates friction | Estimated likelihood | Operational impact | Proposed mitigation |
| --- | --- | --- | --- | --- |
| Role selection | A visitor may not know whether the Driver or Facility path applies. | Medium | High | Clear role-specific public messaging and CTAs. |
| Registration | Form errors, account requirements, or unclear validation can cause abandonment. | Medium | High | Direct errors, recoverable input, and one clear completion state. |
| Profile readiness | Participants may not understand what is required before operations can begin. | Medium | High | Explicit readiness checklist and explanation of required information. |
| Terms or acknowledgements | Required acceptance can feel disconnected from the immediate task. | Medium | Medium | Explain requirement and present a clear continue path. |
| GPS or camera permission | Device prompts can create privacy concern or confusion. | Medium | High | Request contextually, explain purpose, and provide authorized fallback guidance. |
| Facility discovery | Facility eligibility, instructions, or current readiness may be unclear. | Medium | High | Clear facility status, location information, and unavailable/empty states. |
| Arrival and check-in | Field conditions create time pressure and uncertainty. | Medium | High | Short instructions, large actions, and recoverable errors. |
| Evidence upload | Connectivity or device constraints can interrupt submission. | Medium | High | Progress, retry, and clear distinction between upload and completed submission. |
| Review and verification | Participants may not know who acts next or why activity is pending. | Medium | High | Clear owner/facility review status and expected next action. |
| Rejection or exception | A failed or rejected outcome can end participation. | Low to medium | High | Specific reason, recovery option, and authorized support path. |
| Return navigation | Users may not quickly find the workflow on a later visit. | Medium | Medium | Consistent navigation and a prominent next operational action. |

## 7. Time to First Verified Activity (TFVA)

**Time to First Verified Activity (TFVA)** is:

> The elapsed time between successful registration and completion of the participant's first verified activity.

TFVA is a core operational success metric. It is more meaningful than registration counts alone because a registration does not establish that a participant can discover, configure, submit, review, verify, and return through the real workflow.

Reducing TFVA—without reducing trust, evidence, eligibility, or verification quality—is a primary UX objective. Improvements that may reduce TFVA include:

- clearer onboarding and readiness language;
- improved navigation to the next operational action;
- better facility discovery and instruction clarity;
- a simpler, recoverable verification workflow; and
- reduced uncertainty at registration, arrival, submission, and review.

TFVA is an operational success metric, not a financial, settlement, payment, or marketing KPI. It must not be used to justify bypassing required verification or operational safeguards.

## 8. Pilot Success Criteria

### Driver

- Registers successfully.
- Understands applicable readiness steps.
- Finds a participating facility using the current workflow.
- Completes an eligible activity submission.
- Receives a clear verification outcome.
- Returns voluntarily for later operational use.

### Participating Facility

- Registers successfully.
- Configures a participating facility to the minimum approved operational readiness level.
- Receives and reviews submitted activity.
- Verifies or otherwise resolves activity through the approved workflow.
- Returns voluntarily to maintain facility operations.

### Platform Operations Center

- Observes the complete workflow without relying on unsupported data.
- Supports participants through expected, authorized exception paths.
- Detects recurring friction and review backlog.
- Requires minimal manual intervention for normal pilot operations.

## 9. MVP Acceptance Criteria

### Driver checklist

- [ ] The public path clearly identifies Driver registration and login.
- [ ] Registration and required profile steps present understandable validation and recovery states.
- [ ] Required permissions and acknowledgements explain their operational purpose.
- [ ] Eligible facility discovery is understandable on a mobile device.
- [ ] Arrival, submission, and evidence steps provide clear confirmation or error recovery.
- [ ] Verified, pending, rejected, and unavailable states are not conflated.
- [ ] The return path exposes the next meaningful operational action.

### Participating Facility checklist

- [ ] The public path uses Facility terminology and leads to the approved registration route.
- [ ] Business profile and facility setup distinguish required from optional configuration.
- [ ] Active and visible facility states are understandable and separately labeled.
- [ ] Hours, instructions, and preferences support practical operations.
- [ ] Review and verification actions are explicit and recoverable.
- [ ] Verification is not described as payment, settlement, certification, or material-quality assurance.
- [ ] Dashboard and reports retain operational, configuration, payment, and settlement boundaries.

### Platform Operations Center checklist

- [ ] New participant and facility readiness can be identified through authorized views.
- [ ] Review workload and operational aging are understandable.
- [ ] Marketplace health is presented as approved operational context.
- [ ] Exception paths are visible, role-appropriate, and auditable.
- [ ] Support actions do not bypass participant responsibility or financial controls.

## 10. Pilot Readiness Checklist

Pilot launch should occur only after this checklist has been satisfactorily completed for the approved pilot scope.

- [ ] UX journey review complete.
- [ ] Supporting documentation complete.
- [ ] Mobile review complete.
- [ ] Accessibility review complete.
- [ ] English content review complete.
- [ ] Fluent Spanish content review complete.
- [ ] Driver onboarding validated.
- [ ] Facility onboarding and readiness validated.
- [ ] Activity submission and verification validated.
- [ ] Driver and Facility dashboard experience validated.
- [ ] Authorized operational reports validated.
- [ ] Platform Operations Center workflow validated.
- [ ] Participant support documentation available.
- [ ] Recovery and escalation procedures documented.
- [ ] Known pilot limits communicated to the operating team.

## 11. UX Decision Filter

For proposed UX work, ask:

- Does it reduce onboarding friction?
- Does it reduce confusion?
- Does it increase trust through accurate operational clarity?
- Does it shorten TFVA without weakening verification quality?
- Does it improve successful verification?
- Does it improve voluntary return participation?

If the answer is no, the enhancement should generally be considered after pilot unless it is required for stability, security, accessibility, privacy, or an approved operational obligation.

## 12. Relationship to Other UX Documents

```text
CTX-UX-001 — First Impression and Onboarding Experience
↓
CTX-UX-002 — Landing Page Content, Information Architecture, and Wireframe Specification
↓
CTX-UX-003 — First-Time User Journey & Pilot Readiness
↓
Driver UX · Facility UX · Platform Operations Center UX
```

CTX-UX-001 governs first impression and onboarding philosophy. CTX-UX-002 governs public presentation, content, and landing-page information architecture. CTX-UX-003 governs operational first-time journeys and pilot readiness across participant roles.

This document remains subordinate to the governing hierarchy: [Platform Vision](../vision/platform-vision.md), [Platform Strategy](../vision/platform-strategy.md), [Project Context](../project/project-context.md), [Platform Standards](../standards/cretexchange-platform-standards.md), applicable [CTX-ARCH documents](../architecture/README.md), [Product Decisions](../product/product-decisions.md), and the [Development Protocol](../development-protocol.md). In particular, [PD-045](../product/product-decisions.md#pd-045---canonical-driver-settlement-rail) and [CTX-ARCH-006](../architecture/driver-incentive-and-financial-settlement-architecture.md) continue to govern settlement boundaries; this document does not alter them.

## Document Boundaries

This specification does not authorize implementation changes, new data collection, analytics, routes, APIs, schemas, financial changes, wallet behavior, Stripe behavior, settlement behavior, or future Construction Circular Economy Intelligence Platform capabilities. It should be updated after pilot observations through the normal documentation and decision process.
