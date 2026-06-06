import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { MobileNav } from "@/components/MobileNav";
import { 
  Settings, 
  Clock, 
  Calendar, 
  Building2, 
  Loader2, 
  CheckCircle2,
  AlertCircle,
  Zap,
  CalendarDays,
  CalendarRange
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatCurrencyFromCents } from "@/lib/utils";

interface OwnerBillingSettings {
  ownerId: string;
  companyName: string;
  username: string;
  billingCadence: string;
  billingCutoffTime: string;
  billingTimezone: string;
  billingDayOfWeek: number;
}

interface BillingSettingsResponse {
  owners: OwnerBillingSettings[];
  billingCadenceOptions: { value: string; label: string }[];
  dayOfWeekOptions: { value: number; label: string }[];
  timezoneOptions: string[];
  immediateBillingOwners?: ImmediateBillingOwner[];
  immediateBillingHistory?: ImmediateBillingHistory[];
  immediateBillingSummary?: {
    ownerCount: number;
    approvedWashoutCount: number;
    platformFeesOwedCents: number;
    platformFeesPaidCents: number;
    platformFeesTotalCents: number;
    paidBatchCount: number;
    failedBatchCount: number;
  };
}

interface ImmediateBillingOwner {
  ownerId: string;
  companyName: string;
  username: string;
  billingCadence: string;
  approvedWashoutCount: number;
  platformFeesOwedCents: number;
  platformFeesOwed: string;
  paymentMethodStatus: string;
  paymentMethodStatusLabel?: string;
  stripeCustomerIdSource?: "owner" | "user" | null;
  stripePaymentMethodSource?: "owner" | "user" | null;
  hasStripeCustomer: boolean;
  hasPaymentMethod: boolean;
  lastBillingAttemptAt: string | null;
  lastBillingStatus: string;
  lastBillingWashoutCount: number;
  lastBillingAmountCents: number;
  lastStripePaymentIntentId: string | null;
  lastStripeChargeId: string | null;
  billingReconciliationStatus?: string | null;
  billingReconciliationDeltaCents?: number;
  billingReconciliationNote?: string | null;
}

