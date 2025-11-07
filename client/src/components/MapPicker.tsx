import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation } from "lucide-react";

interface MapPickerProps {
  latitude?: number;
  longitude?: number;
  onLocationChange: (lat: number, lng: number) => void;
  height?: string;
}

export function MapPicker({ latitude, longitude, onLocationChange, height = "300px" }: MapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  useEffect(() => {
    const initMap = () => {
      if (!mapRef.current) return;

      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      
      if (!apiKey || apiKey === 'YOUR_API_KEY') {
        setMapError("Google Maps API key not configured");
        return;
      }

      if (!(window as any).google || !(window as any).google.maps) {
        setMapError("Google Maps not loaded");
        return;
      }

      try {
        // Default to Denver if no coordinates provided
        const center = (latitude && longitude) 
          ? { lat: latitude, lng: longitude }
          : { lat: 39.7392, lng: -104.9903 };

        // Initialize map
        const map = new google.maps.Map(mapRef.current, {
          zoom: 15,
          center,
          mapTypeControl: true,
          streetViewControl: false,
        });

        mapInstanceRef.current = map;

        // Add draggable marker
        const marker = new google.maps.Marker({
          position: center,
          map,
          draggable: true,
          title: "Drag to adjust location",
          animation: google.maps.Animation.DROP,
        });

        markerRef.current = marker;

        // Update coordinates when marker is dragged
        marker.addListener('dragend', () => {
          const position = marker.getPosition();
          if (position) {
            onLocationChange(position.lat(), position.lng());
          }
        });

        // Allow clicking on map to move marker
        map.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (e.latLng) {
            marker.setPosition(e.latLng);
            onLocationChange(e.latLng.lat(), e.latLng.lng());
          }
        });

        setMapError(null);
      } catch (err) {
        console.error('Error initializing map:', err);
        setMapError("Failed to initialize map");
      }
    };

    // Load Google Maps script if not already loaded
    const loadGoogleMaps = () => {
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      
      if (!apiKey || apiKey === 'YOUR_API_KEY') {
        setMapError("Google Maps API key not configured");
        return;
      }

      if ((window as any).google && (window as any).google.maps) {
        initMap();
        return;
      }

      // Check if script is already being loaded
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        existingScript.addEventListener('load', () => initMap());
        return;
      }

      // Load script
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => initMap();
      script.onerror = () => setMapError("Failed to load Google Maps");
      document.head.appendChild(script);
    };

    loadGoogleMaps();
  }, [latitude, longitude, onLocationChange]);

  // Update marker position when coordinates change externally
  useEffect(() => {
    if (markerRef.current && latitude && longitude) {
      const newPosition = { lat: latitude, lng: longitude };
      markerRef.current.setPosition(newPosition);
      mapInstanceRef.current?.setCenter(newPosition);
    }
  }, [latitude, longitude]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMapError("Geolocation not supported by your browser");
      return;
    }

    setIsGettingLocation(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        // Update map and marker
        if (mapInstanceRef.current && markerRef.current) {
          const newPosition = { lat, lng };
          markerRef.current.setPosition(newPosition);
          mapInstanceRef.current.setCenter(newPosition);
          mapInstanceRef.current.setZoom(17); // Zoom in for precise location
        }

        onLocationChange(lat, lng);
        setIsGettingLocation(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        setMapError("Failed to get your location. Please allow location access.");
        setIsGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  if (mapError) {
    return (
      <div className="space-y-3">
        <div className="p-4 rounded-md bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 text-sm text-yellow-800 dark:text-yellow-200">
          <p className="font-medium mb-1">Map Preview Unavailable</p>
          <p>{mapError}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleUseCurrentLocation}
          disabled={isGettingLocation}
          className="w-full"
          data-testid="button-use-current-location-fallback"
        >
          <Navigation className="w-4 h-4 mr-2" />
          {isGettingLocation ? "Getting location..." : "Use My Current Location"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        ref={mapRef}
        style={{ height, width: "100%" }}
        className="rounded-lg border"
        data-testid="map-picker"
      />
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleUseCurrentLocation}
          disabled={isGettingLocation}
          className="flex-1"
          data-testid="button-use-current-location"
        >
          <Navigation className="w-4 h-4 mr-2" />
          {isGettingLocation ? "Getting location..." : "Use My Current Location"}
        </Button>
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          <MapPin className="w-4 h-4 mr-1" />
          Drag marker or click map to adjust
        </div>
      </div>
    </div>
  );
}
