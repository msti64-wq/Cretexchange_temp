# CreteXchange - Concrete Washout Location Management Platform

## Overview
CreteXchange is a web application that connects concrete truck drivers with verified washout locations for drum cleaning services. It functions as a marketplace for washout services, payments, and location management for concrete truck drivers, location owners, and super administrators. The platform aims to streamline the process of finding and utilizing washout services, managing facilities, and processing payments, ultimately creating a new market for these services.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
-   **Frontend**: React with TypeScript, Vite, and Wouter.
-   **Styling**: Radix UI, Tailwind CSS, and Shadcn/ui for accessible, utility-first components.
-   **Design Philosophy**: Mobile-first, responsive, Progressive Web App (PWA) features, touch-friendly navigation, and real-time updates.

### Technical Implementations
-   **Backend**: Express.js with TypeScript for RESTful APIs, session-based authentication, and file uploads.
-   **Database**: PostgreSQL hosted on Neon, managed with Drizzle ORM for type-safe queries. The schema supports users, locations, activities, and payments with role-based access.
-   **Authentication & Authorization**: Custom username/password authentication, role-based access control (driver, owner, admin), and secure session management.
-   **Payment Processing**: All-Stripe Infrastructure, including Stripe Connect for marketplace payments, Stripe Treasury for wallet management (ACH, payouts, internal transfers), and Stripe Issuing for debit cards (virtual and physical). A platform fee of $4.00 per washout is collected via Stripe transfers.
-   **Automated Batch Processing**: A daily batch processor handles payments, recurring fees, and subscriptions, designed for external cron services, ensuring idempotency and multi-timezone support.
-   **File Management**: Google Cloud Storage for secure photo uploads using presigned URLs and access control.
-   **Location Services**: GPS integration, Google Maps API for interactive maps, proximity-based discovery, and check-in systems.

### Feature Specifications
-   **Washout Process**: Drivers locate facilities, complete washouts with photo verification, and receive payments via Stripe Treasury.
-   **Location Management**: Owners manage facilities, set rates, monitor activity, and process payments.
-   **Monthly Billing**: Automated monthly recurring fees ($100/location) charged via Stripe Treasury.
-   **Subscription Management**: A one-time platform membership fee ($1,500) processed via Stripe.
-   **Wallet System**: Stripe Treasury integration for wallet management, including balance tracking, ACH transfers for funding, auto top-up, and low balance alerts.
-   **Internal Transfers**: Instant Stripe Treasury transfers for washout payments between owner and driver wallets.
-   **Debit Card Integration**: Stripe Issuing-powered debit cards for instant fund access. Drivers can request virtual ($0.10) or physical ($3.00) debit cards linked to their Stripe Treasury wallets.

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