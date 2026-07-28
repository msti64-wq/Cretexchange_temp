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
import { MapPin, Search, Navigation, Clock, Package } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getCurrentLocation } from "@/lib/gps";
import { formatAddress } from "@shared/addressUtils";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { FEATURE_FLAGS } from "@shared/featureFlags";
import { useLanguage } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";
import { DriverMaterialIntentSelector, driverMaterialIntentKey, type DriverMaterialIntent } from "@/components/driver/DriverMaterialIntentSelector";

export default function DriverLocations() {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"distance" | "rate">("distance");

  // Check if enhanced location creation (Google Maps) is enabled
  const { enabled: isMapEnabled } = useFeatureFlag(FEATURE_FLAGS.ENHANCED_LOCATION_CREATION);
  
  // Check if rubble service is enabled
  const { enabled: isRubbleServiceEnabled } = useFeatureFlag(FEATURE_FLAGS.RUBBLE_SERVICE);

  const { data: materialIntent, isLoading: isIntentLoading } = useQuery<DriverMaterialIntent>({
    queryKey: driverMaterialIntentKey,
    queryFn: async () => (await apiRequest("GET", "/api/drivers/material-intent")).json(),
  });
  const activeMaterialSlug = materialIntent?.materialSlug || null;
  const { data: locations, isLoading, isError, refetch } = useQuery({
    queryKey: ["/api/drivers/locations", activeMaterialSlug],
    queryFn: async () => activeMaterialSlug ? (await apiRequest("GET", `/api/drivers/locations?materialSlug=${encodeURIComponent(activeMaterialSlug)}`)).json() : [],
    enabled: Boolean(activeMaterialSlug),
  });

  useEffect(() => {
    // Get user's current location
    const getLocation = async () => {
      try {
        const coords = await getCurrentLocation();
        setCurrentLocation({ lat: coords.latitude, lng: coords.longitude });
        setLocationError(null);
      } catch (error) {
        console.error("Error getting location:", error);
        const errorMessage = error instanceof Error ? error.message : "Unable to get location";
        setLocationError(errorMessage);
        // Fallback for development: use a default location (Denver, CO area)
        setCurrentLocation({ lat: 39.7392, lng: -104.9903 });
      }
    };

    getLocation();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const hadDarkClass = root.classList.contains("dark");
    root.classList.add("dark");

    return () => {
      if (!hadDarkClass) {
        root.classList.remove("dark");
      }
    };
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

  const filteredAndSortedLocations = Array.isArray(locations) ? locations.filter((item: any) => {
    const location = item.washout_locations || item;
    const searchLower = searchTerm.toLowerCase();
    return (
      (location.name || '').toLowerCase().includes(searchLower) ||
      (location.street || '').toLowerCase().includes(searchLower) ||
      (location.city || '').toLowerCase().includes(searchLower) ||
      (location.state || '').toLowerCase().includes(searchLower) ||
      (location.zip || '').toLowerCase().includes(searchLower)
    );
  }).map((item: any) => {
    const location = item.washout_locations || item;
    return {
      ...item,
      distance: currentLocation ? 
        calculateDistance(
          currentLocation.lat, 
          currentLocation.lng, 
          Number(location.latitude), 
          Number(location.longitude)
        ) : 0
    };
  }).sort((a: any, b: any) => {
    const locationA = a.washout_locations || a;
    const locationB = b.washout_locations || b;
    if (sortBy === "distance") {
      return a.distance - b.distance;
    } else {
      return Number(locationB.rate) - Number(locationA.rate);
    }
  }) : [];

  if (isIntentLoading || (activeMaterialSlug && isLoading)) {
    return (
      <div className="dark min-h-screen bg-background text-foreground">
        <DriverHeader />
        <div className="animate-pulse p-4 space-y-4">
          <div className="h-10 rounded-lg bg-muted/70" />
          <div className="h-48 rounded-lg bg-muted/70" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 rounded-lg bg-muted/70" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dark min-h-screen bg-background pb-20 text-foreground">
      <DriverHeader />
      
      <div className="p-4 space-y-4">
        {/* Search and Filter */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-foreground/70" />
            <Input
              placeholder={t("driver.locations.searchPlaceholder")}
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
              {t("common.distance")}
            </Button>
            <Button 
              variant={sortBy === "rate" ? "default" : "outline"}
              size="sm"
              onClick={() => setSortBy("rate")}
              data-testid="button-sort-rate"
            >
              {t("common.rate")}
            </Button>
          </div>
        </div>

        <DriverMaterialIntentSelector compact />

        {/* Location Error Message */}
        {locationError && (
          <div className="rounded-lg border border-border/70 bg-card/90 p-4">
            <p className="text-sm text-foreground/85">
              {t("driver.locations.approxLocation")}
            </p>
            <p className="mt-1 text-xs text-foreground/65">
              {t("driver.locations.enableGps")}
            </p>
          </div>
        )}

        {/* Map View - Only when enhanced location creation is enabled */}
        {isMapEnabled && (
          <Card className="border-border/70 bg-card/90">
            <CardContent className="p-0">
              <LocationMap 
                locations={filteredAndSortedLocations}
                userLocation={currentLocation}
                height="200px"
              />
            </CardContent>
          </Card>
        )}

        {!activeMaterialSlug ? <Card className="border-border/70 bg-card/90"><CardContent className="py-8 text-center"><Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><p className="font-medium">{t("driver.material.selectionRequired")}</p><p className="mt-1 text-sm text-muted-foreground">{t("driver.material.selectionRequiredHelp")}</p></CardContent></Card> : <>
        {/* Location List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("driver.locations.availableLocations")}</h2>
            <Badge variant="secondary" data-testid="text-location-count">
              {t("driver.locations.locationCount", { count: filteredAndSortedLocations.length })}
            </Badge>
          </div>

          {isError ? (
            <Card className="border-border/70 bg-card/90"><CardContent className="py-8 text-center"><p className="text-foreground/75">{t("driver.locations.loadFailed")}</p><Button className="mt-3" onClick={() => refetch()}>{t("common.retry")}</Button></CardContent></Card>
          ) : filteredAndSortedLocations.length === 0 ? (
            <Card className="border-border/70 bg-card/90">
              <CardContent className="text-center py-8">
                <MapPin className="w-12 h-12 text-foreground/65 mx-auto mb-4" />
                <p className="text-foreground/75">{t("driver.material.noMatchingLocations", { material: materialIntent?.material?.displayName || "" })}</p>
              </CardContent>
            </Card>
          ) : (
            filteredAndSortedLocations.map((item: any, index: number) => {
              const location = item.washout_locations || item;
              return (
              <Card key={location.id} className="border-border/70 bg-card/90 hover:border-border hover:shadow-md transition-shadow" data-testid={`card-location-${index}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-1" data-testid={`text-location-name-${index}`}>
                        {location.name}
                      </h3>
                      <p className="text-foreground/75 text-sm mb-2" data-testid={`text-location-address-${index}`}>
                        {formatAddress({
                          street: location.street,
                          city: location.city,
                          state: location.state,
                          zip: location.zip
                        })}
                      </p>
                      {(item.owner?.user || location.owner?.user) && (
                        <p className="text-xs text-foreground/65 mb-2" data-testid={`text-owner-name-${index}`}>
                          {t("driver.locations.ownerName", { name: `${item.owner?.user?.firstName || location.owner?.user?.firstName} ${item.owner?.user?.lastName || location.owner?.user?.lastName}` })}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm">
                        {currentLocation && item.distance !== undefined && (
                          <div className="flex items-center text-foreground/70">
                            <Navigation className="w-4 h-4 mr-1" />
                            <span data-testid={`text-location-distance-${index}`}>
                              {item.distance.toFixed(1)} mi
                            </span>
                          </div>
                        )}
                        <div className="flex items-center text-green-600">
                          <Clock className="w-4 h-4 mr-1" />
                          <span>{t("driver.locations.open247")}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-accent mb-1" data-testid={`text-location-rate-${index}`}>
                        {formatCurrency(Number(location.rate))}
                      </div>
                      <div className="text-xs text-foreground/65">{t("driver.locations.configuredIncentive")}</div>
                    </div>
                  </div>

                  {location.description && (
                    <p className="text-sm text-foreground/75 mb-3" data-testid={`text-location-description-${index}`}>
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

                  {/* Materials Accepted - Rubble Service */}
                  {isRubbleServiceEnabled && location.materialIntents && location.materialIntents.length > 0 && (
                    <div className="mb-3 rounded-lg border border-border/70 bg-card/80 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Package className="w-4 h-4 text-accent" />
                        <h4 className="text-sm font-semibold">{t("driver.locations.materialsAccepted")}</h4>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {location.materialIntents
                          .filter((intent: any) => intent.active !== false)
                          .map((intent: any, intentIndex: number) => {
                            const material = intent.material;
                            const displayName = material?.displayName || material?.display_name || intent.customLabel || t("driver.locations.customMaterial");
                            const rateCents = intent.rateCents || intent.rate_cents || 0;
                            const unit = intent.unit || 'per_load';
                            const unitDisplay = unit === 'per_load' ? 'per load' : unit === 'per_ton' ? 'per ton' : 'per cubic yard';
                            
                            return (
                              <div key={intentIndex} className="flex items-center justify-between text-sm" data-testid={`material-${index}-${intentIndex}`}>
                                <span className="text-foreground/70">{displayName}</span>
                                <span className="font-semibold text-emerald-500">
                                  {formatCurrency(rateCents / 100)} {unitDisplay}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                  {item.matchedMaterial && <Badge variant="secondary" className="mb-3">{t("driver.material.accepts", { material: item.matchedMaterial.displayName })}</Badge>}
                  <p className="mb-3 text-xs text-muted-foreground">{t("driver.locations.configuredIncentiveQualification")}</p>

                  <div className="flex gap-2">
                    <Button 
                      size="sm"
                      onClick={() => setLocation(`/check-in/${location.id}`)}
                      className="flex-1"
                      data-testid={`button-check-in-${index}`}
                    >
                      <MapPin className="w-4 h-4 mr-1" />
                      {t("driver.locations.checkIn")}
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
              );
            })
          )}
        </div></>}
      </div>

      <MobileNav role="driver" />
    </div>
  );
}
