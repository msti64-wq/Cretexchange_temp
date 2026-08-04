import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, ChevronRight, ImageIcon, ShieldAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AuthenticatedImage } from "@/components/AuthenticatedImage";
import { MobileNav } from "@/components/MobileNav";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { isPlatformOperationsRole } from "@/lib/adminFinancialWorkspace";
import { localeForLanguage, useLanguage } from "@/lib/i18n";

type ReviewView = "needs_review" | "rejected_by_owner" | "escalated_disputed" | "completed" | "all";
type QueueItem = {
  photo: { id: string; activityId: string; verificationStatus: "verified" | "warning" | "failed" | "needs_review"; verificationReason?: string | null; photoTakenAt?: string | null; uploadedAt?: string | null; contentType?: string | null; evidencePath: string };
  submission: { id: string; status: string; checkInTime?: string | null; submittedAt?: string | null; rejectionReason?: string | null; rejectedAt?: string | null };
  driver: { id?: string | null; displayName: string };
  facility: { id: string; name: string; city?: string | null; state?: string | null };
  material: string;
  activeAdminAction: boolean;
  escalationState: "none" | "open" | "resolved";
  administrativeReview: { id: string; requestedAt?: string | null; resolution?: string | null; decidedAt?: string | null; rationale?: string | null } | null;
  administrativeReviews: Array<{ id: string; requestedAt?: string | null; resolution?: string | null; decidedAt?: string | null; rationale?: string | null }>;
  history: Array<{ id: string; previousStatus: string; newStatus: string; reason?: string | null; createdAt?: string | null }>;
  activityHistory: Array<{ id: string; previousStatus: string; newStatus: string; createdAt?: string | null }>;
};
type QueueResponse = { items: QueueItem[]; summary: { activeCount: number }; pagination: { page: number; pageSize: number; total: number; hasMore: boolean } };

const reviewViews: ReviewView[] = ["needs_review", "rejected_by_owner", "escalated_disputed", "completed", "all"];

