import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, History, Loader2, MessageSquare, Package, RefreshCw, Save, ShieldAlert, Ticket, Truck, User, XCircle } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
    if (!selectedFulfillmentId && filteredFulfillments.length > 0) {
      setSelectedFulfillmentId(filteredFulfillments[0].id);
      return;
    }
    if (selectedFulfillmentId && filteredFulfillments.length > 0) {
      const stillVisible = filteredFulfillments.some((fulfillment) => fulfillment.id === selectedFulfillmentId);
      if (!stillVisible) {
        setSelectedFulfillmentId(filteredFulfillments[0].id);
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

  const renderStatusBadge = (status: string) => (
    <Badge className={STATUS_STYLES[status] || "bg-slate-600 text-white"}>
      {statusLabel(status)}
    </Badge>
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
      <header className="border-b border-border/70 bg-slate-950 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">Rewards Operations Center</h1>
                <p className="text-sm text-white/80">
                  Manage post-drawing prize fulfillment queues, notes, and tracking.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
              <Link href="/lottery">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Driver Rewards Program
              </Link>
            </Button>
            <Button
              variant="outline"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="space-y-4 p-4">
        <Card className="border-border/70 bg-slate-950 text-white">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg text-white">
                  <Truck className="h-5 w-5 text-sky-400" />
                  Queue Overview
                </CardTitle>
                <CardDescription className="text-white/70">
                  Group reward fulfillments by operational stage.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-slate-800 text-white hover:bg-slate-800">Total {counts.all}</Badge>
                <Badge className="bg-amber-600 text-white hover:bg-amber-700">Needs Purchase {counts.pending}</Badge>
                <Badge className="bg-sky-600 text-white hover:bg-sky-700">Ordered {counts.ordered}</Badge>
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">Purchased {counts.purchased}</Badge>
                <Badge className="bg-blue-600 text-white hover:bg-blue-700">Shipped {counts.shipped}</Badge>
                <Badge className="bg-green-600 text-white hover:bg-green-700">Delivered/Picked Up {counts.delivered}</Badge>
                <Badge className="bg-red-600 text-white hover:bg-red-700">Issues {counts.issue}</Badge>
                <Badge className="bg-slate-600 text-white hover:bg-slate-700">Canceled {counts.canceled}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeQueue} onValueChange={(value) => setActiveQueue(value as FulfillmentQueue)} className="space-y-4">
              <TabsList className="flex h-auto flex-wrap gap-2 bg-slate-900/60 p-2">
                {QUEUE_TABS.map((queue) => (
                  <TabsTrigger
                    key={queue.value}
                    value={queue.value}
                    className="gap-2 data-[state=active]:bg-white data-[state=active]:text-slate-950"
                  >
                    {queue.label}
                    <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-white">
                      {counts[queue.value as keyof typeof counts] ?? counts.all}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="rounded-xl border border-border/70 bg-background/80 p-0">
                <div className="border-b border-border/70 px-4 py-3">
                  <p className="text-sm font-semibold text-foreground">{visibleQueueLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    {filteredFulfillments.length} fulfillment{filteredFulfillments.length === 1 ? "" : "s"} in view
                  </p>
                </div>
                {isLoading ? (
                  <div className="space-y-3 p-4">
                    {[1, 2, 3].map((row) => (
                      <div key={row} className="h-16 animate-pulse rounded-lg bg-muted" />
                    ))}
                  </div>
                ) : error ? (
                  <div className="p-6 text-sm text-red-500">
                    Unable to load fulfillment queue.
                  </div>
                ) : filteredFulfillments.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Month / Year</TableHead>
                          <TableHead>Driver</TableHead>
                          <TableHead>Entry #</TableHead>
                          <TableHead>Prize</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Vendor / Sponsor</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Tracking / Reference</TableHead>
                          <TableHead>Updated</TableHead>
                          <TableHead className="text-right">Open</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredFulfillments.map((fulfillment) => (
                          <TableRow
                            key={fulfillment.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setSelectedFulfillmentId(fulfillment.id)}
                          >
                            <TableCell className="font-medium">
                              {formatMonthYear(fulfillment.drawingMonth, fulfillment.drawingYear)}
                            </TableCell>
                            <TableCell>{fulfillment.driverName || fulfillment.driverNameSnapshot || "—"}</TableCell>
                            <TableCell className="font-mono text-sm text-muted-foreground">
                              {fulfillment.ticketNumberSnapshot || "—"}
                            </TableCell>
                            <TableCell className="max-w-[220px]">
                              <div className="space-y-1">
                                <p className="font-medium text-foreground">{fulfillment.prizeTitleSnapshot}</p>
                                {fulfillment.prizeDescriptionSnapshot && (
                                  <p className="line-clamp-2 text-xs text-muted-foreground">{fulfillment.prizeDescriptionSnapshot}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {fulfillment.prizeTypeSnapshot || "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {fulfillment.vendorOrSponsorSnapshot || fulfillment.prizeCatalog?.sponsorVendor || "—"}
                            </TableCell>
                            <TableCell>{renderStatusBadge(fulfillment.fulfillmentStatus)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              <div className="space-y-1">
                                <p>{fulfillment.trackingNumber || "—"}</p>
                                <p>{fulfillment.trackingReference || "—"}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDateTime(fulfillment.updatedAt)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-slate-700 bg-slate-900/30 text-white hover:bg-slate-800 dark:border-slate-600 dark:bg-slate-800/40 dark:text-white"
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
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                    <Package className="h-10 w-10 text-sky-400" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">No fulfillments in this queue.</p>
                      <p className="text-sm text-muted-foreground">
                        {activeQueue === "all"
                          ? "Completed drawings will populate this list automatically."
                          : `No ${visibleQueueLabel.toLowerCase()} items are waiting right now.`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </Tabs>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-slate-950 text-white">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg text-white">
              <History className="h-5 w-5 text-sky-400" />
              Operations Notes
            </CardTitle>
            <CardDescription className="text-white/70">
              Use the drawer on the right to update status, notes, and tracking details for a selected fulfillment.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border/70 bg-slate-900/60 p-3">
              <p className="text-xs font-medium text-white/60">Needs Purchase</p>
              <p className="mt-1 text-sm text-white">Pending items need procurement or preparation.</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-slate-900/60 p-3">
              <p className="text-xs font-medium text-white/60">Shipped / Delivered</p>
              <p className="mt-1 text-sm text-white">Track outbound delivery and pickup completion.</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-slate-900/60 p-3">
              <p className="text-xs font-medium text-white/60">Issues / Canceled</p>
              <p className="mt-1 text-sm text-white">Keep an audit trail for exceptions and cancellations.</p>
            </div>
          </CardContent>
        </Card>
      </main>

      <Sheet open={Boolean(selectedFulfillmentId)} onOpenChange={(open) => !open && setSelectedFulfillmentId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="space-y-2">
            <SheetTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-sky-500" />
              Rewards Fulfillment Details
            </SheetTitle>
            <SheetDescription>{fulfilledStateLabel(currentSelected)}</SheetDescription>
          </SheetHeader>

          {!currentSelected ? (
            <div className="mt-6 rounded-lg border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
              Select a fulfillment from the queue to review and update it.
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Drawing</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {formatMonthYear(currentSelected.drawingMonth, currentSelected.drawingYear)}
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Entry Number</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                    {currentSelected.ticketNumberSnapshot || "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Driver</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {currentSelected.driverName || currentSelected.driverNameSnapshot || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">{actorLabel(currentSelected.driverUser)}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Status</p>
                  <div className="mt-1">{renderStatusBadge(currentSelected.fulfillmentStatus)}</div>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/80 p-4 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Prize Details</p>
                    <p className="text-xs text-muted-foreground">Prize snapshots from the completed drawing are preserved here.</p>
                  </div>
                  {currentSelected.prizeTypeSnapshot === "prepaid_card" && (
                    <Badge className="bg-red-600 text-white hover:bg-red-700">
                      <ShieldAlert className="mr-1 h-3 w-3" />
                      Sensitive Prize Type
                    </Badge>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Prize Title</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{currentSelected.prizeTitleSnapshot}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Prize Type</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {currentSelected.prizeTypeSnapshot || "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3 sm:col-span-2">
                    <p className="text-xs font-medium text-muted-foreground">Prize Description</p>
                    <p className="mt-1 text-sm text-foreground">
                      {currentSelected.prizeDescriptionSnapshot || "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Vendor / Sponsor</p>
                    <p className="mt-1 text-sm text-foreground">
                      {currentSelected.vendorOrSponsorSnapshot || currentSelected.prizeCatalog?.sponsorVendor || "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Updated</p>
                    <p className="mt-1 text-sm text-foreground">{formatDateTime(currentSelected.updatedAt)}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/80 p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-sky-500" />
                  <p className="text-sm font-semibold text-foreground">Admin Actions</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {quickActions.map((action) => (
                    <Button
                      key={action.status}
                      type="button"
                      variant="outline"
                      className={STATUS_STYLES[action.status] || "border-slate-700 bg-slate-900/30 text-white hover:bg-slate-800 dark:border-slate-600 dark:bg-slate-800/40 dark:text-white"}
                      onClick={() => statusMutation.mutate(action.status)}
                      disabled={statusMutation.isPending}
                    >
                      {statusMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      {action.label}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    className="border-red-600 bg-red-600/10 text-red-700 hover:bg-red-600 hover:text-white dark:border-red-500 dark:text-red-300"
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
              </div>

              <div className="rounded-xl border border-border/70 bg-background/80 p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-sky-500" />
                  <p className="text-sm font-semibold text-foreground">Notes and Tracking</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fulfillment-notes">Fulfillment Notes</Label>
                  <Textarea
                    id="fulfillment-notes"
                    value={notesDraft}
                    onChange={(event) => setNotesDraft(event.target.value)}
                    rows={4}
                    placeholder="Add operational notes, vendor coordination, or delivery context."
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
                    <Label htmlFor="tracking-number">Tracking Number</Label>
                    <Input
                      id="tracking-number"
                      value={trackingNumberDraft}
                      onChange={(event) => setTrackingNumberDraft(event.target.value)}
                      placeholder="Shipment or delivery number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tracking-reference">Tracking Reference</Label>
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
                    className="border-slate-700 bg-slate-900/30 text-white hover:bg-slate-800 dark:border-slate-600 dark:bg-slate-800/40 dark:text-white"
                    onClick={() => trackingMutation.mutate()}
                    disabled={trackingMutation.isPending}
                  >
                    {trackingMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
                    Save Tracking
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/80 p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-sky-500" />
                  <p className="text-sm font-semibold text-foreground">Fulfillment History</p>
                </div>
                <div className="space-y-3">
                  {history.length > 0 ? (
                    history.map((item) => (
                      <div key={item.id} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge className={STATUS_STYLES[item.nextStatus] || "bg-slate-600 text-white"}>
                              {statusLabel(item.nextStatus)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(item.changedAt)}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            by {actorLabel(item.changedByUser)}
                          </span>
                        </div>
                        <div className="mt-2 space-y-1 text-sm">
                          {item.notes && <p className="text-foreground">{item.notes}</p>}
                          <p className="text-xs text-muted-foreground">
                            Tracking: {item.trackingNumber || "—"} {item.trackingReference ? `• Reference: ${item.trackingReference}` : ""}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                      No fulfillment history exists yet for this record.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
