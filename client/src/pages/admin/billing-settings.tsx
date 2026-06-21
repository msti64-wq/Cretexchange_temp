import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
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
  CalendarRange,
  ShieldAlert
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
import { canViewOwnerBillingDryRunTool } from "@/lib/adminBilling";

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

interface DryRunValidation {
  passed: boolean;
  blockedForReview: boolean;
  reviewThresholdCents: number;
  reason: string | null;
}

interface DryRunOwnerBillingResult {
  dryRun: true;
  title: string;
  ledger: {
    approvedWashoutCount: number;
    platformFeeTotalCents: number;
    driverTipTotalCents: number;
    ownerChargeAmountCents: number;
    platformRevenueCents: number;
    driverTransfers: Array<{
      driverId: string;
      connectedAccountId: string;
      washoutActivityIds: string[];
      tipAmountCents: number;
      amountCents: number;
      transferId?: string | null;
      stripeChargeId?: string | null;
    }>;
  };
  stripePaymentIntentPreview: {
    amount: number;
    currency: string;
    customer: string | null;
    payment_method: string | null;
    confirm: boolean;
    off_session: boolean;
    payment_method_types: string[];
    description: string;
    metadata: Record<string, string>;
  };
  stripeTransferPreviews: Array<{
    amount: number;
    currency: string;
    destination: string;
    description: string;
    metadata: Record<string, string>;
  }>;
  validation: DryRunValidation;
  debugTipSources?: Array<{
    washoutActivityId: string;
    rawAmount: number | string | null;
    driverTipCents: number;
    source: "washout_activities.amount" | "washout_locations.rate" | "default" | string;
    connectedAccountId?: string | null;
  }>;
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
  const isSuperAdmin = canViewOwnerBillingDryRunTool((user as any)?.role);
  const [selectedOwner, setSelectedOwner] = useState<OwnerBillingSettings | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [previewOwnerId, setPreviewOwnerId] = useState("");
  const [previewBillingMode, setPreviewBillingMode] = useState<"immediate" | "weekly">("immediate");
  const [previewUseCurrentWashouts, setPreviewUseCurrentWashouts] = useState(true);
  const [previewWashoutIds, setPreviewWashoutIds] = useState("");
  const [previewResult, setPreviewResult] = useState<DryRunOwnerBillingResult | null>(null);
  
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

