# CreteXchange - Concrete Washout Location Management Platform

## Overview
CreteXchange is a web application that connects concrete truck drivers with verified washout locations for drum cleaning services. It functions as a marketplace for washout services, payments, and location management for concrete truck drivers, location owners, and super administrators. The platform aims to streamline the process of finding and utilizing washout services, managing facilities, and processing payments, ultimately creating a new market for these services.

**IMPORTANT**: All payment amounts have been reduced to 1% of production values for live Stripe testing to avoid excessive costs during development troubleshooting.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes
- **November 3, 2025**:
  - Fixed critical bug: `stripeConnectAccountId` now correctly saved to users table (was incorrectly attempting to save to drivers/owners table)
  - Updated all endpoints to check users table for Connect account ID instead of role-specific tables
  - Fixed Stripe Connect account creation to enable both `card_payments` and `transfers` capabilities
  - This allows Connect accounts to work with Destination Charges without requiring Stripe approval
  - **Enabled wallet funding feature flag** - Owners can now fund Treasury wallets via ACH for driver payments
  - Connect accounts now support 25+ payment methods: ACH, cards, SEPA, iDEAL, Klarna, Affirm, Cash App, and more
  - Implemented automatic Stripe Account Link generation for Treasury wallet activation
  - Added two-step Connect onboarding: (1) Create account, (2) Complete Treasury verification via Stripe-provided link
  - Backend now generates and returns `accountSetupLink` after Connect account creation
  - Frontend displays prominent "Complete Wallet Activation" alert with button to open Stripe's verification portal
  - Enhanced UX: Clear messaging guides users through Treasury wallet activation process
  - Account setup link redirects back to profile page after completion
  - Setup link persists across page reloads - auto-fetches fresh links when needed
  - This resolves the additional verification step required for Treasury wallet access

- **October 31, 2025**:
  - Implemented hourly batched payment system for washout transactions to minimize Stripe fees
  - Added `pending_washout_payments` table to queue washouts awaiting batch processing
  - Added `washout_payment_batches` table to track batch processing history and results
  - Washout approval now queues payments instead of immediate charging (batches run hourly or manually)
  - Created batch processor endpoint (`/api/payments/process-batch`) for admin-triggered processing
  - Single Stripe charge per owner per batch, with metadata showing all driver payment splits
  - Comprehensive error handling: batch failures don't block individual payment failures
  - Added Batch Payment Management admin interface (`/batch-payments`) for monitoring and manual triggers
  - Real-time statistics showing queued payments, total amounts, and affected owners
  - Batch history view displaying all processed batches with Stripe payment intent IDs
  - Payment flow: Queue → Hourly batch → Single owner charge → Multiple driver transfers → Complete
  - Designed for external cron triggering (e.g., hourly schedule via Replit Deployments or external service)
  - Testing amounts: $0.50 driver payment + $0.40 platform fee per washout

- **October 30, 2025** (PM - Later):
  - Implemented per-owner custom platform fee system for tenure-based pricing
  - Added `customPlatformFee` nullable field to owners table for individual overrides
  - Super admins can set custom fees via Users management page based on owner loyalty
  - Three-tier fee hierarchy: custom owner fee → global platform fee → $0.40 failsafe
  - "Months on Platform" tenure display added to Users management page
  - Payment processing checks owner's custom fee first before using global fee
  - Comprehensive validation: custom fee must be positive or null (reverts to global)
  - "Set Custom Fee" dialog allows super admins to reward long-term partners with reduced rates

- **October 30, 2025** (PM):
  - Added dynamic platform fee management system for super admins
  - Platform washout fee now configurable via Feature Flags page (no code changes needed)
  - Triple-layer validation ensures fee is always positive (frontend, backend, Zod schema)
  - Payment processing includes failsafe fallback to $0.40 if invalid fee detected
  - Super admins can easily switch between testing ($0.40) and production ($4.00) pricing
  - Platform Settings section added to /feature-flags page for centralized configuration
  - Comprehensive logging and error handling for fee validation and updates

