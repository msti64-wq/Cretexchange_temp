import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
import { DollarSign, RefreshCw, AlertCircle, CheckCircle, Clock, Download } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatAddress } from "@shared/addressUtils";

// Types
interface FeeLedger {
  id: string;
  ownerId: string;
  feeType: string;
  locationId: string | null;
  amountCents: number;
  periodStart: string;
  periodEnd: string;
  status: string;
  walletTxId: string | null;
  columnTransferId: string | null;
  batchId: string | null;
  paidAt: string | null;
  failureReason: string | null;
  retryCount: number;
  metadata: any;
  createdAt: string;
  updatedAt: string;
  owner?: {
    id: string;
    companyName: string | null;
    user: {
      firstName: string;
      lastName: string;
      email: string;
    };
  };
  location?: {
    name: string;
    street: string;
    city: string;
    state: string;
    zip: string;
  } | null;
}

interface FeeSummary {
  pending: { count: number; totalAmount: number };
  paid: { count: number; totalAmount: number };
  failed: { count: number; totalAmount: number };
  total: { count: number; totalAmount: number };
}

// Safe date formatting helper
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString();
  } catch {
    return 'N/A';
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'paid':
      return <Badge className="bg-green-500" data-testid={`badge-status-paid`}><CheckCircle className="w-3 h-3 mr-1" /> Paid</Badge>;
    case 'pending':
      return <Badge className="bg-yellow-500" data-testid={`badge-status-pending`}><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
    case 'failed':
      return <Badge variant="destructive" data-testid={`badge-status-failed`}><AlertCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
    case 'past_due':
      return <Badge variant="destructive" data-testid={`badge-status-pastdue`}>Past Due</Badge>;
    default:
      return <Badge variant="secondary" data-testid={`badge-status-${status}`}>{status}</Badge>;
  }
};

const getFeeTypeBadge = (feeType: string) => {
  switch (feeType) {
    case 'location_monthly':
      return <Badge variant="outline" data-testid="badge-feetype-location">Location Fee</Badge>;
    case 'subscription_monthly':
      return <Badge variant="outline" data-testid="badge-feetype-subscription-monthly">Monthly Subscription</Badge>;
    case 'subscription_annual':
      return <Badge variant="outline" data-testid="badge-feetype-subscription-annual">Annual Subscription</Badge>;
    default:
      return <Badge variant="secondary" data-testid={`badge-feetype-${feeType}`}>{feeType}</Badge>;
  }
};

