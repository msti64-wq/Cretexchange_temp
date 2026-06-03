import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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
  onInputChange?: (value: string) => void;
  defaultValue?: string;
}

interface MapboxContextEntry {
  id: string;
  text: string;
  short_code?: string;
}

interface MapboxFeature {
  id: string;
  text: string;
  place_name: string;
  address?: string;
  center: [number, number];
  context?: MapboxContextEntry[];
}

const VERIFY_MESSAGE = "Please select a valid address from the suggestions.";

function getContextEntry(feature: MapboxFeature, prefix: string) {
  return feature.context?.find((entry) => entry.id.startsWith(prefix));
}

function buildLocationFromFeature(feature: MapboxFeature) {
  const streetNumber = feature.address?.trim();
  const streetName = feature.text?.trim();
  const street = [streetNumber, streetName].filter(Boolean).join(" ").trim() || feature.place_name.split(",")[0].trim();
  const city = getContextEntry(feature, "place")?.text || "";
  const region = getContextEntry(feature, "region");
  const state = region?.short_code?.split("-").pop()?.toUpperCase() || region?.text || "";
  const zip = getContextEntry(feature, "postcode")?.text || "";
  const [longitude, latitude] = feature.center || [];

  return {
    formattedAddress: feature.place_name || "",
    street,
    city,
    state,
    zip,
    latitude,
    longitude,
  };
}

export function AddressAutocomplete({ onPlaceSelected, onInputChange, defaultValue = "" }: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const skipFetchRef = useRef(false);
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<MapboxFeature[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    setQuery(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;

    if (!token || token === "YOUR_MAPBOX_TOKEN") {
      setSuggestions([]);
      setError("Mapbox is not configured. Set VITE_MAPBOX_TOKEN to enable address search.");
      return;
    }

    const trimmedQuery = query.trim();
    if (skipFetchRef.current) {
      skipFetchRef.current = false;
      return;
    }

    if (trimmedQuery.length < 3) {
      setSuggestions([]);
      setError(null);
      setIsSearching(false);
      return;
    }

    const timeout = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsSearching(true);
      setError(null);

      try {
        const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmedQuery)}.json`);
        url.searchParams.set("access_token", token);
        url.searchParams.set("autocomplete", "true");
        url.searchParams.set("types", "address");
        url.searchParams.set("country", "us");
        url.searchParams.set("limit", "5");

        const response = await fetch(url.toString(), { signal: controller.signal });
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.message || VERIFY_MESSAGE);
        }

        const features = Array.isArray(data?.features) ? data.features : [];
        if (features.length === 0) {
          setSuggestions([]);
          setError(VERIFY_MESSAGE);
          return;
        }

        setSuggestions(features);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        if (import.meta.env.DEV) {
          console.warn("Mapbox autocomplete lookup failed:", (err as Error).message);
        }
        setSuggestions([]);
        setError(VERIFY_MESSAGE);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => {
      clearTimeout(timeout);
    };
  }, [query, retryToken]);

  const emptyHint = useMemo(() => {
    if (error) return error;
    if (isSearching) return "Searching addresses...";
    if (query.trim().length >= 3 && suggestions.length === 0) {
      return VERIFY_MESSAGE;
    }
    return null;
  }, [error, isSearching, query, suggestions.length]);

  const handleSelectSuggestion = (feature: MapboxFeature) => {
    const location = buildLocationFromFeature(feature);
    skipFetchRef.current = true;
    setQuery(feature.place_name);
    setSuggestions([]);
    setError(null);
    onPlaceSelected(location);
  };

  if (error && query.trim().length < 3 && !suggestions.length) {
    return (
      <div className="space-y-2">
        <Label>Address Search</Label>
        <div className="p-3 rounded-md bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 text-sm text-yellow-800 dark:text-yellow-200">
          <p>{error}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setRetryToken((value) => value + 1)}
          data-testid="button-retry-address-autocomplete"
        >
          Retry address search
        </Button>
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
          value={query}
          className="pr-10"
          data-testid="input-address-autocomplete"
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            onInputChange?.(value);
            setError(null);
          }}
          autoComplete="off"
        />
        {isSearching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="absolute z-20 mt-2 w-full rounded-md border bg-background shadow-lg overflow-hidden">
            <div className="max-h-64 overflow-auto">
              {suggestions.map((feature) => (
                <button
                  key={feature.id}
                  type="button"
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelectSuggestion(feature)}
                  data-testid={`button-address-suggestion-${feature.id}`}
                >
                  <div className="font-medium">{feature.place_name}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {emptyHint && !suggestions.length && (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      )}

      {error && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setRetryToken((value) => value + 1)}
          data-testid="button-retry-address-autocomplete"
        >
          Retry address search
        </Button>
      )}
    </div>
  );
}