- **October 30, 2025** (AM):
  - Implemented Stripe Connect Destination Charges for washout payments (credit card splitting)
  - Added `processWashoutPaymentViaCard()` function for marketplace payment processing
  - Washout payments now work via credit card WITHOUT Treasury approval
  - Payment flow: Owner's card charged → Driver receives payment via Connect → Platform keeps fee
  - Dual payment system: Credit card (default) OR Treasury wallet (when enabled via feature flag)
  - Automated payment splitting: $0.50 to driver, $0.40 platform fee ($0.90 total - testing prices)
  - Production pricing ready: $5.00 driver, $4.00 platform fee (just change constants)
  - Comprehensive validation: checks for saved payment methods and Connect accounts
  - Fully reversible: Can switch to Treasury wallets by toggling feature flag

- **October 29, 2025**:
  - Added `wallet_funding` feature flag to control ACH wallet funding feature
  - Wallet funding now disabled by default pending Stripe Connect + Treasury approval
  - Backend endpoint returns 403 error with clear message when feature is disabled
  - Frontend wallet page hides/disables Fund Wallet buttons when feature flag is off
  - Added helpful tooltip explaining Stripe Treasury requirement when button is disabled
  - Feature can be enabled from `/feature-flags` page once Stripe approval is received

- **October 28, 2025**:
  - Consolidated all platform toggles into Feature Flags system (single management interface)
  - Added `automatic_tax` and `rubble_service` feature flags to codebase and database
  - Added Feature Flags page (/feature-flags) to super admin navigation - now accessible in production
  - Removed separate Settings page - all configuration now managed via Feature Flags
  - Fixed missing navigation links - Feature Flags page now appears in bottom nav for super admins
  - Automatic Tax flag includes comprehensive documentation about Stripe Tax API requirements
  - Seeded initial feature flags into development database
  
- **October 24, 2025**:
  - Implemented comprehensive Stripe transaction labeling for all payment operations (membership fees, monthly location fees, washout payments, platform fees)
  - Changed Stripe account creation to use username-based identification instead of email addresses
  - Built robust duplicate prevention system with full pagination (checks all Stripe accounts, not just first 100)
  - Added short-circuit optimization to stop pagination once matching account is found (performance improvement)
  - Implemented graceful handling for duplicate account creation (returns existing account instead of throwing error)
  - Created standardized helper functions: `createMembershipPaymentIntent`, `chargeMonthlyLocationFee`
  - All Stripe operations now include proper descriptions and metadata for transaction tracking and auditing
  
- **October 22, 2025**: 
  - Synced database schema for production publishing
  - Fixed enum type mismatches (`payment_method` and `subscription_plan`)
  - Home screen icons optimized from 1.2MB to 22KB (192x192) and 209KB (512x512)
  - Implemented Stripe Treasury ACH wallet funding (replaced 501 error with working InboundTransfer API)
  - Fixed 404 wallet funding error - owners can now fund wallets via ACH bank accounts

## Brand Assets
- **Primary Logo (Header)**: `attached_assets/cretexchange-logo-2025.png` - Complete circular logo with "CRETEXCHANGE" text curved at top, "X" symbol in center (dark gray and orange), and "STREAMLINING CONCRETE CONNECTIONS" curved at bottom. Used in all headers, navigation, and auth pages.
- **Icon Logo (Mobile Home Screen)**: `attached_assets/ChatGPT Image Oct 20, 2025, 01_22_46 AM_1761154981052.png` - Circular X logo with white background (dark gray and orange X design). Optimized for PWA icons at 192x192 and 512x512.
- **Legacy Logos**: Previous versions archived in attached_assets folder
- **Brand Colors**: Orange accent `hsl(33, 100%, 50%)`, Primary blue `hsl(210, 90%, 48%)`, Secondary teal `hsl(174, 60%, 51%)`
- **Typography**: "X" in CreteXchange is styled in orange to match logo branding

## System Architecture

### UI/UX Decisions
-   **Frontend**: React with TypeScript, Vite, and Wouter.
-   **Styling**: Radix UI, Tailwind CSS, and Shadcn/ui for accessible, utility-first components.
-   **Design Philosophy**: Mobile-first, responsive, Progressive Web App (PWA) features, touch-friendly navigation, and real-time updates.

