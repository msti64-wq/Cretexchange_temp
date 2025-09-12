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
import { Building2, Plus, MapPin, DollarSign, Edit, Eye, EyeOff, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function OwnerLocations() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<any>(null);
  const [locationToDelete, setLocationToDelete] = useState<any>(null);

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

  const updateRateMutation = useMutation({
    mutationFn: async ({ locationId, rate }: { locationId: string; rate: string }) => {
      const response = await apiRequest("PUT", `/api/owners/locations/${locationId}/rate`, { rate });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Rate Updated",
        description: "Location rate has been updated successfully.",
      });
      setEditingLocation(null);
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

  const handleRateUpdate = (locationId: string, newRate: string) => {
    updateRateMutation.mutate({ locationId, rate: newRate });
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
                disabled={subscriptionData?.status !== 'active'}
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
        </div>
      </header>

      <main className="p-4 space-y-4">
        {/* Subscription Required Notice */}
        {subscriptionData?.status !== 'active' && (
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
              {locations?.length || 0}
            </div>
            <div className="text-xs text-muted-foreground">Locations</div>
          </StatCard>

          <StatCard title="Active" className="text-center">
            <div className="text-2xl font-bold text-green-600" data-testid="text-active-locations">
              {locations?.filter((l: any) => l.isActive && l.isVisible).length || 0}
            </div>
            <div className="text-xs text-muted-foreground">Visible</div>
          </StatCard>

          <StatCard title="Avg Rate" className="text-center">
            <div className="text-2xl font-bold text-accent" data-testid="text-avg-rate">
              {locations?.length ? 
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

          {!locations?.length ? (
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
            locations.map((location: any, index: number) => (
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
                        {editingLocation === location.id ? (
                          <Input
                            type="number"
                            step="0.01"
                            defaultValue={location.rate}
                            className="w-20 text-right"
                            onBlur={(e) => handleRateUpdate(location.id, e.target.value)}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                handleRateUpdate(location.id, (e.target as HTMLInputElement).value);
                              }
                            }}
                            data-testid={`input-edit-rate-${index}`}
                          />
                        ) : (
                          <div>
                            <div className="text-xl font-bold text-accent" data-testid={`text-location-rate-${index}`}>
                              {formatCurrency(Number(location.rate))}
                            </div>
                            <div className="text-xs text-muted-foreground">per washout</div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingLocation(location.id)}
                          data-testid={`button-edit-rate-${index}`}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit Rate
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
            ))
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
