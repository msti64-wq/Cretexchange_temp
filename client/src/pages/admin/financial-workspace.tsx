import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ClipboardList, Eye, FilePlus2, Loader2, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { MobileNav } from "@/components/MobileNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";
import {
  extractFinancialWorkspaceItems,
  financialWorkspaceAuditEventLabel,
  financialWorkspaceErrorKind,
  formatFinancialWorkspaceAge,
  formatFinancialWorkspaceCents,
  formatFinancialWorkspaceTimestamp,
  isPlatformOperationsRole,
  normalizeFinancialWorkspacePeriodAnchor,
  normalizeFinancialWorkspaceReference,
  workspaceBatchActions,
  type FinancialBatchProjection,
  type FinancialWorkspaceAction,
} from "@/lib/adminFinancialWorkspace";

type Translate = (key: string, values?: Record<string, string | number>) => string;
type Action = { type: "obligation" | "draft" | FinancialWorkspaceAction; batch?: FinancialBatchProjection; item?: Record<string, unknown> };
type CanonicalSummaryMetric = { count: number; driverIncentiveCents: number | null; platformFeeCents: number | null; facilityChargeCents: number | null };
type CanonicalSummary = { missingObligations: { count: number }; openCanonicalObligations: CanonicalSummaryMetric; draftBatches: CanonicalSummaryMetric; readyForReview: CanonicalSummaryMetric; approvedNotExecuted: CanonicalSummaryMetric; exceptions: { count: number }; historicalTestData: { activityCount: number; verifiedActivityCount: number; recordCount: number } };
type FinancialSchemaCapabilities = { previewAvailable: boolean; creationAvailable: boolean; auditSchemaAvailable: boolean; obligationKindAvailable: boolean; financialHistorySchemaAvailable: boolean; canonicalPartialIndexAvailable: boolean; globalActivityIndexPresent: boolean; schemaState: string; creationUnavailableReason: string | null };
type BatchDetail = {
  batch: FinancialBatchProjection;
  memberships: Array<{ obligationReference: string; frozenDriverIncentiveCents: number; frozenPlatformFeeCents: number; frozenFacilityChargeCents: number }>;
  events: Array<{ eventType: string; createdAt: string; reason: string }>;
};

const discoveryKeys = {
  missing: ["/api/admin/financial-obligations/missing", "workspace"] as const,
  unbatched: ["/api/admin/financial-obligations/unbatched", "workspace"] as const,
  exceptions: ["/api/admin/financial-obligations/exceptions", "workspace"] as const,
  batches: ["/api/admin/financial-batches", "workspace"] as const,
  summary: ["/api/admin/financial-workspace/summary", "workspace"] as const,
};

const localeFor = (language: string) => language === "es" ? "es-US" : "en-US";
const unavailable = (t: Translate) => t("financialWorkspace.unavailableValue");
const stateKey = (state: string) => state === "ready_for_review" ? "financialWorkspace.state.ready" : `financialWorkspace.state.${state}`;
const actionKey = (action: FinancialWorkspaceAction) => action === "move_to_review" ? "financialWorkspace.action.review" : `financialWorkspace.action.${action}`;

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">{children}</p>;
}

function LoadingRows({ t }: { t: Translate }) {
  return <div className="space-y-2" role="status" aria-live="polite" aria-label={t("financialWorkspace.loading")}><span className="sr-only">{t("financialWorkspace.loading")}</span><div className="h-10 animate-pulse rounded-lg bg-muted" /><div className="h-10 animate-pulse rounded-lg bg-muted" /></div>;
}

function UnavailableState({ t, retry, retrying = false }: { t: Translate; retry: () => void; retrying?: boolean }) {
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-muted-foreground"><span>{t("financialWorkspace.unavailable")}</span><Button size="sm" variant="outline" onClick={retry} disabled={retrying}>{retrying ? <Loader2 className="animate-spin" /> : t("financialWorkspace.retry")}</Button></div>;
}

