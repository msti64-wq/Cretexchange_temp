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
];
