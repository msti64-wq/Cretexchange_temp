import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface SystemSettings {
  id: string;
  automaticTaxEnabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export default function AdminSettings() {
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<SystemSettings>({
    queryKey: ['/api/admin/settings'],
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: { automaticTaxEnabled: boolean }) => {
      return apiRequest('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: "Settings updated",
        description: "System settings have been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update settings",
      });
    },
  });

  const handleToggleTax = (enabled: boolean) => {
    updateSettingsMutation.mutate({ automaticTaxEnabled: enabled });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" data-testid="loading-spinner" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2" data-testid="heading-settings">System Settings</h1>
        <p className="text-muted-foreground">
          Configure global platform settings (Super Admin only)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle data-testid="heading-stripe-tax">Stripe Automatic Tax</CardTitle>
          <CardDescription>
            Enable or disable automatic tax calculation for all payments
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="automatic-tax" className="text-base">
                Enable Automatic Tax
              </Label>
              <p className="text-sm text-muted-foreground">
                Calculate and collect sales tax automatically using Stripe Tax
              </p>
            </div>
            <Switch
              id="automatic-tax"
              checked={settings?.automaticTaxEnabled || false}
              onCheckedChange={handleToggleTax}
              disabled={updateSettingsMutation.isPending}
              data-testid="switch-automatic-tax"
            />
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Implementation Status: Foundation Only</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                This toggle is currently a feature flag that enables/disables automatic tax infrastructure.
                <strong> Full implementation requires additional development:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 mt-2 text-sm">
                <li>Integration with Stripe Tax Calculation API</li>
                <li>Customer address collection (billing/shipping)</li>
                <li>Tax code assignment for products/services</li>
                <li>Tax transaction recording after payments</li>
                <li>Tax registration setup in Stripe Dashboard</li>
              </ul>
              <p className="mt-2 text-sm font-medium">
                Current status: {settings?.automaticTaxEnabled ? 'Enabled' : 'Disabled'} (toggle ready for future integration)
              </p>
            </AlertDescription>
          </Alert>

          {settings?.automaticTaxEnabled && (
            <Alert variant="default" className="bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <AlertTitle>Tax Registration Required</AlertTitle>
              <AlertDescription>
                Before collecting tax, you must add your tax registrations in the{" "}
                <a 
                  href="https://dashboard.stripe.com/tax/registrations" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  Stripe Dashboard
                </a>
                . Stripe Tax only calculates tax for jurisdictions where you're registered.
              </AlertDescription>
            </Alert>
          )}

          <div className="text-xs text-muted-foreground border-t pt-4">
            <p>
              <strong>Stripe Tax Pricing:</strong> 0.5% per transaction (0.4% over $100k/month) + free until first registration added
            </p>
            <p className="mt-1">
              <strong>Documentation:</strong>{" "}
              <a 
                href="https://docs.stripe.com/tax/custom?api-integration=elements" 
                target="_blank" 
                rel="noopener noreferrer"
                className="underline"
                data-testid="link-stripe-docs"
              >
                Stripe Tax for Custom Integrations
              </a>
            </p>
            {settings?.updatedAt && (
              <p className="mt-2">
                Last updated: {new Date(settings.updatedAt).toLocaleString()}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
