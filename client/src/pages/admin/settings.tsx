import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { MobileNav } from "@/components/MobileNav";
import { Settings, Database, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import logoImage from "@assets/cretexchange logo_1760644229633.png";

export default function AdminSettings() {
  const { toast } = useToast();
  const [backfillResult, setBackfillResult] = useState<any>(null);
  const [stripeAccountResult, setStripeAccountResult] = useState<any>(null);
  const [migrationResult, setMigrationResult] = useState<any>(null);
  const [capabilityResult, setCapabilityResult] = useState<any>(null);
  const [ipOverride, setIpOverride] = useState<string>("");
  const [migrationIpOverride, setMigrationIpOverride] = useState<string>("");

  const backfillMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("/api/admin/backfill-owner-payment-methods", {
        method: "POST",
      });
      return response.json();
    },
    onSuccess: (data) => {
      setBackfillResult(data);
      toast({
        title: "Backfill Complete",
        description: `Successfully synced ${data.backfilled} owner payment methods from Stripe.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Backfill Failed",
        description: error.message || "Failed to backfill payment methods",
        variant: "destructive",
      });
    },
  });

  const stripeAccountMutation = useMutation({
    mutationFn: async (ipOverride?: string) => {
      const response = await apiRequest("/api/admin/backfill-stripe-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ipOverride ? { ipOverride } : {}),
      });
      return response.json();
    },
    onSuccess: (data) => {
      setStripeAccountResult(data);
      toast({
        title: "Stripe Account Creation Complete",
        description: `Created ${data.driversCreated} driver accounts and ${data.ownersCreated} owner accounts.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Stripe Account Creation Failed",
        description: error.message || "Failed to create Stripe accounts",
        variant: "destructive",
      });
    },
  });

  const migrationMutation = useMutation({
    mutationFn: async (ipOverride?: string) => {
      const response = await apiRequest("/api/admin/migrate-custom-to-express", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ipOverride ? { ipOverride } : {}),
      });
      return response.json();
    },
    onSuccess: (data) => {
      setMigrationResult(data);
      toast({
        title: "Migration Complete",
        description: `Successfully migrated ${data.migrated} driver accounts from Custom to Express.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Migration Failed",
        description: error.message || "Failed to migrate Stripe accounts",
        variant: "destructive",
      });
    },
  });

  const capabilityMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("/api/admin/backfill-driver-capabilities", {
        method: "POST",
      });
      return response.json();
    },
    onSuccess: (data) => {
      setCapabilityResult(data);
      toast({
        title: "Capability Update Complete",
        description: `Updated ${data.updated} driver accounts with transfers capability.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Capability Update Failed",
        description: error.message || "Failed to update driver capabilities",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src={logoImage} alt="CreteXchange" className="h-8 w-auto" />
            <h1 className="text-xl font-bold">System Settings</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto p-4 space-y-6 max-w-4xl">
        {/* System Maintenance Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Database Maintenance
            </CardTitle>
            <CardDescription>
              System maintenance tools for database synchronization and data integrity
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Payment Method Backfill */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <h3 className="font-semibold">Sync Owner Payment Methods</h3>
                  <p className="text-sm text-muted-foreground">
                    This tool syncs payment methods from Stripe to the local database for existing owners. 
                    Use this if owners are unable to add locations due to "payment method required" errors, 
                    even though they have valid payment methods saved in Stripe.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <strong>What it does:</strong> Fetches default payment methods from Stripe for all owners 
                    who have a Stripe Customer ID but are missing the payment method ID in the database, 
                    then updates the database accordingly.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => backfillMutation.mutate()}
                  disabled={backfillMutation.isPending}
                  data-testid="button-backfill-payment-methods"
                >
                  {backfillMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4 mr-2" />
                      Run Payment Method Sync
                    </>
                  )}
                </Button>
              </div>

              {/* Results Display */}
              {backfillResult && (
                <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    Sync Results
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total Owners:</span>
                      <span className="ml-2 font-semibold" data-testid="text-backfill-total">
                        {backfillResult.total}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Successfully Synced:</span>
                      <span className="ml-2 font-semibold text-green-600" data-testid="text-backfill-synced">
                        {backfillResult.backfilled}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Already Had Payment Method:</span>
                      <span className="ml-2 font-semibold" data-testid="text-backfill-already-had">
                        {backfillResult.alreadyHadPaymentMethod}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">No Stripe Customer:</span>
                      <span className="ml-2 font-semibold" data-testid="text-backfill-no-customer">
                        {backfillResult.noStripeCustomer}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">No Payment Method in Stripe:</span>
                      <span className="ml-2 font-semibold" data-testid="text-backfill-no-method">
                        {backfillResult.noPaymentMethodInStripe}
                      </span>
                    </div>
                    {backfillResult.errors.length > 0 && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Errors:</span>
                        <span className="ml-2 font-semibold text-red-600">
                          {backfillResult.errors.length}
                        </span>
                        <div className="mt-2 text-xs text-red-600 max-h-32 overflow-y-auto">
                          {backfillResult.errors.map((error: string, i: number) => (
                            <div key={i}>{error}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Stripe Account Backfill */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <h3 className="font-semibold">Create Stripe Accounts for Existing Users</h3>
                  <p className="text-sm text-muted-foreground">
                    This tool creates Stripe Connect accounts for drivers and Stripe Customer accounts for owners 
                    who don't already have them. Essential for payment processing to work correctly.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <strong>What it does:</strong> Scans all users and creates Stripe Connect accounts (for drivers) 
                    and Stripe Customer accounts (for owners) for users missing them. This enables payment processing 
                    for washout activities.
                  </p>
                </div>
              </div>

              {/* Optional IP Override for IPv6-only networks */}
              <div className="space-y-2">
                <Label htmlFor="ip-override" className="text-sm text-muted-foreground">
                  IP Override (Optional)
                </Label>
                <Input
                  id="ip-override"
                  type="text"
                  placeholder="e.g., 192.168.1.1"
                  value={ipOverride}
                  onChange={(e) => setIpOverride(e.target.value)}
                  className="max-w-xs"
                  data-testid="input-ip-override"
                />
                <p className="text-xs text-muted-foreground">
                  Only needed if running from IPv6-only network. Provide a valid IPv4 address for Stripe TOS compliance.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => stripeAccountMutation.mutate(ipOverride || undefined)}
                  disabled={stripeAccountMutation.isPending}
                  data-testid="button-create-stripe-accounts"
                >
                  {stripeAccountMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating Accounts...
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4 mr-2" />
                      Create Stripe Accounts
                    </>
                  )}
                </Button>
              </div>

              {/* Results Display */}
              {stripeAccountResult && (
                <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    Creation Results
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total Users:</span>
                      <span className="ml-2 font-semibold" data-testid="text-stripe-total">
                        {stripeAccountResult.totalUsers}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Drivers Created:</span>
                      <span className="ml-2 font-semibold text-green-600" data-testid="text-stripe-drivers-created">
                        {stripeAccountResult.driversCreated}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Drivers Already Had Account:</span>
                      <span className="ml-2 font-semibold" data-testid="text-stripe-drivers-had">
                        {stripeAccountResult.driversAlreadyHad}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Owners Created:</span>
                      <span className="ml-2 font-semibold text-green-600" data-testid="text-stripe-owners-created">
                        {stripeAccountResult.ownersCreated}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Owners Already Had Account:</span>
                      <span className="ml-2 font-semibold" data-testid="text-stripe-owners-had">
                        {stripeAccountResult.ownersAlreadyHad}
                      </span>
                    </div>
                    {stripeAccountResult.errors.length > 0 && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Errors:</span>
                        <span className="ml-2 font-semibold text-red-600">
                          {stripeAccountResult.errors.length}
                        </span>
                        <div className="mt-2 text-xs text-red-600 max-h-32 overflow-y-auto">
                          {stripeAccountResult.errors.map((error: string, i: number) => (
                            <div key={i}>{error}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Custom to Express Migration */}
            <div className="border rounded-lg p-4 space-y-3 bg-amber-50 dark:bg-amber-950/20">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                    Migrate Custom Accounts to Express (CRITICAL FIX)
                  </h3>
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    <strong>Why this is needed:</strong> Existing driver Stripe accounts were created as Custom accounts, 
                    which require manual capability activation and cannot accept Terms of Service programmatically. 
                    This causes "Terms of service acceptance" and "transfers capability not active" errors.
                  </p>
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    <strong>What this does:</strong> Deletes old Custom accounts and creates new Express accounts for all drivers. 
                    Express accounts auto-activate the `transfers` capability needed for destination charges, and drivers 
                    can complete TOS acceptance through Stripe's hosted onboarding UI.
                  </p>
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    <strong>After migration:</strong> Drivers will need to complete onboarding via their profile page 
                    to accept TOS and provide bank account details.
                  </p>
                </div>
              </div>

              {/* Optional IP Override */}
              <div className="space-y-2">
                <Label htmlFor="migration-ip-override" className="text-sm text-amber-800 dark:text-amber-200">
                  IP Override (Optional)
                </Label>
                <Input
                  id="migration-ip-override"
                  type="text"
                  placeholder="e.g., 8.8.8.8"
                  value={migrationIpOverride}
                  onChange={(e) => setMigrationIpOverride(e.target.value)}
                  className="max-w-xs"
                  data-testid="input-migration-ip-override"
                />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Required if running from IPv6-only network. Provide a valid IPv4 address.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => migrationMutation.mutate(migrationIpOverride || undefined)}
                  disabled={migrationMutation.isPending}
                  variant="default"
                  className="bg-amber-600 hover:bg-amber-700"
                  data-testid="button-migrate-to-express"
                >
                  {migrationMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Migrating...
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4 mr-2" />
                      Migrate to Express Accounts
                    </>
                  )}
                </Button>
              </div>

              {/* Results Display */}
              {migrationResult && (
                <div className="mt-4 p-4 bg-white dark:bg-gray-900 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    Migration Results
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total Drivers:</span>
                      <span className="ml-2 font-semibold" data-testid="text-migration-total">
                        {migrationResult.totalDrivers}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Processed:</span>
                      <span className="ml-2 font-semibold" data-testid="text-migration-processed">
                        {migrationResult.processed}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Successfully Migrated:</span>
                      <span className="ml-2 font-semibold text-green-600" data-testid="text-migration-migrated">
                        {migrationResult.migrated}
                      </span>
                    </div>
                    {migrationResult.errors.length > 0 && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Errors:</span>
                        <span className="ml-2 font-semibold text-red-600">
                          {migrationResult.errors.length}
                        </span>
                        <div className="mt-2 text-xs text-red-600 max-h-32 overflow-y-auto">
                          {migrationResult.errors.map((error: string, i: number) => (
                            <div key={i}>{error}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Driver Capability Backfill */}
            <div className="border rounded-lg p-4 space-y-3 bg-blue-50 dark:bg-blue-950/20">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                    Enable Transfers Capability for Drivers
                  </h3>
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Why this is needed:</strong> Driver accounts need the `transfers` capability enabled to receive 
                    payments via Destination Charges. Existing accounts may not have this capability requested.
                  </p>
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>What this does:</strong> Updates all existing driver Stripe Connect accounts to request the 
                    `transfers` and `card_payments` capabilities. Drivers will then need to complete onboarding to activate these capabilities.
                  </p>
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>After running:</strong> Ask drivers to complete their Stripe onboarding via the profile page to activate the transfers capability.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => capabilityMutation.mutate()}
                  disabled={capabilityMutation.isPending}
                  variant="default"
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid="button-update-driver-capabilities"
                >
                  {capabilityMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Updating Capabilities...
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4 mr-2" />
                      Update Driver Capabilities
                    </>
                  )}
                </Button>
              </div>

              {/* Results Display */}
              {capabilityResult && (
                <div className="mt-4 p-4 bg-white dark:bg-gray-900 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    Capability Update Results
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total Drivers:</span>
                      <span className="ml-2 font-semibold" data-testid="text-capability-total">
                        {capabilityResult.total}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Successfully Updated:</span>
                      <span className="ml-2 font-semibold text-green-600" data-testid="text-capability-updated">
                        {capabilityResult.updated}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Skipped (No Stripe Account):</span>
                      <span className="ml-2 font-semibold" data-testid="text-capability-skipped">
                        {capabilityResult.skipped}
                      </span>
                    </div>
                    {capabilityResult.errors && capabilityResult.errors.length > 0 && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Errors:</span>
                        <span className="ml-2 font-semibold text-red-600">
                          {capabilityResult.errors.length}
                        </span>
                        <div className="mt-2 text-xs text-red-600 max-h-32 overflow-y-auto">
                          {capabilityResult.errors.map((error: any, i: number) => (
                            <div key={i}>{error.username}: {error.error}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Links to Other Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Other Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => window.location.href = '/feature-flags'}
                data-testid="link-feature-flags"
              >
                Feature Flags Management
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mobile Navigation */}
      <MobileNav userRole="super_admin" />
    </div>
  );
}
