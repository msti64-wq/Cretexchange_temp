import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
import { Building2, Plus, MapPin, Eye, EyeOff, Trash2, CheckCircle, XCircle, Settings, Package, DollarSign, Pencil, Check, X } from "lucide-react";
import logoImage from "@assets/cretexchange logo_1760644229633.png";
import { formatCurrency } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatAddress } from "@shared/addressUtils";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { FEATURE_FLAGS } from "@shared/featureFlags";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { useAuth } from "@/hooks/useAuth";
import { resolveOwnerMembershipState } from "@shared/ownerMembership";
import { resolveOwnerLocationAccessState } from "@shared/ownerLocationAccess";

export default function OwnerLocations() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<any>(null);
  const [locationToEdit, setLocationToEdit] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedMaterialsForEdit, setSelectedMaterialsForEdit] = useState<string[]>([]);
  const [isAddressVerified, setIsAddressVerified] = useState(false);
  
  // Inline rate editing state
  const [editingRateLocationId, setEditingRateLocationId] = useState<string | null>(null);
  const [editingRateValue, setEditingRateValue] = useState("");
  const [materialPricing, setMaterialPricing] = useState<{[materialSlug: string]: {rateCents: number, unit: string}}>({});

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
    driverIncentiveTip: "0.00",
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
    driverIncentiveTip: "0.00",
    operatingHours: "",
    amenities: "",
    description: "",
  });

  // Check if enhanced location creation is enabled
  const { enabled: isEnhancedCreationEnabled, isLoading: isFlagLoading } = useFeatureFlag(FEATURE_FLAGS.ENHANCED_LOCATION_CREATION);
  
  // Check if rubble service is enabled
  const { enabled: isRubbleServiceEnabled } = useFeatureFlag(FEATURE_FLAGS.RUBBLE_SERVICE);
  
  // Fetch available materials for rubble service
  const { data: materials = [] } = useQuery<any[]>({
    queryKey: ['/api/materials'],
    enabled: isRubbleServiceEnabled,
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

  const { data: locations, isLoading } = useQuery<any[]>({
    queryKey: ['/api/owners/locations'],
  });

  const ownerRecord = (user as any)?.roleData || {};
  const membershipState = resolveOwnerMembershipState(ownerRecord);
  const locationAccessState = resolveOwnerLocationAccessState(ownerRecord, user as any);

  const addLocationMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/owners/locations", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Location Added",
        description: "New washout location has been created successfully.",
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
        driverIncentiveTip: "0.00",
        operatingHours: "",
        amenities: "",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/locations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
    },
    onError: (error) => {
      const message = parseApiError(error);
      toast({
        title: "Failed to Add Location",
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
        title: "Location Updated",
        description: "Location has been updated successfully.",
      });
      setIsEditDialogOpen(false);
      setLocationToEdit(null);
      queryClient.invalidateQueries({ queryKey: ['/api/owners/locations'] });
    },
    onError: (error) => {
      toast({
        title: "Failed to Update Location",
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
        title: "Status Updated",
        description: `Location is now ${variables.isActive ? 'active' : 'inactive'}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/locations'] });
    },
    onError: (error) => {
      toast({
        title: "Failed to Update Status",
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
        title: "Rate Updated",
        description: "Your washout rate has been updated successfully.",
      });
      setEditingRateLocationId(null);
      setEditingRateValue("");
      queryClient.invalidateQueries({ queryKey: ['/api/owners/locations'] });
    },
    onError: (error) => {
      toast({
        title: "Failed to Update Rate",
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
        title: "Invalid Rate",
        description: "Please enter a valid rate amount.",
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
        title: "Location Deleted",
        description: "The washout location has been permanently removed.",
      });
      setLocationToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['/api/owners/locations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
    },
    onError: (error) => {
      toast({
        title: "Failed to Delete Location",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!isAddressVerified || !formData.latitude || !formData.longitude) {
      toast({
        title: "Address Verification Required",
        description: "Please select an address from the suggestions.",
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
      driverIncentiveTip: parseFloat(formData.driverIncentiveTip || "0"),
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
      driverIncentiveTip: location.driverIncentiveTip?.toString() || "0.00",
      operatingHours: location.operatingHours || "",
      amenities: location.amenities?.join(", ") || "",
      description: location.description || "",
    });
    
    // Load existing material intents if rubble service is enabled
    if (isRubbleServiceEnabled) {
      try {
        const response = await apiRequest('GET', `/api/locations/${location.id}/material-intents`);
        const intents = await response.json();
        const materialSlugs = intents.map((intent: any) => intent.materialSlug || intent.material_slug);
        const pricing: {[key: string]: {rateCents: number, unit: string}} = {};
        intents.forEach((intent: any) => {
          const slug = intent.materialSlug || intent.material_slug;
          if (slug) {
            pricing[slug] = {
              rateCents: intent.rateCents || intent.rate_cents || 0,
              unit: intent.unit || 'per_load'
            };
          }
        });
        setSelectedMaterialsForEdit(materialSlugs);
        setMaterialPricing(pricing);
      } catch (error) {
        console.error('Error loading material intents:', error);
        setSelectedMaterialsForEdit([]);
        setMaterialPricing({});
      }
    }
    
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
        driverIncentiveTip: parseFloat(editFormData.driverIncentiveTip || "0"),
        amenities: amenitiesArray,
      }
    });
    
    // Save material intents if rubble service is enabled
    if (isRubbleServiceEnabled && selectedMaterialsForEdit.length > 0) {
      try {
        // First, clear existing intents
        await apiRequest('DELETE', `/api/locations/${locationToEdit.id}/material-intents`);
        
        // Then, create new intents for selected materials with pricing
        const materialIntents = selectedMaterialsForEdit.map(materialSlug => {
          const pricing = materialPricing[materialSlug] || { rateCents: 0, unit: 'per_load' };
          return {
            locationId: locationToEdit.id,
            materialSlug,
            rateCents: pricing.rateCents,
            unit: pricing.unit,
            active: true,
          };
        });
        
        await Promise.all(
          materialIntents.map(intent =>
            apiRequest('POST', `/api/locations/${locationToEdit.id}/material-intents`, intent)
          )
        );
      } catch (error) {
        console.error('Error saving material intents:', error);
        toast({
          title: "Warning",
          description: "Location updated but material preferences could not be saved.",
          variant: "destructive",
        });
      }
    } else if (isRubbleServiceEnabled && selectedMaterialsForEdit.length === 0) {
      // Clear all material intents if none are selected
      try {
        await apiRequest('DELETE', `/api/locations/${locationToEdit.id}/material-intents`);
      } catch (error) {
        console.error('Error clearing material intents:', error);
      }
    }
  };

  const handleToggleStatus = (locationId: string, currentStatus: boolean) => {
    toggleStatusMutation.mutate({ locationId, isActive: !currentStatus });
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
            <img 
              src={logoImage}
              alt="CreteXchange Logo"
              className="w-10 h-10 object-contain bg-white/20 rounded-full p-1"
            />
            <div>
              <h1 className="font-semibold text-lg">My Locations</h1>
              <p className="text-white/80 text-sm">Manage washout sites</p>
            </div>
          </div>
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
                disabled={!membershipState.dashboardAccessAllowed || !locationAccessState.canManageLocations}
                title={!membershipState.dashboardAccessAllowed
                  ? membershipState.accountStatusMessage || "Your account is pending review."
                  : !locationAccessState.canManageLocations
                  ? locationAccessState.blockingMessage || "Complete your owner profile and add a payment method before setting up locations."
                  : ""}
                onClick={() => {
                  console.log('Membership status:', membershipState, 'Location access:', locationAccessState);
                }}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Location
              </Button>
            </DialogTrigger>
            <DialogContent className="w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Location</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Location Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    required
                    data-testid="input-location-name"
                  />
                </div>

                {/* Enhanced location creation with Mapbox */}
                {isEnhancedCreationEnabled ? (
                  <>
                    <AddressAutocomplete
                      onPlaceSelected={handlePlaceSelected}
                      onInputChange={handleAddressInputChange}
                    />

                    {/* Address fields auto-filled by autocomplete, coordinates must come from Places */}
                    <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
                      <p className="text-sm font-medium">Location Details</p>
                      {!canSubmitLocation && (
                        <p className="text-xs text-muted-foreground">
                          Please select an address from the suggestions.
                        </p>
                      )}
                      <div>
                        <Label htmlFor="street">Street Address</Label>
                        <Input
                          id="street"
                          value={formData.street}
                          onChange={(e) => updateAddressField("street", e.target.value)}
                          placeholder="Auto-filled from search above"
                          required
                          data-testid="input-street"
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="city">City</Label>
                          <Input
                            id="city"
                            value={formData.city}
                            onChange={(e) => updateAddressField("city", e.target.value)}
                            required
                            data-testid="input-city"
                          />
                        </div>
                        <div>
                          <Label htmlFor="state">State</Label>
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
                        <Label htmlFor="zip">ZIP Code</Label>
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
                  </>
                ) : (
                  <>
                    {/* Legacy manual entry */}
                    <div>
                      <Label htmlFor="street">Street Address</Label>
                      <Input
                        id="street"
                        value={formData.street}
                        onChange={(e) => updateAddressField("street", e.target.value)}
                        placeholder="123 Main Street"
                        required
                        data-testid="input-street"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                          <Label htmlFor="city">City</Label>
                          <Input
                            id="city"
                            value={formData.city}
                            onChange={(e) => updateAddressField("city", e.target.value)}
                            placeholder="Austin"
                            required
                            data-testid="input-city"
                          />
                      </div>
                      <div>
                          <Label htmlFor="state">State</Label>
                          <Input
                            id="state"
                            value={formData.state}
                            onChange={(e) => updateAddressField("state", e.target.value)}
                            placeholder="TX"
                            maxLength={2}
                            required
                            data-testid="input-state"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <Label htmlFor="zip">ZIP Code</Label>
                      <Input
                        id="zip"
                        value={formData.zip}
                        onChange={(e) => updateAddressField("zip", e.target.value)}
                        placeholder="78701"
                        maxLength={10}
                        required
                        data-testid="input-zip"
                      />
                    </div>

                  </>
                )}

                <div>
                  <Label htmlFor="rate">Driver payout per washout ($)</Label>
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
                    This is the washout rate drivers see at this location. The platform fee is billed separately.
                  </p>
                </div>

                <div>
                  <Label htmlFor="driverIncentiveTip">Driver Incentive Tip per Washout ($)</Label>
                  <Input
                    id="driverIncentiveTip"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.driverIncentiveTip}
                    onChange={(e) => setFormData({...formData, driverIncentiveTip: e.target.value})}
                    data-testid="input-driver-incentive-tip"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Optional owner-funded incentive paid to the driver. Leave at 0.00 for no tip.
                  </p>
                </div>

                <div>
                  <Label htmlFor="operatingHours">Hours (Optional)</Label>
                  <Textarea
                    id="operatingHours"
                    placeholder="e.g. Mon-Fri 8AM-5PM, Sat-Sun 9AM-3PM"
                    value={formData.operatingHours}
                    onChange={(e) => setFormData({...formData, operatingHours: e.target.value})}
                    data-testid="textarea-operating-hours"
                  />
                </div>

                <div>
                  <Label htmlFor="amenities">Amenities (comma-separated)</Label>
                  <Input
                    id="amenities"
                    placeholder="e.g. 24/7 Access, Water Hose, Scales"
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
                  {addLocationMutation.isPending ? "Creating..." : "Create Location"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {/* Comprehensive Edit Location Dialog */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Location</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="edit-name">Location Name</Label>
                  <Input
                    id="edit-name"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                    required
                    data-testid="input-edit-location-name"
                  />
                </div>
                
                <div>
                  <Label htmlFor="edit-street">Street Address</Label>
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
                    <Label htmlFor="edit-city">City</Label>
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
                    <Label htmlFor="edit-state">State</Label>
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
                  <Label htmlFor="edit-zip">ZIP Code</Label>
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
                  <Label htmlFor="edit-rate">Driver payout per washout ($)</Label>
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
                </div>

                <div>
                  <Label htmlFor="edit-driverIncentiveTip">Driver Incentive Tip per Washout ($)</Label>
                  <Input
                    id="edit-driverIncentiveTip"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editFormData.driverIncentiveTip}
                    onChange={(e) => setEditFormData({...editFormData, driverIncentiveTip: e.target.value})}
                    data-testid="input-edit-driver-incentive-tip"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Optional owner-funded incentive paid to the driver. Leave at 0.00 for no tip.
                  </p>
                </div>

                <div>
                  <Label htmlFor="edit-description">Description (Optional)</Label>
                  <Textarea
                    id="edit-description"
                    placeholder="Brief description of your location"
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({...editFormData, description: e.target.value})}
                    data-testid="textarea-edit-description"
                  />
                </div>

                <div>
                  <Label htmlFor="edit-operatingHours">Hours (Optional)</Label>
                  <Textarea
                    id="edit-operatingHours"
                    placeholder="e.g. Mon-Fri 8AM-5PM, Sat-Sun 9AM-3PM"
                    value={editFormData.operatingHours}
                    onChange={(e) => setEditFormData({...editFormData, operatingHours: e.target.value})}
                    data-testid="textarea-edit-operating-hours"
                  />
                </div>

                <div>
                  <Label htmlFor="edit-amenities">Amenities (comma-separated)</Label>
                  <Input
                    id="edit-amenities"
                    placeholder="e.g. 24/7 Access, Water Hose, Scales"
                    value={editFormData.amenities}
                    onChange={(e) => setEditFormData({...editFormData, amenities: e.target.value})}
                    data-testid="input-edit-amenities"
                  />
                </div>

                {/* Materials Wanted - Rubble Service */}
                {isRubbleServiceEnabled && materials && materials.length > 0 && (
                  <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Package className="w-5 h-5 text-accent" />
                      <Label className="text-base font-semibold">Materials Wanted (Optional)</Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Select construction materials you accept and set your payment rate per unit
                    </p>
                    <div className="space-y-3">
                      {materials.map((material: any) => {
                        const isSelected = selectedMaterialsForEdit.includes(material.slug);
                        const pricing = materialPricing[material.slug] || { rateCents: 0, unit: 'per_load' };
                        return (
                          <div key={material.id} className="space-y-2">
                            <div className="flex items-start space-x-2">
                              <Checkbox
                                id={`edit-material-${material.id}`}
                                checked={isSelected}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedMaterialsForEdit([...selectedMaterialsForEdit, material.slug]);
                                    setMaterialPricing({
                                      ...materialPricing,
                                      [material.slug]: { rateCents: 0, unit: 'per_load' }
                                    });
                                  } else {
                                    setSelectedMaterialsForEdit(selectedMaterialsForEdit.filter(slug => slug !== material.slug));
                                    const newPricing = { ...materialPricing };
                                    delete newPricing[material.slug];
                                    setMaterialPricing(newPricing);
                                  }
                                }}
                                data-testid={`checkbox-edit-material-${material.slug}`}
                              />
                              <Label
                                htmlFor={`edit-material-${material.id}`}
                                className="text-sm font-medium leading-none cursor-pointer"
                              >
                                {material.displayName || material.display_name}
                              </Label>
                            </div>
                            {isSelected && (
                              <div className="ml-6 grid grid-cols-2 gap-2">
                                <div>
                                  <Label htmlFor={`price-${material.slug}`} className="text-xs">Pay Per Unit ($)</Label>
                                  <Input
                                    id={`price-${material.slug}`}
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="0.00"
                                    value={pricing.rateCents / 100}
                                    onChange={(e) => {
                                      const dollars = parseFloat(e.target.value) || 0;
                                      setMaterialPricing({
                                        ...materialPricing,
                                        [material.slug]: { ...pricing, rateCents: Math.round(dollars * 100) }
                                      });
                                    }}
                                    data-testid={`input-price-${material.slug}`}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor={`unit-${material.slug}`} className="text-xs">Unit</Label>
                                  <Select
                                    value={pricing.unit}
                                    onValueChange={(value) => {
                                      setMaterialPricing({
                                        ...materialPricing,
                                        [material.slug]: { ...pricing, unit: value }
                                      });
                                    }}
                                  >
                                    <SelectTrigger id={`unit-${material.slug}`} data-testid={`select-unit-${material.slug}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="per_load">Per Load</SelectItem>
                                      <SelectItem value="per_ton">Per Ton</SelectItem>
                                      <SelectItem value="per_cy">Per Cubic Yard</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {selectedMaterialsForEdit.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {selectedMaterialsForEdit.length} material{selectedMaterialsForEdit.length !== 1 ? 's' : ''} selected
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setIsEditDialogOpen(false)}
                    data-testid="button-cancel-edit"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={updateLocationMutation.isPending}
                    data-testid="button-submit-edit"
                  >
                    {updateLocationMutation.isPending ? "Updating..." : "Update Location"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {!membershipState.dashboardAccessAllowed && membershipState.accountStatusMessage && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
            <p className="text-sm text-amber-800 dark:text-amber-200">{membershipState.accountStatusMessage}</p>
          </div>
        )}

        {membershipState.dashboardAccessAllowed && !locationAccessState.canManageLocations && locationAccessState.blockingMessage && (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm dark:border-sky-900/40 dark:bg-sky-950/20">
            <p className="text-sm text-sky-800 dark:text-sky-200">{locationAccessState.blockingMessage}</p>
            {locationAccessState.missingProfileFieldLabels.length > 0 && (
              <p className="mt-2 text-xs text-sky-700 dark:text-sky-300">
                Missing profile fields: {locationAccessState.missingProfileFieldLabels.join(", ")}
              </p>
            )}
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard title="Total" className="text-center">
            <div className="text-2xl font-bold text-primary" data-testid="text-total-locations">
              {Array.isArray(locations) ? locations.length : 0}
            </div>
            <div className="text-xs text-muted-foreground">Locations</div>
          </StatCard>

          <StatCard title="Active" className="text-center">
            <div className="text-2xl font-bold text-green-600" data-testid="text-active-locations">
              {Array.isArray(locations) ? locations.filter((l: any) => l.isActive && l.isVisible).length : 0}
            </div>
            <div className="text-xs text-muted-foreground">Visible</div>
          </StatCard>

          <StatCard title="Avg Rate" className="text-center">
            <div className="text-2xl font-bold text-accent" data-testid="text-avg-rate">
              {Array.isArray(locations) && locations.length > 0 ? 
                formatCurrency(
                  locations.reduce((sum: number, l: any) => sum + Number(l.rate), 0) / locations.length
                ) : 
                formatCurrency(0)
              }
            </div>
            <div className="text-xs text-muted-foreground">Per Washout</div>
          </StatCard>
        </div>

        {/* Location List */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center">
            <MapPin className="w-5 h-5 mr-2" />
            Your Locations
          </h2>

          {!Array.isArray(locations) || locations.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">No locations yet</p>
                <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-first-location">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Location
                </Button>
              </CardContent>
            </Card>
          ) : (
            Array.isArray(locations) ? locations.map((location: any, index: number) => (
              <Card key={location.id} className="hover:shadow-md transition-shadow" data-testid={`card-location-${index}`}>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-lg" data-testid={`text-location-name-${index}`}>
                            {location.name}
                          </h3>
                          <Badge variant={location.isVisible ? "default" : "secondary"}>
                            {location.isVisible ? (
                              <>
                                <Eye className="w-3 h-3 mr-1" />
                                Visible
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-3 h-3 mr-1" />
                                Hidden
                              </>
                            )}
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
                      </div>
                      
                      <div className="text-right">
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
                            <div className="flex items-center gap-1 justify-end">
                              <div className="text-xl font-bold text-accent" data-testid={`text-location-rate-${index}`}>
                                {formatCurrency(Number(location.rate))}
                              </div>
                              <Pencil className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="text-xs text-muted-foreground">driver payout per washout (click to edit)</div>
                            <div className="text-xs text-muted-foreground">
                              Driver tip: {formatCurrency(Number(location.driverIncentiveTip || 0))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Set to Inactive to temporarily hide this location from drivers
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
                                  Active
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-3 h-3 mr-1" />
                                  Inactive
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
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setLocationToDelete(location)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            data-testid={`button-delete-location-${index}`}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete
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
                      Status: {location.isActive ? 'Active' : 'Inactive'}
                    </div>
                    <div>
                      Created: {new Date(location.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  </div>
                </CardContent>
              </Card>
            )) : null
          )}
        </div>
      </main>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!locationToDelete} onOpenChange={() => setLocationToDelete(null)}>
        <DialogContent data-testid="dialog-delete-confirmation">
          <DialogHeader>
            <DialogTitle>Delete Location</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete "{locationToDelete?.name}"? 
              This action cannot be undone and will remove all associated data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setLocationToDelete(null)}
              data-testid="button-cancel-delete"
            >
              Cancel
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
              {deleteLocationMutation.isPending ? "Deleting..." : "Delete Location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileNav role="owner" />
    </div>
  );
}
