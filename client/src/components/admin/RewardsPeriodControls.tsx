import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bell, Pause, Play, Plus, RotateCcw, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type RewardsPeriodStatus = "scheduled" | "active" | "paused" | "cancelled" | "completed";

type RewardsPeriod = {
  id: string;
  month: number;
  year: number;
  status: RewardsPeriodStatus;
  cancellationReason?: string | null;
  announcementSentAt?: string | null;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const statusTone: Record<RewardsPeriodStatus, "default" | "secondary" | "destructive" | "outline"> = {
  scheduled: "secondary",
  active: "default",
  paused: "outline",
  cancelled: "destructive",
  completed: "outline",
};

function nextActions(status: RewardsPeriodStatus): Array<{ label: string; target: RewardsPeriodStatus; icon: typeof Play }> {
  if (status === "scheduled") return [{ label: "Activate", target: "active", icon: Play }, { label: "Cancel", target: "cancelled", icon: XCircle }];
  if (status === "active") return [{ label: "Pause", target: "paused", icon: Pause }, { label: "Complete", target: "completed", icon: XCircle }, { label: "Cancel", target: "cancelled", icon: XCircle }];
  if (status === "paused") return [{ label: "Resume", target: "active", icon: RotateCcw }, { label: "Cancel", target: "cancelled", icon: XCircle }];
  return [];
}

export function RewardsPeriodControls() {
  const { toast } = useToast();
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [reasonByPeriod, setReasonByPeriod] = useState<Record<string, string>>({});

  const periodsQuery = useQuery<RewardsPeriod[]>({
    queryKey: ["/api/admin/rewards/periods"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/rewards/periods")).json(),
  });

  const invalidate = async () => queryClient.invalidateQueries({ queryKey: ["/api/admin/rewards/periods"] });

  const createPeriod = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/rewards/periods", { month: Number(month), year: Number(year) }),
    onSuccess: async () => {
      await invalidate();
      toast({ title: "Rewards period created" });
    },
    onError: (error: Error) => toast({ title: "Could not create period", description: error.message, variant: "destructive" }),
  });

  const transition = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: RewardsPeriodStatus }) => apiRequest("POST", `/api/admin/rewards/periods/${id}/transition`, {
      status,
      reason: reasonByPeriod[id]?.trim() || undefined,
    }),
    onSuccess: async () => {
      await invalidate();
      toast({ title: "Rewards period updated" });
    },
    onError: (error: Error) => toast({ title: "Could not update period", description: error.message, variant: "destructive" }),
  });

  const announce = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/rewards/periods/${id}/announce-cancellation`),
    onSuccess: async () => {
      await invalidate();
      toast({ title: "Cancellation announcement sent" });
    },
    onError: (error: Error) => toast({ title: "Could not send announcement", description: error.message, variant: "destructive" }),
  });

  const periods = useMemo(() => periodsQuery.data || [], [periodsQuery.data]);

  return (
    <Card className="border-border/70 bg-card shadow-sm" data-testid="rewards-period-controls">
      <CardHeader className="gap-1">
        <CardTitle>Rewards periods</CardTitle>
        <CardDescription>
          Control the active Driver Rewards Program month. These controls do not affect recovery verification, billing, or payments.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
          <Label className="space-y-1">Month
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={month} onChange={(event) => setMonth(event.target.value)}>
              {MONTH_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
            </select>
          </Label>
          <Label className="space-y-1">Year
            <Input inputMode="numeric" value={year} onChange={(event) => setYear(event.target.value)} />
          </Label>
          <Button onClick={() => createPeriod.mutate()} disabled={createPeriod.isPending}>
            <Plus className="mr-2 h-4 w-4" /> Create period
          </Button>
        </div>

        {periodsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading rewards periods…</p> : null}
        {periodsQuery.isError ? <p className="text-sm text-destructive">Rewards periods are unavailable. Refresh to retry.</p> : null}
        {!periodsQuery.isLoading && !periodsQuery.isError && periods.length === 0 ? <p className="text-sm text-muted-foreground">No rewards periods have been created.</p> : null}

        <div className="space-y-3">
          {periods.map((period) => {
            const actions = nextActions(period.status);
            const requiresReason = actions.some((action) => action.target === "cancelled") || period.status === "paused";
            return (
              <div key={period.id} className="rounded-lg border border-border/70 p-3" data-testid={`rewards-period-${period.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{MONTH_NAMES[period.month - 1]} {period.year}</div>
                  <Badge variant={statusTone[period.status]}>{period.status}</Badge>
                </div>
                {requiresReason ? (
                  <Textarea
                    className="mt-3 min-h-16"
                    placeholder={period.status === "paused" ? "Pause reason (optional)" : "Cancellation reason (required to cancel)"}
                    value={reasonByPeriod[period.id] || ""}
                    onChange={(event) => setReasonByPeriod((current) => ({ ...current, [period.id]: event.target.value }))}
                  />
                ) : null}
                {period.cancellationReason ? <p className="mt-2 text-sm text-muted-foreground">Cancellation reason: {period.cancellationReason}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {actions.map(({ label, target, icon: Icon }) => (
                    <Button
                      key={target}
                      type="button"
                      size="sm"
                      variant={target === "cancelled" ? "destructive" : "outline"}
                      disabled={transition.isPending}
                      onClick={() => transition.mutate({ id: period.id, status: target })}
                    >
                      <Icon className="mr-1.5 h-4 w-4" /> {label}
                    </Button>
                  ))}
                  {period.status === "cancelled" ? (
                    <Button type="button" size="sm" variant="outline" disabled={announce.isPending || Boolean(period.announcementSentAt)} onClick={() => announce.mutate(period.id)}>
                      <Bell className="mr-1.5 h-4 w-4" /> {period.announcementSentAt ? "Announcement sent" : "Announce cancellation"}
                    </Button>
                  ) : null}
                </div>
                {period.status === "cancelled" ? <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" /> Cancelled-period tickets remain retained for audit and are excluded from drawings.</p> : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
