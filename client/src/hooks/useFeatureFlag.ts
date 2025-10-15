import { useQuery } from "@tanstack/react-query";
import type { FeatureFlagKey } from "@shared/featureFlags";

interface FeatureFlagCheckResponse {
  enabled: boolean;
}

interface FeatureFlag {
  id: string;
  flagKey: string;
  name: string;
  description: string | null;
  enabled: boolean;
  allowedRoles: string[] | null;
}

/**
 * Hook to check if a feature flag is enabled for the current user
 * 
 * @param flagKey - The feature flag key to check
 * @returns Object with enabled status and loading state
 * 
 * @example
 * const { enabled, isLoading } = useFeatureFlag(FEATURE_FLAGS.RUBBLE_SERVICE);
 * 
 * if (isLoading) return <Loading />;
 * if (!enabled) return null;
 * 
 * return <RubbleServiceUI />;
 */
export function useFeatureFlag(flagKey: FeatureFlagKey) {
  const { data, isLoading, error } = useQuery<FeatureFlagCheckResponse>({
    queryKey: ['/api/feature-flags', flagKey, 'check'],
    enabled: !!flagKey,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
  });

  return {
    enabled: data?.enabled ?? false,
    isLoading,
    error,
  };
}

/**
 * Hook to get all feature flags (admin only)
 */
export function useFeatureFlags() {
  const { data, isLoading, error } = useQuery<FeatureFlag[]>({
    queryKey: ['/api/feature-flags'],
    staleTime: 1 * 60 * 1000, // Cache for 1 minute
  });

  return {
    flags: data ?? [],
    isLoading,
    error,
  };
}
