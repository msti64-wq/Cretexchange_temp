# Assisted-Pilot Operations Runbook

**Status:** Sprint 2.2 Phase A operational guidance
**Scope:** Driver and Participating Facility first-activity support
**Authority:** This runbook supports [CTX-UX-003](../../ux/CTX-UX-003-first-time-user-journey-and-pilot-readiness.md). It does not alter product, financial, security, or settlement policy.

## Support path

Drivers and Facility Operators request help through the existing in-product support/message path or the pilot contact channel supplied by CreteXchange Platform Operations. The operator records the participant role, route, time, symptom, activity or location identifier when available, and resolution in the authorized support queue. Treat a blocker to registration, facility readiness, activity submission, or pending verification as a TFVA priority.

Do not request unnecessary evidence or expose another participant's personal information. Use the least-privileged authorized view for each check.

## Response standard

For every issue, explain the current operational status plainly, identify the next authorized action, record the outcome, and follow up after resolution. Escalate when the response requires a code change, authorization override, security review, database repair procedure, or any financial/Stripe action.

## Scenario playbooks

### Facility approval pending

- **Symptom:** A Facility Operator sees approval pending and cannot create a location.
- **Likely cause:** Administrative review has not completed.
- **Participant explanation:** Registration is complete; CreteXchange Platform Operations must complete administrative approval before location creation is available.
- **Operator checks:** Confirm user role, owner record, approval status, profile completeness, and any documented review note.
- **Safe remediation:** Complete the authorized approval workflow in the Platform Operations Center, or explain the missing profile information and expected follow-up.
- **Escalation criteria:** Approval is older than the pilot service target, records conflict, or a policy exception is requested.
- **Prohibited actions:** Do not directly edit production database records, bypass authorization, or represent payment/Stripe setup as approval.
- **Expected resolution state:** Approved Facility Operator can proceed to first-location setup, or receives a specific authorized correction path.

### Facility approval rejected or incomplete

- **Symptom:** Approval cannot be completed or required information is missing.
- **Likely cause:** Incomplete profile, invalid business information, or authorized review concern.
- **Participant explanation:** Explain only the information the operator is authorized to disclose and provide the exact correction step.
- **Operator checks:** Review the authorized profile and approval record; avoid requesting unrelated financial information.
- **Safe remediation:** Ask the Facility Operator to correct the named profile field and resubmit through the existing workflow.
- **Escalation criteria:** Identity, authorization, privacy, or policy questions.
- **Prohibited actions:** Do not disclose reviewer notes or another participant's data.
- **Expected resolution state:** A corrected profile is ready for authorized review.

### Facility unable to create first location

- **Symptom:** The location form is unavailable or save is blocked.
- **Likely cause:** Pending approval, incomplete operational profile, invalid address or location details, or an authorization/service error.
- **Participant explanation:** An approved Facility with a complete operational profile may create its first location. A saved payment method is not an operational setup prerequisite; explain the exact returned blocker without promising a workaround.
- **Operator checks:** Confirm Facility approval, profile completeness, the server-returned missing-field message, and address validation.
- **Safe remediation:** Direct the operator to the required profile correction or the authorized administrative path.
- **Escalation criteria:** An approved, complete Facility still cannot open or save the location form; the UI and server report conflicting blockers; or address validation consistently fails.
- **Prohibited actions:** Do not change payment, billing, wallet, Stripe, or settlement status to resolve an operational issue. Do not use a direct database edit as a workaround for missing financial readiness.
- **Expected resolution state:** The Facility Operator can open the existing first-location form.

### Facility financial readiness is incomplete

- **Symptom:** A Facility has not completed a separately managed payment, billing, Stripe, wallet, payout, or settlement step.
- **Participant explanation:** Financial readiness is separate from operational location access. It does not block an approved, operationally complete Facility from creating or managing locations under PD-050.
- **Operator checks:** Confirm the participant's operational access result first; handle any financial concern through its separately authorized workflow.
- **Safe remediation:** Use the applicable financial support path only when required for that financial workflow.
- **Escalation criteria:** A financial route unexpectedly blocks operational location management, or a change to financial state is requested to work around an operational issue.
- **Prohibited actions:** Do not create Stripe records, alter payment methods, wallet balances, billing records, or settlement data to resolve location access.
- **Expected resolution state:** Operational access is resolved independently; future billing enforcement remains governed by its separate policy.

