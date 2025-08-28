import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { DriverHeader } from "@/components/DriverHeader";
import { MobileNav } from "@/components/MobileNav";
import { LocationMap } from "@/components/LocationMap";
import { MapPin, Search, Navigation, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getCurrentLocation } from "@/lib/gps";

export default function DriverLocations() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [sortBy, setSortBy] = useState<"distance" | "rate">("distance");

  const { data: locations, isLoading } = useQuery({
    queryKey: ['/api/drivers/locations'],
  });

  useEffect(() => {
    // Get user's current location
    getCurrentLocation()
      .then(coords => {
        setCurrentLocation({ lat: coords.latitude, lng: coords.longitude });
      })
      .catch(error => {
        console.error("Error getting location:", error);
      });
  }, []);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const filteredAndSortedLocations = locations?.filter((location: any) =>
    location.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    location.address.toLowerCase().includes(searchTerm.toLowerCase())
  ).map((location: any) => ({
    ...location,
    distance: currentLocation ? 
      calculateDistance(
        currentLocation.lat, 
        currentLocation.lng, 
        Number(location.latitude), 
        Number(location.longitude)
      ) : 0
  })).sort((a: any, b: any) => {
    if (sortBy === "distance") {
      return a.distance - b.distance;
    } else {
      return Number(b.rate) - Number(a.rate);
    }
  }) || [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <DriverHeader />
        <div className="animate-pulse p-4 space-y-4">
          <div className="h-10 bg-muted rounded-lg" />
          <div className="h-48 bg-muted rounded-lg" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <DriverHeader />
      
      <div className="p-4 space-y-4">
        {/* Search and Filter */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search locations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant={sortBy === "distance" ? "default" : "outline"}
              size="sm"
              onClick={() => setSortBy("distance")}
              data-testid="button-sort-distance"
            >
              <Navigation className="w-4 h-4 mr-1" />
              Distance
            </Button>
            <Button 
              variant={sortBy === "rate" ? "default" : "outline"}
              size="sm"
              onClick={() => setSortBy("rate")}
              data-testid="button-sort-rate"
            >
              Rate
            </Button>
          </div>
        </div>

        {/* Map View */}
        <Card>
          <CardContent className="p-0">
            <LocationMap 
              locations={filteredAndSortedLocations}
              userLocation={currentLocation}
              height="200px"
            />
          </CardContent>
        </Card>

        {/* Location List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Available Locations</h2>
            <Badge variant="secondary" data-testid="text-location-count">
              {filteredAndSortedLocations.length} locations
            </Badge>
          </div>

          {filteredAndSortedLocations.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No locations found</p>
              </CardContent>
            </Card>
          ) : (
            filteredAndSortedLocations.map((location: any, index: number) => (
              <Card key={location.id} className="hover:shadow-md transition-shadow" data-testid={`card-location-${index}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-1" data-testid={`text-location-name-${index}`}>
                        {location.name}
                      </h3>
                      <p className="text-muted-foreground text-sm mb-2" data-testid={`text-location-address-${index}`}>
                        {location.address}
                      </p>
                      <div className="flex items-center gap-4 text-sm">
                        {currentLocation && (
                          <div className="flex items-center text-muted-foreground">
                            <Navigation className="w-4 h-4 mr-1" />
                            <span data-testid={`text-location-distance-${index}`}>
                              {location.distance.toFixed(1)} mi
                            </span>
                          </div>
                        )}
                        <div className="flex items-center text-green-600">
                          <Clock className="w-4 h-4 mr-1" />
                          <span>Open 24/7</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-accent mb-1" data-testid={`text-location-rate-${index}`}>
                        {formatCurrency(Number(location.rate))}
                      </div>
                      <div className="text-xs text-muted-foreground">per washout</div>
                    </div>
                  </div>

                  {location.description && (
                    <p className="text-sm text-muted-foreground mb-3" data-testid={`text-location-description-${index}`}>
                      {location.description}
                    </p>
                  )}

                  {location.amenities && location.amenities.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {location.amenities.map((amenity: string, amenityIndex: number) => (
                        <Badge key={amenityIndex} variant="outline" className="text-xs">
                          {amenity}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button 
                      size="sm"
                      onClick={() => setLocation(`/check-in/${location.id}`)}
                      className="flex-1"
                      data-testid={`button-check-in-${index}`}
                    >
                      <MapPin className="w-4 h-4 mr-1" />
                      Check In
                    </Button>
                    <Button 
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const url = `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
                        window.open(url, '_blank');
                      }}
                      data-testid={`button-directions-${index}`}
                    >
                      <Navigation className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <MobileNav role="driver" />
    </div>
  );
}
