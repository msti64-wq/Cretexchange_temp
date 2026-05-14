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
- **Tech Stack**: React + TypeScript, Express.js, PostgreSQL, Column BaaS, Lithic Cards, Stripe
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
   - Debit card request (sandbox mode)

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

# Auth Secrets
JWT_SECRET=<generate secure random string, at least 32 characters>
SESSION_SECRET=<generate secure random string>
```

#### Authentication
```bash
# Replit OIDC (auto-configured on Replit)
# No manual setup required when deployed on Replit
```

#### Payment & Banking APIs

**Column BaaS** (Wallet & Bank Accounts)
```bash
COLUMN_API_KEY=<your Column API key>
COLUMN_API_BASE_URL=https://api.column.com
COLUMN_PLATFORM_ENTITY_ID=<your platform entity ID>
COLUMN_PLATFORM_ACCOUNT_ID=<your platform account ID>
COLUMN_PLATFORM_ACCOUNT_NUMBER=<your platform account number>
COLUMN_PLATFORM_ROUTING=<your platform routing number>
```

**Lithic** (Debit Cards)
```bash
# Sandbox (for testing)
LITHIC_API_KEY=<your Lithic sandbox API key>
LITHIC_BASE_URL=https://sandbox.lithic.com/v1

# Production (after BIN sponsorship)
LITHIC_API_KEY=<your Lithic production API key>
LITHIC_BASE_URL=https://api.lithic.com/v1
LITHIC_CARD_PROGRAM_TOKEN=<token from Lithic after Column BIN approval>
LITHIC_PRODUCT_ID=<product ID for physical cards>
```

**Stripe** (Subscription Payments)
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

**Google Maps API** (Location Services)
```bash
VITE_GOOGLE_MAPS_API_KEY=<your Google Maps API key>
```

---

## API Integration Setup

### 1. Column BaaS Setup

**Purpose**: Wallet management, bank accounts, book transfers

**Setup Steps**:
1. Sign up at [column.com](https://column.com)
2. Complete KYC/business verification
3. Create platform entity and account
4. Get API credentials from dashboard
5. Configure webhooks for transaction events

**Production Endpoint**: `https://api.column.com`

**Required Secrets**:
- `COLUMN_API_KEY`
- `COLUMN_PLATFORM_ENTITY_ID`
- `COLUMN_PLATFORM_ACCOUNT_ID`
- `COLUMN_PLATFORM_ACCOUNT_NUMBER`
- `COLUMN_PLATFORM_ROUTING`

**Testing**: Use Column's test environment credentials for development

---

### 2. Lithic Card Issuance Setup

**Purpose**: Debit card creation for instant wallet fund access

#### Sandbox Setup (Current)
```bash
LITHIC_API_KEY=<sandbox API key>
LITHIC_BASE_URL=https://sandbox.lithic.com/v1
```

**Capabilities**:
- ✅ Virtual card creation
- ✅ UI/UX testing
- ✅ Card request workflows
- ❌ No real fund access (sandbox limitation)

#### Production Setup (For Live Deployment)

**Prerequisites**:
1. **Column BIN Sponsorship** (90-120 day process)
   - Contact: sales@column.com
   - Provide: Program details (debit cards for drivers, washout payments use case)
   - Complete: Compliance review and documentation

2. **Lithic Configuration**
   - Column provides dedicated BIN
   - Share BIN details with Lithic
   - Receive `card_program_token` from Lithic

3. **Physical Card Inventory**
   - Contact Lithic sales for card design
   - Order minimum quantity (500-1,000 cards)
   - Receive `product_id` after order

**Production Environment Variables**:
```bash
LITHIC_API_KEY=<production API key from Lithic>
LITHIC_BASE_URL=https://api.lithic.com/v1
LITHIC_CARD_PROGRAM_TOKEN=<token linking to Column BIN>
LITHIC_PRODUCT_ID=<product ID for physical cards>
```

**Column-Lithic Architecture**:
- Column: BIN sponsor, holds funds, compliance
- Lithic: Card processor, authorization, fulfillment
- Integration: `card_program_token` links Lithic cards to Column BIN
- Result: Cards pull funds from Column wallet accounts ✅

---

### 3. Stripe Setup

**Purpose**: Subscription payments, owner membership fees

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

### 4. Google Cloud Setup

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

#### Google Maps API (Location Services)

**Setup Steps**:
1. Enable Maps JavaScript API in GCP
2. Enable Places API
3. Enable Geocoding API
4. Create API key with restrictions (HTTP referrers)
5. Add key to environment

**Required Secret**:
```bash
VITE_GOOGLE_MAPS_API_KEY=<maps-api-key>
```

---

## Production Deployment Checklist

### Pre-Deployment

- [ ] **Database Migrations**
  - Run `npm run db:push` to sync schema
  - Verify all tables created successfully
  - Test database connectivity

- [ ] **Environment Variables**
  - All required secrets configured in Replit Secrets
  - Production API keys (not test/sandbox)
  - Verify no hardcoded credentials in code

- [ ] **API Integrations**
  - Column: Test wallet creation and transfers
  - Lithic: Verify card creation (sandbox or production)
  - Stripe: Test subscription payments
  - Google Maps: Verify location services
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
- [ ] Object storage has `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`, and `DEFAULT_OBJECT_STORAGE_BUCKET_ID` configured for the deployment bucket.
- [ ] Google services have `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_CLOUD_BUCKET_NAME`, and `VITE_GOOGLE_MAPS_API_KEY` configured; browser-exposed keys are domain restricted.
- [ ] Column production wallet secrets are configured if wallet and transfer flows are enabled.
- [ ] Lithic production secrets are configured if card issuing is enabled.
- [ ] No placeholder, test-only, or local development values remain in deployment secrets.

### Lithic Production Setup

