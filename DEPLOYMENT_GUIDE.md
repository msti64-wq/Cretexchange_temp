# CreteXchange - Deployment Guide

## Table of Contents
- [Overview](#overview)
- [Quick Start - Mobile Testing](#quick-start---mobile-testing)
- [Environment Setup](#environment-setup)
- [API Integration Setup](#api-integration-setup)
- [Production Deployment Checklist](#production-deployment-checklist)
- [Replit Deployment](#replit-deployment)
- [Security & Compliance](#security--compliance)
- [Troubleshooting](#troubleshooting)

---

## Overview

CreteXchange is a Progressive Web App (PWA) connecting concrete truck drivers with verified washout locations. The platform includes:

- **User Types**: Drivers, Location Owners, Super Admins
- **Core Features**: Washout location discovery, payment processing, wallet management, debit card issuance
- **Tech Stack**: React + TypeScript, Express.js, PostgreSQL, Stripe
- **Deployment**: Replit Autoscale (recommended) or Reserved VM

---

## Quick Start - Mobile Testing

### Testing on Your Mobile Device

1. **Access Dev URL**:
   - Find your Replit dev URL (format: `https://<repl-name>-<username>.replit.dev`)
   - Open this URL on your mobile device's browser

2. **Use QR Code** (Easiest):
   - In Replit workspace, click the URL dropdown
   - Scan the QR code with your mobile device
   - Opens directly in your mobile browser

3. **Install as PWA**:
   - Open dev URL in mobile browser (Safari/Chrome)
   - Tap "Share" → "Add to Home Screen"
   - App installs like a native app with icon
   - Works offline with cached data

4. **Test Key Flows**:
   - Driver registration and onboarding
   - Location discovery and check-in
   - Wallet funding and transactions
   - Debit card request

---

## Environment Setup

### Required Environment Variables

#### Core Application
```bash
# Database
DATABASE_URL=<provided by Replit/Neon>

# Node Environment
NODE_ENV=production
PORT=5000
# Railway/Render/Replit: HOST=0.0.0.0
# Local-only testing: HOST=127.0.0.1
HOST=0.0.0.0

# Auth Secrets
JWT_SECRET=<generate secure random string, at least 32 characters>
SESSION_SECRET=<generate secure random string>
```

#### Authentication
```bash
# Replit OIDC (auto-configured on Replit)
# No manual setup required when deployed on Replit
```

#### One-Time Super Admin Creation

These values are used only when running the maintenance script. Do not add them as public client variables and do not commit real values.

```bash
DATABASE_URL=<production-database-url>
SUPERADMIN_EMAIL=<admin@example.com>
SUPERADMIN_PASSWORD=<long-random-password>
```

#### Payment & Banking APIs

**Stripe** (Payments, wallet flows, and card issuing)
```bash
STRIPE_SECRET_KEY=<your Stripe secret key>
VITE_STRIPE_PUBLIC_KEY=<your Stripe publishable key>
STRIPE_WEBHOOK_SECRET=<your Stripe webhook signing secret>
STRIPE_PLATFORM_FINANCIAL_ACCOUNT_ID=<your Stripe platform financial account ID>
```

#### Cloud Services

**Google Cloud Storage** (Photo Uploads)
```bash
GOOGLE_CLOUD_PROJECT_ID=<your GCP project ID>
GOOGLE_CLOUD_BUCKET_NAME=<your GCS bucket name>
DEFAULT_OBJECT_STORAGE_BUCKET_ID=<your object storage bucket name>
PRIVATE_OBJECT_DIR=/<bucket-name>/private
PUBLIC_OBJECT_SEARCH_PATHS=/<bucket-name>/public,/<bucket-name>/uploads
# Service account credentials (JSON) via Replit Secrets
```

**Mapbox** (Location Search)
```bash
VITE_MAPBOX_TOKEN=<your Mapbox access token>
```

---

## API Integration Setup

### 1. Stripe Setup

**Purpose**: Subscription payments, owner membership fees, wallet flows, and card issuing

**Setup Steps**:
1. Create Stripe account at [stripe.com](https://stripe.com)
2. Get API keys from dashboard (test and live)
3. Configure webhook endpoint: `https://<your-domain>/api/stripe/webhook`
4. Add webhook events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

**Required Secrets**:
```bash
STRIPE_SECRET_KEY=sk_live_...  # or sk_test_... for testing
VITE_STRIPE_PUBLIC_KEY=pk_live_...  # or pk_test_... for testing
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PLATFORM_FINANCIAL_ACCOUNT_ID=fa_...
```

---

### 2. Google Cloud Setup

#### Google Cloud Storage (Photo Uploads)

**Setup Steps**:
1. Create GCP project
2. Enable Cloud Storage API
3. Create storage bucket
4. Create service account with Storage Admin role
5. Download service account JSON key
6. Add JSON key to Replit Secrets as `GOOGLE_APPLICATION_CREDENTIALS`

**Required Secrets**:
```bash
GOOGLE_CLOUD_PROJECT_ID=<project-id>
GOOGLE_CLOUD_BUCKET_NAME=<bucket-name>
GOOGLE_APPLICATION_CREDENTIALS=<service-account-json>
DEFAULT_OBJECT_STORAGE_BUCKET_ID=<bucket-name>
PRIVATE_OBJECT_DIR=/<bucket-name>/private
PUBLIC_OBJECT_SEARCH_PATHS=/<bucket-name>/public,/<bucket-name>/uploads
```

#### Mapbox (Location Search)

**Setup Steps**:
1. Create a Mapbox account
2. Generate a public access token for client-side address search
3. Verify the token can call the Geocoding API for your allowed domains
4. Add the token to environment secrets as `VITE_MAPBOX_TOKEN`

**Required Secret**:
```bash
VITE_MAPBOX_TOKEN=<mapbox-token>
```

---

## Production Deployment Checklist

### Pre-Deployment

- [ ] **Database Migrations**
  - Run `npm run db:migrate` to sync schema
  - Verify all tables created successfully
  - Test database connectivity
  - Create the initial super admin with `npm run create:superadmin`

- [ ] **Environment Variables**
  - All required secrets configured in Replit Secrets
  - Production API keys (not test/sandbox)
  - Verify no hardcoded credentials in code

- [ ] **API Integrations**
  - Stripe: Test subscription payments, wallet flows, and card issuing
  - Mapbox: Verify location search and geocoding
  - GCS: Test photo uploads

- [ ] **Security Audit**
  - No PII in logs (names, SSN, email, phone, addresses)
  - No sensitive tokens in logs (API keys, account tokens)
  - Error messages sanitized (no data leakage)
  - HTTPS enforced (Replit handles this)
  - Session security configured

- [ ] **Testing**
  - Mobile responsive design verified
  - PWA installation tested on iOS and Android
  - Core user flows tested end-to-end
  - Payment flows verified (test mode)
  - Error handling tested

### Deployment Secrets Checklist

- [ ] `DATABASE_URL` points at the production PostgreSQL database.
- [ ] `JWT_SECRET` and `SESSION_SECRET` are separate high-entropy values; `JWT_SECRET` is at least 32 characters.
- [ ] Stripe has `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLIC_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PLATFORM_FINANCIAL_ACCOUNT_ID` configured for the same Stripe mode.
- [ ] `system_settings.platform_washout_fee` is set to `5.00` in production if the database was seeded with an older value.
- [ ] Object storage has `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`, and `DEFAULT_OBJECT_STORAGE_BUCKET_ID` configured for the deployment bucket.
- [ ] Google Cloud Storage has `GOOGLE_CLOUD_PROJECT_ID` and `GOOGLE_CLOUD_BUCKET_NAME` configured.
- [ ] Mapbox has `VITE_MAPBOX_TOKEN` configured for location search.
- [ ] No placeholder, test-only, or local development values remain in deployment secrets.

---

## Replit Deployment

### Deployment Options

**Recommended: Autoscale Deployment**
- Best for variable traffic
- Scales automatically based on demand
- Cost-effective for production
- Automatic SSL/TLS certificates
- Built-in health checks

**Alternative: Reserved VM**
- Consistent resources
- Always-on service
- Good for predictable workloads
- Higher cost but guaranteed performance

### Deployment Steps

1. **Prepare for Deployment**
   ```bash
   # Ensure all tests pass
   npm test
   
   # Verify build succeeds
   npm run build
   ```

2. **Configure Production Environment**
   - Go to Replit Secrets
   - Add all production environment variables
   - Verify `NODE_ENV=production`
   - Set `HOST=0.0.0.0` for Railway, Render, Replit, and other cloud/container deployments

3. **Deploy Application**
   - Click "Deploy" button in Replit workspace
   - Choose deployment type (Autoscale recommended)
   - Configure custom domain (optional)
   - Review settings and confirm
   - **Wait for deployment to complete** (production database will be created automatically)

4. **Run Database Migrations** ⚠️ CRITICAL STEP
   
   After deployment completes, the production database is created but empty. You must run migrations:
   
   **Option A: Using Replit Shell (Recommended)**
   ```bash
   # In your Replit workspace, open the Shell
   # Temporarily set production database URL
   export DATABASE_URL="<your-production-database-url>"
   
   # Run migrations
   npm run db:migrate
   
   # Confirm schema creation
   # You should see: "✓ Everything is up to date"
   ```
   
   **Option B: Using Production DATABASE_URL from Secrets**
   ```bash
   # Find production DATABASE_URL:
   # 1. Go to your deployment page
   # 2. Click "Environment" or "Secrets"
   # 3. Copy the production DATABASE_URL value
   
   # Then run:
   DATABASE_URL="<production-url>" npm run db:migrate
   ```
   
   **Important Notes**:
   - Production DATABASE_URL is different from development
   - This step creates all tables, indexes, and constraints
   - Run this immediately after first deployment
   - Safe to run multiple times (idempotent)

5. **Create or Update the Super Admin**

   Use the one-time maintenance script after migrations. This does not enable any public `/setup` route.

   ```bash
   export DATABASE_URL="<production-database-url>"
   export SUPERADMIN_EMAIL="<admin@example.com>"
   export SUPERADMIN_PASSWORD="<long-random-password>"

   npm run create:superadmin
   ```

   The script hashes the password with the same bcrypt settings used by the app, creates the user if missing, or updates the matching email to `super_admin` with `isActive=true`. It does not print the password.

6. **Post-Deployment**
   - Verify deployment health at `https://<app-name>.replit.app`
   - Confirm database tables created (check logs for "✓ Everything is up to date")
   - Test on mobile devices
   - Monitor logs for errors
   - Set up monitoring/alerting

### Custom Domain Setup

1. **Purchase Domain** (optional)
2. **Configure DNS**:
   - Add CNAME record pointing to Replit
   - Replit handles SSL/TLS automatically
3. **Add to Replit**:
   - Go to deployment settings
   - Add custom domain
   - Wait for DNS propagation (5-60 minutes)

### Monitoring & Maintenance

**Built-in Replit Features**:
- Deployment logs (real-time)
- Performance metrics
- Error tracking
- Resource usage monitoring

**Recommended External Tools**:
- Sentry: Error tracking and monitoring
- LogRocket: Session replay and debugging
- UptimeRobot: Uptime monitoring and alerts

---

## Security & Compliance

### Data Protection

**PII Handling**:
- ✅ All PII redacted from logs (SSN, email, phone, addresses)
- ✅ Sensitive tokens never logged (API keys, account tokens)
- ✅ Error messages sanitized to prevent data leakage
- ✅ HTTPS enforced for all communications

**Data Storage**:
- Database: PostgreSQL with encryption at rest (Neon)
- Files: Google Cloud Storage with access control
- Sessions: Encrypted session cookies
- Passwords: Never stored (using Replit OIDC)

### Compliance

**PCI-DSS** (Payment Card Industry):
- ✅ No card numbers stored in database
- ✅ Stripe handles card data securely
- ✅ Tokenization used for sensitive data
- ✅ HTTPS enforced for all transactions

**GDPR** (Data Privacy):
- ✅ User data minimization
- ✅ Right to deletion implemented
- ✅ Data export capabilities
- ✅ Privacy policy required (add to app)

**Banking Regulations**:
- Stripe handles configured payment, Treasury, and card issuing compliance workflows
- Platform acts as facilitator, not bank

### Security Best Practices

**API Keys**:
- Store in Replit Secrets (never in code)
- Rotate regularly (every 90 days)
- Use separate keys for dev/staging/production
- Revoke immediately if compromised

**Authentication**:
- Replit OIDC handles auth securely
- Session timeout: 24 hours
- Role-based access control (RBAC)
- No password storage

**Rate Limiting**:
- API endpoints protected from abuse
- Payment operations throttled
- File uploads size-limited
- Geographic restrictions (if needed)

---

## Troubleshooting

### Common Issues

#### 0. Database Migration Failed / Copy Development to Production Failed

**Symptom**: Cannot publish because "copy development database to production" fails

**Cause**: Replit's database copy feature is still in development (beta limitation)

**Solution**:
This is expected behavior. Follow this workaround:

1. **Let Replit create a fresh production database**:
   - Proceed with deployment normally
   - Production database will be created automatically (but empty)

2. **Run migrations after deployment**:
   ```bash
   # In Replit Shell:
   export DATABASE_URL="<production-database-url>"
   npm run db:migrate
   ```

3. **Verify schema creation**:
   - Look for "✓ Everything is up to date" message
   - Check production app - database tables should now exist

4. **Alternative: Use Drizzle Studio**:
   - Open Database pane in Replit
   - Switch to Production database
   - Run migrations using Drizzle Studio UI

**Prevention**: Always run `npm run db:migrate` immediately after first deployment to any new environment.

#### 1. Stripe Webhook Failures

**Symptom**: Payments succeed but not reflected in app

**Cause**: Webhook endpoint not configured or signature mismatch

**Solution**:
```bash
# Verify webhook URL in Stripe dashboard
# Check STRIPE_WEBHOOK_SECRET is correct
# Review logs for webhook errors
# Test with Stripe CLI: stripe listen --forward-to localhost:5000/api/stripe/webhook
```

#### 2. Mobile App Not Installing (PWA)

**Symptom**: "Add to Home Screen" not appearing

**Cause**: PWA requirements not met

**Solution**:
- Ensure HTTPS (Replit provides automatically)
- Verify manifest.json served correctly
- Check service worker registration
- Test on supported browsers (Safari/Chrome)

#### 3. Mapbox Location Search Not Working

**Symptom**: Map shows gray screen or errors

**Cause**: Token missing, restricted, or geocoding request rejected

**Solution**:
```bash
# Verify VITE_MAPBOX_TOKEN is set
# Check token restrictions and allowed origins
# Confirm the token can call the Geocoding API
```

### Debug Mode

Enable verbose logging for troubleshooting:

```bash
# Add to environment
DEBUG=true
LOG_LEVEL=debug

# Restart application
# Check logs for detailed output
```

### Getting Help

**Replit Support**:
- Community Forum: [ask.replit.com](https://ask.replit.com)
- Discord: [replit.com/discord](https://replit.com/discord)
- Docs: [docs.replit.com](https://docs.replit.com)

**API Support**:
- Stripe: https://support.stripe.com
- Google Cloud: https://cloud.google.com/support

---

## Appendix

### Environment Variables Reference

Complete list of all environment variables:

```bash
# Core
NODE_ENV=production
PORT=5000
# Railway/Render/Replit: HOST=0.0.0.0
# Local-only testing: HOST=127.0.0.1
HOST=0.0.0.0
DATABASE_URL=<auto-provided>
BASE_URL=<production-app-url>
JWT_SECRET=<secure-random-string-at-least-32-characters>
SESSION_SECRET=<secure-random-string>

# Stripe
STRIPE_SECRET_KEY=<stripe-secret-key>
VITE_STRIPE_PUBLIC_KEY=<stripe-public-key>
STRIPE_WEBHOOK_SECRET=<webhook-secret>
STRIPE_PLATFORM_FINANCIAL_ACCOUNT_ID=<stripe-platform-financial-account-id>

# Object Storage and Google Cloud
GOOGLE_CLOUD_PROJECT_ID=<gcp-project-id>
GOOGLE_CLOUD_BUCKET_NAME=<bucket-name>
GOOGLE_APPLICATION_CREDENTIALS=<service-account-json>
DEFAULT_OBJECT_STORAGE_BUCKET_ID=<bucket-name>
PRIVATE_OBJECT_DIR=/<bucket-name>/private
PUBLIC_OBJECT_SEARCH_PATHS=/<bucket-name>/public,/<bucket-name>/uploads
VITE_MAPBOX_TOKEN=<mapbox-token>
```

### Testing Credentials

**Test Users** (Development):
```
Driver: TD002 / password: test123
Owner: TO001 / password: test123
Admin: admin@cretexchange.com / password: test123
```

**Test Cards** (Stripe):
```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
3D Secure: 4000 0025 0000 3155
Expiry: Any future date
CVC: Any 3 digits
```

---

## Release Notes

### Version 1.0.0 - Production Ready

**Features**:
- ✅ Driver registration and authentication
- ✅ Location discovery and check-in
- ✅ Wallet management
- ✅ Payment processing (Stripe)
- ✅ Debit card requests
- ✅ Progressive Web App (PWA)
- ✅ Mobile-responsive design
- ✅ Security compliance (PCI-DSS, GDPR)

**Known Limitations**:
- Batch processing requires external cron service

**Upcoming Features**:
- Push notifications for transactions
- Advanced fraud detection
- Multi-language support
- Owner dashboard analytics

---

## Contact & Support

**Development Team**:
- Technical Support: support@cretexchange.com
- Bug Reports: https://github.com/cretexchange/issues

**Business Inquiries**:
- Sales: sales@cretexchange.com
- Partnerships: partners@cretexchange.com

---

**Last Updated**: October 11, 2025
**Document Version**: 1.0.0
**Application Version**: 1.0.0