### Address verification failure

- **Symptom:** The location address cannot be saved or verified.
- **Likely cause:** The selected address did not come from the required verified-address workflow, or address data is incomplete.
- **Participant explanation:** Ask the Facility Operator to select a complete address from the available address suggestions.
- **Operator checks:** Confirm the returned validation message and that latitude/longitude were supplied by the normal address workflow.
- **Safe remediation:** Re-enter the address using the existing verified address selection flow.
- **Escalation criteria:** A valid address consistently fails or the address provider is unavailable.
- **Prohibited actions:** Do not fabricate coordinates or manually insert an address into production data.
- **Expected resolution state:** A verified address is saved with the location.

### Driver GPS denied

- **Symptom:** The Driver cannot start photo evidence or submit activity after denying location permission.
- **Likely cause:** Device/browser location permission is denied.
- **Participant explanation:** GPS is required for the pilot verification workflow. Enable location access for CreteXchange in device settings, return to the check-in screen, and select **Retry GPS**.
- **Operator checks:** Confirm the Driver is at the correct check-in route and that the device has location services enabled.
- **Safe remediation:** Guide the Driver through device permission recovery; retain the existing location and do not invent fallback coordinates.
- **Escalation criteria:** Permission is enabled but GPS remains unavailable across a supported device/network.
- **Prohibited actions:** Do not submit activity without GPS metadata or promise manual review as a substitute for the required evidence.
- **Expected resolution state:** GPS is captured and the Driver can upload evidence.

### Driver location unavailable

- **Symptom:** GPS times out or device location cannot be obtained.
- **Likely cause:** Weak signal, disabled location services, or unsupported browser/device configuration.
- **Participant explanation:** Check signal and location settings, then retry from the same check-in screen.
- **Operator checks:** Confirm the facility is still active and visible and the Driver selected the intended location.
- **Safe remediation:** Retry after signal/settings recovery or return safely to location discovery.
- **Escalation criteria:** Repeated failure on a supported device with correct settings.
- **Prohibited actions:** Do not substitute a guessed coordinate.
- **Expected resolution state:** GPS becomes available or the Driver safely exits to locations.

### Photo upload failure

- **Symptom:** One or more evidence photos fail to upload.
- **Likely cause:** Connectivity interruption, unsupported format, oversized file, or transient upload failure.
- **Participant explanation:** The activity has not been submitted. Keep the check-in open, check connectivity, and use **Retry failed photos**.
- **Operator checks:** Confirm photo requirement, GPS readiness, and the user-facing error category; do not request storage URLs or debug output from the participant.
- **Safe remediation:** Retry the existing upload flow or choose a supported, smaller photo.
- **Escalation criteria:** Repeated failures across participants or an apparent service outage.
- **Prohibited actions:** Do not expose signed URLs, CORS details, object-storage identifiers, or another participant's evidence.
- **Expected resolution state:** At least one server-backed photo is ready and the Driver can submit.

### Submission failure

- **Symptom:** The Driver sees a failed submission after evidence upload.
- **Likely cause:** Missing required activity/evidence metadata, inactive/hidden location, duplicate/verification safeguard, or transient service failure.
- **Participant explanation:** The activity was not confirmed. Use the displayed correction guidance; do not resubmit repeatedly until the issue is understood.
- **Operator checks:** Review the authorized activity/location status and the sanitized server message.
- **Safe remediation:** Correct the stated operational issue and retry once through the existing flow.
- **Escalation criteria:** Repeated failure, ownership mismatch, suspected duplicate, or service error.
- **Prohibited actions:** Do not create an activity manually or bypass evidence/duplicate protections.
- **Expected resolution state:** A pending activity exists and the Driver sees submission confirmation.

### Duplicate or suspected duplicate activity

- **Symptom:** Evidence is flagged or an activity needs review for a duplicate signal.
- **Likely cause:** Similar photo fingerprint, unavailable duplicate check, or evidence freshness concern.
- **Participant explanation:** The submission needs authorized review; no outcome is guaranteed while evidence is assessed.
- **Operator checks:** Use authorized review context and preserve the original evidence record.
- **Safe remediation:** Route the item to the authorized Facility/Operations review workflow.
- **Escalation criteria:** Repeated suspected abuse or a conflicting evidence record.
- **Prohibited actions:** Do not delete evidence or mark activity verified without adequate evidence and authority.
- **Expected resolution state:** The activity remains pending, is verified with authority, or is rejected with an authorized explanation.

