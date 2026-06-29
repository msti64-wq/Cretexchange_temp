import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ComponentProps } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, Loader2, Package, RefreshCw, Save, ShieldAlert, Truck, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  DSCard,
  DSKpiCard,
  DSSectionHeader,
  DSStatusChip,
  DSTableShell,
  dsTokens,
} from "@/components/design-system";

type FulfillmentQueue = "all" | "pending" | "ordered" | "purchased" | "shipped" | "delivered" | "issue" | "canceled";

type RewardFulfillment = {
  id: string;
  lotteryDrawingId: string;
  lotteryDrawingWinnerId: string;
  prizeCatalogId: string | null;
  drawingMonth: number;
  drawingYear: number;
  driverId: string;
  driverNameSnapshot: string;
  entryId: string;
  ticketNumberSnapshot: string;
  prizeTitleSnapshot: string;
  prizeDescriptionSnapshot: string | null;
  prizeTypeSnapshot: string | null;
  vendorOrSponsorSnapshot: string | null;
  fulfillmentStatus: string;
  fulfillmentNotes: string | null;
  trackingNumber: string | null;
  trackingReference: string | null;
  fulfilledBy: string | null;
  fulfilledAt: string | null;
  canceledAt: string | null;
  issueReportedAt: string | null;
  createdAt: string;
  updatedAt: string;
  winner?: any;
  drawing?: any;
  driver?: any;
  driverUser?: any;
  prizeCatalog?: any;
  fulfilledByUser?: any;
  driverName?: string;
};

type FulfillmentHistory = {
  id: string;
  fulfillmentId: string;
  previousStatus: string | null;
  nextStatus: string;
  notes: string | null;
  trackingNumber: string | null;
  trackingReference: string | null;
  changedBy: string;
  changedAt: string | null;
  metadata: Record<string, unknown> | null;
  changedByUser?: any;
};

const QUEUE_TABS: Array<{
  value: FulfillmentQueue;
  label: string;
  statuses: string[];
}> = [
  { value: "all", label: "All", statuses: [] },
  { value: "pending", label: "Needs Purchase", statuses: ["pending"] },
  { value: "ordered", label: "Ordered", statuses: ["ordered"] },
  { value: "purchased", label: "Purchased / Ready to Send", statuses: ["purchased"] },
  { value: "shipped", label: "Shipped / Sent", statuses: ["shipped"] },
  { value: "delivered", label: "Delivered / Picked Up", statuses: ["delivered", "picked_up"] },
  { value: "issue", label: "Issues", statuses: ["issue"] },
  { value: "canceled", label: "Canceled", statuses: ["canceled"] },
];

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-600 text-white hover:bg-amber-700",
  ordered: "bg-sky-600 text-white hover:bg-sky-700",
  purchased: "bg-emerald-600 text-white hover:bg-emerald-700",
  shipped: "bg-blue-600 text-white hover:bg-blue-700",
  delivered: "bg-green-600 text-white hover:bg-green-700",
  picked_up: "bg-green-700 text-white hover:bg-green-800",
  issue: "bg-red-600 text-white hover:bg-red-700",
  canceled: "bg-slate-500 text-white hover:bg-slate-600",
};

