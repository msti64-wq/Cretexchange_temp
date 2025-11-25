# CreteXchange - Concrete Washout Location Management Platform

## Overview
CreteXchange is a web application that connects concrete truck drivers with verified washout locations for drum cleaning services. It functions as a marketplace for washout services, payments, and location management for concrete truck drivers, location owners, and super administrators. The platform aims to streamline the process of finding and utilizing washout services, managing facilities, and processing payments, ultimately creating a new market for these services.

## User Preferences
Preferred communication style: Simple, everyday language.

## Testing Environment
**IMPORTANT**: Testing is done in the PRODUCTION environment, NOT development. The development database is separate from production. Test accounts like LD1, LO1 exist in the production database only.

## Recent Updates (Nov 25, 2025)
- ✅ **Identity document support for fraud prevention**: New `identity_documents` table stores government-issued ID documents for drivers and owners
- ✅ **Stripe Identity API integration**: Added functions to create Stripe Identity verification sessions and link documents to connected accounts
- ✅ **Document verification fields in schema**: Added `identityDocumentId` and `identityVerificationStatus` fields to drivers and owners tables  
- ✅ **Verification fields added to schema**: Drivers and owners can now provide dateOfBirth and ssnLast4
- ✅ **Automatic Stripe account updates**: When users update profiles, all verification info automatically forwards to their Stripe Connect account
- ✅ **Manual bank account entry working**: Drivers can add bank accounts via manual entry form (routing number, account number, etc.)
- ✅ **Financial Connections framework in place**: Paid infrastructure is implemented; ongoing refinement for completing connections
- ✅ **External account creation working**: Once bank details are provided, external accounts are created on driver Connect accounts for ACH payouts
- ✅ **T&C acceptance retroactive update**: Admin button in System Settings to backfill T&C acceptance for all existing Stripe accounts (fraud prevention compliance)

## Pricing Structure
-   **Production Pricing**: Driver receives **$5.00** per washout, Platform fee **$4.00**, Total **$9.00**
-   **Testing Pricing (10% scale)**:
    -   **Membership Fee**: $15.00 (one-time platform membership)
    -   **Location Monthly Fee**: $1.00 per location
    -   **Driver Payment per Washout**: $0.50 (set by location owner, default rate)
    -   **Platform Fee per Washout**: $0.40
    -   **Total per Washout**: $0.90 (driver $0.50 + platform $0.40)
    -   **Virtual Debit Card**: $0.01
    -   **Physical Debit Card**: $30.00
-   **Payment Flow**: Stripe Connect Destination Charges - money flows directly owner→driver via Stripe, platform receives only the fee (NO money transmitter obligations, NO 1099 requirements for driver payments)

## Deployment Plan
- **Custom Domain**: After testing is complete, configure custom domain redirect to `Creteapp.creteexchange.com`
  - Steps: Publish app → Add custom domain in Replit → Update DNS CNAME record → SSL auto-provisioned

## System Architecture

### UI/UX Decisions
-   **Frontend**: React with TypeScript, Vite, and Wouter.
-   **Styling**: Radix UI, Tailwind CSS, and Shadcn/ui for accessible, utility-first components.
-   **Design Philosophy**: Mobile-first, responsive, Progressive Web App (PWA) features, touch-friendly navigation, and real-time updates.

### Technical Implementations
-   **Backend**: Express.js with TypeScript for RESTful APIs, session-based authentication, and file uploads.
-   **Database**: PostgreSQL hosted on Neon, managed with Drizzle ORM for type-safe queries. The schema supports users, locations, activities, and payments with role-based access.
-   **Authentication & Authorization**: Custom username/password authentication, role-based access control (driver, owner, admin), and secure session management.
-   **Payment Processing**: All-Stripe Infrastructure including Stripe Connect for marketplace payments, Stripe Treasury for wallet management (funded via ACH), and Stripe Issuing for debit cards. Supports both Treasury wallet transfers and Connect Destination Charges (credit card splitting) for owners. Platform fees are collected automatically via application fees.
-   **Automated Batch Processing**: An hourly batch processor handles payments, recurring fees, and subscriptions, designed for external cron services.
-   **File Management**: Google Cloud Storage for secure photo uploads using presigned URLs.
-   **Location Services**: GPS integration, Google Maps API for interactive maps, proximity-based discovery, and check-in systems.

