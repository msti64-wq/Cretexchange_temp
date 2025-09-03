import { useEffect, useRef, useState } from "react";

interface LocationMapProps {
  locations: Array<{
    id: string;
    name: string;
    latitude: string;
    longitude: string;
    rate: string;
  }>;
  userLocation?: { lat: number; lng: number } | null;
  height?: string;
  onLocationSelect?: (locationId: string) => void;
}

export function LocationMap({ 
  locations, 
  userLocation, 
  height = "300px",
  onLocationSelect 
}: LocationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    // Check if Google Maps API key is available
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey || apiKey === 'YOUR_API_KEY') {
      setMapError(true);
      return;
    }

    // Initialize Google Maps
    const initMap = () => {
      if (!mapRef.current) return;

      const center = userLocation || { lat: 39.7392, lng: -104.9903 }; // Default to Denver

      const map = new google.maps.Map(mapRef.current, {
        zoom: 11,
        center,
        styles: [
          {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }],
          },
        ],
      });

      mapInstanceRef.current = map;

      // Add user location marker
      if (userLocation) {
        new google.maps.Marker({
          position: userLocation,
          map,
          title: "Your Location",
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#1D4ED8",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });
      }

      // Add location markers
      locations.forEach((location) => {
        const marker = new google.maps.Marker({
          position: {
            lat: parseFloat(location.latitude),
            lng: parseFloat(location.longitude),
          },
          map,
          title: location.name,
          icon: {
            path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
            scale: 6,
            fillColor: "#14B8A6",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });

        const infoWindow = new google.maps.InfoWindow({
          content: `
            <div class="p-2">
              <h3 class="font-semibold">${location.name}</h3>
              <p class="text-sm text-gray-600">Rate: $${location.rate}</p>
              ${onLocationSelect ? `<button onclick="window.selectLocation('${location.id}')" class="mt-2 px-3 py-1 bg-blue-500 text-white rounded text-sm">Select</button>` : ''}
            </div>
          `,
        });

        marker.addListener("click", () => {
          infoWindow.open(map, marker);
        });
      });

      // Global function for location selection
      if (onLocationSelect) {
        (window as any).selectLocation = onLocationSelect;
      }
    };

    // Load Google Maps script if not already loaded
    if (!(window as any).google) {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'YOUR_API_KEY'}&callback=initMap`;
      script.async = true;
      script.defer = true;
      (window as any).initMap = initMap;
      document.head.appendChild(script);
    } else {
      initMap();
    }
  }, [locations, userLocation, onLocationSelect]);

  // Show simple GPS status when API key is missing
  if (mapError) {
    return (
      <div 
        style={{ height: "auto", width: "100%" }}
        className="rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border border-green-200 dark:border-green-800 p-4"
        data-testid="location-map-fallback"
      >
        {userLocation && (
          <div className="flex items-center justify-center">
            <p className="text-sm text-green-700 dark:text-green-300 font-medium">
              ✅ GPS location detected: {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      ref={mapRef} 
      style={{ height, width: "100%" }}
      className="rounded-lg"
      data-testid="location-map"
    />
  );
}
