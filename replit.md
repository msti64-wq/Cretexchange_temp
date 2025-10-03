# WashOut Pro - Concrete Washout Location Management Platform

## Overview

WashOut Pro is a comprehensive web application that connects concrete truck drivers with verified washout locations for drum cleaning services. The platform serves three distinct user types: concrete truck drivers who need washout services, location owners who provide these services, and super administrators who manage the entire system.

The application facilitates a marketplace where drivers can find nearby washout locations, complete washouts with photo verification, and receive payments, while location owners can manage their facilities, set rates, monitor activity, and process payments through integrated Stripe functionality.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **React + TypeScript**: Modern React application using TypeScript for type safety
- **Vite**: Fast development server and build tool with hot module replacement
- **React Router (Wouter)**: Lightweight client-side routing for navigation
- **TanStack Query**: Server state management for API calls, caching, and synchronization
- **Radix UI + Tailwind CSS**: Accessible component library with utility-first styling
- **Shadcn/ui**: Pre-built component system built on Radix UI primitives

### Backend Architecture
- **Express.js**: Node.js web framework handling API routes and middleware
- **TypeScript**: Full-stack type safety with shared types between client and server
- **RESTful API**: Clear endpoint structure for different user roles and operations
- **Session-based Authentication**: Express sessions with PostgreSQL storage
- **File Upload Handling**: Direct-to-cloud storage integration for photo uploads

### Database Design
- **PostgreSQL**: Primary relational database with Neon serverless hosting
- **Drizzle ORM**: Type-safe database queries with schema-first approach
- **Comprehensive Schema**: Users, drivers, owners, washout locations, activities, payments, and notifications
- **Role-based Data Access**: Separate tables for driver and owner profiles with proper relationships
- **Activity Tracking**: Complete audit trail of washout activities with photo verification

### Authentication & Authorization
- **Replit OIDC Integration**: Seamless authentication using Replit's OpenID Connect
- **Role-based Access Control**: Three distinct user roles (driver, owner, admin) with different permissions
- **Session Management**: Secure session storage in PostgreSQL with configurable TTL
- **Route Protection**: Middleware-based authentication checks for protected endpoints

### Payment Processing
- **Stripe Integration**: Full payment processing for both driver payments and owner subscriptions
- **Multiple Payment Methods**: Support for ACH, credit cards, checks, Venmo, and Zelle
- **Automated Payouts**: Scheduled payments to drivers based on their preferences
- **Subscription Management**: Monthly/annual billing for washout location owners
- **Transaction Fees**: 10% processing fee charged to location owners

### File Management
- **Google Cloud Storage**: Secure file storage for washout verification photos
- **Object ACL System**: Granular access control for uploaded images
- **Direct Upload**: Client-side uploads with presigned URLs for performance
- **File Validation**: Type and size restrictions for uploaded content

### Location Services
- **GPS Integration**: Real-time location tracking for drivers
- **Google Maps Integration**: Interactive maps showing available washout locations
- **Distance Calculation**: Proximity-based location discovery
- **Check-in System**: Location verification for washout activities

### Mobile-First Design
- **Responsive Layout**: Mobile-optimized interface with desktop support
- **Progressive Web App**: Service worker integration for offline capabilities
- **Touch-friendly Navigation**: Bottom navigation bar for mobile users
- **Real-time Updates**: Live data synchronization across devices

## External Dependencies

### Database & Hosting
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Replit Deployment**: Cloud hosting platform with integrated development environment

### Authentication Services
- **Replit OIDC**: Identity provider for user authentication and session management

### Payment Processing
- **Stripe**: Complete payment infrastructure including:
  - Customer management
  - Subscription billing
  - Payment method storage
  - Automated payouts
  - Webhook processing

- **Column BaaS**: Banking-as-a-Service for wallet management:
  - Bank account creation and management
  - Balance tracking and synchronization
  - **Book Transfer Integration**: Instant internal transfers between Column accounts for washout payments
  - **ACH Transfer Integration**: Real ACH debit transfers from owner funding sources to Column wallets
  - **Counterparty System**: Automatic creation of Column counterparties for external bank accounts
  - **Auto Top-up**: Automated wallet funding when balance drops below threshold
  - Real-time balance sync from Column API
  - **Note**: Using production API endpoint (`api.column.com`) as sandbox endpoint is not accessible from Replit
  - Balance data retrieved from `balances.available_amount` field (in cents)

### Cloud Storage
- **Google Cloud Storage**: Object storage for file uploads with:
  - Presigned URL generation
  - Access control policies
  - Content type validation

