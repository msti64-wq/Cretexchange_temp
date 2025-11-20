import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { MobileNav } from "@/components/MobileNav";
import { Settings, Database, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import logoImage from "@assets/cretexchange logo_1760644229633.png";

export default function AdminSettings() {
  const { toast } = useToast();
  const [backfillResult, setBackfillResult] = useState<any>(null);

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