### Activity pending too long

- **Symptom:** A submitted activity remains pending beyond the pilot review target.
- **Likely cause:** Facility review backlog, unavailable reviewer, or an exception signal.
- **Participant explanation:** The activity is pending Facility review; submission is not the same as verification.
- **Operator checks:** Confirm status, facility ownership, review aging, and whether a Facility can see the queue.
- **Safe remediation:** Notify the authorized Facility Operator and track the review through the existing queue.
- **Escalation criteria:** Aging exceeds the pilot target or the Facility cannot access the submission.
- **Prohibited actions:** Do not change payment/settlement status or mark verified without evidence and authority.
- **Expected resolution state:** Verified or rejected status appears in Driver Activity and the Facility queue updates.

### Activity rejected

- **Symptom:** Driver sees rejected activity or Facility needs to reject it.
- **Likely cause:** Evidence or operational eligibility was insufficient.
- **Participant explanation:** State only the authorized operational reason and the available next step; do not characterize rejection as a financial outcome.
- **Operator checks:** Confirm the activity status and review context.
- **Safe remediation:** Direct the participant to any documented correction/retry path or explain that no retry is authorized.
- **Escalation criteria:** Dispute, inconsistent status, or missing rejection context.
- **Prohibited actions:** Do not alter activity status without authorized review.
- **Expected resolution state:** The participant understands the operational outcome and any authorized next action.

### Driver does not understand status

- **Symptom:** Driver asks whether pending, verified, or rejected means payment or settlement.
- **Likely cause:** Status terminology is misunderstood.
- **Participant explanation:** Pending means Facility review is outstanding; verified means operational review completed. Neither status alone represents payment or settlement.
- **Operator checks:** Confirm the current canonical activity status.
- **Safe remediation:** Use the existing Activity and Notifications views to explain the current status.
- **Escalation criteria:** Status differs across authorized views.
- **Prohibited actions:** Do not promise a financial outcome.
- **Expected resolution state:** Driver can state the current operational status and next step.

### Facility does not see a submission

- **Symptom:** Driver reports submission, but Facility queue is empty.
- **Likely cause:** Submission was not completed, wrong/inactive location, ownership mismatch, stale client data, or query failure.
- **Participant explanation:** Confirm that the platform is checking the operational record; do not disclose unrelated activity information.
- **Operator checks:** Confirm canonical activity record, location ownership, status, and Facility authorization.
- **Safe remediation:** Refresh the authorized queue and direct the Driver to Activity confirmation if no submission exists.
- **Escalation criteria:** A confirmed pending activity is absent from the correct authorized queue.
- **Prohibited actions:** Do not move activity between facilities manually.
- **Expected resolution state:** Correct Facility can view the pending activity or the Driver receives a specific correction path.

### Verification does not appear on Driver history

- **Symptom:** Facility verified an activity, but Driver cannot see it in Activity history.
- **Likely cause:** Stale client data, date/status filter, or a persistence/query issue.
- **Participant explanation:** Ask the Driver to refresh Activity and remove filters; verification remains operational only.
- **Operator checks:** Confirm canonical activity status and authorized Driver ownership.
- **Safe remediation:** Refresh the existing client query and verify filters before escalating.
- **Escalation criteria:** Canonical status is verified but the authorized history endpoint does not return it.
- **Prohibited actions:** Do not create a duplicate activity or alter financial records.
- **Expected resolution state:** Driver history displays the verified activity.

### Language or translation problem

- **Symptom:** A participant sees English unexpectedly, raw translation text, or confusing Spanish copy.
- **Likely cause:** Language preference, missing translation key, or copy defect.
- **Participant explanation:** Confirm the preferred language and provide the current operational instruction in clear language.
- **Operator checks:** Capture route, language choice, visible text, and screenshot only with appropriate consent.
- **Safe remediation:** Use the existing language toggle where available and record the issue for the pilot team.
- **Escalation criteria:** Raw key, incorrect requirement, or safety-critical mistranslation.
- **Prohibited actions:** Do not translate legal, financial, or operational policy ad hoc as an authoritative replacement.
- **Expected resolution state:** Participant receives clear, accurate guidance and the defect is recorded.

### Urgent pilot support request

