import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, FileWarning, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MobileNav } from "@/components/MobileNav";
import { useAuth } from "@/hooks/useAuth";
import { isPlatformOperationsRole } from "@/lib/adminFinancialWorkspace";
import { apiRequest } from "@/lib/queryClient";

type RefreshSnapshot = { state: "idle" | "running" | "completed" | "completed_with_warnings" | "failed"; startedAt: string | null; completedAt: string | null; durationMs: number | null; documentsDiscovered: number; documentsPublished: number; warnings: number; errors: number; sourceCommit: string | null };
type RefreshResult = { status: "completed" | "failed"; report: { publicationStatus: string; documentsDiscovered: number; documentsPublished: number }; warnings: Array<{ code: string; message: string }>; errors: Array<{ code: string; message: string }> };
type RefreshResponse = { status: RefreshSnapshot; result: RefreshResult };
type RefreshStatus = { current: RefreshSnapshot; latest: { status?: string; startedAt?: string; completedAt?: string; immutableCommitSha?: string } | null };
type Health = { governedDocuments: number; warnings: number; blockingErrors: number; duplicateIdentifiers: number; brokenRelationships: number; missingMetadata: number; searchStatus: string; relationshipStatus: string; inventoryStatus: string; latestSynchronization: { status?: string; startedAt?: string; completedAt?: string } | null };
type HistoryRun = { immutableCommitSha: string; initiatedBy: string | null; status: string; startedAt: string | null; completedAt: string | null; summary: Record<string, unknown> };
type History = { runs: HistoryRun[]; auditEvents: Array<{ eventType: string; createdAt: string | null }> };

const refreshKeys = {
  health: ["/api/admin/administration-repository/refresh/health"] as const,
  status: ["/api/admin/administration-repository/refresh/status"] as const,
  history: ["/api/admin/administration-repository/refresh/history"] as const,
};

const displayDate = (value: string | null | undefined) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not yet available";
const displayDuration = (milliseconds: number | null | undefined) => milliseconds == null ? "—" : milliseconds < 1000 ? "Under one second" : `${Math.round(milliseconds / 100) / 10} seconds`;
const isRunning = (status: RefreshStatus | undefined) => status?.current.state === "running";
const publicErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  if (/^(401|403):/.test(message)) return "Documentation Management requires Platform Operations access.";
  if (/^404:/.test(message)) return "Documentation Management is unavailable in this environment.";
  if (/409:|synchronization_in_progress/.test(message)) return "A documentation refresh is already running. Wait for it to finish before starting another.";
  return "The Documentation Library could not be refreshed safely. The current library remains available.";
};

function ManagementShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <main className="min-h-screen bg-background pb-24"><div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">{children}</div><MobileNav role={user?.role as "admin" | "super_admin"} /></main>;
}

function StatusBadge({ state }: { state: RefreshSnapshot["state"] | string }) {
  const warning = state === "completed_with_warnings";
  const failed = state === "failed";
  const running = state === "running";
  const label = state === "completed" ? "Successful" : warning ? "Successful with warnings" : failed ? "Failed" : running ? "Refresh running" : "Not yet synchronized";
  return <Badge className={failed ? "bg-destructive text-destructive-foreground" : warning ? "bg-amber-500 text-black" : running ? "bg-sky-600" : ""} variant={state === "idle" ? "outline" : "default"}>{label}</Badge>;
}

function Metric({ label, value, description }: { label: string; value: string | number; description?: string }) {
  return <Card><CardContent className="space-y-1 p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{value}</p>{description ? <p className="text-xs text-muted-foreground">{description}</p> : null}</CardContent></Card>;
}

