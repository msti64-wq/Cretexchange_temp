# CTX-ARCH-001 — CreteXchange Financial Architecture & KPI Specification

**Document ID:** CTX-ARCH-001  
**Version:** 1.0  
**Status:** Approved  
**Owner:** V8 Laboratories  
**Product:** CreteXchange  
**Effective Date:** July 2026  
**Purpose:** authoritative financial architecture and KPI specification

## 1. Purpose

This document is the authoritative source for CreteXchange financial behavior and reporting. It defines:

- the financial lifecycle
- billing rules
- owner receivables
- driver incentives
- platform revenue
- wallet balances
- Stripe/payment lifecycle
- dashboard KPIs
- reporting
- reconciliation

Any future financial implementation should conform to this document first.

## 2. Financial Philosophy

CreteXchange uses a financially conservative model.

- Operational activity is not the same as a financial obligation.
- Pending washouts do not create receivables.
- Receivables are created only after owner approval or verified billable status.
- Collected revenue is separate from receivables.
- Driver payout is separate from driver earnings.

The platform must avoid treating activity, receivables, collections, and payouts as the same concept.

## 3. Guiding Principles

- One KPI, one business question.
- Operational metrics and financial metrics must not be mixed.
- Every dollar value must have one authoritative source.
- Dashboards display values; they should not invent financial formulas.
- Shared helpers must be used for financial calculations.
- Historical records are preserved.
- Reconciliation must be idempotent.
- Documentation must be updated before financial behavior changes.

## 4. Financial State Machine

### Driver Check-In
Driver records a washout activity at a location.

Financial impact:
- operational record only
- no receivable yet
- no charge yet

### Pending Owner Review
The washout is awaiting owner action.

Financial impact:
- operationally visible
- not yet a receivable
- may have a potential charge estimate for planning

### Owner Approval
The owner verifies or approves the washout.

Financial impact:
- billable status is created
- current receivable can be recognized
- driver incentive and platform fee become financially relevant

### Current Receivable Created
Approved billable washouts are included in current owner receivables.

Financial impact:
- owner charge is recognized
- platform fee and driver incentive are included

### Owner Charged
The owner payment lifecycle begins or is recorded.

Financial impact:
- receivable transitions toward collection
- payment row may be created or updated

### Funds Collected
Stripe or equivalent collection completes.

Financial impact:
- receivable is no longer outstanding
- revenue can move into paid/history totals

### Driver Payout
Driver compensation is transferred or credited according to the configured payout path.

Financial impact:
- driver payout liability is settled
- wallet ledger or Stripe transfer may record the payout

### Historical Payment
Completed financial records remain as history.

Financial impact:
- no current receivable changes
- historical reporting and audits can reference the record

## 5. Washout Status Definitions

| Status | Operational Meaning | Financial Meaning | Dashboard Treatment |
| --- | --- | --- | --- |
| `pending` | Washout submitted but not reviewed | No receivable | Pending Review |
| `submitted` | Washout submitted for review | No receivable | Pending Review |
| `pending_photo_approval` | Waiting on photo validation | No receivable | Pending Review |
| `awaiting_owner_approval` | Owner has not yet approved | No receivable | Pending Review |
| `verified` | Confirmed as valid washout | Billable when approved by billing rules | Billable / Current Receivable if billable |
| `approved` | Owner-approved billable washout | Receivable created or recognized | Billable / Current Receivable |
| `completed` | Washout finished and accepted | Receivable created or recognized | Billable / Current Receivable |
| `rejected` | Explicitly rejected | No receivable | Rejected |
| `declined` | Declined by owner/system | No receivable | Rejected |
| `cancelled/canceled` | Cancelled before billing | No receivable | Rejected / Excluded from receivables |

## 6. Database Source of Truth

Current production Neon source of truth:

- `washout_activities` = operational activity history
- `washout_locations.rate` = owner-posted driver incentive / fallback source
- `payments.amount` = driver incentive / payout amount
- `payments.processing_fee` = platform fee
- `payments.washout_service_fee` = legacy compatibility field
- `wallet_transactions` = wallet ledger
- `driver_wallets` = driver wallet balance
- `owners.walletBalance` = owner wallet / funding balance
- `owner_billing_runs` or equivalent = historical billing runs

Production payments reporting and runtime billing must not rely on missing Neon columns:

- `driver_tip_cents`
- `owner_charge_amount_cents`
- `platform_revenue_cents`
- `payout_status`

## 7. Canonical Calculations

