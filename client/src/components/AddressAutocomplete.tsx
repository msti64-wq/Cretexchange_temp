import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Loader2 } from "lucide-react";

interface AddressAutocompleteProps {
  onPlaceSelected: (place: {
    formattedAddress: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    latitude: number;
    longitude: number;
  }) => void;
  defaultValue?: string;
}

export function AddressAutocomplete({ onPlaceSelected, defaultValue = "" }: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initializedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    if (!apiKey || apiKey === 'YOUR_API_KEY') {
      setError("Google Maps API key not configured");
      return;
    }

    const initAutocomplete = () => {
      if (!inputRef.current || initializedRef.current) return;

      const g = (window as any).google;
      if (!g?.maps?.places?.Autocomplete) return;

      try {
        initializedRef.current = true;
        autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
          types: ['address'],
          componentRestrictions: { country: 'us' },
          fields: ['address_components', 'formatted_address', 'geometry', 'name'],
        });

        autocompleteRef.current.addListener('place_changed', () => {
          const place = autocompleteRef.current?.getPlace();

          if (!place || !place.geometry || !place.address_components) {
            setError("Please select a valid address from the suggestions");
            return;
          }

          setIsLoading(true);
          setError(null);

          let street = '';
          let city = '';
          let state = '';
          let zip = '';

          place.address_components.forEach((component) => {
            const types = component.types;
            if (types.includes('street_number')) {
              street = component.long_name + ' ';
            } else if (types.includes('route')) {
              street += component.long_name;
            } else if (types.includes('locality')) {
              city = component.long_name;
            } else if (types.includes('administrative_area_level_1')) {
              state = component.short_name;
            } else if (types.includes('postal_code')) {
              zip = component.long_name;
            }
          });

          const latitude = place.geometry.location.lat();
          const longitude = place.geometry.location.lng();

          onPlaceSelected({
            formattedAddress: place.formatted_address || '',
            street: street.trim(),
            city,
            state,
            zip,
            latitude,
            longitude,
          });

          setIsLoading(false);
        });

        // Stop polling once initialized
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (err) {
        console.error('Error initializing autocomplete:', err);
        setError("Failed to initialize address search");
        initializedRef.current = false;
      }
    };

    // Load the Maps script if it isn't already in the DOM
    const ensureScriptLoaded = () => {
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (!existingScript) {
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
        script.async = true;
        script.defer = true;
        script.onerror = () => setError("Failed to load Google Maps");
        document.head.appendChild(script);
      }
    };

    ensureScriptLoaded();

    // Poll until google.maps.places is ready — handles all race conditions:
    // script already loaded, script loading in progress, or script not yet added.
    pollRef.current = setInterval(() => {
      const g = (window as any).google;
      if (g?.maps?.places?.Autocomplete) {
        initAutocomplete();
      }
    }, 150);

    // Give up after 15 seconds
    const timeout = setTimeout(() => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (!initializedRef.current) {
        setError("Google Maps took too long to load. Please enter address manually below.");
      }
    }, 15000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      clearTimeout(timeout);
    };
  }, [onPlaceSelected]);

  if (error) {
    return (
      <div className="space-y-2">
        <Label>Address Search (Manual Entry Required)</Label>
        <div className="p-3 rounded-md bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 text-sm text-yellow-800 dark:text-yellow-200">
          <p>{error === "Google Maps API key not configured"
            ? "Address autocomplete unavailable. Please enter address manually below."
            : error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="address-search">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Search for Address
        </div>
      </Label>
      <div className="relative">
        <Input
          id="address-search"
          ref={inputRef}
          type="text"
          placeholder="Start typing an address..."
          defaultValue={defaultValue}
          className="pr-10"
          data-testid="input-address-autocomplete"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Select an address from the dropdown to auto-fill all fields
      </p>
    </div>
  );
}
