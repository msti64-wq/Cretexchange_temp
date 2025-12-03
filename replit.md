# CreteXchange - Concrete Washout Location Management Platform

## Overview
CreteXchange is a web application designed to connect concrete truck drivers with verified washout locations for drum cleaning services. It operates as a comprehensive marketplace facilitating washout services, payment processing, and location management for drivers, location owners, and administrators. The platform's core purpose is to streamline the discovery and utilization of washout facilities, manage operations, and process financial transactions, thereby establishing a new market for these services.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is built with React, TypeScript, Vite, and Wouter, utilizing Radix UI, Tailwind CSS, and Shadcn/ui for accessible, utility-first components. The design philosophy emphasizes mobile-first, responsiveness, Progressive Web App (PWA) features, touch-friendly navigation, and real-time updates.

### Technical Implementations
The backend uses Express.js with TypeScript for RESTful APIs, session-based authentication, and file uploads. PostgreSQL, hosted on Neon and managed with Drizzle ORM, serves as the database, supporting users, locations, activities, and payments with role-based access. Authentication and authorization rely on custom username/password methods and role-based access control (driver, owner, admin). Payment processing is handled entirely by Stripe, including Stripe Connect for marketplace payments, Stripe Treasury for wallet management, and Stripe Issuing for debit cards. An hourly batch processor manages payments and recurring fees. Google Cloud Storage handles secure photo uploads via presigned URLs. Location services integrate GPS and the Google Maps API for interactive maps and proximity-based discovery.

### Feature Specifications
Key features include a streamlined washout process with photo verification, comprehensive location management for owners, automated monthly billing and one-time platform membership subscriptions, and a Stripe Treasury-integrated wallet system supporting ACH transfers, auto top-up, and low balance alerts. Bank account collection offers both manual entry and Stripe Financial Connections for verification. Wallet funding supports card payments with 3DS/SCA and prioritizes ACH. Stripe Issuing powers virtual and physical debit cards linked to Treasury wallets for drivers. Feature flags provide centralized management of platform configurations. Super admins can set custom platform fees per owner and manage rubble service material pricing, allowing owners to configure rates for accepted materials. An admin system settings interface provides tools for system maintenance. Identity document requirements for fraud prevention are integrated via Stripe Identity API and Google Cloud Storage.

## External Dependencies

-   **Neon Database**: Serverless PostgreSQL.
-   **Replit Deployment**: Cloud hosting and development environment.
-   **Stripe**: Payment infrastructure (Connect, Treasury, Issuing).
-   **Google Cloud Storage**: For object storage.
-   **Google Maps API**: For mapping and location services.

## Recent Updates (Dec 3, 2025)
- **Payment Data Integrity**: Added `stripePaymentIntentId` column to payments table for complete Stripe tracking
- **Webhook Handlers Fixed**: Complete rewrite of transfer.failed, charge.refunded, and dispute webhook handlers
- **Payment Reconciliation Service**: Comprehensive system to verify database payments match Stripe records
- **Batch Reconciliation**: Support for auditing billing batch transfers against Stripe Transfer objects
- **Admin Audit Tools**: Full audit endpoint combining balance, payment, and batch reconciliation in one report

## Payment Data Integrity & Reconciliation

### Key Principles
- **Stripe is the Source of Truth**: All payment data in the database should match what Stripe reports
- **Automatic Correction**: Reconciliation can auto-correct discrepancies to match Stripe
- **Audit Trail**: All corrections and discrepancies are logged for review

### Admin Reconciliation Endpoints
| Endpoint | Description |
|----------|-------------|
| `POST /api/admin/reconciliation/payments` | Verify payments table matches Stripe PaymentIntents |
| `POST /api/admin/reconciliation/batches` | Verify billing batches match Stripe Transfers |
| `POST /api/admin/reconciliation/sync-payment/:paymentId` | Force sync single payment from Stripe |
| `GET /api/admin/reconciliation/full-audit` | Run all reconciliation checks in one request |
| `POST /api/admin/reconciliation/run` | Run balance reconciliation for connected accounts |

### Webhook Handlers (webhookService.ts)
- `payment_intent.succeeded` - Records payment completion, triggers driver payout
- `transfer.failed` - Marks payment as failed, logs critical error for admin review
- `charge.refunded` - Updates payment with refund details, sets status to refunded
- `charge.dispute.created` - Tracks dispute in payment metadata
- `account.updated` - Syncs Connect account verification status

## Scheduled Jobs (Replit Scheduled Deployments)

The platform uses Replit Scheduled Deployments for automated background jobs. These run independently from the main application.

### Available Jobs

| Job Script | Purpose | Recommended Schedule |
|------------|---------|---------------------|
| `server/scripts/scheduledReconciliation.ts` | Verify DB matches Stripe data | Daily at 2:00 AM UTC |
| `server/scripts/scheduledBatchProcessing.ts` | Process pending billing batches | Daily at 6:00 AM UTC |

### Setup Instructions

1. **Navigate to Publishing**: From the workspace, click "Publishing" in the left dock
2. **Select "Scheduled"**: Choose the "Scheduled" deployment type
3. **Configure the Job**:
   - **Schedule**: Use natural language like "Every day at 2:00 AM UTC"
   - **Run Command**: `npx tsx server/scripts/scheduledReconciliation.ts`
   - **Timeout**: 5-10 minutes depending on job
4. **Add Secrets**: Ensure `DATABASE_URL` and `STRIPE_SECRET_KEY` are available
5. **Deploy**: Click to activate the scheduled deployment

### Running Jobs Manually

Jobs can also be triggered manually for testing:

```bash
# Run reconciliation
npx tsx server/scripts/scheduledReconciliation.ts

# Run batch processing
npx tsx server/scripts/scheduledBatchProcessing.ts
```

### Job Health Monitoring

- Jobs exit with code 0 on success, code 1 on failure
- Logs include detailed summaries with discrepancy counts
- Health status: HEALTHY, NEEDS_ATTENTION, or CRITICAL
- Critical errors should trigger admin notification