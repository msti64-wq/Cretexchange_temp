import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
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
import { createDriverLocationAcquirer, GpsAcquisitionError, type GpsAcquisitionFailureReason } from "@/lib/gps";
import { formatAddress } from "@shared/addressUtils";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { FEATURE_FLAGS } from "@shared/featureFlags";
import { useLanguage } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";
import { DriverMaterialIntentSelector, driverMaterialIntentKey, type DriverMaterialIntent } from "@/components/driver/DriverMaterialIntentSelector";
import { DriverGeofenceIndicator } from "@/components/driver/DriverGeofenceIndicator";
import { indexDriverGeofenceResults, type DriverGeofenceDisplayState, type DriverGeofenceResult } from "@/lib/driverGeofenceAdvisory";
import type { Coordinates } from "@/lib/gps";

export default function DriverLocations() {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentLocation, setCurrentLocation] = useState<({ lat: number; lng: number } & Coordinates) | null>(null);
  const [locationResolved, setLocationResolved] = useState(false);
  const [locationError, setLocationError] = useState<GpsAcquisitionFailureReason | null>(null);
  const [locationRefreshing, setLocationRefreshing] = useState(false);
  const [locationRetrying, setLocationRetrying] = useState(false);
  const [locationAttempt, setLocationAttempt] = useState(0);
  const [sortBy, setSortBy] = useState<"distance" | "rate">("distance");
  const locationAcquirer = useRef(createDriverLocationAcquirer());
  const locationRequestGeneration = useRef(0);

  // Check if enhanced location creation (Google Maps) is enabled
  const { enabled: isMapEnabled } = useFeatureFlag(FEATURE_FLAGS.ENHANCED_LOCATION_CREATION);
  
  // Check if rubble service is enabled
  const { enabled: isRubbleServiceEnabled } = useFeatureFlag(FEATURE_FLAGS.RUBBLE_SERVICE);
  const { enabled: isGeofenceAdvisoryEnabled } = useFeatureFlag(FEATURE_FLAGS.GEOFENCE_ADVISORY_EVALUATION);

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
  const locationIds = Array.isArray(locations) ? locations.map((item: any) => (item.washout_locations || item).id as string) : [];
  const { data: geofenceAdvisory, isFetching: geofenceAdvisoryLoading, isError: geofenceAdvisoryError, refetch: refetchGeofenceAdvisory } = useQuery<{ enabled: boolean; complete: boolean; results: DriverGeofenceResult[] }>({
    queryKey: ["/api/drivers/locations/geofence-status", activeMaterialSlug, locationIds.join(","), currentLocation?.observedAt || "unavailable", locationAttempt],
    queryFn: async () => (await apiRequest("/api/drivers/locations/geofence-status", {
      method: "POST",
      body: JSON.stringify({
        locationIds,
        materialSlug: activeMaterialSlug,
        observation: currentLocation ? {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          accuracyMeters: currentLocation.accuracyMeters,
          observedAt: currentLocation.observedAt,
        } : null,
      }),
    })).json(),
    enabled: Boolean(isGeofenceAdvisoryEnabled && activeMaterialSlug && locationResolved && locationIds.length),
    staleTime: 30_000,
    retry: false,
  });
  const indexedGeofenceResults = indexDriverGeofenceResults(locationIds, geofenceAdvisory?.results);

  const refreshCurrentLocation = async ({ fresh = false }: { fresh?: boolean } = {}) => {
    const requestGeneration = ++locationRequestGeneration.current;
    setLocationRefreshing(true);
    setLocationRetrying(fresh);
    setLocationResolved(false);
    setLocationError(null);
    setCurrentLocation(null);
    try {
      const coords = await locationAcquirer.current.acquire({ fresh });
      if (requestGeneration !== locationRequestGeneration.current) return;
      setCurrentLocation({ lat: coords.latitude, lng: coords.longitude, ...coords });
    } catch (error) {
      if (requestGeneration !== locationRequestGeneration.current) return;
      setLocationError(error instanceof GpsAcquisitionError ? error.reason : "unavailable");
    } finally {
      if (requestGeneration !== locationRequestGeneration.current) return;
      setLocationAttempt((value) => value + 1);
      setLocationResolved(true);
      setLocationRefreshing(false);
      setLocationRetrying(false);
    }
  };

  useEffect(() => {
    void refreshCurrentLocation();
    return () => {
      locationRequestGeneration.current += 1;
      locationAcquirer.current.cancel();
    };
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
              {locationError === "permission_denied"
                ? t("pilot.gps.permissionDenied")
                : locationError === "timeout"
                  ? t("pilot.gps.timeout")
                  : t("pilot.gps.unavailable")}
            </p>
            <p className="mt-1 text-xs text-foreground/65">
              {t("driver.locations.enableGps")}
            </p>
            <Button type="button" variant="outline" size="sm" className="mt-3 min-h-11" onClick={() => void refreshCurrentLocation({ fresh: true })} disabled={locationRefreshing} data-testid="button-retry-facility-gps">
              <Navigation className="mr-2 h-4 w-4" />
              {locationRefreshing ? t("geofence.driver.improving") : t("geofence.driver.retryGps")}
            </Button>
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t("driver.locations.availableLocations")}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {isGeofenceAdvisoryEnabled && (
                <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => void refreshCurrentLocation({ fresh: true })} disabled={locationRefreshing} data-testid="button-refresh-facility-advisory">
                  <Navigation className="mr-1 h-4 w-4" />
                  {locationRefreshing ? t("geofence.driver.improving") : t("geofence.driver.retryGps")}
                </Button>
              )}
              <Badge variant="secondary" data-testid="text-location-count">
                {t("driver.locations.locationCount", { count: filteredAndSortedLocations.length })}
              </Badge>
            </div>
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
              const geofenceResult = indexedGeofenceResults.byLocation.get(location.id);
              const geofenceDisplayState: DriverGeofenceDisplayState = geofenceAdvisoryError
                ? "ADVISORY_REQUEST_FAILED"
                : geofenceResult?.state || "ADVISORY_RESULT_MISSING";
              const geofenceNeedsGpsRetry = geofenceResult?.state === "LOCATION_UNAVAILABLE" || geofenceResult?.state === "LOCATION_ACCURACY_INSUFFICIENT";
              const geofenceNeedsStatusRetry = geofenceAdvisoryError || !geofenceResult;
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
                  {isGeofenceAdvisoryEnabled && locationRetrying && (
                    <div className="mb-3 flex min-h-11 items-center gap-2 rounded-lg border border-slate-500/60 bg-slate-900/40 px-3 py-2 text-sm text-slate-100" role="status" aria-label={t("geofence.driver.improving")} data-testid="driver-geofence-gps-improving">
                      <Navigation className="h-5 w-5 animate-pulse" aria-hidden="true" />
                      <span>{t("geofence.driver.improving")}</span>
                    </div>
                  )}
                  {isGeofenceAdvisoryEnabled && !locationRetrying && geofenceAdvisoryLoading && (
                    <div className="mb-3 flex min-h-11 items-center gap-2 rounded-lg border border-slate-500/60 bg-slate-900/40 px-3 py-2 text-sm text-slate-100" role="status" aria-label={t("geofence.driver.checking")} data-testid="driver-geofence-status-loading">
                      <Navigation className="h-5 w-5 animate-pulse" aria-hidden="true" />
                      <span>{t("geofence.driver.checking")}</span>
                    </div>
                  )}
                  {isGeofenceAdvisoryEnabled && !locationRetrying && !geofenceAdvisoryLoading && locationResolved && (
                    <div data-testid={`driver-geofence-advisory-${index}`}>
                      <DriverGeofenceIndicator state={geofenceDisplayState} reasonCode={geofenceResult?.reasonCode} />
                      {geofenceNeedsGpsRetry && (
                        <Button type="button" variant="outline" size="sm" className="mb-3 min-h-11" onClick={() => void refreshCurrentLocation({ fresh: true })} disabled={locationRefreshing} data-testid={`button-retry-facility-gps-${index}`}>
                          <Navigation className="mr-2 h-4 w-4" />
                          {locationRefreshing ? t("geofence.driver.improving") : t("geofence.driver.retryGps")}
                        </Button>
                      )}
                      {geofenceNeedsStatusRetry && (
                        <Button type="button" variant="outline" size="sm" className="mb-3 min-h-11" onClick={() => void refetchGeofenceAdvisory()} data-testid={`button-retry-facility-status-${index}`}>
                          <Navigation className="mr-2 h-4 w-4" />
                          {t("geofence.driver.retryStatus")}
                        </Button>
                      )}
                    </div>
                  )}
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