function itemText(item: Record<string, unknown>, key: string, fallback: string) {
  const value = item[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function participantText(item: Record<string, unknown>, key: "driver" | "facility" | "location", fallback: string) {
  const participant = item[key];
  if (!participant || typeof participant !== "object") return fallback;
  const record = participant as Record<string, unknown>;
  const label = key === "driver" ? record.displayName : record.name;
  const reference = record.reference;
  return [typeof label === "string" ? label : null, typeof reference === "string" ? reference : null].filter(Boolean).join(" · ") || fallback;
}

export default function AdminFinancialWorkspace() {
  const { user, isLoading: authLoading } = useAuth();
  const { t, language } = useLanguage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const locale = localeFor(language);
  const allowed = isPlatformOperationsRole(user?.role);
  const [detailBatchId, setDetailBatchId] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [recordReference, setRecordReference] = useState("");
  const [reasonCategory, setReasonCategory] = useState("missing_canonical_obligation");
  const [periodAnchor, setPeriodAnchor] = useState(() => new Date().toISOString().slice(0, 10));
  const [approvedCancellationConfirmed, setApprovedCancellationConfirmed] = useState(false);
  const [cancellationCategory, setCancellationCategory] = useState("");
  const [validationKey, setValidationKey] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const referenceInput = useRef<HTMLInputElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const actionOrigin = useRef<HTMLButtonElement | null>(null);

  const missing = useQuery({ queryKey: discoveryKeys.missing, enabled: allowed });
  const unbatched = useQuery({ queryKey: discoveryKeys.unbatched, enabled: allowed });
  const exceptions = useQuery({ queryKey: discoveryKeys.exceptions, enabled: allowed });
  const batches = useQuery<{ items: FinancialBatchProjection[] }>({ queryKey: discoveryKeys.batches, enabled: allowed });
  const summary = useQuery<CanonicalSummary>({ queryKey: discoveryKeys.summary, enabled: allowed });
  const capabilities = useQuery<FinancialSchemaCapabilities>({ queryKey: ["/api/admin/financial-workspace/capabilities"], enabled: allowed, retry: false });
  const selectionToken = action?.type === "obligation" ? itemText(action.item || {}, "selectionToken", "") : "";
  const obligationPreview = useQuery<{ driverIncentiveCents: number; platformFeeCents: number; facilityChargeCents: number }>({
    queryKey: ["/api/admin/financial-obligations/preview", selectionToken], enabled: allowed && Boolean(selectionToken),
    queryFn: async () => (await apiRequest("GET", `/api/admin/financial-obligations/preview/${encodeURIComponent(selectionToken)}`)).json(),
  });
  const detail = useQuery<BatchDetail>({
    queryKey: ["/api/admin/financial-batches", detailBatchId],
    enabled: allowed && Boolean(detailBatchId),
    queryFn: async () => (await apiRequest("GET", `/api/admin/financial-batches/${detailBatchId}`)).json(),
  });

  const refreshWorkspace = async () => {
    await Promise.all(Object.values(discoveryKeys).map((key) => queryClient.invalidateQueries({ queryKey: key })));
    if (detailBatchId) await queryClient.invalidateQueries({ queryKey: ["/api/admin/financial-batches", detailBatchId] });
  };
  const clearAction = () => {
    const origin = actionOrigin.current;
    setAction(null); setReason(""); setRecordReference(""); setReasonCategory("missing_canonical_obligation"); setApprovedCancellationConfirmed(false); setCancellationCategory(""); setValidationKey(null);
    queueMicrotask(() => origin?.focus());
  };
  const validationMessage = () => {
    if (!action) return null;
    if (action.type === "obligation") {
      if (!selectionToken) return "financialWorkspace.validation.selectionRequired";
      if (obligationPreview.isLoading || obligationPreview.isError || !obligationPreview.data) return "financialWorkspace.validation.previewUnavailable";
      if (!capabilities.data?.creationAvailable) return "financialWorkspace.validation.canonicalCreationUnavailable";
      if (reason.trim().length < 20) return "financialWorkspace.validation.detailRequired";
    }
    if (action.type === "draft") {
      if (!recordReference.trim()) return "financialWorkspace.validation.referenceRequired";
      if (!normalizeFinancialWorkspaceReference(recordReference)) return "financialWorkspace.validation.referenceInvalid";
    }
    if (action.type === "draft" && !normalizeFinancialWorkspacePeriodAnchor(periodAnchor)) return "financialWorkspace.validation.periodInvalid";
    if (!reason.trim()) return "financialWorkspace.validation.reasonRequired";
    if (action.type === "cancel" && action.batch?.state === "approved" && !approvedCancellationConfirmed) return "financialWorkspace.validation.confirmationRequired";
    if (action.type === "cancel" && action.batch?.state === "approved" && !cancellationCategory.trim()) return "financialWorkspace.validation.categoryRequired";
    return null;
  };

  const mutation = useMutation({
    onMutate: () => setLiveMessage(t("financialWorkspace.validation.inProgress")),
    mutationFn: async () => {
      const failedValidation = validationMessage();
      if (failedValidation) {
        setValidationKey(failedValidation);
        setLiveMessage(t(failedValidation));
        if (failedValidation.includes("reference")) referenceInput.current?.focus(); else reasonInput.current?.focus();
        throw new Error("workspace_validation");
      }
      if (!action) throw new Error("workspace_validation");
      const reference = normalizeFinancialWorkspaceReference(recordReference);
      if (action.type === "obligation") return (await apiRequest("POST", "/api/admin/financial-obligations/create", { selectionToken, reasonCategory, supportingDetail: reason.trim() })).json();
      if (action.type === "draft") {
        const normalizedPeriodAnchor = normalizeFinancialWorkspacePeriodAnchor(periodAnchor)!;
        return (await apiRequest("POST", "/api/admin/financial-batches", { facilityId: reference!, periodAnchor: normalizedPeriodAnchor, reason: reason.trim(), idempotencyKey: `workspace-${reference!}-${normalizedPeriodAnchor}` })).json();
      }
      if (!action.batch) throw new Error("workspace_validation");
      const body: Record<string, unknown> = { expectedState: action.batch.state, reason: reason.trim() };
      if (action.type === "cancel" && action.batch.state === "approved") { body.approvedCancellationConfirmed = approvedCancellationConfirmed; body.cancellationCategory = cancellationCategory.trim(); }
      const endpoint = action.type === "move_to_review" ? "ready-for-review" : action.type;
      return (await apiRequest("POST", `/api/admin/financial-batches/${encodeURIComponent(action.batch.id)}/${endpoint}`, body)).json();
    },
    onSuccess: async () => {
      const message = t(action?.type === "approve" ? "financialWorkspace.success.approved" : "financialWorkspace.success");
      clearAction(); setLiveMessage(message); toast({ title: t("financialWorkspace.title"), description: message }); await refreshWorkspace();
    },
    onError: (error: Error) => {
      if (error.message === "workspace_validation") return;
      const manual = action?.type === "obligation" || action?.type === "draft";
      const errorKind = financialWorkspaceErrorKind(error, manual);
      const message = t(`financialWorkspace.error.${errorKind}`);
      setLiveMessage(message); toast({ title: t("common.error"), description: message, variant: "destructive" });
      if (errorKind === "state" || errorKind === "conflict") clearAction();
      void refreshWorkspace();
    },
  });

  const missingItems = extractFinancialWorkspaceItems(missing.data);
  const unbatchedItems = extractFinancialWorkspaceItems(unbatched.data);
  const exceptionItems = extractFinancialWorkspaceItems(exceptions.data);
  const batchItems = Array.isArray(batches.data?.items) ? batches.data.items : null;
  const byState = useMemo(() => ({
    draft: batchItems?.filter((batch) => batch.state === "draft") || [], ready: batchItems?.filter((batch) => batch.state === "ready_for_review") || [], approved: batchItems?.filter((batch) => batch.state === "approved") || [], cancelled: batchItems?.filter((batch) => batch.state === "cancelled") || [],
  }), [batchItems]);
  const openAction = (nextAction: Action) => { clearAction(); setAction(nextAction); };

  if (authLoading) return <div className="min-h-screen bg-background p-6"><LoadingRows t={t} /></div>;
  if (!allowed) return <main className="mx-auto max-w-3xl p-6" role="alert"><Card><CardHeader><CardTitle>{t("financialWorkspace.accessRequired")}</CardTitle><CardDescription>{t("financialWorkspace.accessDescription")}</CardDescription></CardHeader><CardContent><Button onClick={() => setLocation("/")}>{t("financialWorkspace.returnDashboard")}</Button></CardContent></Card></main>;

  return <div className="min-h-screen bg-background pb-24">
    <div aria-live="polite" className="sr-only">{liveMessage}</div>
    <header className="border-b border-border/70 bg-card/95 shadow-sm"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="mb-2 flex flex-wrap items-center gap-2"><ReadOnlyBadge t={t} /><span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("financialWorkspace.accessRequired")}</span></div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("financialWorkspace.title")}</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("financialWorkspace.description")}</p></div><Button variant="outline" onClick={() => void refreshWorkspace()}>{t("financialWorkspace.refresh")}</Button></div></header>
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <CanonicalSummarySection t={t} locale={locale} query={summary} />
      <p className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 text-sm text-muted-foreground">{t("financialWorkspace.componentExplanation")}</p>
      <QueueSection t={t} icon={FilePlus2} titleKey="financialWorkspace.missing.title" descriptionKey="financialWorkspace.missing.description" emptyKey="financialWorkspace.missing.empty" query={missing} items={missingItems}>
        {(item, index) => <QueueCard t={t} values={[[t("financialWorkspace.label.verifiedActivity"), itemText(item, "activityReference", unavailable(t))], [t("financialWorkspace.label.facility"), participantText(item, "facility", unavailable(t))], [t("financialWorkspace.label.driver"), participantText(item, "driver", unavailable(t))], [t("financialWorkspace.label.age"), formatFinancialWorkspaceAge(item.ageSeconds, unavailable(t), locale)], [t("financialWorkspace.label.location"), participantText(item, "location", unavailable(t))], [t("financialWorkspace.label.reason"), itemText(item, "classification", unavailable(t))]]} actionLabel={t("financialWorkspace.action.createVerifiedObligation")} onAction={(event) => { actionOrigin.current = event.currentTarget; openAction({ type: "obligation", item }); }} testId={`button-create-obligation-${index}`} disabled={!itemText(item, "selectionToken", "")} />}
      </QueueSection>
      <QueueSection t={t} icon={ClipboardList} titleKey="financialWorkspace.unbatched.title" descriptionKey="financialWorkspace.unbatched.description" emptyKey="financialWorkspace.unbatched.empty" query={unbatched} items={unbatchedItems}>
        {(item, index) => <QueueCard t={t} values={[[t("financialWorkspace.label.obligation"), itemText(item, "obligationReference", unavailable(t))], [t("financialWorkspace.label.facility"), participantText(item, "facility", unavailable(t))], [t("financialWorkspace.label.driver"), participantText(item, "driver", unavailable(t))], [t("financialWorkspace.label.frozenIncentive"), formatFinancialWorkspaceCents(item.frozenDriverIncentiveCents, locale, unavailable(t))], [t("financialWorkspace.label.platformFee"), formatFinancialWorkspaceCents(item.frozenPlatformFeeCents, locale, unavailable(t))], [t("financialWorkspace.label.facilityTotal"), formatFinancialWorkspaceCents(item.facilityChargeCents, locale, unavailable(t))], [t("financialWorkspace.label.age"), formatFinancialWorkspaceAge(item.ageSeconds, unavailable(t), locale)]]} actionLabel={t("financialWorkspace.action.createDraft")} onAction={() => openAction({ type: "draft" })} testId={`button-create-draft-batch-${index}`} />}
      </QueueSection>
      <ExceptionSection t={t} locale={locale} items={exceptionItems} query={exceptions} />
      <BatchSection t={t} locale={locale} state="draft" batches={byState.draft} query={batches} onView={setDetailBatchId} onAction={openAction} />
      <BatchSection t={t} locale={locale} state="ready_for_review" batches={byState.ready} query={batches} onView={setDetailBatchId} onAction={openAction} />
      <BatchSection t={t} locale={locale} state="approved" batches={byState.approved} query={batches} onView={setDetailBatchId} onAction={openAction} />
      <BatchSection t={t} locale={locale} state="cancelled" batches={byState.cancelled} query={batches} onView={setDetailBatchId} onAction={openAction} />
    </main>
    <MobileNav role={user?.role} />
    <ActionDialog t={t} action={action} reason={reason} reasonCategory={reasonCategory} preview={obligationPreview.data} previewLoading={obligationPreview.isLoading} previewUnavailable={obligationPreview.isError || !obligationPreview.data} creationUnavailable={action?.type === "obligation" && !capabilities.data?.creationAvailable} creationUnavailableReason={capabilities.data?.creationUnavailableReason || null} reference={recordReference} periodAnchor={periodAnchor} confirmed={approvedCancellationConfirmed} category={cancellationCategory} validationKey={validationKey} pending={mutation.isPending} referenceInput={referenceInput} reasonInput={reasonInput} onReason={setReason} onReasonCategory={setReasonCategory} onReference={setRecordReference} onPeriod={setPeriodAnchor} onConfirmed={setApprovedCancellationConfirmed} onCategory={setCancellationCategory} onClose={clearAction} onRetryPreview={() => void obligationPreview.refetch()} onSubmit={() => mutation.mutate()} />
    <DetailDialog t={t} locale={locale} detail={detail.data} loading={detail.isLoading} error={detail.isError} onRetry={() => void detail.refetch()} onClose={() => setDetailBatchId(null)} />
  </div>;
}