- **Driver Incentive** = `payments.amount`
- **Platform Fee** = `payments.processing_fee`
- **Owner Charge** = `payments.amount + payments.processing_fee`
- **Current Receivables** = approved billable owner charges not yet collected
- **Pending Review Potential Charges** = pending washouts × configured platform fee + resolved driver incentive
- **Wallet Balance** = wallet ledger balance, not activity earnings

## 8. Dashboard KPI Catalog

### Driver Dashboard

| KPI | Audience | Business Meaning | Source | Calculation | Includes | Excludes | Changes When |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Site Visits Today | Driver | Today’s operational stops | `dailyStats.visits` | Count of today’s activities | Today’s activity rows | Historical rows outside today | New check-ins or activity sync |
| Today Earnings | Driver | Today’s net activity-based earnings | `dailyStats.earnings` less rejected adjustments | Activity sum net of rejected washouts | Activity amounts for today | Non-activity payouts | Activity review status changes |
| Recent Billable Washouts | Driver | Billable washout activity in recent activity view | Recent activities filtered to billable statuses | Count of `verified`, `approved`, `completed` activities | Billable activities | Rejected / pending statuses | Recent activity refresh |
| 7-day Paid Washouts | Driver | Paid washout count from payment history | `weeklyStats.totalWashouts` or payment rows | Payment-row count in the selected period | Payment rows | Activities without payment rows | Payment creation or payout posting |
| Total Paid Net | Driver | Actual paid/payout history | Payment history endpoint | Sum of paid records | Payment records | Unpaid receivables | Stripe or wallet settlement |
| Wallet Balance | Driver | Available wallet balance | `wallet_transactions` / `driver_wallets` | Ledger balance | Posted wallet credits | Activity earnings not yet credited | Wallet transaction posting |

### Owner Dashboard

| KPI | Audience | Business Meaning | Source | Calculation | Includes | Excludes | Changes When |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Washouts | Owner | Billable washouts in the selected dashboard period | Billable washout activity slice | Count of billable activities | `verified`, `approved`, `completed` | Pending / rejected | Activity status changes |
| Pending Review | Owner | Operational washouts awaiting review | Pending approval activities | Count of pending washouts | Pending / awaiting approval statuses | Approved / rejected | Owner review actions |
| Potential Charges | Owner | Estimated charge exposure for pending review | Pending approval activities + pricing helper | Platform fee + resolved driver incentive | Pending washouts only | Current receivables | Pending activity updates |
| Current Receivables | Owner | Actual owner obligation not yet collected | Canonical receivables summary | Approved billable washouts total | Billable current receivables | Pending review / paid history | Approval and billing summary changes |
| Platform Fees | Owner | Platform portion of current receivables | Canonical receivables summary | Sum of platform fee cents | Platform fee cents | Driver incentive | Billing summary refresh |
| Driver Tips | Owner | Driver incentive portion of current receivables | Canonical receivables summary | Sum of driver incentive cents | Driver incentive cents | Platform fees | Billing summary refresh |
| Total Owner Charge | Owner | Full owner receivable amount | Canonical receivables summary | Platform fees + driver tips | Combined owner charge | Pending review / paid history | Billing summary refresh |
| Active Sites | Owner | Active owner locations | Owner locations | Count of active locations | Active locations | Inactive locations | Location lifecycle changes |
| Billable Washouts | Owner | Approved billable washout count | Canonical receivables summary / billable activity bucket | Count of billable washouts | Billable statuses | Pending / rejected | Approval state changes |
| Rejected Washouts | Owner | Washouts rejected from billing | Washout status bucket | Count of rejected washouts | Rejected / declined / cancelled | Billable / pending | Rejection status changes |

### Admin Dashboard

| KPI | Audience | Business Meaning | Source | Calculation | Includes | Excludes | Changes When |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Platform Fees | Admin | Platform revenue due or billed | Canonical billing summary | Sum of platform fee cents | Platform fee totals | Driver incentives | Billing summary refresh |
| Driver Incentives | Admin | Driver incentive liability/total | Canonical billing summary | Sum of driver incentive cents | Driver tip totals | Platform fees | Billing summary refresh |
| Total Owner Charge / Receivables | Admin | Full owner billing obligation | Canonical billing summary | Platform fees + driver incentives | Current owner charge totals | Paid history unless explicitly shown | Billing summary refresh |
| Paid Receivables | Admin | Collected totals | Payment and batch history | Sum of collected platform revenue | Paid records | Outstanding receivables | Payment settlement |
| Outstanding Receivables | Admin | Uncollected owner charges | Billing summary | Receivable total minus paid totals | Uncollected charges | Paid history | Collections or new approvals |
| Driver Payout Liability | Admin | Amount owed or scheduled to drivers | Payment/wallet ledger | Sum of unpaid driver incentives | Unpaid driver amounts | Paid records | Payout posting |
| Billing Preview | Admin | What a charge run would bill | Canonical preview summary | Same as receivable helper | Approved billable washouts | Historical paid rows | Preview inputs change |
| Billing History | Admin | Historical completed billing runs | Billing run history | Run records and outcomes | Completed runs | Current pending review | Billing run completion |

