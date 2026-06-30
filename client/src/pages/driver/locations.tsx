import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { DriverHeader } from "@/components/DriverHeader";
import { MobileNav } from "@/components/MobileNav";
import { LocationMap } from "@/components/LocationMap";
import { MapPin, Search, Navigation, Clock, Trash2, Package } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getCurrentLocation } from "@/lib/gps";
import { formatAddress } from "@shared/addressUtils";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { FEATURE_FLAGS } from "@shared/featureFlags";
import { resolveLocationDriverTipRateCents } from "@shared/locationBilling";
import { useLanguage } from "@/lib/i18n";
import { DSCard, DSSectionHeader, DSStatusChip } from "@/components/design-system";

export default function DriverLocations() {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"distance" | "rate">("distance");
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);

  // Check if enhanced location creation (Google Maps) is enabled
  const { enabled: isMapEnabled } = useFeatureFlag(FEATURE_FLAGS.ENHANCED_LOCATION_CREATION);
  
  // Check if rubble service is enabled
  const { enabled: isRubbleServiceEnabled } = useFeatureFlag(FEATURE_FLAGS.RUBBLE_SERVICE);

  // Fetch available materials for rubble service
  const { data: materials = [] } = useQuery<any[]>({
    queryKey: ['/api/materials'],
    enabled: isRubbleServiceEnabled,
  });

  const { data: locations, isLoading } = useQuery({
    queryKey: ['/api/drivers/locations'],
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
  const nearbyCount = filteredAndSortedLocations.length;
  const activeMaterials = selectedMaterials.length;
  const gpsStatusLabel = currentLocation
    ? t("driver.locations.approxLocation")
    : t("driver.locations.enableGps");
  const sortLabel = sortBy === "distance" ? t("common.distance") : t("common.rate");

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
        <DSCard padding="md" elevated>
          <div className="space-y-3">
            <DSSectionHeader
              eyebrow={t("driver.locations.availableLocations")}
              title={t("driver.locations.availableLocations")}
              description={t("driver.locations.locationCount", { count: nearbyCount })}
            />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_auto]">
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("driver.locations.searchPlaceholder")}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={sortBy === "distance" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSortBy("distance")}
                    data-testid="button-sort-distance"
                  >
                    <Navigation className="mr-1 h-4 w-4" />
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
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <DSStatusChip tone="info" className="rounded-2xl px-3 py-2 text-sm font-medium">
                  <span className="font-semibold">{nearbyCount}</span>
                  <span className="ml-1">{t("driver.locations.locationCount", { count: nearbyCount })}</span>
                </DSStatusChip>
                <DSStatusChip tone={currentLocation ? "success" : "warning"} className="rounded-2xl px-3 py-2 text-sm font-medium">
                  {gpsStatusLabel}
                </DSStatusChip>
                <DSStatusChip tone="neutral" className="rounded-2xl px-3 py-2 text-sm font-medium">
                  {sortLabel}
                </DSStatusChip>
                {isRubbleServiceEnabled && activeMaterials > 0 && (
                  <DSStatusChip tone="accent" className="rounded-2xl px-3 py-2 text-sm font-medium">
                    {t("driver.locations.materialsSelected", { count: activeMaterials })}
                  </DSStatusChip>
                )}
              </div>
            </div>
          </div>
        </DSCard>

        {/* Material Selection for Rubble Service */}
        {isRubbleServiceEnabled && materials && materials.length > 0 && (
          <DSCard padding="md" elevated>
            <DSSectionHeader
              title={t("driver.locations.dropOffQuestion")}
              description={t("driver.locations.dropOffHelp")}
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {materials.map((material: any) => (
                <label key={material.id} htmlFor={`material-${material.id}`} className="flex cursor-pointer items-start gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2">
                  <Checkbox
                    id={`material-${material.id}`}
                    checked={selectedMaterials.includes(material.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedMaterials([...selectedMaterials, material.id]);
                      } else {
                        setSelectedMaterials(selectedMaterials.filter(id => id !== material.id));
                      }
                    }}
                    data-testid={`checkbox-material-${material.slug}`}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{material.displayName || material.display_name}</div>
                    {material.synonyms && material.synonyms.length > 0 && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {t("driver.locations.examples", { examples: material.synonyms.join(', ') })}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
            {selectedMaterials.length > 0 && (
              <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3 text-sm">
                <span className="text-muted-foreground">
                  {selectedMaterials.length === 1
                    ? t("driver.locations.materialSelected", { count: selectedMaterials.length })
                    : t("driver.locations.materialsSelected", { count: selectedMaterials.length })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedMaterials([])}
                  data-testid="button-clear-materials"
                >
                  {t("driver.locations.clearAll")}
                </Button>
              </div>
            )}
          </DSCard>
        )}

        {/* Location Error Message */}
        {locationError && (
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <p className="text-sm font-medium text-foreground">
              {t("driver.locations.approxLocation")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("driver.locations.enableGps")}
            </p>
          </div>
        )}

        {/* Map View - Only when enhanced location creation is enabled */}
        {isMapEnabled && (
          <Card>
            <CardContent className="p-0">
              <LocationMap 
                locations={filteredAndSortedLocations}
                userLocation={currentLocation}
                height="200px"
              />
            </CardContent>
          </Card>
        )}

        {/* Location List */}
        <div className="space-y-3">
          {filteredAndSortedLocations.length === 0 ? (
            <DSCard padding="lg" elevated>
              <div className="text-center">
                <MapPin className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">{t("driver.locations.noLocationsFound")}</p>
              </div>
            </DSCard>
          ) : (
            filteredAndSortedLocations.map((item: any, index: number) => {
              const location = item.washout_locations || item;
              return (
              <DSCard key={location.id} padding="md" elevated className="overflow-hidden" data-testid={`card-location-${index}`}>
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-base font-semibold tracking-tight text-foreground" data-testid={`text-location-name-${index}`}>
                        {location.name}
                      </h3>
                      <p className="mt-1 break-words text-sm text-muted-foreground" data-testid={`text-location-address-${index}`}>
                        {formatAddress({
                          street: location.street,
                          city: location.city,
                          state: location.state,
                          zip: location.zip
                        })}
                      </p>
                      {(item.owner?.user || location.owner?.user) && (
                        <p className="mt-1 break-words text-xs text-muted-foreground" data-testid={`text-owner-name-${index}`}>
                          {t("driver.locations.ownerName", { name: `${item.owner?.user?.firstName || location.owner?.user?.firstName} ${item.owner?.user?.lastName || location.owner?.user?.lastName}` })}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xl font-semibold tracking-tight text-primary" data-testid={`text-location-rate-${index}`}>
                        {formatCurrency(Number(location.rate))}
                      </div>
                      <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{t("driver.locations.driverPayoutPerWashout")}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {t("driver.locations.driverTip", { amount: formatCurrency(resolveLocationDriverTipRateCents(location.rate) / 100) })}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {currentLocation && item.distance !== undefined && (
                      <div className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-1 text-muted-foreground">
                        <Navigation className="h-4 w-4 shrink-0" />
                        <span data-testid={`text-location-distance-${index}`}>
                          {item.distance.toFixed(1)} mi
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-card px-2.5 py-1 text-emerald-400">
                      <Clock className="h-4 w-4 shrink-0" />
                      <span>{t("driver.locations.open247")}</span>
                    </div>
                  </div>

                  {(location.description || (location.amenities && location.amenities.length > 0)) && (
                    <div className="space-y-2">
                      {location.description && (
                        <p className="text-sm text-muted-foreground" data-testid={`text-location-description-${index}`}>
                          {location.description}
                        </p>
                      )}
                      {location.amenities && location.amenities.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {location.amenities.map((amenity: string, amenityIndex: number) => (
                            <Badge key={amenityIndex} variant="outline" className="text-xs">
                              {amenity}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Materials Accepted - Rubble Service */}
                  {isRubbleServiceEnabled && location.materialIntents && location.materialIntents.length > 0 && (
                    <div className="rounded-2xl border border-border/70 bg-card p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary" />
                        <h4 className="text-sm font-semibold text-foreground">{t("driver.locations.materialsAccepted")}</h4>
                      </div>
                      <div className="space-y-2">
                        {location.materialIntents
                          .filter((intent: any) => intent.active !== false)
                          .map((intent: any, intentIndex: number) => {
                            const material = intent.material;
                            const displayName = material?.displayName || material?.display_name || intent.customLabel || t("driver.locations.customMaterial");
                            const rateCents = intent.rateCents || intent.rate_cents || 0;
                            const unit = intent.unit || 'per_load';
                            const unitDisplay = unit === 'per_load' ? 'per load' : unit === 'per_ton' ? 'per ton' : 'per cubic yard';
                            
                            return (
                              <div key={intentIndex} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm" data-testid={`material-${index}-${intentIndex}`}>
                                <span className="min-w-0 break-words text-foreground">{displayName}</span>
                                <span className="shrink-0 font-semibold text-primary">
                                  {formatCurrency(rateCents / 100)} {unitDisplay}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => setLocation(`/check-in/${location.id}`)}
                      className="h-11 flex-1"
                      data-testid={`button-check-in-${index}`}
                    >
                      <MapPin className="mr-1 h-4 w-4" />
                      {t("driver.locations.checkIn")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const url = `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
                        window.open(url, '_blank');
                      }}
                      className="h-11 px-3"
                      data-testid={`button-directions-${index}`}
                    >
                      <Navigation className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </DSCard>
              );
            })
          )}
        </div>
      </div>

      <MobileNav role="driver" />
    </div>
  );
}
