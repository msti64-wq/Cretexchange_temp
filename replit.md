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

## External Dependencies

### Database & Hosting
-   **Neon Database**: Serverless PostgreSQL.
-   **Replit Deployment**: Cloud hosting and development environment.

### Authentication Services
-   **Replit OIDC**: For user authentication.

### Payment Processing
-   **Stripe**: For customer management, subscription billing, payment methods, automated payouts, and webhook processing.
-   **Column BaaS**: Banking-as-a-Service for wallet management, bank account creation, balance tracking, book transfers, and ACH transfers. Uses the production API endpoint with test credentials.

### Cloud Storage
-   **Google Cloud Storage**: For object storage, presigned URL generation, and access control.

### Mapping & Location
-   **Google Maps API**: For interactive maps, geocoding, distance calculations, and real-time location tracking.

### Development Tools
-   **TypeScript**: For type-safe development.
-   **ESBuild**: For fast JavaScript bundling.
-   **PostCSS**: For CSS processing with Tailwind CSS.