**Only required if you need Column wallet fund access via debit cards**:

- [ ] **Column BIN Sponsorship**
  - Application submitted to Column (sales@column.com)
  - Compliance review completed
  - BIN assigned (90-120 day timeline)

- [ ] **Lithic Integration**
  - BIN details shared with Lithic
  - `card_program_token` received from Lithic
  - Production API key configured
  - Environment updated:
    ```bash
    LITHIC_BASE_URL=https://api.lithic.com/v1
    LITHIC_CARD_PROGRAM_TOKEN=<token>
    ```

- [ ] **Physical Cards** (Optional)
  - Card design approved
  - Inventory ordered (500-1,000 minimum)
  - `LITHIC_PRODUCT_ID` configured
  - Card type updated to 'physical' in code

- [ ] **Card Testing**
  - End-to-end card issuance tested
  - Column fund access verified
  - Card controls configured (limits, restrictions)
  - Fraud monitoring enabled

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
   npm run db:push
   
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
   DATABASE_URL="<production-url>" npm run db:push
   ```
   
   **Important Notes**:
   - Production DATABASE_URL is different from development
   - This step creates all tables, indexes, and constraints
   - Run this immediately after first deployment
   - Safe to run multiple times (idempotent)

5. **Post-Deployment**
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
- ✅ Stripe/Lithic handle card data securely
- ✅ Tokenization used for sensitive data
- ✅ HTTPS enforced for all transactions

**GDPR** (Data Privacy):
- ✅ User data minimization
- ✅ Right to deletion implemented
- ✅ Data export capabilities
- ✅ Privacy policy required (add to app)

**Banking Regulations**:
- Column handles KYC/AML compliance
- Lithic manages card network compliance
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
   npm run db:push
   ```

3. **Verify schema creation**:
   - Look for "✓ Everything is up to date" message
   - Check production app - database tables should now exist

4. **Alternative: Use Drizzle Studio**:
   - Open Database pane in Replit
   - Switch to Production database
   - Run migrations using Drizzle Studio UI

**Prevention**: Always run `npm run db:push` immediately after first deployment to any new environment.

#### 1. Lithic Card Creation Fails

**Symptom**: "Missing address" error during card request

**Cause**: Driver profile incomplete (no street address)

**Solution**:
```bash
# Verify driver has complete address in database
# Check fields: street, city, state, zip
# Update profile via UI or admin panel
```

#### 2. Column Wallet Not Accessible

**Symptom**: "Column not onboarded" error

**Cause**: Driver hasn't completed Column KYC

**Solution**:
1. Navigate to /driver/wallet
2. Complete onboarding flow
3. Provide SSN, DOB, address
4. Wait for Column approval (usually instant)

#### 3. Stripe Webhook Failures

**Symptom**: Payments succeed but not reflected in app

**Cause**: Webhook endpoint not configured or signature mismatch

**Solution**:
```bash
# Verify webhook URL in Stripe dashboard
# Check STRIPE_WEBHOOK_SECRET is correct
# Review logs for webhook errors
# Test with Stripe CLI: stripe listen --forward-to localhost:5000/api/stripe/webhook
```

#### 4. Mobile App Not Installing (PWA)

**Symptom**: "Add to Home Screen" not appearing

**Cause**: PWA requirements not met

**Solution**:
- Ensure HTTPS (Replit provides automatically)
- Verify manifest.json served correctly
- Check service worker registration
- Test on supported browsers (Safari/Chrome)

#### 5. Google Maps Not Loading

**Symptom**: Map shows gray screen or errors

**Cause**: API key missing, restricted, or quota exceeded

**Solution**:
```bash
# Verify VITE_GOOGLE_MAPS_API_KEY is set
# Check API key restrictions in GCP console
# Ensure Maps JavaScript API enabled
# Review billing and quota in GCP
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
- Column: support@column.com
- Lithic: support@lithic.com
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
DATABASE_URL=<auto-provided>
BASE_URL=<production-app-url>
JWT_SECRET=<secure-random-string-at-least-32-characters>
SESSION_SECRET=<secure-random-string>

# Column BaaS
COLUMN_API_KEY=<column-api-key>
COLUMN_API_BASE_URL=https://api.column.com
COLUMN_PLATFORM_ENTITY_ID=<entity-id>
COLUMN_PLATFORM_ACCOUNT_ID=<account-id>
COLUMN_PLATFORM_ACCOUNT_NUMBER=<account-number>
COLUMN_PLATFORM_ROUTING=<routing-number>

# Lithic (Sandbox)
LITHIC_API_KEY=<lithic-sandbox-key>
LITHIC_BASE_URL=https://sandbox.lithic.com/v1

# Lithic (Production - after BIN sponsorship)
LITHIC_API_KEY=<lithic-production-key>
LITHIC_BASE_URL=https://api.lithic.com/v1
LITHIC_CARD_PROGRAM_TOKEN=<card-program-token>
LITHIC_PRODUCT_ID=<product-id>

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
VITE_GOOGLE_MAPS_API_KEY=<maps-api-key>
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

**Test SSN** (Lithic Sandbox):
```
Success: 123456789
Failure: 000-00-0001 (triggers verification failure)
```

---

## Release Notes

### Version 1.0.0 - Production Ready

**Features**:
- ✅ Driver registration and authentication
- ✅ Location discovery and check-in
- ✅ Wallet management (Column BaaS)
- ✅ Payment processing (Stripe)
- ✅ Debit card requests (Lithic sandbox)
- ✅ Progressive Web App (PWA)
- ✅ Mobile-responsive design
- ✅ Security compliance (PCI-DSS, GDPR)

**Known Limitations**:
- Debit cards in sandbox mode (no Column fund access until BIN sponsorship)
- Physical cards require production Lithic setup
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