## 9. Reporting Rules

- Activity reports use `washout_activities`.
- Financial reports use `payments`.
- Wallet reports use `wallet_transactions`.
- Billing previews use the canonical receivables summary and approved washout calculation.
- Dashboards should not mix operational and financial sources in one KPI.

## 10. Data Lineage

Driver check-in  
→ `washout_activities`  
→ owner review  
→ billable status  
→ canonical billing receivables summary  
→ `payments`  
→ Stripe `PaymentIntent`  
→ Stripe transfer  
→ `wallet_transactions`  
→ `driver_wallets`  
→ reports/dashboards

## 11. Stripe and Wallet Architecture

- Owner charge lifecycle:
  - owner charge is created from approved receivables
  - Stripe collects the owner amount
  - platform fee and driver incentive are represented in the payment model
- Driver transfer lifecycle:
  - driver incentive may be transferred through Stripe Connect or credited to wallet ledger depending on the configured payout path
- Stripe Connect relationship:
  - Stripe is the external collection/transfer rail
  - it is not the system of record for dashboard calculations
- Wallet ledger relationship:
  - `wallet_transactions` is the authoritative wallet ledger
  - `driver_wallets` stores the driver’s wallet balance state
- Wallet balance is not the same as activity earnings because earnings can exist before posting or payout.
- Payment history is not the same as receivables because historical paid records and current receivables are different financial states.

## 12. Canonical Helper Modules

Current helper modules for financial logic:

- `shared/paymentAccounting.ts`
- `shared/locationBilling.ts`
- `server/ownerBillingReceivables.ts`
- owner billing ledger and reporting helpers

New financial work should extend these helpers rather than duplicate formulas.

## 13. Audit and Reconciliation Rules

- Repairs must be idempotent.
- Dry run must be supported for repair operations.
- No duplicate payment rows.
- No duplicate wallet transactions.
- Historical records should not be deleted.
- Bad rows should be repaired with audit logging.
- Old bad data must not be charged to Stripe until reviewed.

## 14. Architecture Decision Records

### ADR-001 — Financially Conservative Accounting

**Decision:** Receivables are created only after owner approval / billable status.

### ADR-002 — Operational and Financial Separation

**Decision:** Operational activity, payments, and wallet ledgers are separate systems of record.

### ADR-003 — Production Payment Schema Source of Truth

**Decision:** Use `payments.amount`, `payments.processing_fee`, and `payments.washout_service_fee` for current production accounting.

### ADR-004 — Canonical Billing Summary

**Decision:** Owner/admin billing displays must use canonical billing summaries rather than duplicate calculations.

### ADR-005 — Idempotent Reconciliation

**Decision:** Repair routines must be safe to run multiple times without duplicate payments or wallet credits.

## 15. Codex Engineering Rules

- Never calculate money directly in React components when a canonical API/helper exists.
- Never duplicate billing formulas.
- Never use missing Neon columns.
- Never mix activity stats with wallet balances.
- New financial KPIs must be added to this spec.
- Any financial schema change requires updating this document.
- Reconciliation endpoints must support dry run.
- Dashboard labels must match the source of truth.

## 16. Future Financial Expansion

This specification is intended to accommodate future expansion, including:

- material-specific pricing
- per-material driver incentives
- per-material owner fees
- capacity-aware pricing
- subscriptions
- failed payment fees
- delinquent account fees
- automated collections
- taxes
- enterprise billing
- multi-location organizations
- regional pricing
- monthly statements
- financial exports

## 17. Change Governance

Any change to financial calculations, dashboard KPIs, Stripe/payment logic, wallet logic, or billing reports must:

- update this spec first
- identify impacted dashboards, APIs, and reports
- include validation
- include migration or reconciliation guidance if applicable

This document is the governing source for financial behavior until superseded by a newer approved architecture document.