- **Symptom:** A participant is blocked during an active field workflow or a review deadline is at risk.
- **Likely cause:** Any TFVA blocker or operational exception above.
- **Participant explanation:** Acknowledge the issue, state the next immediate step, and give a realistic update path.
- **Operator checks:** Capture role, route, timestamp, location/activity identifier, status, and safety/authorization concerns.
- **Safe remediation:** Apply the applicable scenario playbook and prioritize the issue in the authorized support queue.
- **Escalation criteria:** Security, privacy, repeated outage, data integrity, financial/Stripe issue, or any action outside operator authority.
- **Prohibited actions:** Do not use live Stripe account creation as a troubleshooting shortcut, overwrite conflicting Stripe identifiers, directly edit production database records without an approved repair procedure, or bypass evidence/verification authority.
- **Expected resolution state:** Participant receives an authorized next step, the issue is recorded, and follow-up ownership is assigned.

## Closeout

Record the final participant-facing status, the authorized action taken, any escalation, and whether the issue delayed TFVA. Use recurring patterns to prioritize approved UX remediation; do not introduce new analytics or data collection through this runbook.

## Phase 3B financial-batch review boundary

When [PD-053](../../product/PD-053-canonical-financial-batch-lifecycle-and-approval-policy.md) is implemented under [CTX-ARCH-007](../../architecture/CTX-ARCH-007-canonical-financial-batch-architecture.md), Platform Operations reviews missing obligations, unbatched canonical obligations, draft batches, and quarantined exceptions through authorized queues. The manual process stops after a separately reasoned batch approval.

Approval does not mean paid, scheduled, collected, wallet-funded, or settled. No money moves, and legacy execution routes remain prohibited. Escalate totals mismatch, missing/duplicate obligations, invalid timezone, legacy records, or any request to execute or repair financial data through the separately authorized process.

## Platform Operations Financial Workspace (Phase 3B.4)

Use the Financial Workspace only as an authorized Platform Operations console for canonical obligation and batch records. It is non-executing: it does not charge a Facility, pay a Driver, fund a wallet, schedule a payment, settle a batch, call a provider, or repair an exception.

1. Confirm that you are signed in as an authorized Admin or Super Admin. Do not attempt to use this workspace from a Driver, Facility, or Owner account.
2. Review **Missing Obligations** and confirm the verified activity, Facility, Driver, age, location, and stated reason in the authorized operational source before taking any action.
3. If authorized to create an obligation, enter an existing activity reference from an authorized source and a concise operational reason. The temporary reference is used only for that request; it is not saved by the workspace, does not grant authority, and the backend independently validates eligibility and relationships.
4. Review **Unbatched Obligations** for frozen Driver incentive, Platform fee, Facility total, and age. Do not infer that any displayed value has been collected, paid, or settled.
5. If authorized to create a draft batch, enter an existing Facility reference, select the intended weekly period anchor, and provide a concise operational reason. Review the returned frozen totals, membership count, billing period, and timezone before proceeding.
6. Review **Financial Exceptions** as read-only information. Do not repair, retry, reclassify, or alter an exception from the workspace; escalate it through the separately authorized process.
7. Review a batch detail before lifecycle action. Confirm its reference, Facility, period, timezone, revision, frozen totals, membership rows, available actor references, append-only audit events, and the explicitly disclosed detail limits.
8. For a Draft batch, move it to **Ready for Review** only when the canonical record is ready for separate review. For a Ready for Review batch, approve or cancel only under the approved operational policy and with a concise reason.
9. For an Approved batch, state and confirm that it is **not executed, not charged, not paid, and not settled** before cancellation. Provide the required cancellation category. Cancellation remains an operational record action, not a financial execution action.
10. If a source is unavailable, an action fails, a record is stale, totals disagree, actor information is absent, or an exception requires repair, stop and escalate. Do not substitute a zero value, retry a financial execution path, or use a legacy payment route.

Approval remains a separate, reasoned lifecycle decision. It never authorizes execution. Legacy payment and execution routes remain prohibited until separately approved and enabled under the governing financial architecture.

## Legacy financial surfaces

`/payments`, `/fees`, and `/billing-settings` are read-only historical views during the assisted pilot. They are not canonical evidence of an obligation, batch state, Driver entitlement, collection, payment, or settlement. Operators must not generate legacy fees, run legacy billing, retry legacy financial records, or interpret legacy statuses as canonical states. Use **Financial Workspace** for authorized canonical obligation and batch review; no payment execution occurs from any of these legacy pages.
