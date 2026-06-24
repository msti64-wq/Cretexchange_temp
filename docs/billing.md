# Billing

## Dry-Run Preview

- Dry-run endpoint: `POST /api/admin/billing/preview-owner-washout-charge`
- Dry-run does not call Stripe.
- Dry-run does not write billing success records.
- Dry-run is preview only: it returns the ledger payload and debug fields, but it does not create a live charge or transfer.

## Canonical Ledger

Dry-run and live billing use the shared canonical calculator in `shared/billingPolicy.ts`.

Ledger fields returned by the preview include:

- `platformFeeTotalCents`
- `driverTipTotalCents`
- `ownerChargeAmountCents`
- `platformRevenueCents`
- `driverTransfers[].amountCents`

## Source Mapping

- Driver tip source: `washout_activities.amount`
- Platform fee source: current platform fee logic
- Fallbacks for tip data are only used when the primary activity amount is missing.
- A normalized dollar string such as `"1.00"` must resolve to `100` cents before ledger calculation.

## Live Billing

Live billing uses the same canonical ledger shape as dry-run, but it proceeds through the actual owner billing execution path and Stripe charge flow.

Current live billing behavior:

- approved, billable washouts are selected from the owner billing run
- the shared ledger determines owner charge amount, platform fee, and driver transfer amounts
- the owner charge is sent through Stripe in the production billing path
- billing success records are written only in the live execution flow
- owners are not currently charged recurring subscription fees
- billing cadence controls when approved per-washout platform fees are processed; it is not a subscription schedule
- CreteXchange may change fees in the future with advance notice and updated terms

## Immediate Billing Process

When billing cadence is immediate:

1. The approved washout is verified for ownership and billability.
2. The shared ledger is built.
3. The owner charge amount is sent to Stripe.
4. The platform fee remains in the platform revenue path.
5. The driver transfer amount uses the resolved driver tip value.
6. The billing batch and related accounting records are updated only after the live billing path succeeds.

## Operational Notes

- Do not change the ledger math when only the display layer needs work.
- Keep Stripe execution separate from dry-run diagnostics.
- Keep billing, wallet accounting, and driver tip changes isolated from each other.
