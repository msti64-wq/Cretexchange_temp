# CreteXchange - Concrete Washout Location Management Platform

## Overview
CreteXchange is a web application that connects concrete truck drivers with verified washout locations for drum cleaning services. It functions as a marketplace for washout services, payments, and location management for concrete truck drivers, location owners, and super administrators. The platform aims to streamline the process of finding and utilizing washout services, managing facilities, and processing payments, ultimately creating a new market for these services.

**IMPORTANT**: All payment amounts have been reduced to 1% of production values for live Stripe testing to avoid excessive costs during development troubleshooting.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes
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
-   **Payment Processing**: All-Stripe Infrastructure, including Stripe Connect for marketplace payments, Stripe Treasury for wallet management (ACH, payouts, internal transfers), and Stripe Issuing for debit cards (virtual and physical). A platform fee of $0.40 per washout (testing amount, 10% of production $4.00) is collected via Stripe transfers.
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
-   **Feature Flags**: Centralized system for managing platform features and configurations. Super admins can toggle features like automatic tax calculation and rubble service through the `/feature-flags` page. All platform settings consolidated in one location.

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