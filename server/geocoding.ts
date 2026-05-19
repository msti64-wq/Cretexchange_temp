/**
 * Server-side geocoding using the Mapbox Geocoding API.
 * Converts a street address into lat/lng coordinates for owner locations.
 */

const MAPBOX_TOKEN = process.env.VITE_MAPBOX_TOKEN;

export interface GeocodeResult {
  latitude: string;
  longitude: string;
  formattedAddress?: string;
}

export async function geocodeAddress(
  street: string,
  city: string,
  state: string,
  zip: string
): Promise<GeocodeResult> {
  if (!MAPBOX_TOKEN) {
    throw new Error(
      'Mapbox token is not configured. Set VITE_MAPBOX_TOKEN on the server or select a valid address from the dropdown suggestions.'
    );
  }

  const addressQuery = `${street}, ${city}, ${state} ${zip}`.trim();
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressQuery)}.json`);
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("autocomplete", "false");
  url.searchParams.set("limit", "1");
  url.searchParams.set("types", "address");
  url.searchParams.set("country", "us");

  const response = await fetch(url.toString());
  const data = await response.json().catch(() => null) as any;

  if (!response.ok) {
    const reason = response.status === 401 || response.status === 403
      ? 'Mapbox rejected the geocoding request. Check VITE_MAPBOX_TOKEN and token restrictions.'
      : 'Unable to verify this address. Please select a valid address from the dropdown suggestions or contact support.';
    throw new Error(reason);
  }

  const feature = data?.features?.[0];
  if (!feature || !Array.isArray(feature.center) || feature.center.length < 2) {
    throw new Error(
      'We could not verify this address. Please select a valid address from the dropdown suggestions or contact support.'
    );
  }

  const [longitude, latitude] = feature.center;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    throw new Error(
      'We could not verify this address. Please select a valid address from the dropdown suggestions or contact support.'
    );
  }

  return {
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    formattedAddress: feature.place_name,
  };
}
