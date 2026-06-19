# Financial Schema Map

Live Neon schema audit run against `information_schema.columns` on June 18, 2026.

## Verified Columns

`washout_activities`: `id`, `driver_id`, `location_id`, `status`, `amount`, `check_in_time`, `check_out_time`, `photo_urls`, `notes`, `verified_by`, `verified_at`, `latitude`, `longitude`, `service_type`, `material_slug`, `material_custom_label`, `qty`, `unit`, `amount_cents_owner_to_driver`, `fee_cents_platform`, `created_at`, `updated_at`.

`washout_locations`: `id`, `owner_id`, `name`, `street`, `city`, `state`, `zip`, `address`, `latitude`, `longitude`, `rate`, `monthly_fee_cents`, `is_active`, `is_visible`, `description`, `amenities`, `operating_hours`, `permit_urls`, `created_at`, `updated_at`, `driver_incentive_tip`.

`payments`: `id`, `driver_id`, `owner_id`, `activity_id`, `amount`, `processing_fee`, `washout_service_fee`, `stripe_payment_intent_id`, `stripe_transfer_id`, `stripe_charge_id`, `status`, `refunded_at`, `refund_amount`, `refund_reason`, `batch_id`, `business_date`, `paid_at`, `created_at`, `updated_at`.

`billing_batches`: `id`, `owner_id`, `business_date`, `cutoff_time`, `timezone`, `total_amount`, `total_fees`, `payment_count`, `stripe_payment_intent_id`, `stripe_batch_transfer_id`, `status`, `processing_started_at`, `completed_at`, `failure_reason`, `retry_count`, `metadata`, `created_at`, `updated_at`.

`owner_wallet_transactions`: `id`, `owner_id`, `type`, `amount`, `balance_before`, `balance_after`, `description`, `payment_id`, `batch_id`, `column_transfer_id`, `column_counterparty_id`, `stripe_transfer_id`, `created_at`.

`fees_ledger`: `id`, `owner_id`, `fee_type`, `location_id`, `amount_cents`, `period_start`, `period_end`, `status`, `wallet_tx_id`, `column_transfer_id`, `stripe_transfer_id`, `batch_id`, `paid_at`, `failure_reason`, `retry_count`, `metadata`, `created_at`, `updated_at`.

## Field Mapping

| UI field | Backend field | Source table.column | Join path | Unit | Fallback |
| --- | --- | --- | --- | --- | --- |
| Owner dashboard total payments | `weekStats.totalPayments`, `monthStats.totalPayments` | ledger sum from `billing_batches`, `payments.processing_fee`, payment tips | owner -> billing batches -> payments | dollars number | zero only when no rows |
| Owner dashboard total washouts | `weekStats.totalWashouts`, `monthStats.totalWashouts` | `washout_activities.id` count | `washout_locations.owner_id -> owners.id`, `washout_activities.location_id -> washout_locations.id` | count | zero only when no rows |
| Owner dashboard total drivers | `weekStats.totalDrivers`, `monthStats.totalDrivers` | distinct `washout_activities.driver_id` | owner -> locations -> activities | count | zero only when no rows |
| Owner dashboard platform fees owed | `platformFeesOwedCents` | `washout_activities.fee_cents_platform` or configured fee | owner -> locations -> activities | cents | configured platform fee |
| Owner dashboard platform fees paid | `platformFeesPaidCents` | `payments.processing_fee` / billing ledger | owner -> billing batches -> payments | cents | zero only when no paid rows |
| Owner dashboard driver tips | `driverTipTotalCents` | `washout_activities.amount`; payment fallback `payments.amount`; location fallback `washout_locations.rate` | activity -> payment/location | cents after normalization | fallback chain, then zero |
| Owner activities list | activity rows | `washout_activities.*` | owner -> `washout_locations.owner_id`, `washout_activities.location_id` | mixed | none; query failure should fail |
| Driver dashboard total earnings | `totalEarnings`, `tipTotalCents` | `payments.amount` and synthesized `tipAmountCents` | `payments.driver_id -> drivers.id` | dollars/cents | zero only when no rows |
| Driver dashboard total washouts | `totalWashouts` | `payments.id` count or activity count | driver -> payments/activities | count | zero only when no rows |
| Admin dashboard washout count | `totalWashouts` | `washout_activities.id` count | direct activity query | count | zero only when no rows |
| Admin dashboard driver count | `totalDrivers` | distinct `washout_activities.driver_id` | direct activity query | count | zero only when no rows |
| Admin dashboard owner count | `totalOwners` | distinct `washout_locations.owner_id` | activities -> locations | count | zero only when no rows |
| Admin dashboard platform revenue | `platformWashoutRevenueCents` | `washout_activities.fee_cents_platform`, `payments.processing_fee` | ledger over owners/batches/payments | cents | configured platform fee |
| Dry-run owner list | owner records | `owners.id`, `owners.company_name`, `users.username` | `owners.user_id -> users.id` | text | none |
| Dry-run washout list | `washoutActivityIds` | `washout_activities.id` | owner -> locations -> activities | text ids | none |
| Platform fee per washout | `platformFeeCentsByWashout` | `washout_activities.fee_cents_platform` | activity row | cents | owner/system configured fee |
| Driver tip per washout | `driverTipCentsByWashout` | `washout_activities.amount`; fallback `payments.amount`; fallback `washout_locations.rate` | activity -> payment/location | cents after normalization | fallback chain, then zero |
| Stripe owner charge amount | `ownerChargeAmountCents` | computed from platform fee + driver tip | ledger inputs above | cents | no fallback beyond ledger inputs |
| Driver transfer amount | `driverTransfers[].amountCents` | computed sum of driver tips by `driver_id` | ledger inputs above | cents | zero if no driver tips |
| Billing history amount | `billing_batches.total_amount` | `billing_batches.total_amount` | owner -> billing_batches | dollars decimal | none |
| Billing history fees | `billing_batches.total_fees` | `billing_batches.total_fees` | owner -> billing_batches | dollars decimal | none |
| Platform earnings | reporting summary | `payments.processing_fee`, `washout_activities.fee_cents_platform` | payments/activities ledgers | cents | configured platform fee |

## Nonexistent In Live Payments Schema

The live `payments` table does not contain `payout_status`, `defer_reason`, or `deferred_at`. Runtime code must not insert, update, or select those columns. If callers need those fields in JSON responses, they are synthesized response metadata only.
