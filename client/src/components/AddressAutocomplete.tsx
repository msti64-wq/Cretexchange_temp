import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initAutocomplete = () => {
      if (!inputRef.current) return;

      // Check if Google Maps API is loaded
      if (!(window as any).google || !(window as any).google.maps) {
        setError("Google Maps not loaded");
        return;
      }

      try {
        // Initialize autocomplete
        autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
          types: ['address'],
          componentRestrictions: { country: 'us' },
          fields: ['address_components', 'formatted_address', 'geometry', 'name'],
        });

        // Listen for place selection
        autocompleteRef.current.addListener('place_changed', () => {
          const place = autocompleteRef.current?.getPlace();
          
          if (!place || !place.geometry || !place.address_components) {
            setError("Please select a valid address from the suggestions");
            return;
          }

          setIsLoading(true);
          setError(null);

          // Parse address components
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

          // Get coordinates
          const latitude = place.geometry.location.lat();
          const longitude = place.geometry.location.lng();

          // Call parent callback
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

        setError(null);
      } catch (err) {
        console.error('Error initializing autocomplete:', err);
        setError("Failed to initialize address search");
      }
    };

    // Load Google Maps script if not already loaded
    const loadGoogleMaps = () => {
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      
      if (!apiKey || apiKey === 'YOUR_API_KEY') {
        setError("Google Maps API key not configured");
        return;
      }

      // Check if Google Maps is already loaded
      if ((window as any).google && (window as any).google.maps) {
        initAutocomplete();
        return;
      }

      // Check if script is already being loaded
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        // If script exists but Google Maps not loaded yet, wait for it
        const handleLoad = () => {
          if ((window as any).google && (window as any).google.maps) {
            initAutocomplete();
          }
        };
        existingScript.addEventListener('load', handleLoad, { once: true });
        return;
      }

      // Load script
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => initAutocomplete();
      script.onerror = () => setError("Failed to load Google Maps");
      document.head.appendChild(script);
    };

    loadGoogleMaps();
  }, [onPlaceSelected]);

  if (error) {
    return (
      <div className="space-y-2">
        <Label>Address Search (Manual Entry Required)</Label>
        <div className="p-3 rounded-md bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 text-sm text-yellow-800 dark:text-yellow-200">
          {error === "Google Maps API key not configured" ? (
            <p>Address autocomplete unavailable. Please enter address manually below.</p>
          ) : (
            <p>{error}</p>
          )}
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
