# CreteXchange Driver User Guide

## What This Account Type Does

Drivers complete washouts, upload photos, view activity, and earn lottery entries from eligible approved washouts.

Drivers do not need to manually enter the lottery.

## Driver Dashboard

The dashboard is the main view for:

- today’s activity
- washout history
- locations
- wallet / payout status
- notifications
- lottery entries

## Washout Workflow

Typical driver flow:

1. Open the app and go to an eligible location.
2. Check in.
3. Complete the washout activity.
4. Upload the required photos.
5. Submit the activity.
6. Wait for approval / verification.

After a washout is approved and billable:

- the driver earns lottery eligibility automatically
- the platform records the activity
- the owner billing side can count the washout as receivable

## Photo Requirements

Photos are validated for:

- file metadata
- upload metadata
- GPS location
- photo freshness
- duplicate-photo detection

The backend uses GPS and location coordinates to determine whether the photo is:

- verified
- warning
- failed
- needs review

If GPS is missing or the coordinates do not line up, the photo may go to review instead of auto-verifying.

### What You Need to Know

- Photos must be uploaded to server storage.
- Do not reuse the same stale image for a new washout.
- A photo outside the normal GPS radius can be flagged or rejected.

## Lottery

Drivers automatically receive lottery entries for eligible approved washouts.

Important rules:

- no manual entry is needed
- only billable approved washouts earn entries
- `rubble_dropoff` is not treated as a washout lottery entry
- duplicate approvals do not create duplicate entries

The driver dashboard can show:

- whether lottery is active
- the current drawing
- your current entry count

## Wallet and Payouts

Drivers may see wallet and payout information separately from washout approval.

Optional payout-related behavior:

- driver Stripe tip payout setup is only relevant if the platform enables it
- it is not required for washout completion
- it is not required for lottery eligibility

If tip payouts are enabled, the driver may need to complete Stripe onboarding for that separate flow.

## Driver Profile

Drivers can update profile details, payout preferences, and optional financial setup.

Do not confuse:

- washout completion
- lottery eligibility
- optional tip payout onboarding

These are separate systems.

## Common Driver Messages

- `Lottery active`
  - The lottery feature is enabled.

- `Lottery disabled`
  - An admin has disabled the lottery feature.

- `Lottery is active for [month] [year], but no drawing has been posted yet.`
  - The lottery system is on, but a drawing has not been posted.

- `Photo GPS is ... miles from the washout location.`
  - The photo was too far from the location to auto-verify.

- `Failed to upload photo`
  - A photo upload or storage request failed.

## Driver Troubleshooting

### My washout is not earning a lottery entry

Check:

- the washout was approved
- the washout is billable
- the service type is eligible
- the approval did not fail or remain pending

### My photos keep getting flagged

Check:

- location services are enabled
- the phone is tagging photos with GPS
- the photos are uploaded from the device, not copied from a stale source

### I see payout or tip setup prompts

Those prompts are about optional driver payout setup. They do not mean you cannot complete washouts.

