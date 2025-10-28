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
  
  // Example: Beta features
  // ADVANCED_ANALYTICS: 'advanced_analytics',
  // BULK_OPERATIONS: 'bulk_operations',
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
];
