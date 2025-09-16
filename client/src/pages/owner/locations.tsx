import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
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
import { Building2, Plus, MapPin, Eye, EyeOff, Trash2, CheckCircle, XCircle, Settings } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function OwnerLocations() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<any>(null);
  const [locationToEdit, setLocationToEdit] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const { data: locations, isLoading } = useQuery({
    queryKey: ['/api/owners/locations'],
  });

  const { data: subscriptionData } = useQuery({
    queryKey: ['/api/payments/subscription-status'],
  });

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
      queryClient.invalidateQueries({ queryKey: ['/api/owners/locations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
    },
    onError: (error) => {
      toast({
        title: "Failed to Add Location",
        description: error.message,
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

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    latitude: "",
    longitude: "",
    rate: "5.00",
    operatingHours: "",
    amenities: "",
  });

  const [editFormData, setEditFormData] = useState({
    name: "",
    address: "",
    latitude: "",
    longitude: "",
    rate: "5.00",
    operatingHours: "",
    amenities: "",
    description: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const amenitiesArray = formData.amenities
      .split(',')
      .map(a => a.trim())
      .filter(a => a.length > 0);

    addLocationMutation.mutate({
      ...formData,
      latitude: parseFloat(formData.latitude),
      longitude: parseFloat(formData.longitude),
      rate: parseFloat(formData.rate),
      amenities: amenitiesArray,
    });
  };


  const handleEditLocation = (location: any) => {
    setLocationToEdit(location);
    setEditFormData({
      name: location.name || "",
      address: location.address || "",
      latitude: location.latitude?.toString() || "",
      longitude: location.longitude?.toString() || "",
      rate: location.rate?.toString() || "5.00",
      operatingHours: location.operatingHours || "",
      amenities: location.amenities?.join(", ") || "",
      description: location.description || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!locationToEdit) return;

    const amenitiesArray = editFormData.amenities
      .split(',')
      .map(a => a.trim())
      .filter(a => a.length > 0);

    updateLocationMutation.mutate({
      locationId: locationToEdit.id,
      locationData: {
        ...editFormData,
        latitude: parseFloat(editFormData.latitude),
        longitude: parseFloat(editFormData.longitude),
        rate: parseFloat(editFormData.rate),
        amenities: amenitiesArray,
      }
    });
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
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">My Locations</h1>
              <p className="text-white/80 text-sm">Manage washout sites</p>
            </div>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="secondary" 
                size="sm" 
                data-testid="button-add-location" 
                className="bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-400 disabled:cursor-not-allowed"
                disabled={(subscriptionData as any)?.status !== 'active'}
                title={(subscriptionData as any)?.status === 'past_due' 
                  ? "Feature restricted during grace period - payment required"
                  : (subscriptionData as any)?.status !== 'active' 
                  ? `Active subscription required (Current: ${(subscriptionData as any)?.status || 'none'})` 
                  : ""}
                onClick={() => console.log('Subscription status:', subscriptionData)}
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
                
                <div>
                  <Label htmlFor="address">Address</Label>
                  <Textarea
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    required
                    data-testid="textarea-address"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="latitude">Latitude</Label>
                    <Input
                      id="latitude"
                      type="number"
                      step="any"
                      value={formData.latitude}
                      onChange={(e) => setFormData({...formData, latitude: e.target.value})}
                      required
                      data-testid="input-latitude"
                    />
                  </div>
                  <div>
                    <Label htmlFor="longitude">Longitude</Label>
                    <Input
                      id="longitude"
                      type="number"
                      step="any"
                      value={formData.longitude}
                      onChange={(e) => setFormData({...formData, longitude: e.target.value})}
                      required
                      data-testid="input-longitude"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="rate">Rate per Washout ($)</Label>
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
                  disabled={addLocationMutation.isPending}
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
                  <Label htmlFor="edit-address">Address</Label>
                  <Textarea
                    id="edit-address"
                    value={editFormData.address}
                    onChange={(e) => setEditFormData({...editFormData, address: e.target.value})}
                    required
                    data-testid="textarea-edit-address"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-latitude">Latitude</Label>
                    <Input
                      id="edit-latitude"
                      type="number"
                      step="any"
                      value={editFormData.latitude}
                      onChange={(e) => setEditFormData({...editFormData, latitude: e.target.value})}
                      required
                      data-testid="input-edit-latitude"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-longitude">Longitude</Label>
                    <Input
                      id="edit-longitude"
                      type="number"
                      step="any"
                      value={editFormData.longitude}
                      onChange={(e) => setEditFormData({...editFormData, longitude: e.target.value})}
                      required
                      data-testid="input-edit-longitude"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="edit-rate">Rate per Washout ($)</Label>
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
        {/* Subscription Required Notice */}
        {subscriptionData && (subscriptionData as any).status !== 'active' && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-xs font-bold">!</span>
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-1">
                  Active Subscription Required
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                  You must have an active subscription to add and manage washout locations. Each location requires a subscription to operate.
                </p>
                <Button
                  size="sm"
                  onClick={() => window.location.href = '/subscribe'}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="button-subscribe-locations"
                >
                  Get Subscription
                </Button>
              </div>
            </div>
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
                          {location.address}
                        </p>
                        {location.description && (
                          <p className="text-sm text-muted-foreground mt-1" data-testid={`text-location-description-${index}`}>
                            {location.description}
                          </p>
                        )}
                      </div>
                      
                      <div className="text-right">
                        <div>
                          <div className="text-xl font-bold text-accent" data-testid={`text-location-rate-${index}`}>
                            {formatCurrency(Number(location.rate))}
                          </div>
                          <div className="text-xs text-muted-foreground">per washout</div>
                        </div>
                      </div>
                    </div>
                    
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
