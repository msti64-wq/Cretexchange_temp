# CreteXchange - Concrete Washout Location Management Platform

## Overview
CreteXchange is a comprehensive web application designed to connect concrete truck drivers with verified washout locations for drum cleaning services. It acts as a marketplace facilitating washout services, payments, and location management for three distinct user types: concrete truck drivers, location owners, and super administrators. The platform aims to streamline the process of finding and utilizing washout services, managing facilities, and processing payments.

## User Preferences
Preferred communication style: Simple, everyday language.

## ⚠️  MIGRATION IN PROGRESS: Column/Lithic → All-Stripe Infrastructure

**Status**: Schema updated, Stripe service layer created, database migration pending

**Completed (October 15, 2025)**:
- ✅ Database schema updated to replace Column/Lithic fields with Stripe equivalents
  - `columnCustomerId` → `stripeConnectAccountId`
  - `columnEntityId`, `columnBankAccountId` → `stripeTreasuryAccountId`
  - `lithicAccountHolderToken`, `lithicFinancialAccountToken` → `stripeIssuingCardholderId`
  - `lithicCardId` → `stripeIssuingCardId`
- ✅ Created comprehensive Stripe service layer (`server/stripeService.ts`) with:
  - Stripe Connect for marketplace payments and connected accounts
  - Stripe Treasury for wallet management (ACH, payouts, internal transfers)
  - Stripe Issuing for debit cards (virtual $0.10, physical $3 with 2-day shipping)

**Pending**:
- ⏳ Database schema application (blocked by drizzle-kit interactive prompts)
- ⏳ Route updates to use Stripe service instead of Column/Lithic services
- ⏳ Frontend updates for Stripe card fees and timelines
- ⏳ Removal of Column/Lithic service files

**Manual Action Required**:
To apply the database schema changes, run in your local terminal or Replit Shell:
```bash
# Option 1: Use drizzle-kit push and manually select "create column" for each prompt
npm run db:push

# Option 2: If you have drizzle-kit ≥0.30, use the --yes flag
npm run db:push -- --yes
```

After schema is applied, the remaining route migrations can proceed automatically.

## System Architecture

### UI/UX Decisions
-   **Frontend**: React with TypeScript, Vite for fast development, Wouter for routing.
-   **Styling**: Radix UI, Tailwind CSS, and Shadcn/ui for accessible, utility-first components.
-   **Mobile-First Design**: Responsive layout, Progressive Web App features, touch-friendly navigation, and real-time updates.

### Technical Implementations (Post-Migration)
-   **Backend**: Express.js with TypeScript for RESTful API, session-based authentication, and file upload handling.
-   **Database**: PostgreSQL hosted on Neon, managed with Drizzle ORM for type-safe queries. Features a comprehensive schema for users, locations, activities, and payments with role-based access.
-   **Authentication & Authorization**: Custom username/password authentication, role-based access control (driver, owner, admin), and secure session management.
-   **Payment Processing**: **All-Stripe Infrastructure**
  - **Stripe Connect**: Marketplace payments with connected accounts for drivers and owners
  - **Stripe Treasury**: Wallet management with ACH funding, payouts, and internal transfers
  - **Stripe Issuing**: Debit cards (virtual $0.10, physical $3) for instant fund access
  - Platform fee: $4.00 per washout, collected via Stripe transfers
-   **Automated Batch Processing**: A daily batch processor handles payments, recurring fees, and subscriptions, designed for external cron services. It includes idempotency and multi-timezone support.
-   **File Management**: Google Cloud Storage for secure photo uploads with presigned URLs and access control.
-   **Location Services**: GPS integration, Google Maps API for interactive maps, proximity-based discovery, and check-in systems.

### Feature Specifications (Post-Migration)
-   **Washout Process**: Drivers find locations, complete washouts with photo verification, and receive payments via Stripe Treasury.
-   **Location Management**: Owners manage facilities, set rates, monitor activity, and process payments.
-   **Monthly Billing**: Automated monthly recurring fees ($100/location) charged via Stripe Treasury transfers.
-   **Subscription Management**: One-time platform membership fee ($1,500) processed via Stripe.
-   **Wallet System**: Stripe Treasury integration for wallet management, including balance tracking, ACH transfers for funding, auto top-up functionality, and low balance alerts.
-   **Internal Transfers**: Instant Stripe Treasury transfers for washout payments between owner and driver wallets.
-   **Debit Card Integration**: Stripe Issuing-powered debit cards for instant fund access. Drivers can request debit cards (virtual $0.10 instant, physical $3 with 2-day shipping) linked to their Stripe Treasury wallets for immediate fund access at ATMs and stores. Infrastructure includes card request management, shipping address collection, and full Stripe Issuing API integration.

## Stripe Integration Setup

### Production Requirements

**Stripe Connect Setup:**
- [ ] Apply for Stripe Connect platform account at https://stripe.com/connect
- [ ] Complete platform verification and business documentation
- [ ] Enable Treasury and Issuing capabilities
- [ ] Configure platform branding and terms of service

**API Configuration:**
- ✅ `STRIPE_SECRET_KEY`: Secret key from Stripe dashboard (already configured)
- ✅ `VITE_STRIPE_PUBLIC_KEY`: Publishable key for frontend (already configured)
- [ ] Set up Stripe webhooks for payment events:
  - `payment_intent.succeeded`
  - `payment_intent.failed`
  - `account.updated`
  - `treasury.financial_account.updated`
  - `issuing.card.created`
  - `issuing.card.updated`

**Treasury & Issuing Activation:**
- [ ] Request Treasury access through Stripe dashboard
- [ ] Request Issuing access through Stripe dashboard
- [ ] Complete KYC requirements for platform account
- [ ] Set up physical card design and ordering (via Stripe dashboard)
- [ ] Configure card spending controls and limits

**Pricing:**
- Virtual cards: $0.10 per card (instant issuance)
- Physical cards: $3.00 per card (2-day shipping included)
- Platform fee: $4.00 per washout transaction
- First $500K in transactions: free processing fees

## External Dependencies

### Database & Hosting
-   **Neon Database**: Serverless PostgreSQL.
-   **Replit Deployment**: Cloud hosting and development environment.

### Payment Infrastructure (Post-Migration)
-   **Stripe**: All-in-one payment platform providing:
  - **Stripe Connect**: Marketplace payment processing with connected accounts for drivers and owners
  - **Stripe Treasury**: Banking-as-a-Service for wallet management, ACH funding, payouts, and internal transfers
  - **Stripe Issuing**: Debit card issuance for instant fund access (virtual $0.10, physical $3 with 2-day shipping)

### Cloud Storage
-   **Google Cloud Storage**: For object storage, presigned URL generation, and access control.

### Mapping & Location
-   **Google Maps API**: For interactive maps, geocoding, distance calculations, and real-time location tracking.

### Development Tools
-   **TypeScript**: For type-safe development.
-   **ESBuild**: For fast JavaScript bundling.
-   **PostCSS**: For CSS processing with Tailwind CSS.