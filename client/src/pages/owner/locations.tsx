import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
import { Building2, Plus, MapPin, Eye, EyeOff, Trash2, CheckCircle, XCircle, Settings, DollarSign, Pencil, Check, X, Activity, Radius } from "lucide-react";
import { BrandHeaderLogo } from "@/components/BrandHeaderLogo";
import { formatCentsToDollars, formatCurrency } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatAddress } from "@shared/addressUtils";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { useAuth } from "@/hooks/useAuth";
import { resolveOwnerLocationAccessState } from "@shared/ownerLocationAccess";
import { resolveLocationDriverTipRateCents } from "@shared/locationBilling";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLanguage } from "@/lib/i18n";
import { FacilityMaterialsManager } from "@/components/owner/FacilityMaterialsManager";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { FEATURE_FLAGS } from "@shared/featureFlags";

export default function OwnerLocations() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [, navigate] = useLocation();
  const { enabled: geofenceManagementEnabled } = useFeatureFlag(FEATURE_FLAGS.GEOFENCE_OWNER_BOUNDARY_MANAGEMENT);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<any>(null);
  const [locationToEdit, setLocationToEdit] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAddressVerified, setIsAddressVerified] = useState(false);
  
  // Inline rate editing state
  const [editingRateLocationId, setEditingRateLocationId] = useState<string | null>(null);
  const [editingRateValue, setEditingRateValue] = useState("");

  // Form state - MUST be declared before callbacks that use setFormData
  const [formData, setFormData] = useState({
    name: "",
    street: "",
    city: "",
    state: "",
    zip: "",
    latitude: "",
    longitude: "",
    rate: "5.00",
    operatingHours: "",
    amenities: "",
  });

  const [editFormData, setEditFormData] = useState({
    name: "",
    street: "",
    city: "",
    state: "",
    zip: "",
    rate: "5.00",
    operatingHours: "",
    amenities: "",
    description: "",
  });

  // Stable callbacks for Mapbox autocomplete to prevent stale verified state
  const handlePlaceSelected = useCallback((place: {
    formattedAddress: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    latitude?: number;
    longitude?: number;
  }) => {
    setFormData((prev) => ({
      ...prev,
      street: place.street,
      city: place.city,
      state: place.state,
      zip: place.zip,
      latitude: place.latitude?.toString() || "",
      longitude: place.longitude?.toString() || "",
    }));
    setIsAddressVerified(true);
  }, []);

  const handleAddressInputChange = useCallback(() => {
    setIsAddressVerified(false);
    setFormData((prev) => ({
      ...prev,
      latitude: "",
      longitude: "",
    }));
  }, []);

  const canSubmitLocation = isAddressVerified && !!formData.latitude && !!formData.longitude;

  const updateAddressField = useCallback((field: "street" | "city" | "state" | "zip", value: string) => {
    setIsAddressVerified(false);
    setFormData((prev) => ({
      ...prev,
      [field]: value,
      latitude: "",
      longitude: "",
    }));
  }, []);

  const parseApiError = useCallback((error: unknown) => {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const payloadMatch = rawMessage.match(/^\d+:\s*([\s\S]*)$/);
    const payload = payloadMatch?.[1] ?? rawMessage;

    try {
      const parsed = JSON.parse(payload);
      if (parsed && typeof parsed.message === "string") {
        if (Array.isArray(parsed.missingFieldLabels) && parsed.missingFieldLabels.length > 0) {
          return `${parsed.message}\nMissing: ${parsed.missingFieldLabels.join(", ")}`;
        }
        return parsed.message;
      }
    } catch {
      // Fall through to the raw payload.
    }

    return payload;
  }, []);

  const ownerRecord = (user as any)?.roleData || {};
  const locationAccessState = resolveOwnerLocationAccessState(ownerRecord, user as any);

  const { data: locations, isLoading, isError: isLocationsError } = useQuery<any[]>({
    queryKey: ['/api/owners/locations'],
    enabled: locationAccessState.canManageLocations,
  });

  const {
    data: ownerActivities,
    isLoading: isOwnerActivitiesLoading,
    isError: isOwnerActivitiesError,
  } = useQuery<any[]>({
    queryKey: ['/api/owners/activities?dateRange=all'],
    refetchInterval: 30000,
    enabled: locationAccessState.canManageLocations,
  });
  const ownerLocationRows = Array.isArray(locations) ? locations : [];
  const ownerActivityRows = Array.isArray(ownerActivities) ? ownerActivities : [];

  const locationActivitySummary = ownerLocationRows.map((location: any) => {
    const activityRows = ownerActivityRows.filter((activity: any) => String(activity?.location?.id ?? activity?.locationId ?? "") === String(location.id));
    const driverVisitCounts = activityRows.reduce<Record<string, number>>((acc, activity: any) => {
      const driverKey = activity?.driver?.user?.id ?? activity?.driver?.id ?? activity?.driverId;
      if (!driverKey) return acc;
      acc[driverKey] = (acc[driverKey] || 0) + 1;
      return acc;
    }, {});
    const recentWindowStart = new Date();
    recentWindowStart.setDate(recentWindowStart.getDate() - 7);
    const recentActivityRows = activityRows.filter((activity: any) => {
      const activityDate = new Date(activity?.checkInTime ?? activity?.createdAt ?? 0);
      return !Number.isNaN(activityDate.getTime()) && activityDate >= recentWindowStart;
    });
    return {
      location,
      activityCount: activityRows.length,
      recentActivityCount: recentActivityRows.length,
      uniqueDriverCount: Object.keys(driverVisitCounts).length,
      repeatDriverCount: Object.values(driverVisitCounts).filter((count) => count > 1).length,
      recentActivityPresent: recentActivityRows.length > 0,
    };
  });

  const activeLocationCount = ownerLocationRows.filter((location: any) => location?.isActive).length;
  const visibleLocationCount = ownerLocationRows.filter((location: any) => location?.isVisible).length;
  const configuredIncentiveRates = ownerLocationRows
    .map((location: any) => {
      if (location?.rate === null || location?.rate === undefined || location?.rate === "") {
        return null;
      }
      const resolved = resolveLocationDriverTipRateCents(location?.rate);
      return Number.isFinite(resolved) ? resolved : null;
    })
    .filter((value): value is number => value !== null);
  const averageConfiguredIncentiveCents = configuredIncentiveRates.length > 0
    ? Math.round(configuredIncentiveRates.reduce((sum: number, value) => sum + value, 0) / configuredIncentiveRates.length)
    : null;
  const topLocationCandidate = [...locationActivitySummary].sort((a, b) => b.activityCount - a.activityCount)[0] || null;
  const topLocationByActivity = topLocationCandidate && topLocationCandidate.activityCount > 0
    ? topLocationCandidate
    : null;
  const locationsWithRecentActivity = locationActivitySummary.filter((entry) => entry.recentActivityPresent).length;
  const ownerLocationIntelligenceEmpty = locationAccessState.canManageLocations
    && !isLocationsError
    && !isOwnerActivitiesError
    && !isOwnerActivitiesLoading
    && !ownerLocationRows.length
    && !ownerActivityRows.length;

  const addLocationMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/owners/locations", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t("owner.locations.locationAdded"),
        description: t("owner.locations.locationAddedDescription"),
      });
      setIsAddDialogOpen(false);
      setIsAddressVerified(false);
      setFormData({
        name: "",
        street: "",
        city: "",
        state: "",
        zip: "",
        latitude: "",
        longitude: "",
        rate: "5.00",
        operatingHours: "",
        amenities: "",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/locations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
      refreshDriverLocations();
    },
    onError: (error) => {
      const message = parseApiError(error);
      toast({
        title: t("owner.locations.failedToAdd"),
        description: message,
        variant: "destructive",
      });
    },
  });


  const updateLocationMutation = useMutation({
    mutationFn: async ({ locationId, locationData }: { locationId: string; locationData: any }) => {
      const response = await apiRequest("PUT", `/api/owners/locations/${locationId}`, locationData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t("owner.locations.locationUpdated"),
        description: t("owner.locations.locationUpdatedDescription"),
      });
      setIsEditDialogOpen(false);
      setLocationToEdit(null);
      queryClient.invalidateQueries({ queryKey: ['/api/owners/locations'] });
      refreshDriverLocations();
    },
    onError: (error) => {
      toast({
        title: t("owner.locations.failedToUpdate"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ locationId, isActive }: { locationId: string; isActive: boolean }) => {
      const response = await apiRequest("PUT", `/api/owners/locations/${locationId}/status`, { isActive });
      return response.json();
    },
    onSuccess: (_, variables) => {
      toast({
        title: t("owner.locations.statusUpdated"),
        description: t("owner.locations.statusDescription", {
          status: variables.isActive ? t("common.active").toLowerCase() : t("owner.billing.inactive").toLowerCase(),
        }),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/locations'] });
    },
    onError: (error) => {
      toast({
        title: t("owner.locations.failedToUpdateStatus"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateRateMutation = useMutation({
    mutationFn: async ({ locationId, rate }: { locationId: string; rate: number }) => {
      const response = await apiRequest("PUT", `/api/owners/locations/${locationId}/rate`, { rate });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t("owner.locations.rateUpdated"),
        description: t("owner.locations.rateUpdatedDescription"),
      });
      setEditingRateLocationId(null);
      setEditingRateValue("");
      queryClient.invalidateQueries({ queryKey: ['/api/owners/locations'] });
      refreshDriverLocations();
    },
    onError: (error) => {
      toast({
        title: t("owner.locations.failedToUpdateRate"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleStartEditRate = (location: any) => {
    setEditingRateLocationId(location.id);
    setEditingRateValue(location.rate?.toString() || "0.00");
  };

  const handleSaveRate = (locationId: string) => {
    const rate = parseFloat(editingRateValue);
    if (isNaN(rate) || rate < 0) {
      toast({
        title: t("owner.locations.invalidRate"),
        description: t("owner.locations.invalidRateDescription"),
        variant: "destructive",
      });
      return;
    }
    updateRateMutation.mutate({ locationId, rate });
  };

  const handleCancelEditRate = () => {
    setEditingRateLocationId(null);
    setEditingRateValue("");
  };

  const deleteLocationMutation = useMutation({
    mutationFn: async (locationId: string) => {
      const response = await apiRequest("DELETE", `/api/owners/locations/${locationId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t("owner.locations.locationDeleted"),
        description: t("owner.locations.locationDeletedDescription"),
      });
      setLocationToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['/api/owners/locations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
    },
    onError: (error) => {
      toast({
        title: t("owner.locations.failedToDelete"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!isAddressVerified || !formData.latitude || !formData.longitude) {
      toast({
        title: t("owner.locations.addressVerificationRequired"),
        description: t("owner.locations.selectValidAddress"),
        variant: "destructive",
      });
      return;
    }
    
    const amenitiesArray = formData.amenities
      .split(',')
      .map(a => a.trim())
      .filter(a => a.length > 0);

    addLocationMutation.mutate({
      ...formData,
      rate: parseFloat(formData.rate),
      amenities: amenitiesArray,
    });
  };


  const handleEditLocation = async (location: any) => {
    setLocationToEdit(location);
    setEditFormData({
      name: location.name || "",
      street: location.street || "",
      city: location.city || "",
      state: location.state || "",
      zip: location.zip || "",
      rate: location.rate?.toString() || "5.00",
      operatingHours: location.operatingHours || "",
      amenities: location.amenities?.join(", ") || "",
      description: location.description || "",
    });
    
    setIsEditDialogOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!locationToEdit) return;

    const amenitiesArray = editFormData.amenities
      .split(',')
      .map(a => a.trim())
      .filter(a => a.length > 0);

    // Update location data
    updateLocationMutation.mutate({
      locationId: locationToEdit.id,
      locationData: {
        ...editFormData,
        rate: parseFloat(editFormData.rate),
        amenities: amenitiesArray,
      }
    });
    
  };

  const handleToggleStatus = (locationId: string, currentStatus: boolean) => {
    toggleStatusMutation.mutate({ locationId, isActive: !currentStatus });
  };

  const refreshDriverLocations = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/drivers/locations'] });
    void queryClient.refetchQueries({ queryKey: ['/api/drivers/locations'] });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="animate-pulse space-y-4 p-4">
          <div className="h-20 bg-muted rounded-lg" />
          <div className="h-32 bg-muted rounded-lg" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
        <MobileNav role="owner" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="gradient-bg text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <BrandHeaderLogo alt="CreteXchange" size="compact" />
            <div>
              <h1 className="font-semibold text-lg">{t("owner.locations.myLocations")}</h1>
              <p className="text-white/80 text-sm">{t("owner.locations.manageWashoutSites")}</p>
            </div>
          </div>
          <LanguageToggle />
          <Dialog
            open={isAddDialogOpen}
            onOpenChange={(open) => {
              setIsAddDialogOpen(open);
              if (!open) {
                setIsAddressVerified(false);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button 
                variant="secondary" 
                size="sm" 
                data-testid="button-add-location" 
                className="bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-400 disabled:cursor-not-allowed"
                disabled={!locationAccessState.canManageLocations}
                title={!locationAccessState.canManageLocations
                  ? locationAccessState.blockingMessage || t("owner.dashboard.accountPendingReview")
                  : ""}
                onClick={() => {
                  if (!locationAccessState.canManageLocations) {
                    toast({
                      title: t("owner.locations.accountReviewRequired"),
                      description: locationAccessState.blockingMessage || t("owner.dashboard.accountPendingReview"),
                      variant: "destructive",
                    });
                  }
                }}
              >
                <Plus className="w-4 h-4 mr-1" />
                {t("owner.locations.addLocation")}
              </Button>
            </DialogTrigger>
            <DialogContent className="w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("owner.locations.addNewLocation")}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <AddressAutocomplete
                  onPlaceSelected={handlePlaceSelected}
                  onInputChange={handleAddressInputChange}
                />

                <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
                  <p className="text-sm font-medium">{t("owner.locations.locationDetails")}</p>
                  {!canSubmitLocation && (
                    <p className="text-xs text-muted-foreground">
                      {t("owner.locations.selectValidAddress")}
                    </p>
                  )}
                  <div>
                    <Label htmlFor="name">{t("owner.locations.locationName")}</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      required
                      data-testid="input-location-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="street">{t("owner.locations.streetAddress")}</Label>
                    <Input
                      id="street"
                      value={formData.street}
                      onChange={(e) => updateAddressField("street", e.target.value)}
                      placeholder={t("owner.locations.autoFilled")}
                      required
                      data-testid="input-street"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="city">{t("common.city")}</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => updateAddressField("city", e.target.value)}
                        required
                        data-testid="input-city"
                      />
                    </div>
                    <div>
                      <Label htmlFor="state">{t("common.state")}</Label>
                      <Input
                        id="state"
                        value={formData.state}
                        onChange={(e) => updateAddressField("state", e.target.value)}
                        maxLength={2}
                        required
                        data-testid="input-state"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="zip">{t("common.zipCode")}</Label>
                    <Input
                      id="zip"
                      value={formData.zip}
                      onChange={(e) => updateAddressField("zip", e.target.value)}
                      maxLength={10}
                      required
                      data-testid="input-zip"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="rate">Driver Incentive</Label>
                  <Input
                    id="rate"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.rate}
                    onChange={(e) => setFormData({...formData, rate: e.target.value})}
                    required
                    data-testid="input-rate"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    This value is stored in `washout_locations.rate` and shown to drivers.
                  </p>
                </div>

                <div>
                  <Label htmlFor="operatingHours">{t("owner.locations.hoursOptional")}</Label>
                  <Textarea
                    id="operatingHours"
                    placeholder={t("owner.locations.hoursPlaceholder")}
                    value={formData.operatingHours}
                    onChange={(e) => setFormData({...formData, operatingHours: e.target.value})}
                    data-testid="textarea-operating-hours"
                  />
                </div>

                <div>
                  <Label htmlFor="amenities">{t("owner.locations.amenities")}</Label>
                  <Input
                    id="amenities"
                    placeholder={t("owner.locations.amenitiesPlaceholder")}
                    value={formData.amenities}
                    onChange={(e) => setFormData({...formData, amenities: e.target.value})}
                    data-testid="input-amenities"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={addLocationMutation.isPending || !canSubmitLocation}
                  data-testid="button-submit-location"
                >
                  {addLocationMutation.isPending ? t("common.creating") : t("owner.locations.createLocation")}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {/* Comprehensive Edit Location Dialog */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("owner.locations.editLocation")}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="edit-name">{t("owner.locations.locationName")}</Label>
                  <Input
                    id="edit-name"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                    required
                    data-testid="input-edit-location-name"
                  />
                </div>
                
                <div>
                  <Label htmlFor="edit-street">{t("owner.locations.streetAddress")}</Label>
                  <Input
                    id="edit-street"
                    value={editFormData.street}
                    onChange={(e) => setEditFormData({...editFormData, street: e.target.value})}
                    placeholder="123 Main Street"
                    required
                    data-testid="input-edit-street"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-city">{t("common.city")}</Label>
                    <Input
                      id="edit-city"
                      value={editFormData.city}
                      onChange={(e) => setEditFormData({...editFormData, city: e.target.value})}
                      placeholder="Austin"
                      required
                      data-testid="input-edit-city"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-state">{t("common.state")}</Label>
                    <Input
                      id="edit-state"
                      value={editFormData.state}
                      onChange={(e) => setEditFormData({...editFormData, state: e.target.value})}
                      placeholder="TX"
                      maxLength={2}
                      required
                      data-testid="input-edit-state"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="edit-zip">{t("common.zipCode")}</Label>
                  <Input
                    id="edit-zip"
                    value={editFormData.zip}
                    onChange={(e) => setEditFormData({...editFormData, zip: e.target.value})}
                    placeholder="78701"
                    maxLength={10}
                    required
                    data-testid="input-edit-zip"
                  />
                </div>

                <div>
                  <Label htmlFor="edit-rate">Driver Incentive</Label>
                  <Input
                    id="edit-rate"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editFormData.rate}
                    onChange={(e) => setEditFormData({...editFormData, rate: e.target.value})}
                    required
                    data-testid="input-edit-rate"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    This value is stored in `washout_locations.rate` and shown to drivers.
                  </p>
                </div>

                <div>
                  <Label htmlFor="edit-description">{t("common.description")}</Label>
                  <Textarea
                    id="edit-description"
                    placeholder="Brief description of your location"
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({...editFormData, description: e.target.value})}
                    data-testid="textarea-edit-description"
                  />
                </div>

                <div>
                  <Label htmlFor="edit-operatingHours">{t("owner.locations.hoursOptional")}</Label>
                  <Textarea
                    id="edit-operatingHours"
                    placeholder="e.g. Mon-Fri 8AM-5PM, Sat-Sun 9AM-3PM"
                    value={editFormData.operatingHours}
                    onChange={(e) => setEditFormData({...editFormData, operatingHours: e.target.value})}
                    data-testid="textarea-edit-operating-hours"
                  />
                </div>

                <div>
                  <Label htmlFor="edit-amenities">{t("owner.locations.amenities")}</Label>
                  <Input
                    id="edit-amenities"
                    placeholder={t("owner.locations.amenitiesPlaceholder")}
                    value={editFormData.amenities}
                    onChange={(e) => setEditFormData({...editFormData, amenities: e.target.value})}
                    data-testid="input-edit-amenities"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setIsEditDialogOpen(false)}
                    data-testid="button-cancel-edit"
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={updateLocationMutation.isPending}
                    data-testid="button-submit-edit"
                  >
                    {updateLocationMutation.isPending ? t("common.saving") : t("owner.locations.updateLocation")}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {!locationAccessState.canManageLocations && locationAccessState.blockingMessage && (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm dark:border-sky-900/40 dark:bg-sky-950/20">
            <p className="text-sm text-sky-800 dark:text-sky-200">{locationAccessState.blockingMessage}</p>
            {locationAccessState.missingProfileFieldLabels.length > 0 && (
              <p className="mt-2 text-xs text-sky-700 dark:text-sky-300">
                Missing profile fields: {locationAccessState.missingProfileFieldLabels.join(", ")}
              </p>
            )}
          </div>
        )}

        {locationAccessState.canManageLocations && !isLocationsError && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">{t("owner.locations.intelligence")}</h2>
                <p className="text-sm text-muted-foreground">{t("owner.locations.intelligenceDescription")}</p>
              </div>
              <Badge variant="outline" className="text-xs uppercase tracking-[0.14em]">
                Existing data only
              </Badge>
            </div>

            {ownerLocationIntelligenceEmpty ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                  <Activity className="h-10 w-10 text-muted-foreground" />
                  <div className="space-y-1">
                    <p className="font-semibold">{t("owner.locations.noIntelligence")}</p>
                    <p className="max-w-lg text-sm text-muted-foreground">
                      Add locations and capture activity to surface activity totals, driver attraction, repeat drivers, incentive averages, and engagement indicators.
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                    Review locations
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {isOwnerActivitiesError && (
                  <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
                    <div>
                      <p className="text-sm font-semibold">{t("owner.locations.activityUnavailable")}</p>
                      <p className="text-xs opacity-80">Location configuration remains available; activity-derived metrics are shown as unavailable.</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void queryClient.refetchQueries({ queryKey: ['/api/owners/activities?dateRange=all'] })}
                    >
                      Retry activity
                    </Button>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard title={t("owner.locations.status")} className="text-center">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-2xl font-bold text-green-600" data-testid="text-active-locations">
                          {activeLocationCount}
                        </div>
                        <div className="text-xs text-muted-foreground">Active</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-primary" data-testid="text-visible-locations">
                          {visibleLocationCount}
                        </div>
                        <div className="text-xs text-muted-foreground">Visible</div>
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground" data-testid="text-total-locations">
                      {`${ownerLocationRows.length} total locations`}
                    </div>
                  </StatCard>

                  <StatCard title={t("owner.locations.topLocation")} className="text-center">
                    <div className="truncate text-lg font-bold text-primary" data-testid="text-top-location">
                      {isOwnerActivitiesLoading ? "Loading…" : isOwnerActivitiesError ? "—" : topLocationByActivity?.location?.name || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {isOwnerActivitiesLoading
                        ? "Loading activity-derived ranking"
                        : isOwnerActivitiesError
                          ? "Activity-derived ranking unavailable"
                          : topLocationByActivity
                            ? `${topLocationByActivity.activityCount} activity-derived visit${topLocationByActivity.activityCount === 1 ? "" : "s"}`
                            : "No activity-derived visits yet"}
                    </div>
                  </StatCard>

                  <StatCard title={t("owner.locations.averageIncentive")} className="text-center">
                    <div className="text-2xl font-bold text-accent" data-testid="text-average-incentive">
                      {averageConfiguredIncentiveCents !== null ? formatCentsToDollars(averageConfiguredIncentiveCents) : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {configuredIncentiveRates.length > 0 ? "Average configured incentive" : "No configured rates yet"}
                    </div>
                  </StatCard>

                  <StatCard title={t("owner.locations.recentActivity")} className="text-center">
                    <div className="text-2xl font-bold text-secondary" data-testid="text-recent-location-activity">
                      {isOwnerActivitiesLoading ? "…" : isOwnerActivitiesError ? "—" : locationsWithRecentActivity}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {isOwnerActivitiesLoading
                        ? "Loading activity-derived recency"
                        : isOwnerActivitiesError
                          ? "Activity-derived recency unavailable"
                          : "Locations with activity-derived visits in the last 7 days"}
                    </div>
                  </StatCard>
                </div>
              </>
            )}
          </section>
        )}

        {/* Location List */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center">
            <MapPin className="w-5 h-5 mr-2" />
            {t("owner.locations.myLocations")}
          </h2>

          {isLocationsError ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                <Building2 className="h-12 w-12 text-muted-foreground" />
                <div className="space-y-1">
                  <p className="font-semibold">Unable to load locations</p>
                  <p className="text-sm text-muted-foreground">Retry to restore the existing location management workflows.</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => void queryClient.refetchQueries({ queryKey: ['/api/owners/locations'] })}
                >
                  Retry locations
                </Button>
              </CardContent>
            </Card>
          ) : !Array.isArray(locations) || locations.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">{t("owner.locations.noLocationsYet")}</p>
                <Button
                  onClick={() => setIsAddDialogOpen(true)}
                  disabled={!locationAccessState.canManageLocations}
                  data-testid="button-add-first-location"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t("owner.locations.addFirstLocation")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            Array.isArray(locations) ? locations.map((location: any, index: number) => {
              const activitySummary = locationActivitySummary.find((entry) => String(entry.location.id) === String(location.id));
              const configuredDriverIncentiveCents = location?.rate !== null && location?.rate !== undefined && location?.rate !== ""
                ? resolveLocationDriverTipRateCents(location.rate)
                : null;
              const activityMetricValue = (value: number) => {
                if (isOwnerActivitiesLoading) return "…";
                if (isOwnerActivitiesError) return "—";
                return value;
              };
              const recentActivityBadge = isOwnerActivitiesLoading
                ? "Loading activity"
                : isOwnerActivitiesError
                  ? "Activity unavailable"
                  : activitySummary?.recentActivityPresent
                    ? "Recent activity"
                    : "No recent activity";
              return (
              <Card key={location.id} className="hover:shadow-md transition-shadow" data-testid={`card-location-${index}`}>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-lg" data-testid={`text-location-name-${index}`}>
                            {location.name}
                          </h3>
                          <Badge variant={location.isActive ? "default" : "secondary"}>
                            {location.isActive ? (
                              <>
                                <CheckCircle className="mr-1 h-3 w-3" />
                                {t("common.active")}
                              </>
                            ) : (
                              <>
                                <XCircle className="mr-1 h-3 w-3" />
                                {t("owner.billing.inactive")}
                              </>
                            )}
                          </Badge>
                          <Badge variant={location.isVisible ? "default" : "secondary"}>
                            {location.isVisible ? (
                              <>
                                <Eye className="w-3 h-3 mr-1" />
                                {t("owner.locations.visible")}
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-3 h-3 mr-1" />
                                {t("owner.locations.hidden")}
                              </>
                            )}
                          </Badge>
                          <Badge
                            variant={activitySummary?.recentActivityPresent && !isOwnerActivitiesLoading && !isOwnerActivitiesError ? "default" : "secondary"}
                            data-testid={`status-location-recent-activity-${index}`}
                          >
                            <Activity className="mr-1 h-3 w-3" />
                            {recentActivityBadge}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground" data-testid={`text-location-address-${index}`}>
                          {formatAddress({
                            street: location.street,
                            city: location.city,
                            state: location.state,
                            zip: location.zip
                          })}
                        </p>
                        {location.description && (
                          <p className="text-sm text-muted-foreground mt-1" data-testid={`text-location-description-${index}`}>
                            {location.description}
                          </p>
                        )}
                        <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
                          <div className="rounded-xl border border-border bg-muted/20 px-3 py-2">
                            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{t("owner.locations.activity")}</div>
                            <div className="mt-1 text-base font-semibold" data-testid={`text-location-activity-count-${index}`}>
                              {activityMetricValue(activitySummary?.activityCount ?? 0)}
                            </div>
                            <div className="text-xs text-muted-foreground">Activity-derived total</div>
                          </div>
                          <div className="rounded-xl border border-border bg-muted/20 px-3 py-2">
                            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Recent</div>
                            <div className="mt-1 text-base font-semibold" data-testid={`text-location-recent-activity-count-${index}`}>
                              {activityMetricValue(activitySummary?.recentActivityCount ?? 0)}
                            </div>
                            <div className="text-xs text-muted-foreground">Activity-derived · last 7 days</div>
                          </div>
                          <div className="rounded-xl border border-border bg-muted/20 px-3 py-2">
                            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{t("owner.locations.uniqueDrivers")}</div>
                            <div className="mt-1 text-base font-semibold" data-testid={`text-location-unique-drivers-${index}`}>
                              {activityMetricValue(activitySummary?.uniqueDriverCount ?? 0)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <div data-testid={`text-location-repeat-drivers-${index}`}>
                                {isOwnerActivitiesLoading
                                  ? "Loading repeat drivers"
                                  : isOwnerActivitiesError
                                    ? "Repeat drivers unavailable"
                                    : `Repeat drivers: ${activitySummary?.repeatDriverCount ?? 0}`}
                              </div>
                              <div>Activity-derived</div>
                            </div>
                          </div>
                          <div className="rounded-xl border border-border bg-muted/20 px-3 py-2">
                            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Incentive</div>
                            <div className="mt-1 text-base font-semibold">
                              {configuredDriverIncentiveCents !== null ? formatCentsToDollars(configuredDriverIncentiveCents) : "—"}
                            </div>
                            <div className="text-xs text-muted-foreground">{t("owner.locations.configuredRate")}</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="w-full lg:w-auto lg:text-right">
                        {editingRateLocationId === location.id ? (
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={editingRateValue}
                                onChange={(e) => setEditingRateValue(e.target.value)}
                                className="w-24 pl-7 h-9 text-right"
                                autoFocus
                                data-testid={`input-edit-rate-inline-${index}`}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveRate(location.id);
                                  if (e.key === 'Escape') handleCancelEditRate();
                                }}
                              />
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => handleSaveRate(location.id)}
                              disabled={updateRateMutation.isPending}
                              data-testid={`button-save-rate-${index}`}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={handleCancelEditRate}
                              data-testid={`button-cancel-rate-${index}`}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <div 
                            className="group cursor-pointer"
                            onClick={() => handleStartEditRate(location)}
                            data-testid={`clickable-rate-${index}`}
                          >
                            <div className="flex items-center gap-1 lg:justify-end">
                              <div className="text-xl font-bold text-accent" data-testid={`text-location-rate-${index}`}>
                                {formatCurrency(Number(location.rate))}
                              </div>
                              <Pencil className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="text-xs text-muted-foreground">Driver Incentive. Click to edit.</div>
                            <div className="text-xs text-muted-foreground">
                              {t("driver.locations.driverTip", { amount: formatCentsToDollars(resolveLocationDriverTipRateCents(location.rate)) })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {t("owner.locations.inactiveHelp")}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-1">
                          <div className="flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant={location.isActive ? "default" : "secondary"}
                              onClick={() => handleToggleStatus(location.id, location.isActive)}
                              disabled={toggleStatusMutation.isPending}
                              className={location.isActive ? "bg-green-500 hover:bg-green-600" : "bg-gray-500 hover:bg-gray-600"}
                              data-testid={`button-toggle-status-${index}`}
                            >
                              {location.isActive ? (
                                <>
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  {t("common.active")}
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-3 h-3 mr-1" />
                                  {t("owner.billing.inactive")}
                                </>
                              )}
                            </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditLocation(location)}
                            data-testid={`button-edit-location-${index}`}
                          >
                            <Settings className="w-4 h-4 mr-1" />
                            {t("common.edit")}
                          </Button>
                          <FacilityMaterialsManager location={location} />
                          {geofenceManagementEnabled && (
                            <Button size="sm" variant="ghost" onClick={() => navigate(`/locations/${location.id}/geofence`)} data-testid={`button-manage-boundary-${index}`}>
                              <Radius className="mr-1 h-4 w-4" />
                              {t("geofence.owner.manageBoundary")}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setLocationToDelete(location)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            data-testid={`button-delete-location-${index}`}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            {t("common.delete")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {location.amenities && location.amenities.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {location.amenities.map((amenity: string, amenityIndex: number) => (
                        <Badge key={amenityIndex} variant="outline" className="text-xs">
                          {amenity}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <div>
                      {t("common.status")}: {location.isActive ? t("common.active") : t("owner.billing.inactive")}
                    </div>
                    <div>
                      {t("owner.locations.created")}: {new Date(location.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  </div>
                </CardContent>
              </Card>
            )}) : null
          )}
        </div>
      </main>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!locationToDelete} onOpenChange={() => setLocationToDelete(null)}>
        <DialogContent data-testid="dialog-delete-confirmation">
          <DialogHeader>
            <DialogTitle>{t("owner.locations.deleteLocation")}</DialogTitle>
            <DialogDescription>
              {t("owner.locations.deleteConfirmation", { name: locationToDelete?.name || "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setLocationToDelete(null)}
              data-testid="button-cancel-delete"
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (locationToDelete) {
                  deleteLocationMutation.mutate(locationToDelete.id);
                }
              }}
              disabled={deleteLocationMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteLocationMutation.isPending ? t("owner.locations.deleting") : t("owner.locations.deleteLocation")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileNav role="owner" />
    </div>
  );
}