  const invalidateBillingReportingCaches = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/admin/billing/settings'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['/api/drivers/dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['/api/drivers/stripe-status'] });
    queryClient.invalidateQueries({ queryKey: ['/api/payments/driver-history'] });
  };

  useEffect(() => {
    if (!previewOwnerId && billingData?.owners?.length) {
      setPreviewOwnerId(billingData.owners[0].ownerId);
    }
  }, [billingData, previewOwnerId]);

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
      invalidateBillingReportingCaches();
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
      invalidateBillingReportingCaches();
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
      invalidateBillingReportingCaches();
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

  const previewTipRows = previewResult?.debugTipSources?.map((row) => {
    const matchedTransfer = previewResult.ledger.driverTransfers.find((transfer) =>
      transfer.washoutActivityIds.includes(row.washoutActivityId),
    );
    const connectedAccountId = row.connectedAccountId ?? matchedTransfer?.connectedAccountId ?? null;
    const driverReady = Boolean(connectedAccountId);
    return {
      ...row,
      connectedAccountId,
      driverReady,
      tipStatus: driverReady ? "ready" : "previewed",
    };
  }) || [];

  const previewBillingMutation = useMutation({
    mutationFn: async () => {
      const ownerId = previewOwnerId.trim();
      const washoutActivityIds = previewUseCurrentWashouts
        ? []
        : previewWashoutIds
            .split(/[\n,]/)
            .map((value) => value.trim())
            .filter(Boolean);

      const response = await apiRequest("POST", "/api/admin/billing/preview-owner-washout-charge", {
        ownerId,
        washoutActivityIds,
        billingMode: previewBillingMode,
      });

      return response.json() as Promise<DryRunOwnerBillingResult>;
    },
    onSuccess: (data) => {
      setPreviewResult(data);
      toast({
        title: "Dry run complete",
        description: "Owner billing preview loaded without creating a Stripe charge.",
      });
    },
    onError: (error: any) => {
      setPreviewResult(null);
      toast({
        title: "Dry run failed",
        description: error.message || "Unable to preview owner billing",
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

  const handlePreviewBilling = () => {
    previewBillingMutation.mutate();
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

        {isSuperAdmin && (
          <Card data-testid="card-owner-billing-preview">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5" />
                Dry-Run Owner Washout Charge
              </CardTitle>
              <CardDescription>
                Dry run only - no Stripe charge created.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="preview-owner">Owner</Label>
                  <Select value={previewOwnerId} onValueChange={setPreviewOwnerId}>
                    <SelectTrigger id="preview-owner" data-testid="select-preview-owner">
                      <SelectValue placeholder="Select owner" />
                    </SelectTrigger>
                    <SelectContent>
                      {billingData?.owners?.map((owner) => (
                        <SelectItem key={owner.ownerId} value={owner.ownerId}>
                          {owner.companyName} (@{owner.username})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="preview-mode">Billing mode</Label>
                  <Select value={previewBillingMode} onValueChange={(value) => setPreviewBillingMode(value === "weekly" ? "weekly" : "immediate")}>
                    <SelectTrigger id="preview-mode" data-testid="select-preview-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediate">Immediate preview</SelectItem>
                      <SelectItem value="weekly">Weekly preview</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="preview-washout-mode">Washout selection</Label>
                  <Select
                    value={previewUseCurrentWashouts ? "current" : "manual"}
                    onValueChange={(value) => setPreviewUseCurrentWashouts(value === "current")}
                  >
                    <SelectTrigger id="preview-washout-mode" data-testid="select-preview-washout-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current">Use current unbilled approved washouts</SelectItem>
                      <SelectItem value="manual">Enter washout IDs manually</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!previewUseCurrentWashouts && (
                <div className="space-y-2">
                  <Label htmlFor="preview-washout-ids">Washout IDs</Label>
                  <Textarea
                    id="preview-washout-ids"
                    value={previewWashoutIds}
                    onChange={(event) => setPreviewWashoutIds(event.target.value)}
                    placeholder="activity_1, activity_2, activity_3"
                    className="min-h-28"
                    data-testid="textarea-preview-washout-ids"
                  />
                  <p className="text-xs text-muted-foreground">
                    Separate IDs with commas or new lines. Leave this blank and keep the current option selected to preview all unbilled approved washouts.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={handlePreviewBilling}
                  disabled={previewBillingMutation.isPending || !previewOwnerId}
                  data-testid="button-preview-owner-billing"
                >
                  {previewBillingMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Preview Owner Billing
                </Button>
                <Badge variant="outline" data-testid="badge-preview-dry-run">
                  Dry run only
                </Badge>
              </div>

              {previewResult && (
                <div className="space-y-5 rounded-xl border bg-muted/20 p-4" data-testid="panel-owner-billing-preview-result">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">{previewResult.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {previewBillingMode === "immediate" ? "Immediate preview" : "Weekly preview"}
                      </p>
                    </div>
                    <Badge
                      variant={previewResult.validation.passed ? "default" : "destructive"}
                      data-testid="badge-preview-validation"
                    >
                      {previewResult.validation.passed ? "Validation passed" : "Validation failed"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <StatCard title="Approved Washouts" value={previewResult.ledger.approvedWashoutCount} />
                    <StatCard title="Platform Fees Total" value={formatCurrencyFromCents(previewResult.ledger.platformFeeTotalCents)} />
                    <StatCard title="Driver Tips Total" value={formatCurrencyFromCents(previewResult.ledger.driverTipTotalCents)} />
                    <StatCard title="Owner Charge Total" value={formatCurrencyFromCents(previewResult.ledger.ownerChargeAmountCents)} />
                    <StatCard title="Platform Revenue" value={formatCurrencyFromCents(previewResult.ledger.platformRevenueCents)} />
                    <StatCard
                      title="Review Threshold"
                      value={previewResult.validation.blockedForReview ? "Blocked for review" : "Within threshold"}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-medium">Washout IDs</h4>
                      <span className="text-xs text-muted-foreground">{previewResult.ledger.approvedWashoutCount} entries</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {previewResult.ledger.driverTransfers.flatMap((transfer) => transfer.washoutActivityIds).map((washoutId) => (
                        <Badge key={washoutId} variant="secondary" className="max-w-full break-all">
                          {washoutId}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium">Driver transfer previews</h4>
                    <div className="space-y-3">
                      {previewResult.stripeTransferPreviews.map((transfer, index) => (
                        <div key={`${transfer.destination}-${index}`} className="rounded-lg border bg-background p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="break-words font-medium">{transfer.destination}</p>
                              <p className="break-words text-xs text-muted-foreground">{transfer.description}</p>
                            </div>
                            <Badge variant="outline">{formatCurrencyFromCents(transfer.amount)}</Badge>
                          </div>
                          <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(transfer.metadata, null, 2)}</pre>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-lg border bg-background p-4">
                      <h4 className="font-medium">Stripe PaymentIntent preview</h4>
                      <div className="mt-3 space-y-1 text-sm">
                        <p><span className="font-medium">Amount:</span> {formatCurrencyFromCents(previewResult.stripePaymentIntentPreview.amount)}</p>
                        <p><span className="font-medium">Currency:</span> {previewResult.stripePaymentIntentPreview.currency.toUpperCase()}</p>
                        <p><span className="font-medium">Customer:</span> {previewResult.stripePaymentIntentPreview.customer || "None"}</p>
                        <p><span className="font-medium">Payment method:</span> {previewResult.stripePaymentIntentPreview.payment_method || "None"}</p>
                      </div>
                    </div>

                    <div className="rounded-lg border bg-background p-4">
                      <h4 className="font-medium">Validation</h4>
                      <div className="mt-3 space-y-1 text-sm">
                        <p><span className="font-medium">Status:</span> {previewResult.validation.passed ? "Passed" : "Failed"}</p>
                        <p><span className="font-medium">Blocked for review:</span> {previewResult.validation.blockedForReview ? "Yes" : "No"}</p>
                        <p><span className="font-medium">Reason:</span> {previewResult.validation.reason || "None"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-background p-4">
                    <h4 className="font-medium">Ledger JSON</h4>
                    <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs">
                      {JSON.stringify(previewResult.ledger, null, 2)}
                    </pre>
                  </div>

                  {previewResult && (
                    <details className="rounded-lg border bg-background p-4" open>
                      <summary className="cursor-pointer font-medium">Tip Source Debug</summary>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Read-only diagnostics showing which driver tip source was resolved for each washout.
                      </p>
                      {!Array.isArray(previewResult.debugTipSources) ? (
                        <p className="mt-4 text-sm text-muted-foreground">
                          debugTipSources was not present in the preview response.
                        </p>
                      ) : previewResult.debugTipSources.length === 0 ? (
                        <p className="mt-4 text-sm text-muted-foreground">No tip source rows returned for this preview.</p>
                      ) : (
                        <div className="mt-4 overflow-x-auto">
                          <Table>
                            <TableHeader>
                            <TableRow>
                              <TableHead>Washout</TableHead>
                              <TableHead>Activity Amount</TableHead>
                              <TableHead>Resolved Cents</TableHead>
                              <TableHead>Resolved Source</TableHead>
                              <TableHead>Driver Ready</TableHead>
                              <TableHead>Tip Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {previewTipRows.map((row) => (
                                <TableRow key={row.washoutActivityId}>
                                  <TableCell className="font-mono text-xs">{row.washoutActivityId}</TableCell>
                                  <TableCell className="font-mono text-xs">
                                    {row.rawAmount === null || row.rawAmount === undefined
                                      ? "None"
                                      : String(row.rawAmount)}
                                  </TableCell>
                                  <TableCell className="font-medium">{row.driverTipCents}</TableCell>
                                  <TableCell className="text-xs">{row.source}</TableCell>
                                  <TableCell className="text-xs">{row.driverReady ? "Yes" : "No"}</TableCell>
                                  <TableCell className="text-xs">{row.tipStatus}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </details>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