export default function AdminPhotoReview() {
  const { user, isLoading: authLoading } = useAuth();
  const { t, language } = useLanguage();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [view, setView] = useState<ReviewView>("needs_review");
  const [driverId, setDriverId] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [activityStatus, setActivityStatus] = useState("");
  const [escalationState, setEscalationState] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const allowed = isPlatformOperationsRole(user?.role);
  const displayDate = (value?: string | null) => value ? new Date(value).toLocaleString(localeForLanguage(language)) : "—";
  const displayStatus = (value: string) => value.replaceAll("_", " ");
  const query = new URLSearchParams({ view, sort, page: String(page), pageSize: "20" });
  if (driverId) query.set("driverId", driverId);
  if (facilityId) query.set("facilityId", facilityId);
  if (activityStatus) query.set("activityStatus", activityStatus);
  if (escalationState) query.set("escalationState", escalationState);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const queue = useQuery<QueueResponse>({
    queryKey: ["/api/admin/photo-review", query.toString()],
    enabled: allowed,
    queryFn: async () => (await apiRequest("GET", `/api/admin/photo-review?${query.toString()}`)).json(),
  });
  const decide = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/admin/photo-review/${selected!.photo.id}/decision`, {
      decision,
      expectedStatus: selected!.photo.verificationStatus,
      reason: reason.trim() || undefined,
      confirmationAcknowledged: true,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/photo-review"] });
      setSelected(null); setDecision(null); setReason(""); setConfirmed(false);
    },
  });
  const currentItems = queue.data?.items || [];
  const drivers = useMemo(() => Array.from(new Map(currentItems.filter((item) => item.driver.id).map((item) => [item.driver.id!, item.driver.displayName])).entries()), [currentItems]);
  const facilities = useMemo(() => Array.from(new Map(currentItems.map((item) => [item.facility.id, item.facility.name])).entries()), [currentItems]);
  const resetPage = () => setPage(1);
  const viewLabel = (value: ReviewView) => t(`photoReview.view.${value}`);

  if (authLoading) return <main className="p-6" aria-busy="true">{t("common.loading")}</main>;
  if (!allowed) return <main className="p-6" role="alert">{t("photoReview.accessDenied")}</main>;

  return <main className="min-h-screen bg-background pb-24"><div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-medium text-primary">{t("photoReview.eyebrow")}</p><h1 className="text-3xl font-semibold">{t("photoReview.title")}</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("photoReview.description")}</p></div><Button variant="outline" onClick={() => setLocation("/")}>{t("photoReview.backToDashboard")}</Button></header>
    <section aria-labelledby="photo-review-views"><h2 id="photo-review-views" className="sr-only">{t("photoReview.reviewState")}</h2><div role="tablist" aria-label={t("photoReview.reviewState")} className="flex gap-2 overflow-x-auto pb-1">{reviewViews.map((item) => <Button key={item} role="tab" aria-selected={view === item} variant={view === item ? "default" : "outline"} onClick={() => { setView(item); resetPage(); }} className="shrink-0">{viewLabel(item)}{item === "needs_review" && queue.data ? ` (${queue.data.summary.activeCount})` : ""}</Button>)}</div></section>
    <Card><CardHeader><CardTitle>{t("common.filters")}</CardTitle><CardDescription>{t("photoReview.filterDescription")}</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1 text-sm"><span>{t("common.drivers")}</span><select aria-label={t("common.drivers")} className="h-10 rounded-md border bg-background px-3" value={driverId} onChange={(event) => { setDriverId(event.target.value); resetPage(); }}><option value="">{t("photoReview.allDrivers")}</option>{drivers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="grid gap-1 text-sm"><span>{t("common.locations")}</span><select aria-label={t("common.locations")} className="h-10 rounded-md border bg-background px-3" value={facilityId} onChange={(event) => { setFacilityId(event.target.value); resetPage(); }}><option value="">{t("photoReview.allFacilities")}</option>{facilities.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="grid gap-1 text-sm"><span>{t("photoReview.activityStatus")}</span><select aria-label={t("photoReview.activityStatus")} className="h-10 rounded-md border bg-background px-3" value={activityStatus} onChange={(event) => { setActivityStatus(event.target.value); resetPage(); }}><option value="">{t("common.all")}</option><option value="pending">{t("photoReview.status.pending")}</option><option value="verified">{t("photoReview.status.verified")}</option><option value="rejected">{t("photoReview.status.rejected")}</option></select></label>
      <label className="grid gap-1 text-sm"><span>{t("photoReview.escalationState")}</span><select aria-label={t("photoReview.escalationState")} className="h-10 rounded-md border bg-background px-3" value={escalationState} onChange={(event) => { setEscalationState(event.target.value); resetPage(); }}><option value="">{t("common.all")}</option><option value="none">{t("photoReview.escalation.none")}</option><option value="open">{t("photoReview.escalation.open")}</option><option value="resolved">{t("photoReview.escalation.resolved")}</option></select></label>
      <label className="grid gap-1 text-sm"><span>{t("common.startDate")}</span><Input aria-label={t("common.startDate")} type="date" value={from} onChange={(event) => { setFrom(event.target.value); resetPage(); }} /></label>
      <label className="grid gap-1 text-sm"><span>{t("common.endDate")}</span><Input aria-label={t("common.endDate")} type="date" value={to} onChange={(event) => { setTo(event.target.value); resetPage(); }} /></label>
      <label className="grid gap-1 text-sm"><span>{t("photoReview.sort")}</span><select aria-label={t("photoReview.sort")} className="h-10 rounded-md border bg-background px-3" value={sort} onChange={(event) => { setSort(event.target.value as typeof sort); resetPage(); }}><option value="newest">{t("photoReview.newest")}</option><option value="oldest">{t("photoReview.oldest")}</option></select></label>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{viewLabel(view)}</CardTitle><CardDescription>{t("photoReview.queueDescription", { count: queue.data?.pagination.total || 0 })}</CardDescription></CardHeader><CardContent>
      {queue.isLoading ? <p aria-live="polite">{t("photoReview.loading")}</p> : queue.error ? <div role="alert" className="space-y-3"><p className="text-destructive">{t("photoReview.queueError")}</p><Button variant="outline" onClick={() => queue.refetch()}>{t("common.retry")}</Button></div> : currentItems.length === 0 ? <p className="py-8 text-center text-muted-foreground">{view === "needs_review" ? t("photoReview.noActiveReviews") : view === "rejected_by_owner" ? t("photoReview.noRejectedEvidence") : t("photoReview.empty")}</p> : <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{currentItems.map((item) => <li key={item.photo.id}><button className="w-full overflow-hidden rounded-xl border text-left transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary" onClick={() => { setSelected(item); setDecision(null); setReason(""); setConfirmed(false); }} type="button" aria-label={t("photoReview.openEvidenceAria", { facility: item.facility.name })}><div className="flex min-h-28 flex-col items-center justify-center bg-muted text-muted-foreground"><ImageIcon className="h-8 w-8" aria-hidden="true" /><span className="mt-2 text-xs">{t("photoReview.authorizedPreview")}</span></div><div className="space-y-2 p-4"><div className="flex items-center justify-between gap-2"><Badge variant={item.activeAdminAction ? "destructive" : item.photo.verificationStatus === "verified" ? "default" : "secondary"}>{displayStatus(item.photo.verificationStatus)}</Badge><span className="font-mono text-xs text-muted-foreground">{item.submission.id.slice(0, 8)}</span></div><p className="font-medium">{item.facility.name}</p><p className="text-sm text-muted-foreground">{item.driver.displayName} · {item.material}</p><p className="text-xs text-muted-foreground">{displayDate(item.photo.uploadedAt)}</p>{item.submission.rejectionReason && <p className="line-clamp-2 text-xs text-muted-foreground">{t("photoReview.rejectionReason")}: {item.submission.rejectionReason}</p>}</div></button></li>)}</ul>}
      <div className="mt-5 flex items-center justify-between"><p className="text-sm text-muted-foreground">{t("photoReview.page", { page, total: Math.max(1, Math.ceil((queue.data?.pagination.total || 0) / 20)) })}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft className="mr-1 h-4 w-4" />{t("photoReview.previous")}</Button><Button size="sm" variant="outline" disabled={!queue.data?.pagination.hasMore} onClick={() => setPage((current) => current + 1)}>{t("photoReview.next")}<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>
    </CardContent></Card>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !decide.isPending) setSelected(null); }}><DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>{t("photoReview.detailTitle")}</DialogTitle><DialogDescription>{t("photoReview.evidenceOnly")}</DialogDescription></DialogHeader>{selected && <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]"><section className="space-y-3"><div className="flex min-h-[320px] items-center justify-center rounded-lg bg-muted p-3"><AuthenticatedImage src={selected.photo.evidencePath} alt={t("photoReview.imageAlt", { id: selected.photo.id })} className="max-h-[560px] max-w-full rounded-md object-contain" data-testid="admin-photo-review-image" /></div><dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="font-medium">{t("photoReview.submission")}</dt><dd className="font-mono">{selected.submission.id}</dd></div><div><dt className="font-medium">{t("common.status")}</dt><dd>{displayStatus(selected.submission.status)}</dd></div><div><dt className="font-medium">{t("photoReview.photoTaken")}</dt><dd>{displayDate(selected.photo.photoTakenAt)}</dd></div><div><dt className="font-medium">{t("photoReview.uploaded")}</dt><dd>{displayDate(selected.photo.uploadedAt)}</dd></div><div><dt className="font-medium">{t("photoReview.ownerDecision")}</dt><dd>{selected.submission.rejectedAt ? displayDate(selected.submission.rejectedAt) : "—"}</dd></div><div><dt className="font-medium">{t("photoReview.escalationState")}</dt><dd>{t(`photoReview.escalation.${selected.escalationState}`)}</dd></div></dl></section><aside className="space-y-4"><Card><CardHeader><CardTitle className="text-base">{t("photoReview.context")}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p><strong>{t("common.drivers")}:</strong> {selected.driver.displayName}</p><p><strong>{t("photoReview.facility")}:</strong> {selected.facility.name}</p><p><strong>{t("photoReview.location")}:</strong> {[selected.facility.city, selected.facility.state].filter(Boolean).join(", ") || "—"}</p><p><strong>{t("photoReview.material")}:</strong> {selected.material}</p><p><strong>{t("photoReview.currentReview")}</strong> {displayStatus(selected.photo.verificationStatus)}</p>{selected.photo.verificationReason && <p><strong>{t("photoReview.reviewReason")}</strong> {selected.photo.verificationReason}</p>}{selected.submission.rejectionReason && <p><strong>{t("photoReview.submissionRejection")}</strong> {selected.submission.rejectionReason}</p>}</CardContent></Card>{selected.activeAdminAction && ["needs_review", "warning"].includes(selected.photo.verificationStatus) && <Card><CardHeader><CardTitle className="text-base">{t("photoReview.actions")}</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2"><Button onClick={() => setDecision("approve")}><CheckCircle2 className="mr-2 h-4 w-4" />{t("photoReview.approveEvidence")}</Button><Button onClick={() => setDecision("reject")} variant="destructive"><XCircle className="mr-2 h-4 w-4" />{t("photoReview.rejectEvidence")}</Button></CardContent></Card>}{selected.administrativeReviews.length > 0 && <Card><CardHeader><CardTitle className="text-base">{t("photoReview.reviewHistory")}</CardTitle></CardHeader><CardContent><ol className="space-y-2 text-sm">{selected.administrativeReviews.map((review) => <li key={review.id} className="border-l-2 pl-3"><p>{review.resolution ? t("photoReview.reviewResolved") : t("photoReview.reviewOpen")}</p><p className="text-xs text-muted-foreground">{displayDate(review.requestedAt)}{review.rationale ? ` · ${t("photoReview.escalationReason")}: ${review.rationale}` : ""}</p></li>)}</ol></CardContent></Card>}<Card><CardHeader><CardTitle className="text-base">{t("photoReview.history")}</CardTitle></CardHeader><CardContent>{selected.history.length + selected.activityHistory.length === 0 ? <p className="text-sm text-muted-foreground">{t("photoReview.noHistory")}</p> : <ol className="space-y-2 text-sm">{[...selected.activityHistory, ...selected.history].map((event) => <li key={event.id} className="border-l-2 pl-3"><p>{displayStatus(event.previousStatus)} → {displayStatus(event.newStatus)}</p><p className="text-xs text-muted-foreground">{displayDate(event.createdAt)}{"reason" in event && event.reason ? ` · ${event.reason}` : ""}</p></li>)}</ol>}</CardContent></Card></aside></div>}</DialogContent></Dialog>
    <Dialog open={Boolean(selected && decision)} onOpenChange={(open) => { if (!open && !decide.isPending) setDecision(null); }}><DialogContent><DialogHeader><DialogTitle>{decision === "approve" ? t("photoReview.approveTitle") : t("photoReview.rejectTitle")}</DialogTitle><DialogDescription>{t("photoReview.decisionDescription")}</DialogDescription></DialogHeader><label className="grid gap-2 text-sm font-medium">{decision === "reject" ? t("photoReview.rejectionReason") : t("photoReview.decisionNote")}<Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} /></label><label className="flex gap-2 text-sm"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />{t("photoReview.confirmation")}</label>{decide.error && <p className="text-sm text-destructive" role="alert"><ShieldAlert className="mr-1 inline h-4 w-4" />{t("photoReview.decisionError")}</p>}<DialogFooter><Button variant="outline" onClick={() => setDecision(null)}>{t("common.cancel")}</Button><Button disabled={!confirmed || (decision === "reject" && !reason.trim()) || decide.isPending} onClick={() => decide.mutate()}>{decide.isPending ? t("common.loading") : decision === "approve" ? t("photoReview.approveEvidence") : t("photoReview.rejectEvidence")}</Button></DialogFooter></DialogContent></Dialog>
  </div><MobileNav role={user?.role as "admin" | "super_admin"} /></main>;
}
