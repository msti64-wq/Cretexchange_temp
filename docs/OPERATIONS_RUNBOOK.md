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

### Controlled Production Migration Procedure

Migrations `0036` through `0038` were completed and catalog-verified as a governed production release operation. They are not a recurring Railway pre-deploy requirement for ordinary application or documentation deployments.

The production runner remains separate from the staging-only runner and fails closed unless `MIGRATION_TARGET=production`, `RAILWAY_ENVIRONMENT_NAME=production`, and `PRODUCTION_MIGRATION_AUTHORIZATION` all match the immutable `RAILWAY_GIT_COMMIT_SHA`. It validates committed SQL SHA-256 values, holds a PostgreSQL advisory lock, determines pending versus already-applied migrations from the PostgreSQL catalog, and stops on partial catalog state. Each migration is transactional, additive, and catalog-verified before the deployment may continue.

Any future production migration requires a separately authorized, release-specific controlled invocation. Do not reuse the completed `0036` through `0038` operation as an ordinary deployment hook. Record the approval, selected migration allowlist, checksum verification, execution result, catalog verification, and recovery posture in the production release record. Recovery is by the approved pre-migration Neon snapshot or point-in-time restore; do not rerun a partially applied migration or perform manual SQL repair.

### One-Time Terms Ledger Adoption Procedure

Migration `0013_add_localized_terms_acceptance.sql` is immutable and must be adopted only through `npm run db:migrate:terms-ledger:controlled`. The runner permits only `0013`, verifies SHA-256 `21c04112cae0901781c0dfb572c3de88e4e8a3ff1bf09bdaeae6633d191dc22f`, requires an explicit Railway target and immutable deployed SHA, takes its own advisory lock, and stops on any partial catalog state. Its shared structural verifier checks the exact tables, 12 named columns per table, PostgreSQL types, nullability, governed defaults, primary-key columns, unique/index definitions and order, and the cascading `terms_acceptances.user_id → users.id` foreign key. It performs no acceptance backfill or other record mutation. Health uses the same bounded verifier and fails closed when the catalog is absent, partial, incompatible, or inaccessible.

For Production, set `TERMS_LEDGER_MIGRATION_AUTHORIZATION` only to the approved immutable deployment SHA and invoke the runner through a temporary, environment-specific pre-deploy binding. Record the CTX-OPS-001 evidence, validate the catalog and terms health, then remove that binding and prove an ordinary deployment does not invoke it. Do not add a recurring binding to `railway.json`.

## Build and Test Commands

- `npm run check`
  - TypeScript check

- `npm run build`
  - Frontend and backend production build

## Controlled Staging Admin Bootstrap

The general `create:superadmin` utility is not a release-validation provisioning path because it is not environment-scoped. For a controlled staging acceptance account, use `npm run bootstrap:staging-admin` only from a Railway staging pre-deploy job or service shell after all of these non-secret controls are present: `ADMIN_BOOTSTRAP_TARGET=staging`, `RAILWAY_ENVIRONMENT_NAME=staging`, `STAGING_ADMIN_BOOTSTRAP_CONFIRM=bootstrap-staging-admin`, `STAGING_ADMIN_EMAIL`, and `STAGING_ADMIN_BOOTSTRAP_OPERATOR`. A new account additionally requires a password supplied through the staging secret store as `STAGING_ADMIN_PASSWORD`; it is never logged. The runner refuses every target other than Railway `staging`, creates only an ordinary `admin` account, never repurposes a Driver or Owner, is idempotent for an existing Admin or Super Admin, and writes a sanitized `staging_admin_bootstrap` audit event. Remove the temporary password variable and restore the normal governed migration pre-deploy command after successful provisioning.

For release acceptance that requires separated Driver, Facility Owner, Admin, and Super Admin identities, use `npm run bootstrap:staging-pilot-acceptance` only inside the Railway `staging` service. It requires `PILOT_ACCEPTANCE_TARGET=staging`, `RAILWAY_ENVIRONMENT_NAME=staging`, `PILOT_ACCEPTANCE_CONFIRM=prepare-staging-pilot-acceptance`, `STAGING_PILOT_ACCEPTANCE_NAMESPACE`, `STAGING_PILOT_ACCEPTANCE_PASSWORD`, and `STAGING_PILOT_ACCEPTANCE_OPERATOR`. The password must be supplied through the staging secret store, is never logged, and must not be committed. The runner creates only namespaced `.invalid` identities, refuses production or ambiguous environments, is idempotent, refuses role/identity conflicts, creates only the normal Driver and Owner profiles required by those roles, and appends sanitized staging acceptance audit evidence. It does not create facilities, activities, photos, review decisions, financial records, or an authorization bypass.

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