### Technical Implementations
-   **Backend**: Express.js with TypeScript for RESTful APIs, session-based authentication, and file uploads.
-   **Database**: PostgreSQL hosted on Neon, managed with Drizzle ORM for type-safe queries. The schema supports users, locations, activities, and payments with role-based access.
-   **Authentication & Authorization**: Custom username/password authentication, role-based access control (driver, owner, admin), and secure session management.
-   **Payment Processing**: All-Stripe Infrastructure:
    - **Primary Payment Method**: Stripe Connect Destination Charges for marketplace payments (credit card splitting) - works immediately without approval
    - **Alternative Payment Method**: Stripe Treasury for wallet management (ACH, payouts, internal transfers) - requires approval, controlled via feature flag
    - **Debit Cards**: Stripe Issuing for virtual and physical cards
    - **Platform Fee**: $0.40 per washout (testing amount, 10% of production $4.00) collected automatically via application fees
    - **Payment Splitting**: Owner's card charged → Driver receives payment via Connect account → Platform keeps fee in single transaction
-   **Automated Batch Processing**: A daily batch processor handles payments, recurring fees, and subscriptions, designed for external cron services, ensuring idempotency and multi-timezone support.
-   **File Management**: Google Cloud Storage for secure photo uploads using presigned URLs and access control.
-   **Location Services**: GPS integration, Google Maps API for interactive maps, proximity-based discovery, and check-in systems.

### Feature Specifications
-   **Washout Process**: Drivers locate facilities, complete washouts with photo verification, and receive payments via Stripe Treasury.
-   **Location Management**: Owners manage facilities, set rates, monitor activity, and process payments.
-   **Monthly Billing**: Automated monthly recurring fees ($1.00/location - testing amount, 1% of production $100) charged via Stripe Treasury.
-   **Subscription Management**: A one-time platform membership fee ($15.00 - testing amount, 1% of production $1,500) processed via Stripe.
-   **Wallet System**: Stripe Treasury integration for wallet management, including balance tracking, ACH transfers for funding, auto top-up, and low balance alerts.
-   **Internal Transfers**: Instant Stripe Treasury transfers for washout payments between owner and driver wallets.
-   **Debit Card Integration**: Stripe Issuing-powered debit cards for instant fund access. Drivers can request virtual ($0.01 - testing amount) or physical ($0.30 - testing amount) debit cards linked to their Stripe Treasury wallets.
-   **Feature Flags**: Centralized system for managing platform features and configurations. Super admins can toggle features like automatic tax calculation, rubble service, and wallet funding through the `/feature-flags` page. All platform settings consolidated in one location. Wallet funding feature flag controls ACH bank transfers via Stripe Treasury (requires approval).
-   **Per-Owner Custom Platform Fees**: Super admins can set custom platform fees for individual owners based on tenure and loyalty. Three-tier fee hierarchy: custom owner fee → global platform fee → $0.40 failsafe. "Months on Platform" tenure tracking displayed in Users management page. Custom fees are nullable (null = use global fee).

## External Dependencies

### Database & Hosting
-   **Neon Database**: Serverless PostgreSQL.
-   **Replit Deployment**: Cloud hosting and development environment.

### Payment Infrastructure
-   **Stripe**: Comprehensive payment platform providing:
    -   **Stripe Connect**: Marketplace payment processing.
    -   **Stripe Treasury**: Banking-as-a-Service for wallet management, ACH funding, payouts, and internal transfers.
    -   **Stripe Issuing**: Debit card issuance.

### Cloud Storage
-   **Google Cloud Storage**: For object storage, presigned URL generation, and access control.

### Mapping & Location
-   **Google Maps API**: For interactive maps, geocoding, distance calculations, and real-time location tracking.

### Development Tools
-   **TypeScript**: For type-safe development.
-   **ESBuild**: For fast JavaScript bundling.
-   **PostCSS**: For CSS processing with Tailwind CSS.