function ReadOnlyBadge({ t }: { t: Translate }) { return <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-700 dark:text-sky-300">{t("financialWorkspace.nonExecuting")}</span>; }
function CanonicalSummarySection({ t, locale, query }: { t: Translate; locale: string; query: ReturnType<typeof useQuery<CanonicalSummary>> }) {
  if (query.isLoading) return <section><SectionHeader icon={ShieldCheck} title={t("financialWorkspace.summary.title")} description={t("financialWorkspace.summary.description")} /><LoadingRows t={t} /></section>;
  if (query.isError || !query.data) return <section><SectionHeader icon={ShieldCheck} title={t("financialWorkspace.summary.title")} description={t("financialWorkspace.summary.description")} /><UnavailableState t={t} retry={() => void query.refetch()} retrying={query.isFetching} /></section>;
  const metric = (heading: string, value: CanonicalSummaryMetric) => <Card><CardContent className="space-y-2 p-4"><h3 className="font-medium">{heading}</h3><p className="text-2xl font-semibold">{value.count}</p><RecordGrid values={[[t("financialWorkspace.summary.driver"), formatFinancialWorkspaceCents(value.driverIncentiveCents, locale, t("financialWorkspace.unavailableCanonical"))], [t("financialWorkspace.summary.fee"), formatFinancialWorkspaceCents(value.platformFeeCents, locale, t("financialWorkspace.unavailableCanonical"))], [t("financialWorkspace.summary.facility"), formatFinancialWorkspaceCents(value.facilityChargeCents, locale, t("financialWorkspace.unavailableCanonical"))]]} /></CardContent></Card>;
  return <section><SectionHeader icon={ShieldCheck} title={t("financialWorkspace.summary.title")} description={t("financialWorkspace.summary.description")} /><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"><Card><CardContent className="p-4"><h3 className="font-medium">{t("financialWorkspace.summary.missing")}</h3><p className="mt-2 text-2xl font-semibold">{query.data.missingObligations.count}</p></CardContent></Card>{metric(t("financialWorkspace.summary.open"), query.data.openCanonicalObligations)}{metric(t("financialWorkspace.summary.draft"), query.data.draftBatches)}{metric(t("financialWorkspace.summary.ready"), query.data.readyForReview)}{metric(t("financialWorkspace.summary.approved"), query.data.approvedNotExecuted)}<Card><CardContent className="p-4"><h3 className="font-medium">{t("financialWorkspace.summary.exceptions")}</h3><p className="mt-2 text-2xl font-semibold">{query.data.exceptions.count}</p></CardContent></Card><Card><CardContent className="p-4"><h3 className="font-medium">{t("financialWorkspace.summary.historical")}</h3><p className="mt-2 text-2xl font-semibold">{query.data.historicalTestData.recordCount}</p><p className="mt-1 text-sm text-muted-foreground">{t("financialWorkspace.summary.historicalDescription", { activities: query.data.historicalTestData.activityCount, verified: query.data.historicalTestData.verifiedActivityCount })}</p></CardContent></Card></div></section>;
}
function SectionHeader({ icon: Icon, title, description }: { icon: typeof ClipboardList; title: string; description: string }) { return <div className="mb-3 flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></div><div><h2 className="text-xl font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div></div>; }
function RecordGrid({ values }: { values: Array<[string, string]> }) { return <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">{values.map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd></div>)}</dl>; }
function QueueSection({ t, icon, titleKey, descriptionKey, emptyKey, query, items, children }: { t: Translate; icon: typeof ClipboardList; titleKey: string; descriptionKey: string; emptyKey: string; query: ReturnType<typeof useQuery>; items: Array<Record<string, unknown>> | null; children: (item: Record<string, unknown>, index: number) => ReactNode }) { return <section><SectionHeader icon={icon} title={t(titleKey)} description={t(descriptionKey)} />{query.isLoading ? <LoadingRows t={t} /> : query.isError || items === null ? <UnavailableState t={t} retry={() => void query.refetch()} retrying={query.isFetching} /> : items.length === 0 ? <EmptyState>{t(emptyKey)}</EmptyState> : <div className="grid gap-3 lg:grid-cols-2">{items.map(children)}</div>}</section>; }
function QueueCard({ values, actionLabel, onAction, testId, disabled = false }: { t: Translate; values: Array<[string, string]>; actionLabel: string; onAction: (event: MouseEvent<HTMLButtonElement>) => void; testId: string; disabled?: boolean }) { return <Card><CardContent className="space-y-3 p-4"><RecordGrid values={values} /><div className="flex flex-wrap justify-end border-t pt-3"><Button size="sm" onClick={onAction} data-testid={testId} disabled={disabled}>{actionLabel}</Button></div></CardContent></Card>; }
function ExceptionSection({ t, locale, items, query }: { t: Translate; locale: string; items: Array<Record<string, unknown>> | null; query: ReturnType<typeof useQuery> }) { const headers = ["type", "severity", "facility", "driver", "batch", "age", "reason"]; return <section><SectionHeader icon={AlertTriangle} title={t("financialWorkspace.exceptions.title")} description={t("financialWorkspace.exceptions.description")} />{query.isLoading ? <LoadingRows t={t} /> : query.isError || items === null ? <UnavailableState t={t} retry={() => void query.refetch()} retrying={query.isFetching} /> : items.length === 0 ? <EmptyState>{t("financialWorkspace.exceptions.empty")}</EmptyState> : <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr>{headers.map((header) => <th key={header} className="p-3">{t(`financialWorkspace.label.${header}`)}</th>)}</tr></thead><tbody>{items.map((item, index) => <tr className="border-t" key={`${itemText(item, "reference", "record")}-${index}`}><td className="p-3 font-medium">{itemText(item, "exceptionCategory", unavailable(t))}</td><td className="p-3">{item.blocksObligationCreation === true ? t("financialWorkspace.exceptions.title") : t("financialWorkspace.unavailableValue")}</td><td className="p-3">{participantText(item, "facility", unavailable(t))}</td><td className="p-3">{participantText(item, "driver", unavailable(t))}</td><td className="p-3">{unavailable(t)}</td><td className="p-3">{formatFinancialWorkspaceAge(item.ageSeconds, unavailable(t), locale)}</td><td className="p-3 text-muted-foreground">{itemText(item, "explanation", unavailable(t))}</td></tr>)}</tbody></table></div>}</section>; }
function BatchSection({ t, locale, state, batches, query, onView, onAction }: { t: Translate; locale: string; state: FinancialBatchProjection["state"]; batches: FinancialBatchProjection[]; query: ReturnType<typeof useQuery>; onView: (id: string) => void; onAction: (action: Action) => void }) { const title = t(stateKey(state)); const description = t(`financialWorkspace.${state === "ready_for_review" ? "ready" : state}.description`); return <section><SectionHeader icon={ShieldCheck} title={title} description={description} />{query.isLoading ? <LoadingRows t={t} /> : query.isError ? <UnavailableState t={t} retry={() => void query.refetch()} retrying={query.isFetching} /> : batches.length === 0 ? <EmptyState>{t("financialWorkspace.noBatches", { state: title.toLowerCase() })}</EmptyState> : <div className="grid gap-3 xl:grid-cols-2">{batches.map((batch) => <Card key={batch.id}><CardContent className="space-y-3 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="break-all font-semibold">{batch.reference}</p><p className="text-xs text-muted-foreground">{batch.facilityReference || unavailable(t)}</p></div><span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium">{t(stateKey(batch.state))}</span></div><RecordGrid values={[[t("financialWorkspace.label.billingPeriod"), `${formatFinancialWorkspaceTimestamp(batch.period.start, locale, unavailable(t))} – ${formatFinancialWorkspaceTimestamp(batch.period.end, locale, unavailable(t))}`], [t("financialWorkspace.label.timezone"), batch.period.timezone], [t("financialWorkspace.label.revision"), String(batch.revision)], [t("financialWorkspace.label.membershipCount"), String(batch.obligationCount)], [t("financialWorkspace.label.frozenIncentive"), formatFinancialWorkspaceCents(batch.frozenDriverIncentiveCents, locale, unavailable(t))], [t("financialWorkspace.label.platformFee"), formatFinancialWorkspaceCents(batch.frozenPlatformFeeCents, locale, unavailable(t))], [t("financialWorkspace.label.facilityTotal"), formatFinancialWorkspaceCents(batch.frozenFacilityChargeCents, locale, unavailable(t))], [t("financialWorkspace.label.age"), unavailable(t)], [t("financialWorkspace.label.exceptionCount"), String(batch.exceptionCount)]]} /><p className="text-xs text-muted-foreground">{description}</p><div className="flex flex-wrap gap-2 border-t pt-3"><Button size="sm" variant="outline" onClick={() => onView(batch.id)}>{t("financialWorkspace.action.view")}</Button>{workspaceBatchActions(batch.state).map((item) => <Button key={item} size="sm" variant={item === "cancel" ? "outline" : "default"} onClick={() => onAction({ type: item, batch })}>{t(item === "cancel" && batch.state === "approved" ? "financialWorkspace.action.cancelNonExecuted" : actionKey(item))}</Button>)}</div></CardContent></Card>)}</div>}</section>; }
function ActionDialog({ t, action, reason, reasonCategory, preview, previewLoading, previewUnavailable, creationUnavailable, creationUnavailableReason, reference, periodAnchor, confirmed, category, validationKey, pending, referenceInput, reasonInput, onReason, onReasonCategory, onReference, onPeriod, onConfirmed, onCategory, onClose, onRetryPreview, onSubmit }: { t: Translate; action: Action | null; reason: string; reasonCategory: string; preview?: { driverIncentiveCents: number; platformFeeCents: number; facilityChargeCents: number }; previewLoading: boolean; previewUnavailable: boolean; creationUnavailable: boolean; creationUnavailableReason: string | null; reference: string; periodAnchor: string; confirmed: boolean; category: string; validationKey: string | null; pending: boolean; referenceInput: React.RefObject<HTMLInputElement>; reasonInput: React.RefObject<HTMLTextAreaElement>; onReason: (value: string) => void; onReasonCategory: (value: string) => void; onReference: (value: string) => void; onPeriod: (value: string) => void; onConfirmed: (value: boolean) => void; onCategory: (value: string) => void; onClose: () => void; onRetryPreview: () => void; onSubmit: () => void }) {
  if (!action) return null;
  const referenceAction = action.type === "draft";
  const approvedCancel = action.type === "cancel" && action.batch?.state === "approved";
  const dialogTitle = action.type === "obligation" ? t("financialWorkspace.action.createVerifiedObligation") : action.type === "draft" ? t("financialWorkspace.action.createDraft") : approvedCancel ? t("financialWorkspace.action.cancelNonExecuted") : t(actionKey(action.type));
  const referenceInvalid = referenceAction && Boolean(reference.trim()) && !normalizeFinancialWorkspaceReference(reference);
  const periodInvalid = action.type === "draft" && !normalizeFinancialWorkspacePeriodAnchor(periodAnchor);
  const disabledKey = pending ? "financialWorkspace.validation.inProgress" : action.type === "obligation" && (previewLoading || previewUnavailable) ? "financialWorkspace.validation.previewUnavailable" : action.type === "obligation" && creationUnavailable ? "financialWorkspace.validation.canonicalCreationUnavailable" : action.type === "obligation" && reason.trim().length < 20 ? "financialWorkspace.validation.detailRequired" : action.type !== "obligation" && !reason.trim() ? "financialWorkspace.validation.reasonRequired" : referenceAction && !reference.trim() ? "financialWorkspace.validation.referenceRequired" : referenceInvalid ? "financialWorkspace.validation.referenceInvalid" : periodInvalid ? "financialWorkspace.validation.periodInvalid" : approvedCancel && !confirmed ? "financialWorkspace.validation.confirmationRequired" : approvedCancel && !category.trim() ? "financialWorkspace.validation.categoryRequired" : null;
  const error = validationKey ? t(validationKey) : null;
  const referenceError = Boolean(error && validationKey?.includes("reference"));
  const periodError = validationKey === "financialWorkspace.validation.periodInvalid";
  const reasonError = Boolean(error && !referenceError && !periodError);

  return <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
    <DialogContent className="max-h-[90vh] overflow-y-auto" onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onInteractOutside={(event) => { if (pending) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{dialogTitle}</DialogTitle><DialogDescription>{action.type === "obligation" ? t("financialWorkspace.obligation.dialogDescription") : referenceAction ? t("financialWorkspace.temporary.notice") : t("financialWorkspace.detail.description")}</DialogDescription></DialogHeader>
      <div className="space-y-4">
        {action.type === "obligation" && <><section className="rounded-lg border bg-muted/30 p-3"><span className="rounded-full border px-2 py-1 text-xs font-medium">{t("financialWorkspace.obligation.type")}</span><div className="mt-3">{previewLoading ? <LoadingRows t={t} /> : previewUnavailable ? <div role="alert" aria-live="assertive" className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><p>{t("financialWorkspace.preview.unavailable")}</p><Button type="button" size="sm" variant="outline" onClick={onRetryPreview}>{t("financialWorkspace.preview.retry")}</Button></div> : <RecordGrid values={[[t("financialWorkspace.label.verifiedActivity"), itemText(action.item || {}, "activityReference", unavailable(t))], [t("financialWorkspace.label.facility"), participantText(action.item || {}, "facility", unavailable(t))], [t("financialWorkspace.label.driver"), participantText(action.item || {}, "driver", unavailable(t))], [t("financialWorkspace.label.reviewTimestamp"), itemText(action.item || {}, "verificationTimestamp", unavailable(t))], [t("financialWorkspace.summary.driver"), preview ? formatFinancialWorkspaceCents(preview.driverIncentiveCents) : t("financialWorkspace.unavailableCanonical")], [t("financialWorkspace.summary.fee"), preview ? formatFinancialWorkspaceCents(preview.platformFeeCents) : t("financialWorkspace.unavailableCanonical")], [t("financialWorkspace.summary.facility"), preview ? formatFinancialWorkspaceCents(preview.facilityChargeCents) : t("financialWorkspace.unavailableCanonical")]]} />}</div></section>{creationUnavailable && <p role="alert" className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">{t(creationUnavailableReason === "canonical_uniqueness_migration_pending" ? "financialWorkspace.canonicalUniquenessPending" : creationUnavailableReason === "financial_history_schema_unavailable" ? "financialWorkspace.historySchemaUnavailable" : "financialWorkspace.auditSchemaUnavailable")}</p>}<div className="space-y-2"><Label htmlFor="workspace-reason-category">{t("financialWorkspace.reasonCategory")}</Label><select id="workspace-reason-category" value={reasonCategory} onChange={(event) => onReasonCategory(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="missing_canonical_obligation">{t("financialWorkspace.reason.missingCanonical")}</option></select><p className="text-sm text-muted-foreground">{t("financialWorkspace.reason.guidance")}</p></div></>}
        {referenceAction && <>
          <section className="rounded-lg border bg-muted/30 p-3"><h3 className="font-medium">{t("financialWorkspace.temporary.title")}</h3><p className="mt-1 text-sm text-muted-foreground">{t("financialWorkspace.temporary.notice")}</p></section>
          <div className="space-y-2"><Label htmlFor="workspace-reference">{t(action.type === "obligation" ? "financialWorkspace.reference.activity" : "financialWorkspace.reference.facility")}</Label><Input ref={referenceInput} id="workspace-reference" autoComplete="off" value={reference} onChange={(event) => onReference(event.target.value)} aria-invalid={referenceError} aria-describedby={referenceError ? "workspace-action-error" : undefined} placeholder={t("financialWorkspace.reference.placeholder")} /></div>
          {action.type === "draft" && <div className="space-y-2"><Label htmlFor="workspace-period">{t("financialWorkspace.periodAnchor")}</Label><Input id="workspace-period" type="date" value={periodAnchor} onChange={(event) => onPeriod(event.target.value)} aria-invalid={periodError} aria-describedby={periodError ? "workspace-action-error" : undefined} /></div>}
        </>}
        {approvedCancel && <>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => onConfirmed(event.target.checked)} className="mt-1" />{t("financialWorkspace.approvedCancellationConfirmation")}</label>
          <div className="space-y-2"><Label htmlFor="workspace-category">{t("financialWorkspace.cancellationCategory")}</Label><Input id="workspace-category" autoComplete="off" value={category} onChange={(event) => onCategory(event.target.value)} /></div>
        </>}
        <div className="space-y-2"><Label htmlFor="workspace-reason">{t(action.type === "obligation" ? "financialWorkspace.supportingDetail" : "financialWorkspace.operationalReason")}</Label><Textarea ref={reasonInput} id="workspace-reason" value={reason} onChange={(event) => onReason(event.target.value)} maxLength={action.type === "obligation" ? 420 : 500} aria-invalid={reasonError} aria-describedby={reasonError ? "workspace-action-error" : undefined} placeholder={t(action.type === "obligation" ? "financialWorkspace.reason.detailPlaceholder" : "financialWorkspace.reasonPlaceholder")} />{action.type === "obligation" && <p className="text-xs text-muted-foreground">{reason.length}/420</p>}</div>
        {error && <p id="workspace-action-error" role="alert" className="text-sm text-destructive">{error}</p>}
        {disabledKey && <p id="workspace-action-disabled" className="text-sm text-muted-foreground">{t(disabledKey)}</p>}
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={pending}>{t("financialWorkspace.action.cancel")}</Button><Button onClick={onSubmit} disabled={Boolean(disabledKey)} aria-describedby={disabledKey ? "workspace-action-disabled" : undefined}>{pending && <Loader2 className="animate-spin" />}{dialogTitle}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
function DetailDialog({ t, locale, detail, loading, error, onRetry, onClose }: { t: Translate; locale: string; detail: BatchDetail | undefined; loading: boolean; error: boolean; onRetry: () => void; onClose: () => void }) { if (!detail && !loading && !error) return null; const batch = detail?.batch; const eventActor = (eventType: string) => eventType === "ready_for_review" ? batch?.lifecycle.reviewActorReference : eventType === "approved" ? batch?.lifecycle.approvalActorReference : eventType === "cancelled" ? batch?.lifecycle.cancellationActorReference : null; return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>{t("financialWorkspace.detail.title")}</DialogTitle><DialogDescription>{t("financialWorkspace.detail.description")}</DialogDescription></DialogHeader>{loading ? <LoadingRows t={t} /> : error || !batch ? <UnavailableState t={t} retry={onRetry} /> : <div className="space-y-6"><RecordGrid values={[[t("financialWorkspace.label.batch"), batch.reference], [t("financialWorkspace.label.facility"), batch.facilityReference || unavailable(t)], [t("financialWorkspace.label.billingPeriod"), `${formatFinancialWorkspaceTimestamp(batch.period.start, locale, unavailable(t))} – ${formatFinancialWorkspaceTimestamp(batch.period.end, locale, unavailable(t))}`], [t("financialWorkspace.label.timezone"), batch.period.timezone], [t("financialWorkspace.label.revision"), String(batch.revision)], [t("financialWorkspace.label.state"), t(stateKey(batch.state))], [t("financialWorkspace.label.frozenIncentive"), formatFinancialWorkspaceCents(batch.frozenDriverIncentiveCents, locale, unavailable(t))], [t("financialWorkspace.label.platformFee"), formatFinancialWorkspaceCents(batch.frozenPlatformFeeCents, locale, unavailable(t))], [t("financialWorkspace.label.facilityTotal"), formatFinancialWorkspaceCents(batch.frozenFacilityChargeCents, locale, unavailable(t))], [t("financialWorkspace.label.membershipCount"), String(batch.obligationCount)], [t("financialWorkspace.label.reviewTimestamp"), formatFinancialWorkspaceTimestamp(batch.lifecycle.reviewedAt, locale, unavailable(t))], [t("financialWorkspace.label.actor"), batch.lifecycle.reviewActorReference || unavailable(t)], [t("financialWorkspace.label.approvalTimestamp"), formatFinancialWorkspaceTimestamp(batch.lifecycle.approvedAt, locale, unavailable(t))], [t("financialWorkspace.label.actor"), batch.lifecycle.approvalActorReference || unavailable(t)], [t("financialWorkspace.label.cancellationTimestamp"), formatFinancialWorkspaceTimestamp(batch.lifecycle.cancelledAt, locale, unavailable(t))], [t("financialWorkspace.label.actor"), batch.lifecycle.cancellationActorReference || unavailable(t)], [t("financialWorkspace.label.exceptionCount"), String(batch.exceptionCount)]]} /><p className="text-sm text-muted-foreground">{t("financialWorkspace.partialAudit")}</p><section><h3 className="mb-2 font-semibold">{t("financialWorkspace.auditTimeline")}</h3><div className="space-y-2">{detail.events.length === 0 ? <EmptyState>{t("financialWorkspace.noAudit")}</EmptyState> : detail.events.map((event, index) => <div key={`${event.eventType}-${index}`} className="rounded-lg border p-3 text-sm"><p className="font-medium">{t(financialWorkspaceAuditEventLabel(event.eventType) === "Created" ? "financialWorkspace.state.draft" : financialWorkspaceAuditEventLabel(event.eventType) === "Ready for Review" ? "financialWorkspace.state.ready" : `financialWorkspace.state.${event.eventType}`)}</p><p className="text-muted-foreground">{formatFinancialWorkspaceTimestamp(event.createdAt, locale, unavailable(t))} · {t("financialWorkspace.label.actor")}: {eventActor(event.eventType) || unavailable(t)}</p><p className="text-muted-foreground">{t("financialWorkspace.label.role")}: {t("financialWorkspace.roleUnavailable")}</p><p className="mt-1 text-muted-foreground">{t("financialWorkspace.label.reason")}: {event.reason || unavailable(t)}</p></div>)}</div></section><section><h3 className="mb-2 font-semibold">{t("financialWorkspace.memberships")}</h3>{detail.memberships.length === 0 ? <EmptyState>{t("financialWorkspace.noMemberships")}</EmptyState> : <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-3">{t("financialWorkspace.label.obligation")}</th><th className="p-3">{t("financialWorkspace.label.frozenIncentive")}</th><th className="p-3">{t("financialWorkspace.label.platformFee")}</th><th className="p-3">{t("financialWorkspace.label.facilityTotal")}</th></tr></thead><tbody>{detail.memberships.map((membership) => <tr className="border-t" key={membership.obligationReference}><td className="p-3">{membership.obligationReference}</td><td className="p-3">{formatFinancialWorkspaceCents(membership.frozenDriverIncentiveCents, locale, unavailable(t))}</td><td className="p-3">{formatFinancialWorkspaceCents(membership.frozenPlatformFeeCents, locale, unavailable(t))}</td><td className="p-3">{formatFinancialWorkspaceCents(membership.frozenFacilityChargeCents, locale, unavailable(t))}</td></tr>)}</tbody></table></div>}</section><section><h3 className="mb-2 font-semibold">{t("financialWorkspace.exceptions.title")}</h3><p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{t("financialWorkspace.detailExceptions")}</p></section></div>}<DialogFooter><Button onClick={onClose}>{t("financialWorkspace.action.close")}</Button></DialogFooter></DialogContent></Dialog>; }
