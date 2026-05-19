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
    throw new Error(
      'Google Maps API key is not configured. Set VITE_GOOGLE_MAPS_API_KEY on the server, or enter latitude and longitude manually.'
    );
  }

  const addressQuery = `${street}, ${city}, ${state} ${zip}`;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressQuery)}&key=${GOOGLE_MAPS_API_KEY}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Geocoding request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as any;

  if (data.status !== 'OK' || !data.results || data.results.length === 0) {
    if (data.status === 'REQUEST_DENIED') {
      throw new Error(
        `Google rejected the geocoding request for "${addressQuery}". Check the VITE_GOOGLE_MAPS_API_KEY, API key restrictions, and that the Geocoding API is enabled.`
      );
    }

    if (data.status === 'ZERO_RESULTS') {
      throw new Error(
        `Could not find coordinates for address: "${addressQuery}". Enter latitude and longitude manually or correct the address.`
      );
    }

    if (data.status === 'OVER_QUERY_LIMIT') {
      throw new Error(
        `Google Maps geocoding quota was exceeded while looking up "${addressQuery}". Try again later or enter latitude and longitude manually.`
      );
    }

    throw new Error(
      `Could not geocode address: "${addressQuery}". Google status: ${data.status}. Enter latitude and longitude manually or verify the Google Maps setup.`
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