interface ImmediateBillingHistory {
  batchId: string;
  ownerId: string;
  companyName: string;
  username: string;
  billingCadence: string;
  date: string | null;
  amountCents: number;
  washoutCount: number;
  status: string;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  failureReason: string | null;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getCadenceIcon(cadence: string) {
  switch (cadence) {
    case 'daily':
      return <CalendarDays className="w-4 h-4 text-blue-500" />;
    case 'weekly':
      return <CalendarRange className="w-4 h-4 text-purple-500" />;
    case 'monthly':
      return <Calendar className="w-4 h-4 text-indigo-500" />;
    case 'immediate':
      return <Zap className="w-4 h-4 text-yellow-500" />;
    default:
      return <Clock className="w-4 h-4" />;
  }
}

function getCadenceBadge(cadence: string) {
  switch (cadence) {
    case 'daily':
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Daily</Badge>;
    case 'weekly':
      return <Badge variant="secondary" className="bg-purple-100 text-purple-800">Weekly</Badge>;
    case 'monthly':
      return <Badge variant="secondary" className="bg-indigo-100 text-indigo-800">Monthly</Badge>;
    case 'immediate':
      return <Badge variant="outline">Legacy Immediate</Badge>;
    default:
      return <Badge variant="outline">{cadence}</Badge>;
  }
}

export default function AdminBillingSettings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedOwner, setSelectedOwner] = useState<OwnerBillingSettings | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  
  const [editForm, setEditForm] = useState({
    billingCadence: 'weekly',
    billingCutoffTime: '23:59',
    billingTimezone: 'America/Chicago',
    billingDayOfWeek: 0
  });

  const [bulkForm, setBulkForm] = useState({
    billingCadence: 'weekly',
    billingCutoffTime: '23:59',
    billingTimezone: 'America/Chicago',
    billingDayOfWeek: 0
  });

  const { data: billingData, isLoading } = useQuery<BillingSettingsResponse>({
    queryKey: ['/api/admin/billing/settings'],
    retry: false,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ ownerId, settings }: { ownerId: string; settings: any }) => {
      const response = await apiRequest(`/api/admin/billing/settings/${ownerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/billing/settings'] });
      setEditDialogOpen(false);
      toast({
        title: "Settings Updated",
        description: "Owner billing settings have been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update billing settings",
        variant: "destructive",
      });
    },
  });

  const runImmediateBillingMutation = useMutation({
    mutationFn: async (ownerId: string) => {
      const response = await apiRequest("POST", "/api/admin/billing/process-batches", {
        ownerId,
        runType: "admin_manual",
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/billing/settings'] });
      toast({
        title: "Billing Run Started",
        description: data?.message || "Immediate billing was processed successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Billing Run Failed",
        description: error.message || "Failed to run billing now",
        variant: "destructive",
      });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (settings: any) => {
      const response = await apiRequest('/api/admin/billing/settings/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/billing/settings'] });
      setBulkDialogOpen(false);
      toast({
        title: "Bulk Update Complete",
        description: `Updated billing settings for ${data.updated} owners.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Bulk Update Failed",
        description: error.message || "Failed to bulk update billing settings",
        variant: "destructive",
      });
    },
  });

  const handleEditOwner = (owner: OwnerBillingSettings) => {
    setSelectedOwner(owner);
    setEditForm({
      billingCadence: ['immediate', 'daily', 'weekly', 'monthly'].includes(owner.billingCadence) ? owner.billingCadence : 'weekly',
      billingCutoffTime: owner.billingCutoffTime.substring(0, 5),
      billingTimezone: owner.billingTimezone,
      billingDayOfWeek: owner.billingDayOfWeek
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedOwner) return;
    updateMutation.mutate({
      ownerId: selectedOwner.ownerId,
      settings: editForm
    });
  };

  const handleBulkUpdate = () => {
    bulkUpdateMutation.mutate(bulkForm);
  };

  const cadenceStats = billingData?.owners.reduce((acc, owner) => {
    acc[owner.billingCadence] = (acc[owner.billingCadence] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};
  const immediateBillingOwners = billingData?.immediateBillingOwners || [];
  const immediateBillingHistory = billingData?.immediateBillingHistory || [];
  const immediateBillingSummary = billingData?.immediateBillingSummary || {
    ownerCount: 0,
    approvedWashoutCount: 0,
    platformFeesOwedCents: 0,
    platformFeesPaidCents: 0,
    platformFeesTotalCents: 0,
    paidBatchCount: 0,
    failedBatchCount: 0,
  };

  const formatDateTime = (value: string | null) => {
    if (!value) return "Never";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "Never" : parsed.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="gradient-bg text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">Payment Processing Settings</h1>
              <p className="text-white/80 text-sm">Manage owner billing schedules</p>
            </div>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Billing Cadence Overview
            </CardTitle>
            <CardDescription>
              Configure when owner charges are requested and processed for each owner
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-lg border bg-blue-50 dark:bg-blue-900/20">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarDays className="w-5 h-5 text-blue-600" />
                  <span className="font-medium">Daily</span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  Charges batched and processed at end of day
                </p>
                <p className="text-2xl font-bold">{cadenceStats['daily'] || 0}</p>
                <p className="text-xs text-muted-foreground">owners</p>
              </div>
              
              <div className="p-4 rounded-lg border bg-purple-50 dark:bg-purple-900/20">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarRange className="w-5 h-5 text-purple-600" />
                  <span className="font-medium">Weekly</span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  Charges batched and processed at end of week
                </p>
                <p className="text-2xl font-bold">{cadenceStats['weekly'] || 0}</p>
                <p className="text-xs text-muted-foreground">owners</p>
              </div>
              
              <div className="p-4 rounded-lg border bg-indigo-50 dark:bg-indigo-900/20">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                  <span className="font-medium">Monthly</span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  Charges batched and processed at end of month
                </p>
                <p className="text-2xl font-bold">{cadenceStats['monthly'] || 0}</p>
                <p className="text-xs text-muted-foreground">owners</p>
              </div>
            </div>

            <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full md:w-auto" data-testid="button-bulk-update">
                  <Settings className="w-4 h-4 mr-2" />
                  Bulk Update All Owners
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Bulk Update Billing Settings</DialogTitle>
                  <DialogDescription>
                    Update billing cadence for all owners at once.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Billing Cadence</Label>
                    <Select 
                      value={bulkForm.billingCadence} 
                      onValueChange={(v) => setBulkForm(f => ({ ...f, billingCadence: v }))}
                    >
                      <SelectTrigger data-testid="select-bulk-cadence">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="immediate">Immediate (real-time processing)</SelectItem>
                        <SelectItem value="daily">Daily (end of day batch)</SelectItem>
                        <SelectItem value="weekly">Weekly (end of week batch)</SelectItem>
                        <SelectItem value="monthly">Monthly (end of month batch)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Cutoff Time</Label>
                    <Select 
                      value={bulkForm.billingCutoffTime} 
                      onValueChange={(v) => setBulkForm(f => ({ ...f, billingCutoffTime: v }))}
                    >
                      <SelectTrigger data-testid="select-bulk-cutoff">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="18:00">6:00 PM</SelectItem>
                        <SelectItem value="20:00">8:00 PM</SelectItem>
                        <SelectItem value="22:00">10:00 PM</SelectItem>
                        <SelectItem value="23:59">11:59 PM (End of Day)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Timezone</Label>
                    <Select 
                      value={bulkForm.billingTimezone} 
                      onValueChange={(v) => setBulkForm(f => ({ ...f, billingTimezone: v }))}
                    >
                      <SelectTrigger data-testid="select-bulk-timezone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="America/New_York">Eastern Time</SelectItem>
                        <SelectItem value="America/Chicago">Central Time</SelectItem>
                        <SelectItem value="America/Denver">Mountain Time</SelectItem>
                        <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                        <SelectItem value="America/Phoenix">Arizona (no DST)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {bulkForm.billingCadence === 'weekly' && (
                    <div className="space-y-2">
                      <Label>Processing Day</Label>
                      <Select 
                        value={bulkForm.billingDayOfWeek.toString()} 
                        onValueChange={(v) => setBulkForm(f => ({ ...f, billingDayOfWeek: parseInt(v) }))}
                      >
                        <SelectTrigger data-testid="select-bulk-day">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DAY_NAMES.map((day, idx) => (
                            <SelectItem key={idx} value={idx.toString()}>{day}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {bulkForm.billingCadence === 'monthly' && (
                    <div className="space-y-2">
                      <Label>Monthly Processing</Label>
                      <p className="text-sm text-muted-foreground">
                        Monthly billing runs on the last day of each month in the owner's timezone.
                      </p>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
                  <Button 
                    onClick={handleBulkUpdate} 
                    disabled={bulkUpdateMutation.isPending}
                    data-testid="button-confirm-bulk"
                  >
                    {bulkUpdateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Update All Owners
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Immediate Billing Owners
            </CardTitle>
            <CardDescription>
              Owners configured for immediate billing can be charged now for approved washouts owed to the platform.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Immediate owners</p>
                <p className="mt-2 text-2xl font-semibold" data-testid="text-immediate-owner-count">
                  {immediateBillingSummary.ownerCount}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Approved washouts</p>
                <p className="mt-2 text-2xl font-semibold" data-testid="text-immediate-approved-count">
                  {immediateBillingSummary.approvedWashoutCount}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Current platform receivables</p>
                <p className="mt-2 text-2xl font-semibold" data-testid="text-immediate-owed">
                  {formatCurrencyFromCents(immediateBillingSummary.platformFeesOwedCents)}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Paid platform fees</p>
                <p className="mt-2 text-2xl font-semibold" data-testid="text-immediate-paid-amount">
                  {formatCurrencyFromCents(immediateBillingSummary.platformFeesPaidCents)}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Total platform fees</p>
                <p className="mt-2 text-2xl font-semibold" data-testid="text-immediate-total-amount">
                  {formatCurrencyFromCents(immediateBillingSummary.platformFeesTotalCents)}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Billing outcomes</p>
                <p className="mt-2 text-2xl font-semibold" data-testid="text-immediate-paid-count">
                  {immediateBillingSummary.paidBatchCount}
                </p>
                <p className="text-xs text-muted-foreground">
                  {immediateBillingSummary.failedBatchCount} failed
                </p>
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Owner</TableHead>
                    <TableHead>Cadence</TableHead>
                    <TableHead className="hidden md:table-cell">Approved</TableHead>
                    <TableHead>Fees Owed</TableHead>
                    <TableHead>Card / Stripe</TableHead>
                    <TableHead className="hidden lg:table-cell">Last Attempt</TableHead>
                    <TableHead className="hidden lg:table-cell">Last Stripe IDs</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {immediateBillingOwners.length > 0 ? immediateBillingOwners.map((owner) => (
                    <TableRow key={owner.ownerId} data-testid={`row-immediate-owner-${owner.ownerId}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{owner.companyName}</p>
                          <p className="text-sm text-muted-foreground">@{owner.username}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-900">
                          {owner.billingCadence}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {owner.approvedWashoutCount}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{formatCurrencyFromCents(owner.platformFeesOwedCents)}</div>
                        <p className="text-xs text-muted-foreground">{owner.platformFeesOwed} owed</p>
                        {owner.billingReconciliationNote && (
                          <p className={`mt-1 text-xs ${owner.billingReconciliationStatus === "overcharged" ? "text-red-600" : "text-amber-600"}`}>
                            {owner.billingReconciliationNote}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={owner.hasStripeCustomer && owner.hasPaymentMethod ? "default" : "destructive"}>
                          {owner.paymentMethodStatusLabel === "ready_for_billing"
                            ? "Card on file / Ready for billing"
                            : owner.paymentMethodStatusLabel === "missing_payment_method"
                              ? "Card missing"
                              : "Missing customer identification"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="text-sm">
                          <p>{formatDateTime(owner.lastBillingAttemptAt)}</p>
                          <p className="text-xs text-muted-foreground">Status: {owner.lastBillingStatus}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="text-xs font-mono text-muted-foreground space-y-1">
                          <p>{owner.lastStripePaymentIntentId || "—"}</p>
                          <p>{owner.lastStripeChargeId || "—"}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => runImmediateBillingMutation.mutate(owner.ownerId)}
                          disabled={runImmediateBillingMutation.isPending}
                          data-testid={`button-run-billing-${owner.ownerId}`}
                        >
                          {runImmediateBillingMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Zap className="w-4 h-4 mr-2" />
                          )}
                          Run Billing Now
                        </Button>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        No owners are currently configured for immediate billing.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-md border">
              <div className="border-b px-4 py-3">
                <h3 className="font-medium">Immediate Billing History</h3>
                <p className="text-sm text-muted-foreground">
                  Recent owner billing runs and Stripe transaction records.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Washouts</TableHead>
                    <TableHead className="hidden md:table-cell">Stripe Intent</TableHead>
                    <TableHead className="hidden lg:table-cell">Stripe Charge</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {immediateBillingHistory.length > 0 ? immediateBillingHistory.map((entry) => (
                    <TableRow key={entry.batchId} data-testid={`row-billing-history-${entry.batchId}`}>
                      <TableCell>{formatDateTime(entry.date)}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{entry.companyName}</p>
                          <p className="text-sm text-muted-foreground">@{entry.username}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={entry.status === "completed" ? "default" : entry.status === "failed" ? "destructive" : "secondary"}>
                          {entry.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatCurrency(entry.amountCents / 100)}</TableCell>
                      <TableCell>{entry.washoutCount}</TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-xs">{entry.stripePaymentIntentId || "—"}</TableCell>
                      <TableCell className="hidden lg:table-cell font-mono text-xs">{entry.stripeChargeId || "—"}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        No immediate billing history is available yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Owner Billing Settings
            </CardTitle>
            <CardDescription>
              Individual billing cadence configuration for each location owner
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Owner</TableHead>
                      <TableHead>Billing Cadence</TableHead>
                      <TableHead className="hidden md:table-cell">Cutoff Time</TableHead>
                      <TableHead className="hidden md:table-cell">Timezone</TableHead>
                      <TableHead className="hidden lg:table-cell">Weekly Day</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billingData?.owners.map((owner) => (
                      <TableRow key={owner.ownerId} data-testid={`row-owner-${owner.ownerId}`}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{owner.companyName}</p>
                            <p className="text-sm text-muted-foreground">@{owner.username}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getCadenceIcon(owner.billingCadence)}
                            {getCadenceBadge(owner.billingCadence)}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {owner.billingCutoffTime.substring(0, 5)}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {owner.billingTimezone.replace('America/', '')}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {owner.billingCadence === 'weekly' ? (
                            DAY_NAMES[owner.billingDayOfWeek]
                          ) : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEditOwner(owner)}
                            data-testid={`button-edit-${owner.ownerId}`}
                          >
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!billingData?.owners || billingData.owners.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No owners found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Billing Settings</DialogTitle>
              <DialogDescription>
                {selectedOwner && `Configure billing settings for ${selectedOwner.companyName}`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Billing Cadence</Label>
                <Select 
                  value={editForm.billingCadence} 
                  onValueChange={(v) => setEditForm(f => ({ ...f, billingCadence: v }))}
                >
                  <SelectTrigger data-testid="select-edit-cadence">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">Immediate (real-time processing)</SelectItem>
                    <SelectItem value="daily">Daily (end of day batch)</SelectItem>
                    <SelectItem value="weekly">Weekly (end of week batch)</SelectItem>
                    <SelectItem value="monthly">Monthly (end of month batch)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {editForm.billingCadence === 'immediate' && 'Payments are processed in real time when washouts are approved.'}
                  {editForm.billingCadence === 'daily' && 'All payments will be batched and processed together at the end of each day.'}
                  {editForm.billingCadence === 'weekly' && 'All payments will be batched and processed together at the end of each week.'}
                  {editForm.billingCadence === 'monthly' && 'All payments will be batched and processed together at the end of each month.'}
                </p>
              </div>
              
              <div className="space-y-2">
                <Label>Cutoff Time</Label>
                <Select 
                  value={editForm.billingCutoffTime} 
                  onValueChange={(v) => setEditForm(f => ({ ...f, billingCutoffTime: v }))}
                >
                  <SelectTrigger data-testid="select-edit-cutoff">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="18:00">6:00 PM</SelectItem>
                    <SelectItem value="20:00">8:00 PM</SelectItem>
                    <SelectItem value="22:00">10:00 PM</SelectItem>
                    <SelectItem value="23:59">11:59 PM (End of Day)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Washouts completed before this time will be included in that day's batch.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select 
                  value={editForm.billingTimezone} 
                  onValueChange={(v) => setEditForm(f => ({ ...f, billingTimezone: v }))}
                >
                  <SelectTrigger data-testid="select-edit-timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/New_York">Eastern Time</SelectItem>
                    <SelectItem value="America/Chicago">Central Time</SelectItem>
                    <SelectItem value="America/Denver">Mountain Time</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                    <SelectItem value="America/Phoenix">Arizona (no DST)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {editForm.billingCadence === 'weekly' && (
                <div className="space-y-2">
                  <Label>Processing Day</Label>
                  <Select 
                    value={editForm.billingDayOfWeek.toString()} 
                    onValueChange={(v) => setEditForm(f => ({ ...f, billingDayOfWeek: parseInt(v) }))}
                  >
                    <SelectTrigger data-testid="select-edit-day">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAY_NAMES.map((day, idx) => (
                        <SelectItem key={idx} value={idx.toString()}>{day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Payments will be batched and processed on this day of the week.
                  </p>
                </div>
              )}
              {editForm.billingCadence === 'monthly' && (
                <div className="space-y-2">
                  <Label>Monthly Processing</Label>
                  <p className="text-xs text-muted-foreground">
                    Payments will be batched and processed on the last day of the month in the owner's timezone.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button 
                onClick={handleSaveEdit} 
                disabled={updateMutation.isPending}
                data-testid="button-save-edit"
              >
                {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Important Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
              <p><strong>Daily mode</strong> batches approved washouts once per day.</p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
              <p><strong>Weekly mode</strong> batches approved washouts once per week.</p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
              <p><strong>Monthly mode</strong> batches approved washouts on the last day of the month.</p>
            </div>
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5" />
              <p>Changes take effect immediately for new washouts. Pending payments will be processed according to their original settings.</p>
            </div>
          </CardContent>
        </Card>
      </main>

      <MobileNav role={user?.role} />
    </div>
  );
}
