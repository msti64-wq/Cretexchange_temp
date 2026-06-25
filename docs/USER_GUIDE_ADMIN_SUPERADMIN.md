# CreteXchange Admin and Superadmin User Guide

## Scope

This guide covers the operational screens used by admin and superadmin accounts:

- dashboard
- users
- locations
- payments
- billing settings
- billing audit
- lottery
- feature flags
- reports

Some screens are available to both `admin` and `super_admin`. Higher-risk workflows and audit views may be superadmin-only.

## Admin Dashboard

The dashboard is now focused on the actual operational numbers:

- current platform receivables
- paid platform fees
- total platform fees for the selected period
- approved/billable washout count
- reward entry count
- driver tips as a separate number

The dashboard and billing page use the same server-side receivables summary, so the current receivables number should match.

### Revenue Labels

Use these labels carefully:

- **Current Platform Receivables** = approved billable washouts not yet paid
- **Paid Platform Fees** = successfully collected platform fees
- **Total Platform Fees** = receivables + paid for the selected period
- **7-Day Platform Revenue** = a windowed metric, not the same thing as total receivables

Do not label owner obligations as owner revenue.

## Billing Settings

The billing settings page shows:

- owner/company
- billing cadence
- immediate billing eligibility
- receivables
- paid platform fees
- billing history

See also:

- billing runbook: [docs/billing.md](./billing.md)
- deployment checklist: [docs/deployment.md](./deployment.md)

Current billing cadence options:

- immediate
- daily
- weekly
- monthly

Cadence controls when owner charges are scheduled or requested, but manual “Run Billing Now” works regardless of cadence.

### Immediate Billing Owners

This section is for owners who can be billed now. It shows:

- owner/company name
- billing cadence
- approved unbilled washout count
- platform fees owed
- card/payment method status
- last billing attempt
- last Stripe PaymentIntent / charge ID
- last billing status

The action you care about is:

- `Run Billing Now`

That action charges the owner’s saved payment method off-session for approved billable washouts only.

## Owner Billing Rules

Billing currently works like this:

- bill only approved/completed/verified billable washouts
- exclude declined/rejected/pending/needs_review/cancelled
- default platform fee is $5.00 per billable washout unless admin override data says otherwise
- driver tips are separate from platform revenue
- owner Stripe Connect is not required for owner billing
- driver Stripe onboarding is not required for owner billing

Owners are not currently charged recurring subscription fees. Billing cadence only controls when approved per-washout platform fees are requested or charged. CreteXchange may change fees in the future with advance notice and updated terms.

If a charge succeeds:

- the billing batch becomes paid/completed
- the payment intent and charge IDs are recorded
- the washouts are no longer counted as receivable

If a charge fails:

- the batch is marked failed
- the washouts stay unbilled
- the issue is surfaced in billing history and logs

## Payments Page

The admin payments page lists payment records and should stay online even if some optional fields are missing in production.

If a query fails, the route should return a safe empty set instead of crashing the whole app.

## Billing Audit Report

The audit report is for reconciliation and support:

- transaction / payment intent / charge IDs
- billing run IDs
- owner / driver / location
- washout counts
- platform fee totals
- driver tip totals
- billing status and dates

Use this report when a customer asks, “Why was I charged this amount?”

## Rewards Program Dashboard

The rewards program dashboard is for superadmin operational control of the rewards program:

- current drawing status
- reward entries
- totals
- pending prize drawings
- executed prize drawings

Reward entries are created automatically from eligible approved washouts, so the dashboard is primarily for oversight and drawing execution.

## Feature Flags

The feature flag page controls application features such as:

- rewards program enablement
- driver tip payout-related behavior

Feature flags are an operational safety tool. Use them to disable a problematic feature without redeploying code.

## Common Admin/Superadmin Messages

- `[ADMIN_DASHBOARD] response summary { ... }`
  - The dashboard finished assembling the response.

- `[ADMIN_DASHBOARD] weekStats query failed { ... }`
  - The weekly stats query failed.

- `[ADMIN_DASHBOARD] monthStats query failed { ... }`
  - The monthly stats query failed.

- `[ADMIN_DASHBOARD] billingReceivables query failed { ... }`
  - The receivables summary failed.

- `[ADMIN_BILLING] immediate billing owners summary { ... }`
  - The billing settings page summarized immediate billing owners.

- `[OWNER_BILLING] Starting admin_manual run for owner ...`
  - A manual owner billing run started.

- `❌ [OWNER_BILLING] Billing failed for owner ...`
  - The Stripe payment attempt failed or a setup issue blocked billing.

- `[SYSTEM_STATS] washout revenue summary { ... }`
  - The platform revenue query ran successfully.

- `🎰 Lottery entry created for washout ...`
  - A washout was converted into a reward entry.

## Admin Operating Procedures

### Approving Washouts

If a washout is pending review:

- verify the photos
- check GPS / location match
- approve or reject
- if approved, the washout should immediately move out of the pending queue

### Running Immediate Billing

1. Open Billing Settings.
2. Check the immediate billing owners list.
3. Review the platform fees owed and payment method status.
4. Run billing now.
5. Review the Stripe PaymentIntent / charge ID in history.

### Reconciling Billing

Use the billing audit report and the billing settings history to confirm:

- receivables
- paid platform fees
- Stripe transaction IDs
- any failed attempts

If the dashboard and billing page disagree, they should be using the same shared receivables summary. A mismatch usually means a query failure or a stale browser cache.

### Managing Rewards Program

Use the rewards program dashboard to:

- confirm entries are being created
- review current totals
- execute a monthly prize drawing
- notify winners

## Troubleshooting

- If the dashboard shows a fallback warning:
  - look for the failing subquery name in logs
  - check for a schema mismatch

- If the payment page 500s:
  - inspect `server/storage.ts` query projections
  - check for stale payment columns in production

- If the rewards program page hangs:
  - confirm the auth token is being sent
  - confirm the queries are not waiting on stale cached auth data