### Feature Specifications
-   **Washout Process**: Drivers locate facilities, complete washouts with photo verification, and receive payments.
-   **Location Management**: Owners manage facilities, set rates, monitor activity, and process payments.
-   **Monthly Billing**: Automated monthly recurring fees for locations.
-   **Subscription Management**: A one-time platform membership fee.
-   **Wallet System**: Stripe Treasury integration for wallet management, balance tracking, ACH transfers for funding, auto top-up, and low balance alerts. Internal transfers for instant washout payments.
-   **Bank Account Collection**: 
    -   **Dual Approach**: Manual entry form + Stripe Financial Connections instant verification both available
    -   **Manual Entry**: Drivers/owners can enter routing number and account number directly (instant)
    -   **Financial Connections (Optional)**: Stripe Financial Connections OAuth flow for automated bank linking to 5,000+ US banks (in progress refinement)
    -   **Costs**: $1.50 per automated Financial Connections link (one-time), $0.10 per balance check, $0.80 per ACH transfer fee, 3-5 day settlement
    -   **Driver Payouts**: Bank accounts become external accounts on Stripe Connect accounts for ACH payouts
    -   **Owner Wallet Funding**: Payment methods created for wallet funding via ACH transfers
-   **Wallet Funding Methods**: 
    -   **Card Payments with 3DS/SCA**: Owners can fund wallets via credit/debit cards with full Strong Customer Authentication (3DS) support. ~2.9% + $0.30 fee, instant funding. Backend automatically handles `requires_action` status and returns clientSecret for frontend confirmation.
    -   **Payment Method Priority**: ACH (manual or Financial Connections) is PRIMARY; credit cards are BACKUP/fallback.
-   **Debit Card Integration**: Stripe Issuing-powered debit cards (virtual and physical) linked to Stripe Treasury wallets for drivers.
-   **Feature Flags**: Centralized system for managing platform features and configurations (e.g., automatic tax, rubble service, wallet funding) accessible to super admins.
-   **Per-Owner Custom Platform Fees**: Super admins can set custom platform fees for individual owners based on tenure, with a tiered fee hierarchy.
-   **Rubble Service - Material Pricing**: 
    -   **Materials Catalog**: 6 materials (Asphalt, Brick, Concrete Rubble, Dirt, Fill Dirt, Washout) with synonyms for flexible matching.
    -   **Owner Pricing Configuration**: Owners select which materials they accept and set payment rates ($/unit) for each material. Supports three unit types: per load, per ton, per cubic yard.
    -   **Driver Discovery**: Drivers see which materials each location accepts and the payment rates on the locations list, enabling informed decisions about where to drop off materials.
    -   **Database**: `location_material_intents` table stores pricing (rateCents, unit) per location/material with capacity limits and acceptance rules.
-   **Admin System Settings**: Super admins can access system maintenance tools including payment method backfill utility for fixing production data issues (accessible via Settings nav link).
-   **Identity Document Requirements**: Stripe requires government-issued identity documents (driver's license, passport, state ID) for fraud prevention. System stores documents in `identity_documents` table and uses Stripe Identity API for verification:
    -   **Document Storage**: Google Cloud Storage with secure file URLs
    -   **Verification Status**: Tracks pending, verified, rejected, and expired states
    -   **Stripe Integration**: `createIdentityVerificationSession()` creates Stripe verification sessions, `updateAccountWithIdentityDocument()` links verified documents to Connect accounts
    -   **Schema Support**: Drivers and owners reference their identity documents via `identityDocumentId`

## External Dependencies

### Database & Hosting
-   **Neon Database**: Serverless PostgreSQL.
-   **Replit Deployment**: Cloud hosting and development environment.

### Payment Infrastructure
-   **Stripe**: Comprehensive payment platform providing Stripe Connect, Stripe Treasury, and Stripe Issuing.

### Cloud Storage
-   **Google Cloud Storage**: For object storage.

### Mapping & Location
-   **Google Maps API**: For interactive maps and location services.

### Development Tools
-   **TypeScript**: For type-safe development.
-   **ESBuild**: For fast JavaScript bundling.
-   **PostCSS**: For CSS processing with Tailwind CSS.