### Mapping & Location
- **Google Maps API**: Location services including:
  - Interactive maps
  - Geocoding services
  - Distance calculations
  - Real-time location tracking

### Email & Notifications
- **Future Integration**: Placeholder for email service provider (SendGrid, AWS SES, etc.)

### Development Tools
- **TypeScript**: Type system for both frontend and backend
- **ESBuild**: Fast JavaScript bundler for production builds
- **PostCSS**: CSS processing with Tailwind CSS and Autoprefixer

## Technical Notes

### Column API Integration
**Issue Resolved**: Column sandbox API (`api.sandbox.column.com`) does not resolve from Replit environment (DNS ENOTFOUND error).

**Solution**: Use production API endpoint (`https://api.column.com`) with test credentials. This is a supported configuration for Column's testing environment.

**API Response Structure**:
- Balance data is in `balances` object (plural), not `balance` field
- Available balance: `balances.available_amount` (in cents)
- Other balance fields: `balances.holding_amount`, `balances.locked_amount`, `balances.pending_amount`

**Implementation**:
- Automatic balance synchronization on wallet page load
- Database serves as the local cache
- Column API is the authoritative source for balance data
- Graceful fallback to database values if API is unavailable

### ACH Transfer & Funding Source Integration
**Funding Source Setup**:
- When owners add bank accounts as funding sources, Column counterparties are automatically created
- Counterparty IDs are stored in `owner_funding_sources.column_counterparty_id`
- If counterparty creation fails initially, it's retried during the first funding attempt

**Wallet Funding Flow**:
1. Owner selects a funding source and enters amount
2. System retrieves funding source and verifies Column counterparty exists
3. Creates ACH DEBIT transfer via Column API (pulls money from external bank → owner's Column account)
4. Records transaction in database with Column transfer ID
5. Syncs balance from Column API
6. Funds appear in 1-3 business days (standard ACH timeline)

**Key Implementation Details**:
- Transfer type is 'DEBIT' (pulls from external bank account into Column wallet)
- All amounts converted to cents for Column API (e.g., $100.00 → 10000)
- Transaction includes descriptive metadata (bank name, last 4 digits)
- Balance sync ensures database reflects Column's authoritative balance

### Auto Top-up System
**Functionality**:
- Automatically initiates ACH transfers when wallet balance drops below threshold
- Requires: enabled auto top-up, configured threshold, default funding source, and active Column account
- Top-up amount is configurable per owner (default: $500)

**Trigger Points**:
- After wallet funding completes
- After wallet settings are updated
- After payments are processed
- Whenever balance sync detects low balance

**Process Flow**:
1. Check if balance < threshold AND auto top-up is enabled
2. Get default funding source
3. Create or retrieve Column counterparty for funding source
4. Initiate ACH DEBIT transfer for configured top-up amount
5. Record transaction in database
6. Send notification to owner about auto top-up initiation

**Error Handling**:
- Missing funding source → notification sent to add payment method
- Failed ACH transfer → notification sent with error details
- No Column account → logged but no notification (onboarding required)

### Low Balance Alert System
- Configurable threshold per owner
- Automatic notification creation when balance drops below threshold (if auto top-up disabled)
- Automatic notification clearing when balance recovers
- Auto top-up takes precedence over low balance alerts
- Visual warnings on wallet page
- Bell icon badge showing unread count

### Book Transfer Integration (Washout Payments)
**Payment Flow**:
When an owner approves a washout, two instant book transfers are executed:
1. **Owner → Driver**: Minimum $10 (or location rate if higher)
2. **Owner → Platform**: $4 platform fee

**Key Implementation Details**:
- Uses Column's `/transfers/book` API endpoint
- Parameters: `sender_bank_account_id` and `receiver_bank_account_id` (use bank account IDs like `bacc_xxx`, not account number IDs)
- Transfers are **instant** - funds move immediately between Column accounts
- No settlement delay (unlike ACH which takes 1-3 business days)
- Zero fees for book transfers between Column accounts
- Both accounts must be Column accounts for book transfers to work

**Fee Structure**:
- Driver receives: $10.00 minimum (configurable based on location rate)
- Platform receives: $4.00 (fixed)
- Owner pays: Driver amount + $4.00 (e.g., $10 + $4 = $14 total)

**Database Recording**:
- Owner wallet debited $14 in local database
- Payment record created with Column transfer ID
- Driver pending balance credited $10
- Transfers appear instantly in Column Sandbox/Production