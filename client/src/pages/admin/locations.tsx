import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
import { Building, Search, Filter, Eye, EyeOff, MapPin, Plus, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { formatAddress } from "@shared/addressUtils";
import { resolveLocationDriverIncentiveTipCents } from "@shared/locationBilling";
import { useAuth } from "@/hooks/useAuth";

const addLocationSchema = z.object({
  ownerId: z.string().min(1, "Please select an owner"),
  name: z.string().min(1, "Location name is required"),
  street: z.string().min(1, "Street address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(2, "State is required").max(2, "Use 2-letter state code"),
  zip: z.string().min(5, "ZIP code is required"),
  rate: z.string().min(1, "Rate is required"),
  description: z.string().optional(),
});

type AddLocationForm = z.infer<typeof addLocationSchema>;

export default function AdminLocations() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterOwnerStatus, setFilterOwnerStatus] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: locations, isLoading, error } = useQuery<any[]>({
    queryKey: ['/api/admin/locations'],
    retry: false,
  });

  const { data: owners } = useQuery<any[]>({
    queryKey: ['/api/admin/owners'],
    enabled: showAddDialog,
    retry: false,
  });

  useEffect(() => {
    if (error && isUnauthorizedError(error as Error)) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
    }
  }, [error, toast]);

  const form = useForm<AddLocationForm>({
    resolver: zodResolver(addLocationSchema),
    defaultValues: {
      ownerId: "",
      name: "",
      street: "",
      city: "",
      state: "",
      zip: "",
      rate: "0.50",
      description: "",
    },
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: async ({ locationId, isVisible }: { locationId: string; isVisible: boolean }) => {
      const response = await apiRequest("PUT", `/api/admin/locations/${locationId}/visibility`, { isVisible });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Visibility Updated",
        description: "Location visibility has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/locations'] });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addLocationMutation = useMutation({
    mutationFn: async (data: AddLocationForm) => {
      const response = await apiRequest("POST", "/api/admin/locations", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Location Created",
        description: "The location has been created successfully on behalf of the owner.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/locations'] });
      setShowAddDialog(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Location",
        description: error.message || "Something went wrong.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="animate-pulse space-y-4 p-4">
          <div className="h-20 bg-muted rounded-lg" />
          <div className="h-32 bg-muted rounded-lg" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
        <MobileNav role={user?.role} />
      </div>
    );
  }

  const filteredLocations = locations?.filter((location: any) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      location.name?.toLowerCase().includes(searchLower) ||
      location.street?.toLowerCase().includes(searchLower) ||
      location.city?.toLowerCase().includes(searchLower) ||
      location.state?.toLowerCase().includes(searchLower) ||
      location.zip?.toLowerCase().includes(searchLower) ||
      location.owner?.user?.firstName?.toLowerCase().includes(searchLower) ||
      location.owner?.user?.lastName?.toLowerCase().includes(searchLower) ||
      location.owner?.companyName?.toLowerCase().includes(searchLower);

    const matchesStatus = filterStatus === "all" ||
      (filterStatus === "visible" && location.isVisible && location.isActive) ||
      (filterStatus === "hidden" && (!location.isVisible || !location.isActive));

    const matchesOwnerStatus = filterOwnerStatus === "all" ||
      (filterOwnerStatus === "approved" && ["active", "waived"].includes(location.owner?.membershipStatus)) ||
      (filterOwnerStatus === "pending" && !["active", "waived"].includes(location.owner?.membershipStatus));

    return matchesSearch && matchesStatus && matchesOwnerStatus;
  }) || [];

  const stats = {
    totalLocations: locations?.length || 0,
    visibleLocations: locations?.filter((l: any) => l.isVisible && l.isActive).length || 0,
    hiddenLocations: locations?.filter((l: any) => !l.isVisible || !l.isActive).length || 0,
    avgRate: locations?.length ?
      locations.reduce((sum: number, l: any) => sum + Number(l.rate), 0) / locations.length : 0,
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="gradient-bg text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">Location Management</h1>
              <p className="text-white/80 text-sm">Monitor washout sites</p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAddDialog(true)}
            className="flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Add Location
          </Button>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4">
          <StatCard title="Total Sites" className="text-center">
            <div className="text-2xl font-bold text-primary" data-testid="text-total-locations">
              {stats.totalLocations}
            </div>
            <div className="text-xs text-muted-foreground">Registered</div>
          </StatCard>

          <StatCard title="Visible" className="text-center">
            <div className="text-2xl font-bold text-green-600" data-testid="text-visible-locations">
              {stats.visibleLocations}
            </div>
            <div className="text-xs text-muted-foreground">Active Sites</div>
          </StatCard>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <StatCard title="Hidden" className="text-center">
            <div className="text-xl font-bold text-yellow-600" data-testid="text-hidden-locations">
              {stats.hiddenLocations}
            </div>
            <div className="text-xs text-muted-foreground">Inactive</div>
          </StatCard>

          <StatCard title="Avg Rate" className="text-center">
            <div className="text-xl font-bold text-accent" data-testid="text-avg-rate">
              {formatCurrency(stats.avgRate)}
            </div>
            <div className="text-xs text-muted-foreground">Per Washout</div>
          </StatCard>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filters</span>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search locations or owners..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-locations"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Visibility</label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger data-testid="select-filter-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Locations</SelectItem>
                      <SelectItem value="visible">Visible</SelectItem>
                      <SelectItem value="hidden">Hidden</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Owner Status</label>
                  <Select value={filterOwnerStatus} onValueChange={setFilterOwnerStatus}>
                    <SelectTrigger data-testid="select-filter-owner">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Owners</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Location List */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center">
            <Building className="w-5 h-5 mr-2" />
            Washout Locations ({filteredLocations.length})
          </h2>

          {filteredLocations.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <Building className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No locations found matching your criteria</p>
              </CardContent>
            </Card>
          ) : (
            filteredLocations.map((location: any, index: number) => (
              <Card key={location.id} className="hover:shadow-md transition-shadow" data-testid={`card-location-${index}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-lg" data-testid={`text-location-name-${index}`}>
                          {location.name}
                        </h3>
                        <Badge
                          variant={location.isVisible && location.isActive ? "default" : "secondary"}
                          data-testid={`badge-location-visibility-${index}`}
                        >
                          {location.isVisible && location.isActive ? (
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

                      <p className="text-sm text-muted-foreground mb-2" data-testid={`text-location-address-${index}`}>
                        <MapPin className="w-4 h-4 inline mr-1" />
                        {formatAddress({
                          street: location.street,
                          city: location.city,
                          state: location.state,
                          zip: location.zip
                        })}
                      </p>

                      <div className="text-sm text-muted-foreground">
                        Owner: <span className="font-medium" data-testid={`text-owner-name-${index}`}>
                          {location.owner?.user?.firstName} {location.owner?.user?.lastName}
                          {location.owner?.companyName && ` (${location.owner.companyName})`}
                        </span>
                        <Badge
                          variant={["active", "waived"].includes(location.owner?.membershipStatus) ? "default" : "secondary"}
                          className="ml-2 text-xs"
                          data-testid={`badge-owner-status-${index}`}
                        >
                          {["active", "waived"].includes(location.owner?.membershipStatus) ? 'Approved' : 'Pending'}
                        </Badge>
                      </div>

                      {location.description && (
                        <p className="text-sm text-muted-foreground mt-2" data-testid={`text-location-description-${index}`}>
                          {location.description}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <div className="text-xl font-bold text-accent mb-1" data-testid={`text-location-rate-${index}`}>
                        {formatCurrency(Number(location.rate))}
                      </div>
                      <div className="text-xs text-muted-foreground mb-1">driver payout per washout</div>
                      <div className="text-xs text-muted-foreground mb-3">
                        Driver tip: {formatCurrency(resolveLocationDriverIncentiveTipCents(location.rate) / 100)}
                      </div>

                      <Button
                        size="sm"
                        variant={location.isVisible ? "outline" : "default"}
                        onClick={() => toggleVisibilityMutation.mutate({
                          locationId: location.id,
                          isVisible: !location.isVisible
                        })}
                        disabled={toggleVisibilityMutation.isPending}
                        data-testid={`button-toggle-visibility-${index}`}
                      >
                        {location.isVisible ? (
                          <>
                            <EyeOff className="w-4 h-4 mr-1" />
                            Hide
                          </>
                        ) : (
                          <>
                            <Eye className="w-4 h-4 mr-1" />
                            Show
                          </>
                        )}
                      </Button>
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

                  <div className="flex items-center justify-between pt-3 border-t border-border text-sm text-muted-foreground">
                    <div>
                      Created: {new Date(location.createdAt).toLocaleDateString()}
                    </div>
                    <div className="flex items-center">
                      <MapPin className="w-4 h-4 mr-1" />
                      GPS: {location.latitude}, {location.longitude}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>

      {/* Add Location Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { setShowAddDialog(open); if (!open) form.reset(); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Location on Behalf of Owner</DialogTitle>
            <DialogDescription>
              Admin override — no CC or Stripe checks. The address will be geocoded automatically.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => addLocationMutation.mutate(data))} className="space-y-4">

              <FormField
                control={form.control}
                name="ownerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Owner</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an owner..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(owners as any[])?.map((owner: any) => (
                          <SelectItem key={owner.id} value={owner.id}>
                            {owner.user?.firstName} {owner.user?.lastName}
                            {owner.companyName ? ` — ${owner.companyName}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Riverside Washout Facility" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="street"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street Address</FormLabel>
                    <FormControl>
                      <Input placeholder="123 Main St" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input placeholder="City" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl>
                        <Input placeholder="CA" maxLength={2} className="uppercase" {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="zip"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ZIP Code</FormLabel>
                      <FormControl>
                        <Input placeholder="12345" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rate ($/washout)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" placeholder="0.50" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Any additional details about this location..." rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => { setShowAddDialog(false); form.reset(); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={addLocationMutation.isPending}>
                  {addLocationMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Location"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <MobileNav role={user?.role} />
    </div>
  );
}