export default function AdministrationRepositoryManagement() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const allowed = isPlatformOperationsRole(user?.role);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [lastResult, setLastResult] = useState<RefreshResponse | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const health = useQuery<Health>({ queryKey: refreshKeys.health, enabled: allowed, retry: false, queryFn: async () => (await apiRequest("GET", "/api/admin/administration-repository/refresh/health")).json() });
  const status = useQuery<RefreshStatus>({ queryKey: refreshKeys.status, enabled: allowed, retry: false, refetchInterval: (query) => isRunning(query.state.data) ? 2000 : false, queryFn: async () => (await apiRequest("GET", "/api/admin/administration-repository/refresh/status")).json() });
  const history = useQuery<History>({ queryKey: refreshKeys.history, enabled: allowed, retry: false, queryFn: async () => (await apiRequest("GET", "/api/admin/administration-repository/refresh/history?limit=10")).json() });
  const refresh = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/administration-repository/refresh")).json() as Promise<RefreshResponse>,
    onSuccess: async (result) => {
      setLastResult(result); setFeedback(null); setConfirmationOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: refreshKeys.health }),
        queryClient.invalidateQueries({ queryKey: refreshKeys.status }),
        queryClient.invalidateQueries({ queryKey: refreshKeys.history }),
        queryClient.invalidateQueries({ queryKey: ["/api/admin/administration-repository/overview"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/admin/administration-repository/documents"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/admin/administration-repository/search"] }),
      ]);
    },
    onError: (error) => { setFeedback(publicErrorMessage(error)); setConfirmationOpen(false); void status.refetch(); },
  });
  const activeStatus = status.data?.current || lastResult?.status;
  const detailItems = useMemo(() => ({ warnings: lastResult?.result.warnings || [], errors: lastResult?.result.errors || [] }), [lastResult]);

  if (authLoading) return <ManagementShell><p role="status">Loading Documentation Management…</p></ManagementShell>;
  if (!allowed) return <ManagementShell><Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Platform Operations access required</AlertTitle><AlertDescription>Documentation Management is available only to authorized administrators.</AlertDescription></Alert></ManagementShell>;
  const unavailable = health.isError || status.isError || history.isError;

  return <ManagementShell>
    <div aria-live="polite" className="sr-only">{feedback || (activeStatus?.state === "running" ? "Documentation refresh is running." : "")}</div>
    <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2"><p className="text-sm font-medium text-primary">Administration Repository</p><h1 className="text-3xl font-semibold tracking-tight">Documentation Management</h1><p className="max-w-3xl text-sm text-muted-foreground">Review the health of the governed documentation library and refresh the Administration Repository after documentation changes are deployed. Refreshing never edits source Markdown.</p></div>
      <div className="flex flex-wrap gap-2"><Button onClick={() => setLocation("/admin/administration-repository")} variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Documentation Library</Button><Button disabled={refresh.isPending || isRunning(status.data) || unavailable} onClick={() => setConfirmationOpen(true)}><RefreshCw className={`mr-2 h-4 w-4 ${refresh.isPending || isRunning(status.data) ? "animate-spin" : ""}`} />{isRunning(status.data) ? "Refresh running" : "Refresh Documentation Library"}</Button></div>
    </header>

    {unavailable ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Documentation Management is unavailable</AlertTitle><AlertDescription>{publicErrorMessage(health.error || status.error || history.error)}</AlertDescription></Alert> : null}
    {feedback ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Refresh not started</AlertTitle><AlertDescription>{feedback}</AlertDescription></Alert> : null}
    {isRunning(status.data) ? <Alert><Loader2 className="h-4 w-4 animate-spin" /><AlertTitle>Refresh in progress</AlertTitle><AlertDescription>Documentation is being scanned and validated. Another refresh cannot start until this one finishes. Started {displayDate(status.data?.current.startedAt)}.</AlertDescription></Alert> : null}

    <section aria-labelledby="documentation-health-heading" className="space-y-3"><div><h2 id="documentation-health-heading" className="text-xl font-semibold">Documentation health</h2><p className="text-sm text-muted-foreground">Current metrics come from the protected Administration Repository health endpoint.</p></div>{health.isLoading ? <LoadingCards /> : health.data ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Governed documents" value={health.data.governedDocuments} /><Metric label="Validation errors" value={health.data.blockingErrors} /><Metric label="Warnings" value={health.data.warnings} /><Metric label="Duplicates" value={health.data.duplicateIdentifiers} /><Metric label="Relationship warnings" value={health.data.brokenRelationships} /><Metric label="Metadata warnings" value={health.data.missingMetadata} /><Metric label="Search index" value={health.data.searchStatus} /><Metric label="Inventory" value={health.data.inventoryStatus} /></div> : null}</section>

    <section className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Latest refresh</CardTitle><CardDescription>Refresh status and publication outcome from the protected synchronization API.</CardDescription></CardHeader><CardContent className="space-y-3">{activeStatus ? <><StatusBadge state={activeStatus.state} /><dl className="grid gap-3 text-sm sm:grid-cols-2"><Detail label="Started" value={displayDate(activeStatus.startedAt)} /><Detail label="Completed" value={displayDate(activeStatus.completedAt)} /><Detail label="Duration" value={displayDuration(activeStatus.durationMs)} /><Detail label="Source commit" value={activeStatus.sourceCommit?.slice(0, 12) || "—"} /></dl><dl className="grid gap-3 text-sm sm:grid-cols-2"><Detail label="Documents discovered" value={String(activeStatus.documentsDiscovered)} /><Detail label="Documents published" value={String(activeStatus.documentsPublished)} /><Detail label="Warnings" value={String(activeStatus.warnings)} /><Detail label="Errors" value={String(activeStatus.errors)} /></dl></> : <p className="text-sm text-muted-foreground">No refresh has been recorded in this browser session. Review recent history for persisted results.</p>}</CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5" />Last synchronized</CardTitle><CardDescription>Use refresh only after governed documentation changes are deployed.</CardDescription></CardHeader><CardContent className="space-y-3"><StatusBadge state={status.data?.latest?.status || "idle"} /><p className="text-sm"><span className="font-medium">Last activity:</span> {displayDate(status.data?.latest?.completedAt || status.data?.latest?.startedAt || health.data?.latestSynchronization?.completedAt || health.data?.latestSynchronization?.startedAt)}</p><p className="text-sm text-muted-foreground">The active Documentation Library remains available if validation or publication fails.</p></CardContent></Card></section>

    {lastResult ? <ResultSummary result={lastResult} warnings={detailItems.warnings} errors={detailItems.errors} /> : null}
    <HistorySection history={history} />

    <AlertDialog open={confirmationOpen} onOpenChange={setConfirmationOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Refresh Documentation Library?</AlertDialogTitle><AlertDialogDescription>This scans governed documentation, validates it, and rebuilds derived Administration Repository data. It does not edit source Markdown. The refresh may take some time and cannot run concurrently with another refresh.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={refresh.isPending}>Cancel</AlertDialogCancel><AlertDialogAction disabled={refresh.isPending || isRunning(status.data)} onClick={(event) => { event.preventDefault(); refresh.mutate(); }}>{refresh.isPending ? "Refreshing…" : "Refresh Library"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </ManagementShell>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-all font-medium">{value}</dd></div>; }
function LoadingCards() { return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="status"><span className="sr-only">Loading documentation health…</span>{Array.from({ length: 8 }, (_, index) => <div className="h-24 animate-pulse rounded-lg bg-muted" key={index} />)}</div>; }
function ResultSummary({ result, warnings, errors }: { result: RefreshResponse; warnings: Array<{ code: string; message: string }>; errors: Array<{ code: string; message: string }> }) { const warningSuccess = result.status.state === "completed_with_warnings"; const failed = result.status.state === "failed"; return <section aria-labelledby="refresh-result-heading" className="space-y-3"><div><h2 id="refresh-result-heading" className="text-xl font-semibold">Refresh result</h2><p className="text-sm text-muted-foreground">A concise result from the most recent request in this session.</p></div><Alert variant={failed ? "destructive" : "default"}>{failed ? <AlertCircle className="h-4 w-4" /> : warningSuccess ? <FileWarning className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}<AlertTitle>{failed ? "Refresh failed" : warningSuccess ? "Refresh completed with warnings" : "Refresh completed successfully"}</AlertTitle><AlertDescription>{failed ? "The previously active Documentation Library was preserved." : `${result.status.documentsPublished} documents were published from ${result.status.documentsDiscovered} discovered documents.`}</AlertDescription></Alert>{warnings.length ? <Details title="Warnings" items={warnings} /> : null}{errors.length ? <Details title="Blocking errors" items={errors} destructive /> : null}</section>; }
function Details({ title, items, destructive = false }: { title: string; items: Array<{ code: string; message: string }>; destructive?: boolean }) { return <Card className={destructive ? "border-destructive/50" : ""}><CardHeader><CardTitle className="text-base">{title} ({items.length})</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm">{items.map((item, index) => <li className="rounded border p-2" key={`${item.code}-${index}`}><span className="font-medium">{item.code.replaceAll("_", " ")}</span><span className="text-muted-foreground"> — {item.message}</span></li>)}</ul></CardContent></Card>; }
function HistorySection({ history }: { history: ReturnType<typeof useQuery<History>> }) { return <section aria-labelledby="refresh-history-heading" className="space-y-3"><div><h2 id="refresh-history-heading" className="text-xl font-semibold">Recent synchronization history</h2><p className="text-sm text-muted-foreground">Recent persisted runs and refresh audit activity.</p></div><Card><CardContent className="p-0">{history.isLoading ? <p className="p-4" role="status">Loading refresh history…</p> : history.data?.runs.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="p-3">Started</th><th>Completed</th><th>Status</th><th>Documents</th><th>Warnings</th><th>Errors</th><th>Source</th></tr></thead><tbody>{history.data.runs.map((run, index) => { const summary = run.summary || {}; return <tr className="border-b" key={`${run.immutableCommitSha}-${index}`}><td className="p-3">{displayDate(run.startedAt)}</td><td>{displayDate(run.completedAt)}</td><td><StatusBadge state={String(run.status)} /></td><td>{typeof summary.documentCount === "number" ? summary.documentCount : "—"}</td><td>{typeof summary.warningCount === "number" ? summary.warningCount : "—"}</td><td>{typeof summary.errorCount === "number" ? summary.errorCount : "—"}</td><td className="font-mono text-xs">{run.immutableCommitSha.slice(0, 12)}</td></tr>; })}</tbody></table></div> : <p className="p-4 text-sm text-muted-foreground">No synchronization history is available yet.</p>}</CardContent></Card></section>; }
