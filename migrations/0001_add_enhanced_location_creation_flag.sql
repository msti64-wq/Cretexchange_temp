-- Migration: Add enhanced_location_creation feature flag
-- Created: 2025-11-06
-- Description: Adds feature flag for Google Maps-based location creation

INSERT INTO "feature_flags" (flag_key, enabled, description, allowed_roles)
VALUES (
  'enhanced_location_creation',
  false,
  'Enable enhanced location creation with Google Maps integration. Features: address autocomplete with instant suggestions, automatic coordinate conversion via geocoding, interactive map picker with draggable marker, and "Use Current Location" button. Requires VITE_GOOGLE_MAPS_API_KEY environment variable.',
  ARRAY['owner', 'super_admin']::text[]
)
ON CONFLICT (flag_key) DO NOTHING;
