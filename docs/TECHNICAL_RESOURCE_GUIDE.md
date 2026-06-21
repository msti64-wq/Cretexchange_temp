# CreteXchange Technical Resource Guide

## Purpose

This guide describes the current stabilized CreteXchange application as it exists in this repository: how it is built, how the major workflows fit together, how billing and lottery logic work, and what operators should watch in logs when something breaks.

For deployment and production ownership rules, see [docs/deployment.md](./deployment.md). For billing and dry-run details, see [docs/billing.md](./billing.md). For the owner wallet accounting model, see [docs/owner-wallet-accounting.md](./owner-wallet-accounting.md). For the design system rollout, see [docs/design-system.md](./design-system.md).

## System Architecture

CreteXchange is a TypeScript full-stack application with three main layers:

1. Frontend
   - React 18
   - Vite
   - Wouter for routing
   - TanStack Query for API state
   - Tailwind + component primitives in `client/src/components`

2. Backend
   - Express
   - JWT bearer-token auth
   - Route handlers in `server/routes.ts`
   - Production server bootstrap in `server/index.ts` and `server/production.ts`

3. Data and integrations
   - PostgreSQL via Drizzle ORM
   - Neon as the production Postgres provider
   - Stripe for owner billing and optional driver tip payout setup
   - Cloudflare R2 / S3-compatible object storage for photos
   - Mapbox for address geocoding and location resolution

The app shares schema and business rules across frontend and backend through files in `shared/`. That is where the current billing, photo verification, location access, and lottery eligibility rules live.

## Core Roles

The application uses four roles:

- `driver`
- `owner`
- `admin`
- `super_admin`

Role checks happen in the auth middleware and in route-level authorization logic. `super_admin` has the broadest access. Some admin screens are available to both `admin` and `super_admin`, while a few higher-risk workflows remain superadmin-only.

## Main Data Model

Key tables in `shared/schema.ts`:

- `users`
- `drivers`
- `owners`
- `washout_locations`
- `washout_activities`
- `washout_photos`
- `payments`
- `billing_batches`
- `driver_lottery_entries`
- `feature_flags`

Important fields and their current meaning:

- `owners.billingCadence`: `immediate`, `daily`, `weekly`, or `monthly`
- `owners.stripeCustomerId` / `owners.stripePaymentMethodId`: owner billing setup
- `washout_locations.rate`: per-location driver tip fallback, stored as dollars
- `washout_activities.feeCentsPlatform`: platform fee receivable for a washout, stored as cents
- `washout_activities.verifiedBy` / `verifiedAt`: who approved the washout and when
- `billing_batches`: the owner billing batch record
- `driver_lottery_entries`: automatic lottery tickets earned from eligible washouts

## Washout Status and Billing Eligibility

The code normalizes washout statuses in shared helpers so old text values and current enum values can coexist.

Current owner-billing eligibility uses:

- `verified`
- `completed`
- `approved` is handled as a legacy/display value in some paths, but live database queries should not depend on it

Non-billable statuses include:

- `declined`
- `rejected`
- `pending`
- `needs_review`
- `cancelled`
- `canceled`

Billing and dashboard summaries must use the shared helper rather than duplicating status filters in each query.

## Owner Billing and Platform Receivables

The current billing model separates three things:

1. Platform receivables
   - This is what the owner owes the platform for approved billable washouts.
   - Default platform fee is $5.00 per washout unless admin override data says otherwise.
   - Source of truth: `washout_activities.fee_cents_platform`

2. Driver incentive tips
   - Separate from platform revenue.
   - Stored per location in `washout_locations.rate`.
   - They should not be counted as platform revenue.

3. Billing state
   - Current receivables
   - Paid platform fees
   - Total platform fees for the selected period

The dashboard and the billing page now use the same shared server-side receivables summary so they stay aligned.

Dry-run owner washout billing uses the shared canonical ledger calculator in `shared/billingPolicy.ts` and reads driver tips from `washout_activities.amount`.

## Immediate Owner Billing

Immediate owner billing charges the owner’s saved Stripe payment method off-session.

Current behavior:

- Owner billing does not require Stripe Connect.
- Owner billing requires:
  - a Stripe customer ID
  - a saved payment method
- The app resolves those values from either the owner record or the legacy user record.
- Card-only PaymentIntents are used for owner billing.
- Driver payout readiness does not block owner billing.
- The owner is billed only for approved billable washouts.

If billing fails, the run is marked failed and the washouts are not marked paid.

## Stripe Data Paths

Owner billing and related summary views use the shared helper in `shared/ownerStripeBillingSetup.ts` to determine whether the owner is ready for billing.

The helper returns:

- whether a Stripe customer exists
- whether a payment method exists
- where each value came from (`owner` or `user`)
- a human-readable status label

That prevents the UI from showing “Missing customer identification” when the billing engine can actually run.

## Photo Verification and Fraud Prevention

Washout photos use several layers of validation:

- Photos must be stored in server-backed object storage.
- The system records upload metadata and uses that metadata in review.
- GPS coordinates from the photo are compared against the washout location.
- The helper in `shared/photoVerification.ts` classifies the result as:
  - `verified`
  - `warning`
  - `failed`
  - `needs_review`
- If GPS or location coordinates are missing, the result becomes `needs_review`.
- Duplicate-photo detection and freshness checks are also used to reduce fraud and accidental re-use.

Common photo-related log messages:

- `Photo upload provider selected: ...`
  - The backend selected the upload provider for a request.
