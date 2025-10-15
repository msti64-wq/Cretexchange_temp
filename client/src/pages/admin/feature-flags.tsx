import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useFeatureFlags } from "@/hooks/useFeatureFlag";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Flag, RefreshCw, Shield } from "lucide-react";
import { Link } from "wouter";

export default function AdminFeatureFlags() {
  const { toast } = useToast();
  const { flags, isLoading } = useFeatureFlags();

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="h-32 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Feature Flags</h1>
              <p className="text-muted-foreground">Control feature rollouts across the platform</p>
            </div>
          </div>
          <Link href="/admin/dashboard">
            <Button variant="outline" data-testid="button-back-dashboard">
              Back to Dashboard
            </Button>
          </Link>
        </div>

        {/* Info Card */}
        <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Flag className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  What are Feature Flags?
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Feature flags let you enable or disable features without deploying new code. Use them for:
                </p>
                <ul className="text-sm text-blue-700 dark:text-blue-300 list-disc list-inside ml-2 space-y-1">
                  <li>Gradual feature rollouts to test with real users</li>
                  <li>Emergency feature disable if issues arise</li>
                  <li>A/B testing different features</li>
                  <li>Role-based feature access</li>
                </ul>
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
                <p className="text-muted-foreground">No feature flags configured</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Feature flags will appear here once they're added to the system
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {flags.map((flag: any) => (
                  <div
                    key={flag.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    data-testid={`flag-${flag.flagKey}`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold">{flag.flagKey}</h3>
                        <Badge variant={flag.enabled ? "default" : "secondary"}>
                          {flag.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      {flag.description && (
                        <p className="text-sm text-muted-foreground mt-1">{flag.description}</p>
                      )}
                      {flag.allowedRoles && flag.allowedRoles.length > 0 && (
                        <div className="flex items-center gap-2 mt-2">
                          <p className="text-xs text-muted-foreground">Allowed roles:</p>
                          {flag.allowedRoles.map((role: string) => (
                            <Badge key={role} variant="outline" className="text-xs">
                              {role}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Switch
                      checked={flag.enabled}
                      onCheckedChange={(enabled) =>
                        toggleMutation.mutate({ flagKey: flag.flagKey, enabled })
                      }
                      disabled={toggleMutation.isPending}
                      data-testid={`switch-${flag.flagKey}`}
                    />
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

router.post("/api/rubble-service", requireAuth, async (req, res) => {
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
      </div>
    </div>
  );
}