export default function AdminFees() {
  const { toast } = useToast();
  const [filterStatus, setFilterStatus] = useState("pending");

  const { data: summary, isLoading: summaryLoading, error: summaryError } = useQuery<FeeSummary>({
    queryKey: ['/api/admin/fees/summary'],
    retry: false,
  });

  const { data: fees, isLoading: feesLoading, error: feesError, refetch } = useQuery<FeeLedger[]>({
    queryKey: ['/api/admin/fees/ledger', filterStatus],
    queryFn: async () => {
      const response = await fetch(`/api/admin/fees/ledger?status=${filterStatus}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch fees');
      return response.json();
    },
    retry: false,
  });

  const generateFeesMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/admin/fees/generate', 'POST', {});
    },
    onSuccess: (data) => {
      toast({
        title: "Fees Generated",
        description: `Created ${data.result.created} fee entries for ${data.result.owners.length} owners`,
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/fees/summary'] });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate fees",
        variant: "destructive",
      });
    },
  });

  const retryFeeMutation = useMutation({
    mutationFn: async (feeId: string) => {
      return apiRequest(`/api/admin/fees/${feeId}/retry`, 'POST', {});
    },
    onSuccess: (data) => {
      toast({
        title: "Fee Retry Initiated",
        description: `Processed: ${data.result.processed}, Failed: ${data.result.failed}`,
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/fees/summary'] });
    },
    onError: (error: any) => {
      toast({
        title: "Retry Failed",
        description: error.message || "Failed to retry fee",
        variant: "destructive",
      });
    },
  });

  // Handle unauthorized error
  useEffect(() => {
    const error = summaryError || feesError;
    if (error && isUnauthorizedError(error as Error)) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [summaryError, feesError, toast]);

  const handleExport = () => {
    try {
      const csvContent = [
        'Owner,Email,Fee Type,Amount,Period Start,Period End,Status,Paid At,Failure Reason,Retry Count,Created',
        ...(fees || []).map((fee: FeeLedger) => 
          `"${fee.owner?.companyName || 'N/A'}","${fee.owner?.user.email || 'N/A'}","${fee.feeType}","${formatCurrency(fee.amountCents / 100)}","${fee.periodStart}","${fee.periodEnd}","${fee.status}","${formatDate(fee.paidAt)}","${fee.failureReason || 'N/A'}","${fee.retryCount}","${formatDate(fee.createdAt)}"`
        )
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fees-${filterStatus}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export Successful",
        description: "Fee data has been exported to CSV",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export data",
        variant: "destructive",
      });
    }
  };

  if (summaryLoading || feesLoading) {
    return (
      <>
        <MobileNav />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">Loading...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <MobileNav />
      <div className="container mx-auto px-4 py-8 pb-20">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold" data-testid="heading-fees">Monthly Billing & Fees</h1>
          <Button 
            onClick={() => generateFeesMutation.mutate()}
            disabled={generateFeesMutation.isPending}
            data-testid="button-generate-fees"
          >
            {generateFeesMutation.isPending ? "Generating..." : "Generate Fees (Test)"}
          </Button>
        </div>

        {/* Summary Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Pending Fees"
            value={summary?.pending.count || 0}
            subtitle={formatCurrency(summary?.pending.totalAmount || 0)}
            icon={<Clock className="h-4 w-4 text-yellow-500" />}
            trend="info"
            dataTestId="stat-pending-fees"
          />
          <StatCard
            title="Paid Fees"
            value={summary?.paid.count || 0}
            subtitle={formatCurrency(summary?.paid.totalAmount || 0)}
            icon={<CheckCircle className="h-4 w-4 text-green-500" />}
            trend="info"
            dataTestId="stat-paid-fees"
          />
          <StatCard
            title="Failed Fees"
            value={summary?.failed.count || 0}
            subtitle={formatCurrency(summary?.failed.totalAmount || 0)}
            icon={<AlertCircle className="h-4 w-4 text-red-500" />}
            trend="info"
            dataTestId="stat-failed-fees"
          />
          <StatCard
            title="Total Fees"
            value={summary?.total.count || 0}
            subtitle={formatCurrency(summary?.total.totalAmount || 0)}
            icon={<DollarSign className="h-4 w-4 text-blue-500" />}
            trend="info"
            dataTestId="stat-total-fees"
          />
        </div>

        {/* Filter Controls */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="w-full sm:w-auto">
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-fee-status">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" data-testid="option-status-all">All Fees</SelectItem>
                      <SelectItem value="pending" data-testid="option-status-pending">Pending</SelectItem>
                      <SelectItem value="paid" data-testid="option-status-paid">Paid</SelectItem>
                      <SelectItem value="failed" data-testid="option-status-failed">Failed</SelectItem>
                      <SelectItem value="past_due" data-testid="option-status-pastdue">Past Due</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleExport} variant="outline" data-testid="button-export-fees">
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Fees Table */}
        <Card>
          <CardHeader>
            <CardTitle>Fee Ledger ({(fees || []).length} entries)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Owner</TableHead>
                    <TableHead>Fee Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Paid At</TableHead>
                    <TableHead>Retry Count</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(fees || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground">
                        No fees found
                      </TableCell>
                    </TableRow>
                  ) : (
                    (fees || []).map((fee) => (
                      <TableRow key={fee.id} data-testid={`row-fee-${fee.id}`}>
                        <TableCell data-testid={`cell-owner-${fee.id}`}>
                          <div>
                            <div className="font-medium">{fee.owner?.companyName || 'N/A'}</div>
                            <div className="text-sm text-muted-foreground">{fee.owner?.user.email}</div>
                          </div>
                        </TableCell>
                        <TableCell data-testid={`cell-type-${fee.id}`}>{getFeeTypeBadge(fee.feeType)}</TableCell>
                        <TableCell data-testid={`cell-amount-${fee.id}`} className="font-medium">
                          {formatCurrency(fee.amountCents / 100)}
                        </TableCell>
                        <TableCell data-testid={`cell-period-${fee.id}`}>
                          <div className="text-sm">
                            {fee.periodStart} to {fee.periodEnd}
                          </div>
                        </TableCell>
                        <TableCell data-testid={`cell-status-${fee.id}`}>{getStatusBadge(fee.status)}</TableCell>
                        <TableCell data-testid={`cell-location-${fee.id}`}>
                          {fee.location ? (
                            <div className="text-sm">
                              <div className="font-medium">{fee.location.name}</div>
                              <div className="text-muted-foreground">
                                {formatAddress({
                                  street: fee.location.street,
                                  city: fee.location.city,
                                  state: fee.location.state,
                                  zip: fee.location.zip
                                })}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell data-testid={`cell-paidat-${fee.id}`}>{formatDate(fee.paidAt)}</TableCell>
                        <TableCell data-testid={`cell-retrycount-${fee.id}`}>
                          {fee.retryCount > 0 ? (
                            <Badge variant="secondary">{fee.retryCount}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell data-testid={`cell-actions-${fee.id}`}>
                          {fee.status === 'failed' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => retryFeeMutation.mutate(fee.id)}
                              disabled={retryFeeMutation.isPending}
                              data-testid={`button-retry-${fee.id}`}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Retry
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
