/**
 * Feature Flags System
 * 
 * Type-safe feature flag definitions and utilities.
 * Add new flags here to enable controlled feature rollouts.
 */

// Define all feature flags here (type-safe)
export const FEATURE_FLAGS = {
  // Future feature: Concrete rubble as an additional service
  RUBBLE_SERVICE: 'rubble_service',
  
  // Stripe Automatic Tax - enables automatic tax calculation on all payments
  AUTOMATIC_TAX: 'automatic_tax',
  
  // Wallet Funding - requires Stripe Treasury approval
  WALLET_FUNDING: 'wallet_funding',
  
  // Enhanced Location Creation - Google Maps integration with address autocomplete, geocoding, and interactive map picker
  ENHANCED_LOCATION_CREATION: 'enhanced_location_creation',
  
  // Stripe Treasury - ACH wallet funding (requires Treasury approval)
  TREASURY_ENABLED: 'treasury_enabled',
  
  // Stripe Issuing - Driver debit cards (requires Issuing approval)
  ISSUING_ENABLED: 'issuing_enabled',

  // Trial Mode: Waive credit card / payment method requirement for owners
  WAIVE_OWNER_PAYMENT: 'waive_owner_payment',

  // Trial Mode: Waive bank account / Stripe Connect setup requirement for drivers
  WAIVE_DRIVER_PAYMENT: 'waive_driver_payment',
} as const;

export type FeatureFlagKey = typeof FEATURE_FLAGS[keyof typeof FEATURE_FLAGS];

// Feature flag metadata for initial setup
export interface FeatureFlagDefinition {
  key: FeatureFlagKey;
  description: string;
  enabled: boolean;
  allowedRoles?: string[];
}

// Predefined feature flags (used for seeding/documentation)
export const FEATURE_FLAG_DEFINITIONS: FeatureFlagDefinition[] = [
  {
    key: FEATURE_FLAGS.RUBBLE_SERVICE,
    description: 'Enable concrete rubble removal as an additional service option',
    enabled: false, // Disabled by default
    allowedRoles: [], // Available to all roles when enabled
  },
  {
    key: FEATURE_FLAGS.AUTOMATIC_TAX,
    description: 'Enable Stripe automatic tax calculation on all payments. Requires: (1) Stripe Tax Calculation API integration, (2) Customer billing addresses, (3) Tax code assignment, (4) Tax registrations in Stripe Dashboard.',
    enabled: false, // Disabled by default - full implementation required
    allowedRoles: ['super_admin'], // Super admin only - this is a global platform setting
  },
  {
    key: FEATURE_FLAGS.WALLET_FUNDING,
    description: 'Enable wallet funding via ACH bank transfers. Requires Stripe Connect and Stripe Treasury approval. When disabled, users must use credit cards for all payments. Enable this feature after receiving Stripe Treasury access.',
    enabled: false, // Disabled by default - requires Stripe Treasury approval
    allowedRoles: [], // Available to all roles when enabled
  },
  {
    key: FEATURE_FLAGS.ENHANCED_LOCATION_CREATION,
    description: 'Enable enhanced location creation with Google Maps integration. Features: address autocomplete with instant suggestions, automatic coordinate conversion via geocoding, interactive map picker with draggable marker, and "Use Current Location" button. Requires VITE_GOOGLE_MAPS_API_KEY environment variable.',
    enabled: false, // Disabled by default - requires Google Maps API key
    allowedRoles: ['owner', 'super_admin'], // Location owners and admins
  },
  {
    key: FEATURE_FLAGS.TREASURY_ENABLED,
    description: 'Enable Stripe Treasury for ACH wallet funding. When disabled, owners can only fund wallets via credit/debit cards. Monthly cost: $10k-$20k. Enable after validating revenue justifies the expense.',
    enabled: false, // Disabled by default - requires Stripe approval and significant monthly cost
    allowedRoles: [], // Available to all roles when enabled
  },
  {
    key: FEATURE_FLAGS.ISSUING_ENABLED,
    description: 'Enable Stripe Issuing for driver debit cards. When disabled, drivers receive payments via direct Connect transfers to their bank accounts. Monthly cost: Included in Treasury pricing. Enable after validating driver demand for debit cards.',
    enabled: false, // Disabled by default - requires Stripe approval
    allowedRoles: [], // Available to all roles when enabled
  },
  {
    key: FEATURE_FLAGS.WAIVE_OWNER_PAYMENT,
    description: 'TRIAL MODE: Waive the credit card / payment method requirement for location owners. Owners can create and manage listings without entering a payment method. Disable this before enabling monthly listing fees and billing.',
    enabled: false, // Disabled by default — enable only during trial period
    allowedRoles: [], // All roles can read this flag; it is a global platform setting controlled by super admin
  },
  {
    key: FEATURE_FLAGS.WAIVE_DRIVER_PAYMENT,
    description: 'TRIAL MODE: Waive the bank account / Stripe Connect setup requirement for drivers. Drivers can use the platform without connecting a bank account. Disable this before enabling driver payouts.',
    enabled: false, // Disabled by default — enable only during trial period
    allowedRoles: [], // All roles can read this flag; it is a global platform setting controlled by super admin
  },
];
