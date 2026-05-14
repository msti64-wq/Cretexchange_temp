declare global {
  namespace google.maps {
    interface LatLng {
      lat(): number;
      lng(): number;
    }

    interface MapMouseEvent {
      latLng: LatLng | null;
    }

    interface MapOptions {
      zoom?: number;
      center?: { lat: number; lng: number };
      styles?: unknown[];
      mapTypeControl?: boolean;
      streetViewControl?: boolean;
    }

    class Map {
      constructor(element: HTMLElement, options?: MapOptions);
      setCenter(center: { lat: number; lng: number }): void;
      setZoom(zoom: number): void;
      addListener(eventName: string, handler: (event: MapMouseEvent) => void): void;
    }

    interface MarkerOptions {
      position: { lat: number; lng: number } | LatLng;
      map?: Map;
      title?: string;
      draggable?: boolean;
      icon?: unknown;
      animation?: unknown;
    }

    class Marker {
      constructor(options: MarkerOptions);
      addListener(eventName: string, handler: () => void): void;
      getPosition(): LatLng | null;
      setPosition(position: { lat: number; lng: number } | LatLng): void;
    }

    class InfoWindow {
      constructor(options?: { content?: string });
      open(map: Map, marker?: Marker): void;
    }

    namespace SymbolPath {
      const CIRCLE: string;
      const BACKWARD_CLOSED_ARROW: string;
    }

    const Animation: {
      DROP: string;
    };

    namespace places {
      interface AutocompleteOptions {
        types?: string[];
        componentRestrictions?: { country: string };
        fields?: string[];
      }

      interface GeocoderAddressComponent {
        long_name: string;
        short_name: string;
        types: string[];
      }

      interface PlaceGeometry {
        location: LatLng;
      }

      interface PlaceResult {
        geometry?: PlaceGeometry;
        address_components?: GeocoderAddressComponent[];
        formatted_address?: string;
        name?: string;
      }

      class Autocomplete {
        constructor(input: HTMLInputElement, options?: AutocompleteOptions);
        addListener(eventName: "place_changed", handler: () => void): void;
        getPlace(): PlaceResult;
      }
    }
  }

  interface Window {
    google?: typeof google;
    initMap?: () => void;
    selectLocation?: (locationId: string) => void;
  }
}

export {};
