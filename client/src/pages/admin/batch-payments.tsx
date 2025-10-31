import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { MobileNav } from "@/components/MobileNav";
import { CreditCard, Clock, CheckCircle, XCircle, Play, RefreshCw, DollarSign, Users } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface PendingPayment {
  id: string;
  activityId: string;
  driverId: string;
  ownerId: string;
  locationId: string;
  driverAmount: string;
  platformFee: string;
  totalAmount: string;
  status: string;
  batchId: string | null;
  processedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  metadata: any;
}

interface WashoutPaymentBatch {
  id: string;
  ownerId: string;
  batchTime: string;
  paymentCount: number;
  totalDriverPayments: string;
  totalPlatformFees: string;
  totalOwnerCharge: string;
  status: string;
  stripePaymentIntentId: string | null;
  processingStartedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  owner?: {
    companyName: string;
    user: {
      username: string;
    };
  };
}

export default function AdminBatchPayments() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedBatch, setSelectedBatch] = useState<WashoutPaymentBatch | null>(null);

  // Fetch pending payments
  const { data: pendingPayments, isLoading: loadingPending } = useQuery<PendingPayment[]>({
    queryKey: ['/api/admin/pending-payments'],
    retry: false,
  });

  // Fetch batch history
  const { data: batchHistory, isLoading: loadingHistory } = useQuery<WashoutPaymentBatch[]>({
    queryKey: ['/api/admin/payment-batches'],
    retry: false,
  });

  // Process batch mutation
  const processBatchMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/payments/process-batch', {
        method: 'POST',
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pending-payments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payment-batches'] });
      toast({
        title: "Batch Processing Complete",
        description: data.message || `Processed ${data.batchesProcessed || 0} batches successfully`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Processing Failed",
        description: error.message || "Failed to process batch payments",
        variant: "destructive",
      });
    },
  });

  // Group pending payments by owner
  const paymentsByOwner = (pendingPayments || []).reduce((acc, payment) => {
    if (!acc[payment.ownerId]) {
      acc[payment.ownerId] = [];
    }
    acc[payment.ownerId].push(payment);
    return acc;
  }, {} as Record<string, PendingPayment[]>);

  const queuedPayments = (pendingPayments || []).filter(p => p.status === 'queued');
  const processingPayments = (pendingPayments || []).filter(p => p.status === 'processing');
  const totalQueuedAmount = queuedPayments.reduce((sum, p) => sum + parseFloat(p.totalAmount), 0);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      'queued': { variant: 'outline', icon: Clock, label: 'Queued' },
      'processing': { variant: 'default', icon: RefreshCw, label: 'Processing' },
      'processed': { variant: 'default', icon: CheckCircle, label: 'Processed', className: 'bg-green-500' },
      'completed': { variant: 'default', icon: CheckCircle, label: 'Completed', className: 'bg-green-500' },
      'failed': { variant: 'destructive', icon: XCircle, label: 'Failed' },
    };

    const config = variants[status] || variants['queued'];
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className={config.className}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  if (loadingPending || loadingHistory) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading batch payment data...</p>
          </div>
        </div>
        <MobileNav role={user?.role} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Batch Payment Management</h1>
            <p className="text-muted-foreground">Manage hourly batch processing for washout payments</p>
          </div>
          <Button
            onClick={() => processBatchMutation.mutate()}
            disabled={processBatchMutation.isPending || queuedPayments.length === 0}
            size="lg"
            data-testid="button-process-batch"
          >
            {processBatchMutation.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Process Batch Now
              </>
            )}
          </Button>
        </div>

        {/* Statistics */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card data-testid="stat-queued-payments">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Queued Payments</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{queuedPayments.length}</div>
            </CardContent>
          </Card>
          <Card data-testid="stat-queued-amount">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Queued Amount</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalQueuedAmount)}</div>
            </CardContent>
          </Card>
          <Card data-testid="stat-owners-affected">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Owners Affected</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Object.keys(paymentsByOwner).length}</div>
            </CardContent>
          </Card>
          <Card data-testid="stat-processing">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Processing</CardTitle>
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{processingPayments.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Pending Payments by Owner */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Pending Payments by Owner
            </CardTitle>
          </CardHeader>
          <CardContent>
            {queuedPayments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No pending payments. All payments have been processed!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(paymentsByOwner).map(([ownerId, payments]) => {
                  const totalDriverPayments = payments.reduce((sum, p) => sum + parseFloat(p.driverAmount), 0);
                  const totalPlatformFees = payments.reduce((sum, p) => sum + parseFloat(p.platformFee), 0);
                  const totalOwnerCharge = payments.reduce((sum, p) => sum + parseFloat(p.totalAmount), 0);

                  return (
                    <div key={ownerId} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-semibold">Owner: {ownerId}</h3>
                          <p className="text-sm text-muted-foreground">
                            {payments.length} pending payments
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Total Charge</p>
                          <p className="text-lg font-bold">{formatCurrency(totalOwnerCharge)}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Driver Payouts</p>
                          <p className="font-semibold">{formatCurrency(totalDriverPayments)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Platform Fees</p>
                          <p className="font-semibold">{formatCurrency(totalPlatformFees)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Payments</p>
                          <p className="font-semibold">{payments.length}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Batch Processing History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Batch Processing History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!batchHistory || batchHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No batch history yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch Time</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead className="text-right">Payments</TableHead>
                      <TableHead className="text-right">Total Charge</TableHead>
                      <TableHead className="text-right">Driver Payouts</TableHead>
                      <TableHead className="text-right">Platform Fees</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Stripe ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batchHistory.map((batch) => (
                      <TableRow key={batch.id} data-testid={`batch-row-${batch.id}`}>
                        <TableCell className="font-medium">
                          {new Date(batch.batchTime).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {batch.owner?.companyName || batch.owner?.user?.username || batch.ownerId}
                        </TableCell>
                        <TableCell className="text-right">{batch.paymentCount}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(parseFloat(batch.totalOwnerCharge))}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(parseFloat(batch.totalDriverPayments))}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(parseFloat(batch.totalPlatformFees))}
                        </TableCell>
                        <TableCell>{getStatusBadge(batch.status)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {batch.stripePaymentIntentId ? (
                            <span className="text-blue-600">{batch.stripePaymentIntentId.substring(0, 20)}...</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Help Section */}
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-sm">About Batch Processing</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>Hourly Batch Processing:</strong> Washout payments are queued when owners approve washouts, 
              then processed in hourly batches to minimize transaction fees.
            </p>
            <p>
              <strong>Single Charge per Owner:</strong> All pending washouts for an owner are combined into a single 
              credit card charge, with metadata showing the driver payment splits.
            </p>
            <p>
              <strong>Automatic Processing:</strong> Batches run automatically every hour via cron, or can be manually 
              triggered using the "Process Batch Now" button above.
            </p>
            <p>
              <strong>Payment Flow:</strong> Owner's card is charged → Funds are transferred to each driver's Stripe 
              Connect account → Platform fee is automatically collected by Stripe.
            </p>
          </CardContent>
        </Card>
      </div>

      <MobileNav role={user?.role} />
    </div>
  );
}
