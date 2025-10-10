# WashOut Pro - Concrete Washout Location Management Platform

## Overview
WashOut Pro is a comprehensive web application designed to connect concrete truck drivers with verified washout locations for drum cleaning services. It acts as a marketplace facilitating washout services, payments, and location management for three distinct user types: concrete truck drivers, location owners, and super administrators. The platform aims to streamline the process of finding and utilizing washout services, managing facilities, and processing payments.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
-   **Frontend**: React with TypeScript, Vite for fast development, Wouter for routing.
-   **Styling**: Radix UI, Tailwind CSS, and Shadcn/ui for accessible, utility-first components.
-   **Mobile-First Design**: Responsive layout, Progressive Web App features, touch-friendly navigation, and real-time updates.

### Technical Implementations
-   **Backend**: Express.js with TypeScript for RESTful API, session-based authentication, and file upload handling.
-   **Database**: PostgreSQL hosted on Neon, managed with Drizzle ORM for type-safe queries. Features a comprehensive schema for users, locations, activities, and payments with role-based access.
-   **Authentication & Authorization**: Replit OIDC integration, role-based access control (driver, owner, admin), and secure session management.
-   **Payment Processing**: Integrated Stripe for driver payments, owner subscriptions, and transaction fees. Supports multiple payment methods and automated payouts.
-   **Automated Batch Processing**: A daily batch processor handles payments, recurring fees, and subscriptions, designed for external cron services. It includes idempotency and multi-timezone support.
-   **File Management**: Google Cloud Storage for secure photo uploads with presigned URLs and access control.
-   **Location Services**: GPS integration, Google Maps API for interactive maps, proximity-based discovery, and check-in systems.

### Feature Specifications
-   **Washout Process**: Drivers find locations, complete washouts with photo verification, and receive payments.
-   **Location Management**: Owners manage facilities, set rates, monitor activity, and process payments.
-   **Monthly Billing**: Automated monthly recurring fees for locations charged via Column book transfers.
-   **Subscription Management**: One-time platform membership fee processed via Stripe for owners.
-   **Wallet System**: Column BaaS integration for wallet management, including balance tracking, ACH transfers for funding, auto top-up functionality, and low balance alerts.
-   **Book Transfers**: Instant internal transfers for washout payments between owner and driver, and owner to platform fees.
-   **Debit Card Integration**: Lithic-powered debit cards for instant fund access. Drivers can request virtual debit cards (sandbox: virtual cards for testing, production: physical cards) linked to their Column bank accounts for immediate wallet fund access at ATMs and stores. Infrastructure includes card request management, shipping address collection, and full Lithic API integration. The wallet UI dynamically shows card details after successful issuance or the request button if no card exists.

## Column-Lithic Integration Architecture

### Current State (Sandbox)
-   **Card Creation**: Virtual cards created in Lithic sandbox for UI/UX testing
-   **Account Linking**: Column bank account ID passed to Lithic but not validated in sandbox
-   **Funding**: Cards NOT connected to actual Column wallet funds (sandbox limitation)
-   **Purpose**: Test card request flows, UI display, and user experience

### Production Requirements
For live deployment, the following integration must be completed:

#### Option 1: Lithic Financial Accounts (Recommended)
1. **Account Holder Enrollment**:
   - Create Lithic account holder when driver completes Column onboarding
   - Use existing KYC data (name, DOB, SSN, address) collected for Column
   - Store `lithic_account_holder_token` in driver record

2. **Financial Account Setup**:
   - Create Lithic financial account linked to Column bank account
   - Provide Column routing number and account number to Lithic
   - Lithic validates Column account exists
   - Store `lithic_financial_account_token` in driver record

3. **Card Issuance**:
   - Issue cards against Lithic financial account token
   - Card transactions pull funds from linked Column account
   - Real-time balance validation against Column wallet

#### Option 2: Direct Integration
-   Requires partnership agreement between Column and Lithic
-   Configure Lithic to recognize Column's BIN/routing structure
-   May require custom integration work

### Production Checklist

#### ✅ Completed (Development)
- [x] Implement Lithic account holder enrollment flow
- [x] Implement Lithic financial account creation linked to Column (with Column routing/account numbers)
- [x] Update database schema to store Lithic account holder and financial account tokens
- [x] Integrate enrollment into card request flow (automatic enrollment if missing)
- [x] Update card creation to use `account_token` parameter (Lithic API requirement)
- [x] Add validation to ensure drivers have Lithic enrollment before card issuance
- [x] **CRITICAL:** Properly link Column bank accounts to Lithic financial accounts for fund access

#### 🚀 Required for Production Launch
- [ ] Obtain Lithic production API key from dashboard
- [ ] Update `LITHIC_BASE_URL` environment variable to `https://api.lithic.com/v1`
- [ ] Configure `product_id` for physical card issuance in Lithic dashboard
- [ ] Set up Lithic webhooks for card status updates
- [ ] Implement card controls (spending limits, merchant restrictions)
- [ ] Add fraud monitoring and transaction alerts
- [ ] Run end-to-end test with Column test accounts
- [ ] Security audit: ensure no card numbers/CVV are logged
- [ ] Test complete flow: Column onboarding → Lithic enrollment → Card issuance

#### 📝 Environment Configuration
Production deployment requires these environment variables:
- `LITHIC_API_KEY`: Production API key from Lithic dashboard
- `LITHIC_BASE_URL`: Set to `https://api.lithic.com/v1` (currently hardcoded to sandbox)
- Note: Base URL should be configurable via environment variable for easy production/sandbox switching

## External Dependencies

### Database & Hosting
-   **Neon Database**: Serverless PostgreSQL.
-   **Replit Deployment**: Cloud hosting and development environment.

### Authentication Services
-   **Replit OIDC**: For user authentication.

### Payment Processing
-   **Stripe**: For customer management, subscription billing, payment methods, automated payouts, and webhook processing.
-   **Column BaaS**: Banking-as-a-Service for wallet management, bank account creation, balance tracking, book transfers, and ACH transfers. Uses the production API endpoint with test credentials.
-   **Lithic**: Card issuing platform for instant debit card access. Sandbox integration configured with physical card creation, status tracking, and card management. Provides processor-only model that integrates with Column bank accounts for instant fund access via physical/virtual debit cards.

### Cloud Storage
-   **Google Cloud Storage**: For object storage, presigned URL generation, and access control.

### Mapping & Location
-   **Google Maps API**: For interactive maps, geocoding, distance calculations, and real-time location tracking.

### Development Tools
-   **TypeScript**: For type-safe development.
-   **ESBuild**: For fast JavaScript bundling.
-   **PostCSS**: For CSS processing with Tailwind CSS.