/**
 * Server-side geocoding using Google Maps Geocoding API.
 * Automatically converts a street address into lat/lng coordinates.
 */

const GOOGLE_MAPS_API_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY;

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
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('Google Maps API key is not configured. Cannot auto-geocode address.');
  }

  const addressQuery = `${street}, ${city}, ${state} ${zip}`;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressQuery)}&key=${GOOGLE_MAPS_API_KEY}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Geocoding request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as any;

  if (data.status !== 'OK' || !data.results || data.results.length === 0) {
    throw new Error(
      `Could not find coordinates for address: "${addressQuery}". Please check the address and try again. (Google status: ${data.status})`
    );
  }

  const result = data.results[0];
  const { lat, lng } = result.geometry.location;

  return {
    latitude: lat.toString(),
    longitude: lng.toString(),
    formattedAddress: result.formatted_address,
  };
}
