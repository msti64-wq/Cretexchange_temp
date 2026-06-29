import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { Flag, RefreshCw, Shield, UserPlus, Settings } from "lucide-react";
import { Link } from "wouter";
import { DSCard, DSSectionHeader, DSStatusChip, DSTableShell, dsTokens } from "@/components/design-system";

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
  const currentPlatformFee = Math.max(
    parseFloat((systemSettings as any)?.platformWashoutFee || "5.00"),
    0.0,
  ).toFixed(2);

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

  const refreshFlagsMutation = useMutation({
    mutationFn: async () => {
      // Force a refetch by returning the query result
      await queryClient.refetchQueries({ queryKey: ['/api/feature-flags'] });
    },
    onSuccess: () => {
      toast({
        title: "Flags Refreshed",
        description: "Feature flags have been reloaded from the server.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Refresh Failed",
        description: error.message || "Failed to refresh feature flags",
        variant: "destructive",
      });
    },
  });

  const handleUpdatePlatformFee = () => {
    const feeValue = parseFloat(platformFee);
    if (isNaN(feeValue) || feeValue < 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid number zero or greater",
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
      <div className="sticky top-0 z-10 border-b border-border/70 bg-card/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="hover:opacity-80 transition-opacity">
              <Button variant="ghost" size="sm" className="h-9 text-foreground hover:bg-muted">
                ← Back
              </Button>
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Admin tools</p>
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: dsTokens.colors.pageTitle }}>Feature Flags</h1>
              <p className="text-sm" style={{ color: dsTokens.colors.bodyText }}>Control feature rollouts.</p>
            </div>
          </div>
          <Shield className="h-8 w-8 text-muted-foreground" />
        </div>
      </div>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-5">
        {/* Info Card */}
        <DSCard padding="lg" elevated className="border-border/70 bg-muted/30">
          <div className="flex items-start gap-3">
            <Flag className="mt-0.5 h-5 w-5 text-primary" />
            <div className="flex-1">
                <h3 className="mb-2 text-base font-semibold" style={{ color: dsTokens.colors.sectionTitle }}>
                  Feature Flag System
                </h3>
                <p className="mb-3 text-sm" style={{ color: dsTokens.colors.bodyText }}>
                  Safely roll out new features with granular control over access.
                </p>
                <ul className="ml-2 list-inside list-disc space-y-1 text-sm" style={{ color: dsTokens.colors.bodyText }}>
                  <li>Global on/off switches for instant feature control</li>
                  <li>Role-based access (driver, owner, admin)</li>
                  <li>User-specific overrides for beta testing</li>
                </ul>
            </div>
          </div>
        </DSCard>

        {/* Platform Settings */}
        <DSCard padding="lg" elevated>
          <DSSectionHeader
            title="Platform Settings"
            description="Configure global platform parameters."
            actions={<Settings className="h-6 w-6 text-muted-foreground" />}
          />
          <div className="mt-4 space-y-4">
            {/* Platform Washout Fee */}
            <div className="rounded-xl border border-border/70 bg-background/70 p-4 space-y-3 shadow-sm dark:bg-background/40">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-base font-semibold" style={{ color: dsTokens.colors.sectionTitle }}>Platform Fee per Washout</h3>
                  <p className="mt-1 text-sm" style={{ color: dsTokens.colors.bodyText }}>
                    Fee charged per completed washout (blank/default can be overridden by a superadmin to $0.00; currently ${currentPlatformFee})
                  </p>
                  <p className="mt-2 text-xs" style={{ color: dsTokens.colors.helperText }}>
                    Leave blank to use the current default. Enter 0.00 to waive the fee. Superadmins can override the default rate per owner or location.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Label htmlFor="platform-fee">New Fee Amount ($)</Label>
                  <div className="mt-1 flex items-stretch overflow-hidden rounded-md border border-border bg-card shadow-sm transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
                    <span className="inline-flex items-center border-r border-border bg-muted/80 px-3 text-sm font-medium text-foreground/80">
                      $
                    </span>
                    <Input
                      id="platform-fee"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={currentPlatformFee}
                      value={platformFee}
                      onChange={(e) => setPlatformFee(e.target.value)}
                      className="border-0 bg-transparent px-3 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      data-testid="input-platform-fee"
                    />
                  </div>
                  <p className="mt-2 text-xs text-foreground/75">Enter dollars per approved washout.</p>
                </div>
                <Button
                  onClick={handleUpdatePlatformFee}
                  disabled={!platformFee || updatePlatformFeeMutation.isPending}
                  data-testid="button-update-platform-fee"
                >
                  {updatePlatformFeeMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Settings className="h-4 w-4" />
                      Update Fee
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DSCard>

        {/* Feature Flags List */}
        <DSCard padding="lg" elevated>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <DSSectionHeader
              title="Active Feature Flags"
              description="Manage platform feature rollout, overrides, and role access."
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => seedFlagsMutation.mutate()}
                disabled={seedFlagsMutation.isPending}
                data-testid="button-sync-flags"
              >
                <Flag className={`h-4 w-4 ${seedFlagsMutation.isPending ? 'animate-spin' : ''}`} />
                {seedFlagsMutation.isPending ? 'Syncing...' : 'Sync Flags'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refreshFlagsMutation.mutate()}
                disabled={refreshFlagsMutation.isPending}
                data-testid="button-refresh-flags"
              >
                <RefreshCw className={`h-4 w-4 ${refreshFlagsMutation.isPending ? 'animate-spin' : ''}`} />
                {refreshFlagsMutation.isPending ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </div>
          <div className="mt-4">
            {isLoading ? (
              <div className="rounded-xl border border-border/70 bg-background/70 px-6 py-10 text-center shadow-sm dark:bg-background/40">
                <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm font-medium" style={{ color: dsTokens.colors.operationalText }}>Loading feature flags...</p>
                <p className="mt-1 text-sm" style={{ color: dsTokens.colors.helperText }}>Fetching current rollout state from the server.</p>
              </div>
            ) : flags.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/40 px-6 py-12 text-center">
                <Flag className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <p className="mb-4 text-sm" style={{ color: dsTokens.colors.operationalText }}>No feature flags configured.</p>
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
                <p className="mt-3 text-sm" style={{ color: dsTokens.colors.helperText }}>
                  This will initialize all predefined feature flags for the platform
                </p>
              </div>
            ) : (
              <DSTableShell
                density="compact"
                title="Feature Flags"
                description="Toggle global access, configure role access, and set user overrides."
              >
                <div className="min-w-[880px]">
                  <div className="grid grid-cols-[minmax(220px,1.4fr)_minmax(220px,1.1fr)_minmax(180px,0.9fr)_auto] gap-4 border-b px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: dsTokens.colors.metadataText }}>
                    <div>Flag</div>
                    <div>Description</div>
                    <div>Roles</div>
                    <div className="text-right">Actions</div>
                  </div>
                  <div className="divide-y">
                    {flags.map((flag: any) => (
                      <div
                        key={flag.id}
                        className="grid grid-cols-[minmax(220px,1.4fr)_minmax(220px,1.1fr)_minmax(180px,0.9fr)_auto] items-center gap-4 px-4 py-4 transition-colors hover:bg-muted/40"
                        data-testid={`flag-${flag.flagKey}`}
                      >
                        <div className="min-w-0 space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate text-sm font-semibold" style={{ color: dsTokens.colors.operationalText }}>{flag.flagKey}</h3>
                            <DSStatusChip tone={flag.enabled ? "success" : "neutral"} size="sm">
                              {flag.enabled ? "Enabled" : "Disabled"}
                            </DSStatusChip>
                          </div>
                          <p className="text-xs" style={{ color: dsTokens.colors.helperText }}>
                            {flag.name || "Feature flag"}
                          </p>
                        </div>
                        <div className="min-w-0">
                          {flag.description ? (
                            <p className="text-sm" style={{ color: dsTokens.colors.bodyText }}>{flag.description}</p>
                          ) : (
                            <span className="text-sm" style={{ color: dsTokens.colors.helperText }}>No description available.</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          {flag.allowedRoles && flag.allowedRoles.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {flag.allowedRoles.map((role: string) => (
                                <DSStatusChip key={role} tone="neutral" size="sm">
                                  {role}
                                </DSStatusChip>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm" style={{ color: dsTokens.colors.helperText }}>All roles</span>
                          )}
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                      <Dialog open={roleDialogOpen && selectedFlag?.id === flag.id} onOpenChange={setRoleDialogOpen}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openRoleDialog(flag)}
                            data-testid={`button-roles-${flag.flagKey}`}
                          >
                            <Settings className="h-4 w-4" />
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
                            <UserPlus className="h-4 w-4" />
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
                </div>
              </DSTableShell>
            )}
          </div>
        </DSCard>

        {/* Usage Guide */}
        <DSCard padding="lg" elevated>
          <DSSectionHeader
            title="How to Use Feature Flags in Code"
            description="Example usage for frontend and backend checks."
          />
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <h4 className="mb-2 font-medium text-foreground">Frontend (React)</h4>
              <pre className="overflow-x-auto rounded-xl border border-border/70 bg-muted p-4 text-xs text-foreground shadow-sm dark:bg-background/60">
{`import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { FEATURE_FLAGS } from "@shared/featureFlags";

function MyComponent() {
  const { enabled, isLoading } = useFeatureFlag(FEATURE_FLAGS.RUBBLE_SERVICE);
  
  if (isLoading) return <Loading />;
  if (!enabled) return null;

  return <div>RUBBLE_SERVICE UI goes here (illustrative example only).</div>;
}`}
              </pre>
            </div>
            <div>
              <h4 className="mb-2 font-medium text-foreground">Backend (Express)</h4>
              <pre className="overflow-x-auto rounded-xl border border-border/70 bg-muted p-4 text-xs text-foreground shadow-sm dark:bg-background/60">
{`import { FEATURE_FLAGS } from "@shared/featureFlags";

// Illustrative example only: check the RUBBLE_SERVICE flag before exposing rubble-specific behavior.
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
          </div>
        </DSCard>
      </main>
    </div>
  );
}
