import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useFeatureFlags } from "@/hooks/useFeatureFlag";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Flag, RefreshCw, Shield, UserPlus, Users, Settings } from "lucide-react";
import { Link } from "wouter";

export default function AdminFeatureFlags() {
  const { toast } = useToast();
  const { flags, isLoading } = useFeatureFlags();
  const [selectedFlag, setSelectedFlag] = useState<any>(null);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [overrideEnabled, setOverrideEnabled] = useState(true);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [platformFee, setPlatformFee] = useState("");

  const { data: users } = useQuery({
    queryKey: ['/api/admin/users'],
    retry: false,
  });

  // Get system settings for platform fee
  const { data: systemSettings } = useQuery({
    queryKey: ['/api/admin/settings'],
    retry: false,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ flagKey, enabled }: { flagKey: string; enabled: boolean }) => {
      return await apiRequest(`/api/feature-flags/${flagKey}/toggle`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/feature-flags'] });
      toast({
        title: "Feature Flag Updated",
        description: "The feature flag has been successfully updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update feature flag",
        variant: "destructive",
      });
    },
  });

  const overrideMutation = useMutation({
    mutationFn: async ({ flagKey, userId, enabled }: { flagKey: string; userId: string; enabled: boolean }) => {
      return await apiRequest(`/api/feature-flags/${flagKey}/override/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/feature-flags'] });
      setOverrideDialogOpen(false);
      setUserEmail("");
      toast({
        title: "User Override Set",
        description: "The user-specific override has been set successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Override Failed",
        description: error.message || "Failed to set user override",
        variant: "destructive",
      });
    },
  });

  const updateRolesMutation = useMutation({
    mutationFn: async ({ flagKey, allowedRoles }: { flagKey: string; allowedRoles: string[] }) => {
      return await apiRequest(`/api/feature-flags/${flagKey}/roles`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedRoles }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/feature-flags'] });
      setRoleDialogOpen(false);
      toast({
        title: "Roles Updated",
        description: "Allowed roles have been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update roles",
        variant: "destructive",
      });
    },
  });

  const seedFlagsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/feature-flags/seed', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/feature-flags'] });
      toast({
        title: "Feature Flags Seeded",
        description: "All predefined feature flags have been initialized successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Seeding Failed",
        description: error.message || "Failed to seed feature flags",
        variant: "destructive",
      });
    },
  });

  const updatePlatformFeeMutation = useMutation({
    mutationFn: async (fee: string) => {
      return await apiRequest('/api/admin/settings', {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformWashoutFee: fee }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      setPlatformFee("");
      toast({
        title: "Platform Fee Updated",
        description: "The platform washout fee has been successfully updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update platform fee",
        variant: "destructive",
      });
    },
  });

  const handleUpdatePlatformFee = () => {
    const feeValue = parseFloat(platformFee);
    if (isNaN(feeValue) || feeValue < 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid positive number",
        variant: "destructive",
      });
      return;
    }
    updatePlatformFeeMutation.mutate(platformFee);
  };

  const handleAddOverride = () => {
    if (!selectedFlag || !userEmail) {
      toast({
        title: "Missing Information",
        description: "Please select a user",
        variant: "destructive",
      });
      return;
    }

    // Flatten users from {drivers, owners, admins} structure
    const allUsers = [
      ...((users as any)?.drivers?.map((d: any) => d.users) || []),
      ...((users as any)?.owners?.map((o: any) => o.users) || []),
      ...((users as any)?.admins || []),
    ];
    
    const user = allUsers.find((u: any) => u.email === userEmail);
    if (!user) {
      toast({
        title: "User Not Found",
        description: "The selected user could not be found",
        variant: "destructive",
      });
      return;
    }

    overrideMutation.mutate({
      flagKey: selectedFlag.flagKey,
      userId: user.id,
      enabled: overrideEnabled,
    });
  };

  const handleUpdateRoles = () => {
    if (!selectedFlag) return;
    updateRolesMutation.mutate({
      flagKey: selectedFlag.flagKey,
      allowedRoles: selectedRoles,
    });
  };

  const openOverrideDialog = (flag: any) => {
    setSelectedFlag(flag);
    setUserEmail("");
    setOverrideEnabled(true);
    setOverrideDialogOpen(true);
  };

  const openRoleDialog = (flag: any) => {
    setSelectedFlag(flag);
    setSelectedRoles(flag.allowedRoles || []);
    setRoleDialogOpen(true);
  };

  const toggleRole = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center space-x-3">
            <Link href="/" className="hover:opacity-80 transition-opacity">
              <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/10">
                ← Back
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold">Feature Flags</h1>
              <p className="text-sm text-primary-foreground/80">Control feature rollouts</p>
            </div>
          </div>
          <Shield className="w-8 h-8" />
        </div>
      </div>

      <main className="p-4 space-y-6 max-w-7xl mx-auto">
        {/* Info Card */}
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-3">
              <Flag className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                  Feature Flag System
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                  Safely roll out new features with granular control over who sees what.
                </p>
                <ul className="text-sm text-blue-700 dark:text-blue-300 list-disc list-inside ml-2 space-y-1">
                  <li>Global on/off switches for instant feature control</li>
                  <li>Role-based access (driver, owner, admin)</li>
                  <li>User-specific overrides for beta testing</li>
                  <li>No code deployment needed for feature toggles</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Platform Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Platform Settings</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Configure global platform parameters
                </p>
              </div>
              <Settings className="w-6 h-6 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Platform Washout Fee */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold">Platform Washout Fee</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Fee charged per washout transaction (currently ${(systemSettings as any)?.platformWashoutFee || '0.40'})
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    💡 Testing: $0.40 (10% of production) • Production: $4.00
                  </p>
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label htmlFor="platform-fee">New Fee Amount ($)</Label>
                  <Input
                    id="platform-fee"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={(systemSettings as any)?.platformWashoutFee || '0.40'}
                    value={platformFee}
                    onChange={(e) => setPlatformFee(e.target.value)}
                    data-testid="input-platform-fee"
                  />
                </div>
                <Button
                  onClick={handleUpdatePlatformFee}
                  disabled={!platformFee || updatePlatformFeeMutation.isPending}
                  data-testid="button-update-platform-fee"
                >
                  {updatePlatformFeeMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Settings className="w-4 h-4 mr-2" />
                      Update Fee
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Feature Flags List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Active Feature Flags</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/feature-flags'] })}
                data-testid="button-refresh-flags"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {flags.length === 0 ? (
              <div className="text-center py-12">
                <Flag className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">No feature flags configured</p>
                <Button
                  onClick={() => seedFlagsMutation.mutate()}
                  disabled={seedFlagsMutation.isPending}
                  data-testid="button-seed-flags"
                >
                  {seedFlagsMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Seeding Flags...
                    </>
                  ) : (
                    <>
                      <Flag className="w-4 h-4 mr-2" />
                      Seed Feature Flags
                    </>
                  )}
                </Button>
                <p className="text-sm text-muted-foreground mt-3">
                  This will initialize all predefined feature flags for the platform
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {flags.map((flag: any) => (
                  <div
                    key={flag.id}
                    className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors gap-4"
                    data-testid={`flag-${flag.flagKey}`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-semibold">{flag.flagKey}</h3>
                        <Badge variant={flag.enabled ? "default" : "secondary"}>
                          {flag.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      {flag.description && (
                        <p className="text-sm text-muted-foreground mt-1">{flag.description}</p>
                      )}
                      {flag.allowedRoles && flag.allowedRoles.length > 0 && (
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <p className="text-xs text-muted-foreground">Allowed roles:</p>
                          {flag.allowedRoles.map((role: string) => (
                            <Badge key={role} variant="outline" className="text-xs">
                              {role}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Dialog open={roleDialogOpen && selectedFlag?.id === flag.id} onOpenChange={setRoleDialogOpen}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openRoleDialog(flag)}
                            data-testid={`button-roles-${flag.flagKey}`}
                          >
                            <Settings className="w-4 h-4 mr-2" />
                            Roles
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Manage Allowed Roles</DialogTitle>
                            <DialogDescription>
                              Select which user roles can access {flag.flagKey}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              {['driver', 'owner', 'admin', 'super_admin'].map(role => (
                                <div key={role} className="flex items-center space-x-2">
                                  <input
                                    type="checkbox"
                                    id={`role-${role}`}
                                    checked={selectedRoles.includes(role)}
                                    onChange={() => toggleRole(role)}
                                    className="w-4 h-4"
                                  />
                                  <Label htmlFor={`role-${role}`} className="capitalize cursor-pointer">
                                    {role.replace('_', ' ')}
                                  </Label>
                                </div>
                              ))}
                            </div>
                            <Button
                              onClick={handleUpdateRoles}
                              disabled={updateRolesMutation.isPending}
                              className="w-full"
                              data-testid="button-save-roles"
                            >
                              Save Roles
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>

                      <Dialog open={overrideDialogOpen && selectedFlag?.id === flag.id} onOpenChange={setOverrideDialogOpen}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openOverrideDialog(flag)}
                            data-testid={`button-override-${flag.flagKey}`}
                          >
                            <UserPlus className="w-4 h-4 mr-2" />
                            Override
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Add User Override</DialogTitle>
                            <DialogDescription>
                              Set a user-specific override for {flag.flagKey}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label htmlFor="user-select">Select User</Label>
                              <Select value={userEmail} onValueChange={setUserEmail}>
                                <SelectTrigger id="user-select" data-testid="select-user">
                                  <SelectValue placeholder="Choose a user" />
                                </SelectTrigger>
                                <SelectContent>
                                  {[
                                    ...((users as any)?.drivers?.map((d: any) => d.users) || []),
                                    ...((users as any)?.owners?.map((o: any) => o.users) || []),
                                    ...((users as any)?.admins || []),
                                  ].map((user: any) => (
                                    <SelectItem key={user.id} value={user.email}>
                                      {user.email} ({user.role})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Switch
                                checked={overrideEnabled}
                                onCheckedChange={setOverrideEnabled}
                                id="override-enabled"
                                data-testid="switch-override-enabled"
                              />
                              <Label htmlFor="override-enabled">
                                {overrideEnabled ? "Enable" : "Disable"} for this user
                              </Label>
                            </div>
                            <Button
                              onClick={handleAddOverride}
                              disabled={overrideMutation.isPending || !userEmail}
                              className="w-full"
                              data-testid="button-add-override"
                            >
                              Add Override
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>

                      <Switch
                        checked={flag.enabled}
                        onCheckedChange={(enabled) =>
                          toggleMutation.mutate({ flagKey: flag.flagKey, enabled })
                        }
                        disabled={toggleMutation.isPending}
                        data-testid={`switch-${flag.flagKey}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Usage Guide */}
        <Card>
          <CardHeader>
            <CardTitle>How to Use Feature Flags in Code</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Frontend (React):</h4>
              <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { FEATURE_FLAGS } from "@shared/featureFlags";

function MyComponent() {
  const { enabled, isLoading } = useFeatureFlag(FEATURE_FLAGS.RUBBLE_SERVICE);
  
  if (isLoading) return <Loading />;
  if (!enabled) return null;
  
  return <RubbleServiceUI />;
}`}
              </pre>
            </div>
            <div>
              <h4 className="font-medium mb-2">Backend (Express):</h4>
              <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`import { FEATURE_FLAGS } from "@shared/featureFlags";

app.post("/api/rubble-service", isAuthenticated, async (req, res) => {
  const enabled = await storage.checkFeatureFlag(
    FEATURE_FLAGS.RUBBLE_SERVICE, 
    req.user.id, 
    req.user.role
  );
  
  if (!enabled) {
    return res.status(404).json({ message: "Not found" });
  }
  
  // Handle rubble service request
});`}
              </pre>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
