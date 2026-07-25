# CreteXchange Operations Runbook

## Purpose

This runbook is for day-to-day operations, incident triage, and safe maintenance of the current CreteXchange application.

## Deployment Model

The app is designed to run on Railway with:

- a built frontend bundle
- an Express production server
- Neon Postgres
- Stripe for billing
- object storage for photos

Production startup path:

1. Build the app
2. Start `dist/index.js`
3. Serve static assets
4. Route API calls through Express

Production source of truth:

- production repo: `msti64-wq/Cretexchange_temp`
- production branch: `main`
- deployment checklist: [docs/deployment.md](./deployment.md)

If the browser gets HTML instead of JavaScript for a module request, check the build artifacts and static routing before investigating the client app.

## Environment Checklist

Use environment variables only. Do not store secrets in docs or code comments.

Required / commonly used env vars:

- `DATABASE_URL`
- `JWT_SECRET`
- `SESSION_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `VITE_STRIPE_PUBLIC_KEY`
- `VITE_MAPBOX_TOKEN`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET`
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID`
- `PUBLIC_OBJECT_SEARCH_PATHS`
- `PRIVATE_OBJECT_DIR`
- `GOOGLE_CLOUD_BUCKET_NAME`
- `GOOGLE_CLOUD_PROJECT_ID`
- `GOOGLE_APPLICATION_CREDENTIALS`
- `LOTTERY_ENABLED`
- `ENABLE_LOTTERY`
- `PORT`
- `HOST`
- `REPLIT_DEPLOYMENT`
- `REPLIT`

### Object Storage Path Convention

Photo uploads use the configured S3-compatible bucket; they do not use a Railway Volume. Every deployed environment that enables photo upload MUST set `PRIVATE_OBJECT_DIR` to `/<S3_BUCKET>/private` (for example, when `S3_BUCKET` is `example-bucket`, use `/example-bucket/private`). The application stores uploaded photos beneath `private/photos/` and creates object keys during upload; no mounted directory, startup directory creation, or filesystem permission configuration is required. Railway must provide the variable to the application service.

## Build and Test Commands

- `npm run check`
  - TypeScript check

- `npm run build`
  - Frontend and backend production build

- `npm run test`
  - Full test suite with test JWT/session secrets

- `npm run start`
  - Production server

- `npm run dev`
  - Development server with Vite

## Database and Migration Notes

Neon is the production database.

Use:

- `npm run db:migrate`
  - safe schema migration helper
  - used for the photo schema cleanup path

- `npm run db:push`
  - development-oriented schema push

Repair/verification scripts:

- `npm run repair:washout-ledger`
  - backfills washout fee data and missing lottery entries

- `npm run verify:washout-billing-counts`
  - read-only billing verification report

If production metrics look wrong after a migration:

- check the schema in `shared/schema.ts`
- compare the live query shape to the migration
- look for enum mismatches or missing columns in logs

Billing and accounting references:

- dry-run and live billing: [docs/billing.md](./billing.md)
- owner wallet accounting: [docs/owner-wallet-accounting.md](./owner-wallet-accounting.md)

## Stripe Operations

Owner billing:

- bills the owner’s saved Stripe customer/payment method off-session
- does not require Stripe Connect for the owner
- does not require driver payout readiness
- owner billing cadence controls per-washout platform fee timing; it is not a recurring subscription fee
- owners are not currently charged recurring subscription fees, but fee schedules may change in the future with advance notice and updated terms

Driver tip payouts:

- optional and separate from owner billing
- only relevant when the feature is enabled

Billing preview and ledger notes:

- canonical ledger: `shared/billingPolicy.ts`
- dry-run preview endpoint: `POST /api/admin/billing/preview-owner-washout-charge`
- driver tip source: `washout_activities.amount`

If Stripe is unavailable:

- owner billing should fail cleanly
- washouts should not be marked paid

If the owner is missing Stripe customer/payment method setup:

- the admin UI should show the missing field
- billing should not pretend the owner is ready

## Object Storage / R2 Notes

Photos must be stored in server-backed object storage.

Checklist:

- confirm the object storage env vars are present
- confirm the selected provider is correct
- confirm the bucket exists and is writable
- confirm browser requests are not blocked by CORS when using S3/R2

Common storage messages:

- `Missing object storage env vars: ...`
  - one or more required env vars are missing

- `Photo upload provider selected: s3`
  - the upload flow is using the S3-compatible path

- `Failed to generate upload URL`
  - the upload URL endpoint or storage client failed

If the client receives a broken photo URL, check the upload provider and ACL metadata first.

## Incident Triage

### 1) Admin dashboard shows fallback data

What to check:

- `server/storage.ts` summary queries
- `washout_activities.fee_cents_platform`
- `driver_lottery_entries`
- logs beginning with:
  - `[SYSTEM_STATS] washout revenue summary`
  - `[ADMIN_DASHBOARD] ... query failed`

What to do:

- identify the failing subquery name
- fix the schema mismatch
- verify the dashboard and billing page use the same shared receivables helper

### 2) Admin payments endpoint returns 500

What to check:

- the explicit projection in the payment query
- stale legacy fields in production such as old payment-tip or payout columns

What to do:

- return a safe empty array for the API if needed
- remove the stale field from the live query

### 3) Owner billing fails

What to check:

- owner Stripe customer ID
- owner payment method ID
- legacy user-level Stripe fields
- amount calculation
- batch metadata and idempotency key

Common logs:

- `Missing customer identification`
- `Card missing`
- `Stripe unavailable`
- `Billing failed for owner ...`

What to do:

- confirm the owner has a Stripe customer and payment method
- confirm the billing run only includes approved billable washouts
- retry with a clean idempotency key when the amount or washout set changes

### 4) Lottery data is missing

What to check:

- `LOTTERY_ENABLED` or `ENABLE_LOTTERY`
- whether the washout is billable
- whether the service type is eligible
- whether a previous entry already exists

Common logs:

- `🎰 Lottery entry created for washout ...`
- `🎰 Lottery entry already exists for washout ...`
- `🎰 Lottery skipped for washout ...`

### 5) Photo approval fails

What to check:

- approved washout status
- location ownership
- `verifiedBy` and `verifiedAt`
- photo verification status

Common logs:

- `Failed to approve washout`
- `Failed to verify activity`
- `Photo GPS is ... miles from the washout location.`

## Logging Reference

### Auth

- `🔐 Auth check for METHOD /path`
  - request hit protected auth middleware

- `✅ Auth success: role=...`
  - auth succeeded and the request role was loaded

- `❌ Auth failed: Missing or invalid auth header`
  - no bearer token or malformed header

### Billing

- `[OWNER_BILLING] Starting admin_manual run for owner ...`
  - immediate/manual owner billing began

- `[OWNER_BILLING] Candidate approved washouts for owner ...`
  - the engine selected billable washouts

- `[ADMIN_BILLING] immediate billing owners summary { ... }`
  - admin billing settings page summary rendered

### Revenue

- `[SYSTEM_STATS] washout revenue summary { ... }`
  - revenue summary query completed

### Object storage

- `Missing object storage env vars: ...`
  - missing R2/S3/GCS config

- `Photo upload provider selected: ...`
  - upload provider selection was made

## Safe Recovery Practices

- Do not edit production data directly unless you first understand the billing or photo side effects.
- Prefer the repair scripts for backfills and reconciliation.
- If you must re-run a billing flow, confirm the previous billing batch status and the idempotency key inputs first.
- If a query fails because of a schema mismatch, fix the query against the live schema instead of masking the error everywhere.
