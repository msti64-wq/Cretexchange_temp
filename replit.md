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