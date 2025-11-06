# CreteXchange - Concrete Washout Location Management Platform

## Overview
CreteXchange is a web application that connects concrete truck drivers with verified washout locations for drum cleaning services. It functions as a marketplace for washout services, payments, and location management for concrete truck drivers, location owners, and super administrators. The platform aims to streamline the process of finding and utilizing washout services, managing facilities, and processing payments, ultimately creating a new market for these services.

## User Preferences
Preferred communication style: Simple, everyday language.

## Pricing Structure
-   **Production Pricing**: Driver receives **$5.00** per washout, Platform fee **$4.00**, Total **$9.00**
-   **Testing Pricing (10% scale)**: Driver receives **$0.50** per washout, Platform fee **$0.40**, Total **$0.90**
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
-   **Wallet Funding Methods**: 
    -   **Instant Bank Linking via Financial Connections**: Owners can link bank accounts instantly using Stripe Financial Connections, replacing slow micro-deposit verification with instant OAuth-based verification. $0.80 per ACH transfer fee, 3-5 day settlement.
    -   **Card Payments with 3DS/SCA**: Owners can fund wallets via credit/debit cards with full Strong Customer Authentication (3DS) support. ~2.9% + $0.30 fee, instant funding. Backend automatically handles `requires_action` status and returns clientSecret for frontend confirmation.
    -   **Payment Method Priority**: Treasury wallet transfers are PRIMARY; credit cards are BACKUP/fallback.
-   **Debit Card Integration**: Stripe Issuing-powered debit cards (virtual and physical) linked to Stripe Treasury wallets for drivers.
-   **Feature Flags**: Centralized system for managing platform features and configurations (e.g., automatic tax, rubble service, wallet funding) accessible to super admins.
-   **Per-Owner Custom Platform Fees**: Super admins can set custom platform fees for individual owners based on tenure, with a tiered fee hierarchy.

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