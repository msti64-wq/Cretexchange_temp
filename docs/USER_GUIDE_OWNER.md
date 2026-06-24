# CreteXchange Owner User Guide

## What This Account Type Does

Owners manage washout locations, review washout activity, manage payment setup, and see platform billing information for approved washouts tied to their locations.

Owners do **not** need to manage driver payout readiness for their own platform billing.

## Getting Started

After login, the owner dashboard provides the main operational view:

- account status
- location summary
- washout activity
- platform receivables
- payment method and billing setup
- reports and history

If the account is still under review, the app will show a clear message instead of the dashboard.

## Owner Profile and Billing Setup

Owners need:

- a completed profile
- a saved payment method on file for platform billing

The app checks the owner record and legacy user record together so the billing status is accurate even when the customer ID or payment method was stored in the older profile.

What you may see:

- `Card on file / Ready for billing`
- `Card missing`
- `Missing customer identification`

If the app says a field is missing, it will now show the specific missing items instead of a generic error.

## Managing Locations

Owners can add and manage locations from the Locations page.

Current flow:

1. Open the add-location form.
2. Start with the address autocomplete field.
3. Select a valid address suggestion.
4. The app resolves latitude and longitude automatically.
5. Submit the form once the required profile/payment checks pass.

Important rules:

- You do not manually type latitude or longitude.
- The app requires a valid selected address suggestion.
- Platform fee settings are controlled by admin/superadmin, not by the owner.
- Owner-set driver incentive tips are separate from the platform fee.

## Driver Incentive Tips

For a location, the owner can set a driver incentive tip.

This is:

- optional
- separate from the platform fee
- usually `$0.00` by default

The driver incentive tip is intended to encourage driver choice at that location. It is not the platform fee charged to the owner.

## Billing and Platform Fees

The owner owes the platform a fee for approved billable washouts.

Current billing behavior:

- approved/completed/verified billable washouts count
- declined/rejected/pending/needs_review/cancelled washouts do not count
- default platform fee is $5.00 per billable washout unless admin override data says otherwise
- the system separates:
  - current receivables
  - paid platform fees
  - total platform fees

Owners are not currently charged recurring subscription fees. Current owner charges are per-approved-washout platform fees, plus any owner/location-configured driver incentive tips shown in the app. Billing cadence controls when charges are processed; it does not create a recurring subscription charge. CreteXchange may change fees in the future with advance notice and updated terms.

Your owner dashboard and billing page now use the same server-side summary, so the numbers should match.

Owner wallet accounting uses completed billing batches and historical owner charge rows. See [docs/owner-wallet-accounting.md](./owner-wallet-accounting.md).

### Immediate Billing

If an admin runs billing immediately:

- the system charges the owner’s saved card off-session
- Stripe Connect is **not** required for the owner
- driver Stripe onboarding is **not** part of owner billing

If a charge succeeds, the run will show as paid and the billed washouts will no longer appear as owed.

If a charge fails, the washouts remain unbilled until the issue is fixed and the run is retried.

## Owner Drivers Page

The Drivers page is an operational list, not a revenue report.

It may show:

- pending charges
- committed payments
- driver incentive totals

It should not label owner obligations as “revenue.”

## Washout Approvals

Owners can manually approve eligible washouts tied to their own locations.

If a washout is pending, the UI may show “Auto-approving soon” until it is manually approved or the auto-review logic runs.

Approved washouts:

- update immediately in the UI after save
- can earn lottery entries for drivers
- can count toward platform receivables

## Reports

Owner reports can show:

- washout history
- payment history
- platform fees
- driver incentive totals

If you are checking billing, use the billing page rather than the Drivers page.

## Common Owner Errors

- `Please select a valid address from the suggestions.`
  - The address field must be chosen from autocomplete, not entered as free text.

- `Missing customer identification`
  - The owner billing setup is incomplete.

- `Card missing`
  - The owner has a customer ID but no valid payment method on file.

- `Failed to approve washout`
  - The washout approval request was rejected. Check permissions, washout status, or validation details.

## Owner Troubleshooting

### I completed my profile, but I still cannot add a location

Check:

- the profile save actually completed
- the payment method is on file
- the form uses the address suggestion picker
- the app refreshed its cached user/profile data after save

### I see the wrong billing amount

The billing page now uses the same shared summary as the dashboard. If the numbers still look off, the issue is usually one of:

- date range
- paid vs owed split
- a stale browser cache
- a backend query failure on the current environment