const statusLabel = (status: string) => {
  switch (status) {
    case "pending": return "Needs Purchase";
    case "ordered": return "Ordered";
    case "purchased": return "Purchased / Ready to Send";
    case "shipped": return "Shipped / Sent";
    case "delivered": return "Delivered";
    case "picked_up": return "Picked Up";
    case "issue": return "Issue";
    case "canceled": return "Canceled";
    default: return status || "Unknown";
  }
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatMonthYear = (month: number, year: number) => {
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${names[month - 1] || "Month"} ${year}`;
};

const actorLabel = (person: any) => {
  if (!person) return "—";
  return person.username || [person.firstName, person.lastName].filter(Boolean).join(" ") || person.email || "—";
};

const fulfilledStateLabel = (record: RewardFulfillment | null) => {
  if (!record) return "No fulfillment selected";
  return `${statusLabel(record.fulfillmentStatus)} • ${formatMonthYear(record.drawingMonth, record.drawingYear)}`;
};

const semanticTextStyles = {
  pageTitle: { color: dsTokens.colors.pageTitle },
  sectionTitle: { color: dsTokens.colors.sectionTitle },
  cardTitle: { color: dsTokens.colors.cardTitle },
  winnerTitle: { color: dsTokens.colors.pageTitle },
  prizeTitle: { color: "#4ADE80" },
  actionsTitle: { color: "#FBBF24" },
  trackingTitle: { color: "#38BDF8" },
  historyTitle: { color: dsTokens.colors.metadataText },
  operationalText: { color: dsTokens.colors.operationalText },
  bodyText: { color: dsTokens.colors.bodyText },
  helperText: { color: dsTokens.colors.helperText },
  metadataText: { color: dsTokens.colors.metadataText },
  infoText: { color: "#38BDF8" },
} as const;

const fulfillmentStatusTone = (status: string): ComponentProps<typeof DSStatusChip>["tone"] => {
  switch (status) {
    case "pending":
      return "warning";
    case "ordered":
      return "info";
    case "purchased":
      return "success";
    case "shipped":
      return "info";
    case "delivered":
    case "picked_up":
      return "success";
    case "issue":
      return "danger";
    case "canceled":
      return "neutral";
    default:
      return "neutral";
  }
};

const fulfillmentStatusChipStyle = (status: string) => {
  switch (status) {
    case "pending":
      return { borderColor: "#F59E0B", backgroundColor: "rgba(245, 158, 11, 0.12)", color: "#FBBF24" };
    case "ordered":
    case "purchased":
      return { borderColor: "#3B82F6", backgroundColor: "rgba(59, 130, 246, 0.12)", color: "#60A5FA" };
    case "shipped":
      return { borderColor: "#22D3EE", backgroundColor: "rgba(34, 211, 238, 0.12)", color: "#22D3EE" };
    case "delivered":
    case "picked_up":
      return { borderColor: "#22C55E", backgroundColor: "rgba(34, 197, 94, 0.12)", color: "#4ADE80" };
    case "issue":
      return { borderColor: "#EF4444", backgroundColor: "rgba(239, 68, 68, 0.12)", color: "#F87171" };
    case "canceled":
      return { borderColor: "#64748B", backgroundColor: "rgba(100, 116, 139, 0.14)", color: "#94A3B8" };
    default:
      return { borderColor: "#64748B", backgroundColor: "rgba(100, 116, 139, 0.14)", color: "#C4CDD7" };
  }
};

const queueAccentStyles: Record<string, {
  tone: ComponentProps<typeof DSKpiCard>["accentTone"];
  card: CSSProperties;
  label: CSSProperties;
  value: CSSProperties;
  detail: CSSProperties;
}> = {
  total: {
    tone: "textSecondary",
    card: {
      backgroundColor: "rgba(27, 31, 36, 0.95)",
      borderColor: "#3B4250",
    },
    label: semanticTextStyles.metadataText,
    value: semanticTextStyles.operationalText,
    detail: semanticTextStyles.helperText,
  },
  pending: {
    tone: "warning",
    card: {
      backgroundColor: "rgba(245, 158, 11, 0.09)",
      borderColor: "rgba(245, 158, 11, 0.38)",
    },
    label: { color: "#FBBF24" },
    value: { color: "#F59E0B" },
    detail: semanticTextStyles.helperText,
  },
  ordered: {
    tone: "info",
    card: {
      backgroundColor: "rgba(59, 130, 246, 0.10)",
      borderColor: "rgba(59, 130, 246, 0.34)",
    },
    label: { color: "#93C5FD" },
    value: { color: "#60A5FA" },
    detail: semanticTextStyles.helperText,
  },
  purchased: {
    tone: "info",
    card: {
      backgroundColor: "rgba(37, 99, 235, 0.10)",
      borderColor: "rgba(59, 130, 246, 0.34)",
    },
    label: { color: "#93C5FD" },
    value: { color: "#60A5FA" },
    detail: semanticTextStyles.helperText,
  },
  shipped: {
    tone: "info",
    card: {
      backgroundColor: "rgba(34, 211, 238, 0.10)",
      borderColor: "rgba(34, 211, 238, 0.34)",
    },
    label: { color: "#67E8F9" },
    value: { color: "#22D3EE" },
    detail: semanticTextStyles.helperText,
  },
  deliveredPickedUp: {
    tone: "success",
    card: {
      backgroundColor: "rgba(34, 197, 94, 0.10)",
      borderColor: "rgba(34, 197, 94, 0.34)",
    },
    label: { color: "#86EFAC" },
    value: { color: "#4ADE80" },
    detail: semanticTextStyles.helperText,
  },
  issues: {
    tone: "danger",
    card: {
      backgroundColor: "rgba(239, 68, 68, 0.10)",
      borderColor: "rgba(239, 68, 68, 0.34)",
    },
    label: { color: "#FCA5A5" },
    value: { color: "#F87171" },
    detail: semanticTextStyles.helperText,
  },
  canceled: {
    tone: "textSecondary",
    card: {
      backgroundColor: "rgba(51, 65, 85, 0.38)",
      borderColor: "rgba(100, 116, 139, 0.38)",
    },
    label: semanticTextStyles.metadataText,
    value: semanticTextStyles.helperText,
    detail: semanticTextStyles.helperText,
  },
};

export default function RewardsOperationsCenter() {
  const { toast } = useToast();
  const [activeQueue, setActiveQueue] = useState<FulfillmentQueue>("all");
  const [selectedFulfillmentId, setSelectedFulfillmentId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [trackingNumberDraft, setTrackingNumberDraft] = useState("");
  const [trackingReferenceDraft, setTrackingReferenceDraft] = useState("");

  const { data: fulfillments, isLoading, isFetching, error, refetch } = useQuery<RewardFulfillment[]>({
    queryKey: ["/api/admin/rewards/fulfillment"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/rewards/fulfillment");
      return response.json();
    },
  });

  const counts = useMemo(() => {
    const next = {
      all: 0,
      pending: 0,
      ordered: 0,
      purchased: 0,
      shipped: 0,
      delivered: 0,
      issue: 0,
      canceled: 0,
    };

    (fulfillments || []).forEach((fulfillment) => {
      next.all += 1;
      if (fulfillment.fulfillmentStatus in next) {
        (next as Record<string, number>)[fulfillment.fulfillmentStatus] += 1;
      }
      if (fulfillment.fulfillmentStatus === "picked_up") {
        next.delivered += 1;
      }
    });

    return next;
  }, [fulfillments]);

  const filteredFulfillments = useMemo(() => {
    const queue = QUEUE_TABS.find((tab) => tab.value === activeQueue);
    if (!queue || queue.value === "all") return fulfillments || [];
    return (fulfillments || []).filter((fulfillment) => queue.statuses.includes(fulfillment.fulfillmentStatus));
  }, [activeQueue, fulfillments]);

  useEffect(() => {
    if (selectedFulfillmentId && filteredFulfillments.length > 0) {
      const stillVisible = filteredFulfillments.some((fulfillment) => fulfillment.id === selectedFulfillmentId);
      if (!stillVisible) {
        setSelectedFulfillmentId(null);
      }
    }
    if (filteredFulfillments.length === 0) {
      setSelectedFulfillmentId(null);
    }
  }, [filteredFulfillments, selectedFulfillmentId]);

  const selectedFulfillment = useMemo(
    () => (fulfillments || []).find((fulfillment) => fulfillment.id === selectedFulfillmentId) || null,
    [fulfillments, selectedFulfillmentId],
  );

  const { data: selectedDetail } = useQuery<RewardFulfillment>({
    queryKey: ["/api/admin/rewards/fulfillment", selectedFulfillmentId],
    enabled: Boolean(selectedFulfillmentId),
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/admin/rewards/fulfillment/${selectedFulfillmentId}`);
      return response.json();
    },
  });

  const { data: selectedHistory } = useQuery<FulfillmentHistory[]>({
    queryKey: ["/api/admin/rewards/fulfillment", selectedFulfillmentId, "history"],
    enabled: Boolean(selectedFulfillmentId),
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/admin/rewards/fulfillment/${selectedFulfillmentId}/history`);
      return response.json();
    },
  });

  useEffect(() => {
    const detail = selectedDetail || selectedFulfillment;
    setNotesDraft(detail?.fulfillmentNotes || "");
    setTrackingNumberDraft(detail?.trackingNumber || "");
    setTrackingReferenceDraft(detail?.trackingReference || "");
  }, [selectedDetail, selectedFulfillment]);

  const invalidateFulfillmentQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rewards/fulfillment"] }),
      selectedFulfillmentId
        ? queryClient.invalidateQueries({ queryKey: ["/api/admin/rewards/fulfillment", selectedFulfillmentId] })
        : Promise.resolve(),
      selectedFulfillmentId
        ? queryClient.invalidateQueries({ queryKey: ["/api/admin/rewards/fulfillment", selectedFulfillmentId, "history"] })
        : Promise.resolve(),
    ]);
    await refetch();
  };

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      if (!selectedFulfillmentId) {
        throw new Error("Select a fulfillment record first.");
      }
      const response = await apiRequest(`/api/admin/rewards/fulfillment/${selectedFulfillmentId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      return response.json();
    },
    onSuccess: async (data: any) => {
      toast({
        title: "Fulfillment Status Updated",
        description: data.message || "Status changed successfully.",
      });
      await invalidateFulfillmentQueries();
    },
    onError: (mutationError: Error) => {
      toast({
        title: "Status Update Failed",
        description: mutationError.message,
        variant: "destructive",
      });
    },
  });

  const notesMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFulfillmentId) {
        throw new Error("Select a fulfillment record first.");
      }
      const response = await apiRequest(`/api/admin/rewards/fulfillment/${selectedFulfillmentId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesDraft }),
      });
      return response.json();
    },
    onSuccess: async (data: any) => {
      toast({
        title: "Notes Updated",
        description: data.message || "Fulfillment notes saved.",
      });
      await invalidateFulfillmentQueries();
    },
    onError: (mutationError: Error) => {
      toast({
        title: "Notes Update Failed",
        description: mutationError.message,
        variant: "destructive",
      });
    },
  });

  const trackingMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFulfillmentId) {
        throw new Error("Select a fulfillment record first.");
      }
      const response = await apiRequest(`/api/admin/rewards/fulfillment/${selectedFulfillmentId}/tracking`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackingNumber: trackingNumberDraft,
          trackingReference: trackingReferenceDraft,
        }),
      });
      return response.json();
    },
    onSuccess: async (data: any) => {
      toast({
        title: "Tracking Updated",
        description: data.message || "Tracking details saved.",
      });
      await invalidateFulfillmentQueries();
    },
    onError: (mutationError: Error) => {
      toast({
        title: "Tracking Update Failed",
        description: mutationError.message,
        variant: "destructive",
      });
    },
  });

  const currentSelected = selectedDetail || selectedFulfillment;
  const history = selectedHistory || [];
  const visibleQueueLabel = QUEUE_TABS.find((tab) => tab.value === activeQueue)?.label || "All";
  const summaryCards = [
    {
      key: "total",
      label: "Total",
      value: counts.all,
      detail: "All fulfillment records",
    },
    {
      key: "pending",
      label: "Needs Purchase",
      value: counts.pending,
      detail: "Pending procurement or prep",
    },
    {
      key: "ordered",
      label: "Ordered",
      value: counts.ordered,
      detail: "Placed with vendor or sponsor",
    },
    {
      key: "purchased",
      label: "Purchased",
      value: counts.purchased,
      detail: "Ready to send or release",
    },
    {
      key: "shipped",
      label: "Shipped",
      value: counts.shipped,
      detail: "Out for delivery or pickup",
    },
    {
      key: "deliveredPickedUp",
      label: "Delivered / Picked Up",
      value: counts.delivered,
      detail: "Completed by delivery or pickup",
    },
    {
      key: "issues",
      label: "Issues",
      value: counts.issue,
      detail: "Needs review or exception handling",
    },
    {
      key: "canceled",
      label: "Canceled",
      value: counts.canceled,
      detail: "Closed or voided fulfillment records",
    },
  ];

  const renderStatusBadge = (status: string) => (
    <DSStatusChip tone={fulfillmentStatusTone(status)} size="sm" style={fulfillmentStatusChipStyle(status)}>
      {statusLabel(status)}
    </DSStatusChip>
  );

  const quickActions = [
    { label: "Mark Ordered", status: "ordered" },
    { label: "Mark Purchased", status: "purchased" },
    { label: "Mark Shipped", status: "shipped" },
    { label: "Mark Delivered", status: "delivered" },
    { label: "Mark Picked Up", status: "picked_up" },
    { label: "Mark Issue", status: "issue" },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="border-b border-border/70 bg-slate-950 shadow-lg">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
              <ClipboardList className="h-5 w-5 text-sky-400" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight" style={semanticTextStyles.pageTitle}>
                Rewards Operations Center
              </h1>
              <p className="text-sm" style={semanticTextStyles.bodyText}>
                Manage post-drawing prize fulfillment queues, notes, and tracking.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/lottery">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Driver Rewards Program
              </Link>
            </Button>
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto space-y-6 px-4 py-6 max-w-[1600px]">
        <DSSectionHeader
          title={<span style={semanticTextStyles.sectionTitle}>Queue Summary</span>}
          description={<span style={semanticTextStyles.bodyText}>Track fulfillment volume by operational stage.</span>}
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <DSKpiCard
              key={card.key}
              label={<span style={queueAccentStyles[card.key].label}>{card.label}</span>}
              value={<span style={queueAccentStyles[card.key].value}>{card.value}</span>}
              detail={<span style={queueAccentStyles[card.key].detail}>{card.detail}</span>}
              accentTone={queueAccentStyles[card.key].tone}
              style={queueAccentStyles[card.key].card}
            />
          ))}
        </div>

        <DSCard elevated className="space-y-5">
          <DSSectionHeader
            title={<span style={semanticTextStyles.sectionTitle}>Fulfillment Queue</span>}
            description={<span style={semanticTextStyles.bodyText}>Review items by workflow stage, then open a record to update it.</span>}
            actions={
              <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
                {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh
              </Button>
            }
          />

          <Tabs value={activeQueue} onValueChange={(value) => setActiveQueue(value as FulfillmentQueue)} className="space-y-4">
            <TabsList className="flex h-auto flex-wrap gap-2 rounded-xl border border-border/70 bg-background/60 p-2">
              {QUEUE_TABS.map((queue) => (
                <TabsTrigger
                  key={queue.value}
                  value={queue.value}
                  className="gap-2 border border-transparent text-foreground/85 data-[state=active]:border-sky-500 data-[state=active]:bg-sky-500/10 data-[state=active]:text-sky-300"
                >
                  {queue.label}
                  <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-white">
                    {counts[queue.value as keyof typeof counts] ?? counts.all}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border/70 bg-muted/20 px-6 py-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
                <div>
                  <p className="text-sm font-semibold" style={semanticTextStyles.operationalText}>
                    Loading fulfillment queue...
                  </p>
                  <p className="text-sm" style={semanticTextStyles.helperText}>
                    Fetching current operational status from the server.
                  </p>
                </div>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-6 py-12 text-center">
                <AlertTriangle className="h-8 w-8 text-red-400" />
                <div>
                  <p className="text-sm font-semibold text-red-200">Unable to load fulfillment queue.</p>
                  <p className="text-sm text-red-200/80">Refresh the page or try again once the API is reachable.</p>
                </div>
              </div>
            ) : filteredFulfillments.length > 0 ? (
              <DSTableShell
                density="compact"
                title={<span style={semanticTextStyles.sectionTitle}>{visibleQueueLabel}</span>}
                description={
                  <span style={semanticTextStyles.bodyText}>
                    {filteredFulfillments.length} fulfillment{filteredFulfillments.length === 1 ? "" : "s"} in view
                  </span>
                }
              >
                <div className="overflow-x-auto">
                  <Table className="min-w-[1180px]">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead style={semanticTextStyles.metadataText}>Month / Year</TableHead>
                        <TableHead style={semanticTextStyles.metadataText}>Driver</TableHead>
                        <TableHead style={semanticTextStyles.metadataText}>Entry #</TableHead>
                        <TableHead style={semanticTextStyles.metadataText}>Prize</TableHead>
                        <TableHead style={semanticTextStyles.metadataText}>Type</TableHead>
                        <TableHead style={semanticTextStyles.metadataText}>Vendor / Sponsor</TableHead>
                        <TableHead style={semanticTextStyles.metadataText}>Status</TableHead>
                        <TableHead style={semanticTextStyles.metadataText}>Tracking / Reference</TableHead>
                        <TableHead style={semanticTextStyles.metadataText}>Updated</TableHead>
                        <TableHead className="text-right" style={semanticTextStyles.metadataText}>
                          Open
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredFulfillments.map((fulfillment) => (
                        <TableRow
                          key={fulfillment.id}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => setSelectedFulfillmentId(fulfillment.id)}
                        >
                          <TableCell className="font-medium" style={semanticTextStyles.operationalText}>
                            {formatMonthYear(fulfillment.drawingMonth, fulfillment.drawingYear)}
                          </TableCell>
                          <TableCell style={semanticTextStyles.operationalText}>
                            {fulfillment.driverName || fulfillment.driverNameSnapshot || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-sm" style={semanticTextStyles.operationalText}>
                            {fulfillment.ticketNumberSnapshot || "—"}
                          </TableCell>
                          <TableCell className="max-w-[240px]">
                            <div className="space-y-1">
                              <p className="font-medium" style={semanticTextStyles.operationalText}>
                                {fulfillment.prizeTitleSnapshot}
                              </p>
                              {fulfillment.prizeDescriptionSnapshot ? (
                                <p className="line-clamp-2 text-xs" style={semanticTextStyles.helperText}>
                                  {fulfillment.prizeDescriptionSnapshot}
                                </p>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell style={semanticTextStyles.bodyText}>{fulfillment.prizeTypeSnapshot || "—"}</TableCell>
                          <TableCell style={semanticTextStyles.bodyText}>
                            {fulfillment.vendorOrSponsorSnapshot || fulfillment.prizeCatalog?.sponsorVendor || "—"}
                          </TableCell>
                          <TableCell>{renderStatusBadge(fulfillment.fulfillmentStatus)}</TableCell>
                          <TableCell className="text-sm">
                            <div className="space-y-1">
                              <p style={semanticTextStyles.infoText}>{fulfillment.trackingNumber || "—"}</p>
                              <p style={semanticTextStyles.helperText}>{fulfillment.trackingReference || "—"}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm" style={semanticTextStyles.helperText}>
                            {formatDateTime(fulfillment.updatedAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedFulfillmentId(fulfillment.id);
                              }}
                            >
                              Open
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </DSTableShell>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 px-6 py-12 text-center">
                <Package className="h-10 w-10 text-sky-400" />
                <div>
                  <p className="text-sm font-semibold" style={semanticTextStyles.operationalText}>
                    No fulfillments in this queue.
                  </p>
                  <p className="text-sm" style={semanticTextStyles.helperText}>
                    {activeQueue === "all"
                      ? "Completed drawings will populate this list automatically."
                      : `No ${visibleQueueLabel.toLowerCase()} items are waiting right now.`}
                  </p>
                </div>
              </div>
            )}
          </Tabs>
        </DSCard>

        <DSCard elevated className="space-y-4">
          <DSSectionHeader
            title={<span style={semanticTextStyles.sectionTitle}>Operations Notes</span>}
            description={<span style={semanticTextStyles.bodyText}>Use the drawer to update status, notes, and tracking details for a selected fulfillment.</span>}
          />
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <p className="text-xs font-medium" style={semanticTextStyles.metadataText}>Needs Purchase</p>
              <p className="mt-1 text-sm" style={semanticTextStyles.bodyText}>
                Pending items need procurement or preparation.
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <p className="text-xs font-medium" style={semanticTextStyles.metadataText}>Shipped / Delivered</p>
              <p className="mt-1 text-sm" style={semanticTextStyles.bodyText}>
                Track outbound delivery and pickup completion.
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <p className="text-xs font-medium" style={semanticTextStyles.metadataText}>Issues / Canceled</p>
              <p className="mt-1 text-sm" style={semanticTextStyles.bodyText}>
                Keep an audit trail for exceptions and cancellations.
              </p>
            </div>
          </div>
        </DSCard>
      </main>

      <Sheet open={Boolean(selectedFulfillmentId)} onOpenChange={(open) => !open && setSelectedFulfillmentId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <div className="space-y-6">
            <DSSectionHeader
              title={<span style={semanticTextStyles.winnerTitle}>Rewards Fulfillment Details</span>}
              description={<span style={semanticTextStyles.bodyText}>{fulfilledStateLabel(currentSelected)}</span>}
              actions={
                <Button type="button" variant="outline" onClick={() => setSelectedFulfillmentId(null)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Fulfillment Queue
                </Button>
              }
            />

            {!currentSelected ? (
              <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-sm" style={semanticTextStyles.helperText}>
                Select a fulfillment from the queue to review and update it.
              </div>
            ) : (
              <div className="space-y-5">
                <DSCard className="space-y-4">
                  <DSSectionHeader
                    title={<span style={semanticTextStyles.winnerTitle}>Winner Information</span>}
                    description={<span style={semanticTextStyles.helperText}>Snapshot details from the completed drawing and current fulfillment state.</span>}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                      <p className="text-xs font-medium" style={semanticTextStyles.metadataText}>Drawing</p>
                      <p className="mt-1 text-sm font-semibold" style={semanticTextStyles.operationalText}>
                        {formatMonthYear(currentSelected.drawingMonth, currentSelected.drawingYear)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                      <p className="text-xs font-medium" style={semanticTextStyles.metadataText}>Entry Number</p>
                      <p className="mt-1 font-mono text-sm font-semibold" style={semanticTextStyles.operationalText}>
                        {currentSelected.ticketNumberSnapshot || "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                      <p className="text-xs font-medium" style={semanticTextStyles.metadataText}>Driver</p>
                      <p className="mt-1 text-sm font-semibold" style={semanticTextStyles.operationalText}>
                        {currentSelected.driverName || currentSelected.driverNameSnapshot || "—"}
                      </p>
                      <p className="text-xs" style={semanticTextStyles.helperText}>
                        {actorLabel(currentSelected.driverUser)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                      <p className="text-xs font-medium" style={semanticTextStyles.metadataText}>Status</p>
                      <div className="mt-1">{renderStatusBadge(currentSelected.fulfillmentStatus)}</div>
                    </div>
                  </div>
                </DSCard>

                <DSCard className="space-y-4">
                  <DSSectionHeader
                    title={<span style={semanticTextStyles.prizeTitle}>Prize Details</span>}
                    description={<span style={semanticTextStyles.helperText}>Prize snapshots from the completed drawing are preserved here.</span>}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    {currentSelected.prizeTypeSnapshot === "prepaid_card" ? (
                      <DSStatusChip tone="danger" size="sm">
                        <ShieldAlert className="mr-1 h-3 w-3" />
                        Sensitive Prize Type
                      </DSStatusChip>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-border/70 bg-muted/10 p-3">
                      <p className="text-xs font-medium" style={semanticTextStyles.metadataText}>Prize Title</p>
                      <p className="mt-1 text-sm font-semibold" style={semanticTextStyles.operationalText}>
                        {currentSelected.prizeTitleSnapshot}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/10 p-3">
                      <p className="text-xs font-medium" style={semanticTextStyles.metadataText}>Prize Type</p>
                      <p className="mt-1 text-sm font-semibold" style={semanticTextStyles.operationalText}>
                        {currentSelected.prizeTypeSnapshot || "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/10 p-3 sm:col-span-2">
                      <p className="text-xs font-medium" style={semanticTextStyles.metadataText}>Prize Description</p>
                      <p className="mt-1 text-sm" style={semanticTextStyles.bodyText}>
                        {currentSelected.prizeDescriptionSnapshot || "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/10 p-3">
                      <p className="text-xs font-medium" style={semanticTextStyles.metadataText}>Vendor / Sponsor</p>
                      <p className="mt-1 text-sm" style={semanticTextStyles.bodyText}>
                        {currentSelected.vendorOrSponsorSnapshot || currentSelected.prizeCatalog?.sponsorVendor || "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/10 p-3">
                      <p className="text-xs font-medium" style={semanticTextStyles.metadataText}>Updated</p>
                      <p className="mt-1 text-sm" style={semanticTextStyles.bodyText}>
                        {formatDateTime(currentSelected.updatedAt)}
                      </p>
                    </div>
                  </div>
                </DSCard>

                <DSCard className="space-y-4">
                  <DSSectionHeader
                    title={<span style={semanticTextStyles.actionsTitle}>Fulfillment Actions</span>}
                    description={<span style={semanticTextStyles.helperText}>Update the fulfillment stage or cancel this record if necessary.</span>}
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {quickActions.map((action) => (
                      <Button
                        key={action.status}
                        type="button"
                        variant="outline"
                        className={STATUS_STYLES[action.status] || ""}
                        onClick={() => statusMutation.mutate(action.status)}
                        disabled={statusMutation.isPending}
                      >
                        {statusMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                        {action.label}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => {
                        const confirmed = window.confirm("Cancel this fulfillment?");
                        if (!confirmed) return;
                        statusMutation.mutate("canceled");
                      }}
                      disabled={statusMutation.isPending}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Cancel Fulfillment
                    </Button>
                  </div>
                </DSCard>

                <DSCard className="space-y-4">
                  <DSSectionHeader
                    title={<span style={semanticTextStyles.trackingTitle}>Tracking</span>}
                    description={<span style={semanticTextStyles.helperText}>Record shipment details and operational notes.</span>}
                  />

                  <div className="space-y-2">
                    <Label htmlFor="fulfillment-notes" className="text-foreground/90">
                      Fulfillment Notes
                    </Label>
                    <Textarea
                      id="fulfillment-notes"
                      value={notesDraft}
                      onChange={(event) => setNotesDraft(event.target.value)}
                      rows={4}
                      placeholder="Add operational notes, vendor coordination, or delivery context."
                      className="border-border bg-card text-foreground placeholder:text-foreground/55 focus-visible:ring-ring"
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={() => notesMutation.mutate()}
                        disabled={notesMutation.isPending}
                      >
                        {notesMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Notes
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="tracking-number" className="text-foreground/90">
                        Tracking Number
                      </Label>
                      <Input
                        id="tracking-number"
                        value={trackingNumberDraft}
                        onChange={(event) => setTrackingNumberDraft(event.target.value)}
                        placeholder="Shipment or delivery number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tracking-reference" className="text-foreground/90">
                        Tracking Reference
                      </Label>
                      <Input
                        id="tracking-reference"
                        value={trackingReferenceDraft}
                        onChange={(event) => setTrackingReferenceDraft(event.target.value)}
                        placeholder="Pickup receipt, internal reference, or vendor code"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => trackingMutation.mutate()}
                      disabled={trackingMutation.isPending}
                    >
                      {trackingMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
                      Save Tracking
                    </Button>
                  </div>
                </DSCard>

                <DSCard className="space-y-4">
                  <DSSectionHeader
                    title={<span style={semanticTextStyles.historyTitle}>Fulfillment History</span>}
                    description={<span style={semanticTextStyles.helperText}>Append-only status and tracking updates for audit review.</span>}
                  />
                  <div className="space-y-3">
                    {history.length > 0 ? (
                      history.map((item) => (
                        <div key={item.id} className="rounded-lg border border-border/70 bg-muted/10 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <DSStatusChip tone={fulfillmentStatusTone(item.nextStatus)} size="sm">
                                  {statusLabel(item.nextStatus)}
                                </DSStatusChip>
                              <span className="text-xs" style={semanticTextStyles.helperText}>
                                {formatDateTime(item.changedAt)}
                              </span>
                            </div>
                            <span className="text-xs" style={semanticTextStyles.helperText}>
                              by {actorLabel(item.changedByUser)}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1 text-sm">
                            {item.notes ? <p style={semanticTextStyles.bodyText}>{item.notes}</p> : null}
                            <p className="text-xs" style={semanticTextStyles.helperText}>
                              Tracking: <span style={semanticTextStyles.infoText}>{item.trackingNumber || "—"}</span>{item.trackingReference ? ` • Reference: ${item.trackingReference}` : ""}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg border border-dashed border-border/70 p-4 text-sm" style={semanticTextStyles.helperText}>
                        No fulfillment history exists yet for this record.
                      </div>
                    )}
                  </div>
                </DSCard>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
