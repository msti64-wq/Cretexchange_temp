# Billing

## Dry-Run Preview

- Dry-run endpoint: `POST /api/admin/billing/preview-owner-washout-charge`
- Dry-run does not call Stripe.
- Dry-run does not write billing success records.

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
- Fallbacks for tip data are only used when the primary activity amount is missing

## Operational Notes

- Do not change the ledger math when only the display layer needs work.
- Keep Stripe execution separate from dry-run diagnostics.
- Keep billing, wallet accounting, and driver tip changes isolated from each other.