- `Missing object storage env vars: ...`
  - Object storage is not configured correctly.
- `Failed to generate upload URL`
  - The upload URL endpoint failed.
- `Photo upload is missing its storage key. Please re-upload the photo.`
  - A stored photo record is incomplete.
- `Photo GPS is ... miles from the washout location.`
  - The photo location does not match the location closely enough.

## Lottery Logic

Lottery is active by default unless explicitly disabled by an admin flag or env override.

Behavior:

- Approved billable washouts automatically create lottery entries.
- Lottery entries are idempotent by activity.
- Drivers do not manually enter the lottery.
- Service type `rubble_dropoff` is excluded.

Relevant paths:

- `driver_lottery_entries`
- `server/lottery.ts`
- `server/routes.ts` lottery helpers

Common lottery messages:

- `🎰 Lottery entry created for washout ...`
- `🎰 Lottery entry already exists for washout ...`
- `🎰 Lottery skipped for washout ...: ineligible service type`
- `🎰 Lottery skipped for washout ...: lottery disabled`

## Routes and API Families

Main route families:

- Auth: `/api/login`, `/api/logout`, `/api/auth/*`
- Driver: `/api/drivers/*`
- Owner: `/api/owners/*`
- Photos: `/api/photos/*`
- Admin: `/api/admin/*`

High-value admin routes:

- `/api/admin/dashboard`
- `/api/admin/payments`
- `/api/admin/billing/settings`
- `/api/admin/billing/process-batches`
- `/api/admin/billing-audit-report`
- `/api/admin/lottery`
- `/api/admin/lottery/entries`
- `/api/admin/lottery/totals`
- `/api/admin/lottery/drawings`
- `/api/admin/lottery/drawings/pending`

## Deployment and Runtime

Production flow:

1. `npm run build`
2. Deploy the built app
3. Start with `npm run start`

The production server:

- logs startup environment
- verifies database availability
- serves static assets from the build output
- uses SPA fallback only for non-asset routes

Important production note:

- If the browser receives `text/html` for a JS module request, the catch-all/static routing is wrong or the asset file is missing from the build output.

## Environment Variables

Documented env vars used by the current system:

- `DATABASE_URL`
- `JWT_SECRET`
- `SESSION_SECRET`
- `PORT`
- `HOST`
- `NODE_ENV`
- `REPLIT_DEPLOYMENT`
- `REPLIT`
- `REPLIT_DOMAINS`
- `REPL_ID`
- `ISSUER_URL`
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

Do not store secrets or full connection strings in docs. Use variable names only.

## Scripts

Useful scripts from `package.json`:

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run check`
- `npm run test`
- `npm run db:push`
- `npm run db:migrate`
- `npm run repair:washout-ledger`
- `npm run verify:washout-billing-counts`
- `npm run create:superadmin`

## Common Logs and Meanings

### Auth

- `🔐 Auth check for METHOD /path`
  - A protected route is being checked.
- `✅ Auth success: role=...`
  - Authentication succeeded and the user role was loaded.
- `❌ Auth failed: Missing or invalid auth header`
  - The request did not include a bearer token.
- `❌ Auth failed: User not found`
  - The token was valid, but the user no longer exists.

### Database

- `Database query error (attempt x/y): ...`
  - The database retry wrapper hit a transient or permanent query failure.
- `[SYSTEM_STATS] washout revenue summary { ... }`
  - The admin revenue summary ran.
- `[ADMIN_DASHBOARD] response summary { ... }`
  - The admin dashboard response was assembled.
- `[ADMIN_DASHBOARD] billingReceivables query failed { ... }`
  - The receivables query failed; the dashboard may show a metric-specific fallback.
- `[ADMIN_PAYMENTS] query failed { ... }`
  - The admin payments query failed; the API should return a safe fallback instead of crashing.

### Billing

- `[OWNER_BILLING] Starting ... run for owner ...`
  - A scheduled or manual owner billing run began.
- `[OWNER_BILLING] Candidate approved washouts for owner ...`
  - The engine collected billable washouts for charge calculation.
- `[OWNER_BILLING] Stripe payment intent created for owner ...`
  - Stripe accepted the off-session charge request.
- `Missing customer identification`
  - The owner does not have a usable Stripe customer ID in either the owner or user record.
- `Card missing`
  - A Stripe customer exists, but no usable payment method exists.

### Storage

- `Missing object storage env vars: ...`
  - Photo storage is not configured correctly.
- `Photo upload provider selected: s3`
  - The system is using S3/R2-compatible object storage for uploads.

## Troubleshooting Checklist

1. If owner billing fails:
   - Check `owner.stripeCustomerId`, `owner.stripePaymentMethodId`, `user.stripeCustomerId`, and `user.stripePaymentMethodId`.
   - Confirm the owner has approved billable washouts.
   - Confirm Stripe is configured.

2. If lottery entries are missing:
   - Confirm `LOTTERY_ENABLED` or `ENABLE_LOTTERY` is not disabled.
   - Confirm the washout status is billable.
   - Confirm the service type is not `rubble_dropoff`.

3. If photos fail verification:
   - Check GPS coordinates, location coordinates, freshness, and storage metadata.
   - Confirm the photo was uploaded to server storage.

4. If dashboard metrics show zeros unexpectedly:
   - Check the route logs for query failures.
   - Verify the relevant query uses the shared summary helper.
   - Check whether the date window matches the data you expect.
