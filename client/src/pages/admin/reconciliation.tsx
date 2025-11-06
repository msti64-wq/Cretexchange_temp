import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MobileNav } from "@/components/MobileNav";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/utils";
import { RefreshCw, TestTube, Zap, CheckCircle, AlertTriangle, Info, DollarSign } from "lucide-react";

interface ReconciliationResult {
  reconciliationId: string;
  status: string;
  accountsChecked: number;
  discrepanciesFound: number;
  totalAmountDiscrepancy: number;
  discrepancies: Array<{
    accountType: string;
    accountId: string;
    userId: string;
    username: string;
    type: string;
    databaseBalance: number;
    stripeBalance: number;
    difference: number;
    severity: 'critical' | 'warning' | 'minor';
  }>;
}

export default function AdminReconciliation() {
  const { toast } = useToast();
  const [lastResult, setLastResult] = useState<ReconciliationResult | null>(null);

  const runReconciliationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/reconciliation/run-daily", {});
      return response.json();
    },
    onSuccess: (data) => {
      setLastResult(data);
      toast({
        title: "Reconciliation Complete",
        description: `Checked ${data.accountsChecked} accounts, found ${data.discrepanciesFound} discrepancies`,
      });
    },
    onError: () => {
      toast({
        title: "Reconciliation Failed",
        description: "An error occurred while running reconciliation",
        variant: "destructive",
      });
    },
  });

  const injectDiscrepancyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/reconciliation/test-discrepancy", {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Test Discrepancy Injected",
        description: `Injected $5.00 discrepancy for driver ${data.driverId}`,
      });
    },
    onError: () => {
      toast({
        title: "Failed to Inject Discrepancy",
        variant: "destructive",
      });
    },
  });

  const testPaymentFlowMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/reconciliation/test-payment-flow", {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Payment Flow Test Complete",
        description: `Test payment: ${data.message}`,
      });
    },
    onError: () => {
      toast({
        title: "Payment Flow Test Failed",
        variant: "destructive",
      });
    },
  });

  const getSeverityBadge = (severity: 'critical' | 'warning' | 'minor') => {
    const variants = {
      critical: { variant: "destructive" as const, icon: AlertTriangle },
      warning: { variant: "default" as const, icon: AlertTriangle },
      minor: { variant: "secondary" as const, icon: Info },
    };
    
    const config = variants[severity];
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="w-3 h-3" />
        {severity.toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen pb-20 bg-background">
      <div className="container mx-auto p-4 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2" data-testid="text-page-title">Balance Reconciliation</h1>
          <p className="text-muted-foreground" data-testid="text-page-description">
            Monitor and correct balance discrepancies between database and Stripe
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5" />
                Manual Reconciliation
              </CardTitle>
              <CardDescription>
                Run a full balance reconciliation across all driver accounts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => runReconciliationMutation.mutate()}
                disabled={runReconciliationMutation.isPending}
                className="w-full"
                data-testid="button-run-reconciliation"
              >
                {runReconciliationMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Running Reconciliation...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Run Full Reconciliation
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Compares database balances with Stripe and auto-corrects discrepancies
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Quick Actions
              </CardTitle>
              <CardDescription>
                Testing and diagnostic tools
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={() => injectDiscrepancyMutation.mutate()}
                disabled={injectDiscrepancyMutation.isPending}
                variant="outline"
                className="w-full"
                data-testid="button-inject-discrepancy"
              >
                {injectDiscrepancyMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Injecting...
                  </>
                ) : (
                  <>
                    <TestTube className="w-4 h-4 mr-2" />
                    Inject Test Discrepancy
                  </>
                )}
              </Button>
              
              <Button
                onClick={() => testPaymentFlowMutation.mutate()}
                disabled={testPaymentFlowMutation.isPending}
                variant="outline"
                className="w-full"
                data-testid="button-test-payment"
              >
                {testPaymentFlowMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <DollarSign className="w-4 h-4 mr-2" />
                    Test Payment Flow
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {lastResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                Last Reconciliation Results
              </CardTitle>
              <CardDescription>
                Run ID: {lastResult.reconciliationId}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3 mb-6">
                <div className="p-4 rounded-lg bg-muted">
                  <div className="text-sm text-muted-foreground mb-1">Accounts Checked</div>
                  <div className="text-2xl font-bold" data-testid="text-accounts-checked">
                    {lastResult.accountsChecked}
                  </div>
                </div>
                
                <div className="p-4 rounded-lg bg-muted">
                  <div className="text-sm text-muted-foreground mb-1">Discrepancies Found</div>
                  <div className="text-2xl font-bold" data-testid="text-discrepancies-found">
                    {lastResult.discrepanciesFound}
                  </div>
                </div>
                
                <div className="p-4 rounded-lg bg-muted">
                  <div className="text-sm text-muted-foreground mb-1">Total Discrepancy</div>
                  <div className="text-2xl font-bold" data-testid="text-total-discrepancy">
                    {formatCurrency(lastResult.totalAmountDiscrepancy)}
                  </div>
                </div>
              </div>

              {lastResult.discrepancies.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">Discrepancy Details</h3>
                  <div className="space-y-3">
                    {lastResult.discrepancies.map((disc, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-lg border bg-card"
                        data-testid={`discrepancy-${idx}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="font-medium" data-testid={`text-username-${idx}`}>
                              {disc.username}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {disc.accountType} • User ID: {disc.userId}
                            </div>
                          </div>
                          {getSeverityBadge(disc.severity)}
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
                          <div>
                            <div className="text-muted-foreground">Database</div>
                            <div className="font-medium" data-testid={`text-db-balance-${idx}`}>
                              {formatCurrency(disc.databaseBalance)}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Stripe</div>
                            <div className="font-medium" data-testid={`text-stripe-balance-${idx}`}>
                              {formatCurrency(disc.stripeBalance)}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Difference</div>
                            <div className="font-medium text-destructive" data-testid={`text-difference-${idx}`}>
                              {formatCurrency(disc.difference)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {lastResult.discrepancies.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-600" />
                  <p>All balances match! No discrepancies found.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>How Reconciliation Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex gap-2">
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-600" />
              <p>
                <strong>Automated Daily Checks:</strong> Reconciliation runs automatically every day via cron job
              </p>
            </div>
            <div className="flex gap-2">
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-600" />
              <p>
                <strong>Auto-Correction:</strong> When discrepancies are detected, database balances are automatically updated to match Stripe (source of truth)
              </p>
            </div>
            <div className="flex gap-2">
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-600" />
              <p>
                <strong>Severity Classification:</strong> Critical (&gt;$10), Warning ($1-$10), Minor ($0.01-$1)
              </p>
            </div>
            <div className="flex gap-2">
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-600" />
              <p>
                <strong>Audit Trail:</strong> All discrepancies are logged with full details for compliance and troubleshooting
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <MobileNav role="super_admin" />
    </div>
  );
}
