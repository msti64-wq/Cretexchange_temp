import { useMemo, useState } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, ImageIcon, ShieldAlert, XCircle } from "lucide-react";
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
import { useLanguage } from "@/lib/i18n";

type QueueItem = {
  photo: { id: string; activityId: string; verificationStatus: "verified" | "warning" | "failed" | "needs_review"; verificationReason?: string | null; photoTakenAt?: string | null; uploadedAt?: string | null; contentType?: string | null };
  submission: { id: string; status: string; checkInTime?: string | null; submittedAt?: string | null; rejectionReason?: string | null };
  driver: { id?: string | null; firstName?: string | null; lastName?: string | null; truckNumber?: string | null };
  facility: { id: string; name: string; city?: string | null; state?: string | null; ownerName?: string | null };
  administrativeReview: { id: string; requestedAt?: string | null; resolution?: string | null; decidedAt?: string | null; rationale?: string | null } | null;
  history: Array<{ id: string; actorUserId?: string | null; previousStatus: string; newStatus: string; reason?: string | null; createdAt?: string | null }>;
};

type QueueResponse = { items: QueueItem[]; pagination: { page: number; pageSize: number; total: number; hasMore: boolean } };

function displayDate(value?: string | null) { return value ? new Date(value).toLocaleString() : "—"; }
function displayStatus(status: QueueItem["photo"]["verificationStatus"]) { return status.replaceAll("_", " "); }

function PhotoReviewThumbnail({ activityId, photoId, alt }: { activityId: string; photoId: string; alt: string }) {
  const photos = useQuery<{ photos: Array<{ id: string; url: string }> }>({
    queryKey: ["/api/photos/activity", activityId, "thumbnail"],
    queryFn: async () => (await apiRequest("GET", `/api/photos/activity/${activityId}`)).json(),
  });
  const photo = photos.data?.photos.find((item) => item.id === photoId);
  if (photos.isLoading) return <span className="text-xs text-muted-foreground">Loading…</span>;
  if (!photo) return <ImageIcon className="h-8 w-8 text-muted-foreground" aria-label={alt} />;
  return <AuthenticatedImage src={photo.url} alt={alt} className="h-36 w-full object-cover" data-testid={`admin-photo-thumbnail-${photoId}`} />;
}

export default function AdminPhotoReview() {
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [state, setState] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [driverId, setDriverId] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const allowed = isPlatformOperationsRole(user?.role);
  const query = new URLSearchParams({ state, page: String(page), pageSize: "20" });
  if (driverId) query.set("driverId", driverId);
  if (facilityId) query.set("facilityId", facilityId);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const queue = useQuery<QueueResponse>({
    queryKey: ["/api/admin/photo-review", query.toString()],
    enabled: allowed,
    queryFn: async () => (await apiRequest("GET", `/api/admin/photo-review?${query.toString()}`)).json(),
  });
  const activityPhotos = useQuery<{ photos: Array<{ id: string; url: string }> }>({
    queryKey: ["/api/photos/activity", selected?.submission.id],
    enabled: Boolean(selected?.submission.id),
    queryFn: async () => (await apiRequest("GET", `/api/photos/activity/${selected!.submission.id}`)).json(),
  });
  const currentPhoto = activityPhotos.data?.photos.find((photo) => photo.id === selected?.photo.id);
  const decide = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/admin/photo-review/${selected!.photo.id}/decision`, {
      decision,
      expectedStatus: selected!.photo.verificationStatus,
      reason: reason.trim() || undefined,
      confirmationAcknowledged: true,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/photo-review"] });
      queryClient.invalidateQueries({ queryKey: ["/api/photos/activity", selected?.submission.id] });
      setSelected(null); setDecision(null); setReason(""); setConfirmed(false);
    },
  });
  const currentItems = queue.data?.items || [];
  const drivers = useMemo(() => Array.from(new Map(currentItems.filter((item) => item.driver.id).map((item) => [item.driver.id!, `${item.driver.firstName || "Driver"} ${item.driver.lastName || ""}`.trim()])).entries()), [currentItems]);
  const facilities = useMemo(() => Array.from(new Map(currentItems.map((item) => [item.facility.id, item.facility.name])).entries()), [currentItems]);
  const resetPage = () => setPage(1);

  if (authLoading) return <main className="p-6">{t("common.loading")}</main>;
  if (!allowed) return <main className="p-6" role="alert">{t("photoReview.accessDenied")}</main>;

  return <main className="min-h-screen bg-background pb-24"><div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-medium text-primary">{t("photoReview.eyebrow")}</p><h1 className="text-3xl font-semibold">{t("photoReview.title")}</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("photoReview.description")}</p></div><Button variant="outline" onClick={() => setLocation("/")}>{t("photoReview.backToDashboard")}</Button></header>
    <Card><CardHeader><CardTitle>{t("common.filters")}</CardTitle><CardDescription>{t("photoReview.filterDescription")}</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
      <label className="grid gap-1 text-sm"><span>{t("photoReview.reviewState")}</span><select aria-label={t("photoReview.reviewState")} className="h-10 rounded-md border bg-background px-3" value={state} onChange={(event) => { setState(event.target.value as typeof state); resetPage(); }}><option value="pending">{t("photoReview.pending")}</option><option value="approved">{t("photoReview.approved")}</option><option value="rejected">{t("photoReview.rejected")}</option><option value="all">{t("common.all")}</option></select></label>
      <label className="grid gap-1 text-sm"><span>{t("common.drivers")}</span><select aria-label={t("common.drivers")} className="h-10 rounded-md border bg-background px-3" value={driverId} onChange={(event) => { setDriverId(event.target.value); resetPage(); }}><option value="">{t("photoReview.allDrivers")}</option>{drivers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="grid gap-1 text-sm"><span>{t("common.locations")}</span><select aria-label={t("common.locations")} className="h-10 rounded-md border bg-background px-3" value={facilityId} onChange={(event) => { setFacilityId(event.target.value); resetPage(); }}><option value="">{t("photoReview.allFacilities")}</option>{facilities.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="grid gap-1 text-sm"><span>{t("common.startDate")}</span><Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); resetPage(); }} /></label><label className="grid gap-1 text-sm"><span>{t("common.endDate")}</span><Input type="date" value={to} onChange={(event) => { setTo(event.target.value); resetPage(); }} /></label>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t("photoReview.queueTitle")}</CardTitle><CardDescription>{t("photoReview.queueDescription", { count: queue.data?.pagination.total || 0 })}</CardDescription></CardHeader><CardContent>
      {queue.isLoading ? <p>{t("common.loading")}</p> : queue.error ? <p role="alert" className="text-destructive">{t("photoReview.queueError")}</p> : currentItems.length === 0 ? <p className="py-8 text-center text-muted-foreground">{t("photoReview.empty")}</p> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{currentItems.map((item) => <button className="overflow-hidden rounded-xl border text-left transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary" key={item.photo.id} onClick={() => { setSelected(item); setDecision(null); setReason(""); setConfirmed(false); }} type="button"><div className="flex min-h-36 items-center justify-center bg-muted"><PhotoReviewThumbnail activityId={item.submission.id} photoId={item.photo.id} alt={t("photoReview.imageAlt", { id: item.photo.id })} /></div><div className="space-y-2 p-4"><div className="flex items-center justify-between gap-2"><Badge variant={item.photo.verificationStatus === "failed" ? "destructive" : item.photo.verificationStatus === "verified" ? "default" : "secondary"}>{displayStatus(item.photo.verificationStatus)}</Badge><span className="font-mono text-xs text-muted-foreground">{item.submission.id.slice(0, 8)}</span></div><p className="font-medium">{item.facility.name}</p><p className="text-sm text-muted-foreground">{item.driver.firstName || t("photoReview.unknownDriver")} {item.driver.lastName || ""}</p><p className="text-xs text-muted-foreground">{displayDate(item.photo.uploadedAt)}</p>{item.photo.verificationReason && <p className="line-clamp-2 text-xs text-muted-foreground">{item.photo.verificationReason}</p>}</div></button>)}</div>}
      <div className="mt-5 flex items-center justify-between"><p className="text-sm text-muted-foreground">{t("photoReview.page", { page, total: Math.max(1, Math.ceil((queue.data?.pagination.total || 0) / 20)) })}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft className="mr-1 h-4 w-4" />{t("photoReview.previous")}</Button><Button size="sm" variant="outline" disabled={!queue.data?.pagination.hasMore} onClick={() => setPage((current) => current + 1)}>{t("photoReview.next")}<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>
    </CardContent></Card>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !decide.isPending) setSelected(null); }}><DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>{t("photoReview.detailTitle")}</DialogTitle><DialogDescription>{t("photoReview.evidenceOnly")}</DialogDescription></DialogHeader>{selected && <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]"><section className="space-y-3"><div className="flex min-h-[320px] items-center justify-center rounded-lg bg-muted p-3">{activityPhotos.isLoading ? <p>{t("common.loading")}</p> : currentPhoto ? <AuthenticatedImage src={currentPhoto.url} alt={t("photoReview.imageAlt", { id: selected.photo.id })} className="max-h-[560px] max-w-full rounded-md object-contain" data-testid="admin-photo-review-image" /> : <p className="text-muted-foreground">{t("photoReview.imageUnavailable")}</p>}</div><dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="font-medium">{t("photoReview.submission")}</dt><dd className="font-mono">{selected.submission.id}</dd></div><div><dt className="font-medium">{t("common.status")}</dt><dd>{selected.submission.status}</dd></div><div><dt className="font-medium">{t("photoReview.photoTaken")}</dt><dd>{displayDate(selected.photo.photoTakenAt)}</dd></div><div><dt className="font-medium">{t("photoReview.uploaded")}</dt><dd>{displayDate(selected.photo.uploadedAt)}</dd></div></dl></section><aside className="space-y-4"><Card><CardHeader><CardTitle className="text-base">{t("photoReview.context")}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p><strong>{t("common.drivers")}:</strong> {selected.driver.firstName || t("photoReview.unknownDriver")} {selected.driver.lastName || ""}</p><p><strong>{t("photoReview.facility")}:</strong> {selected.facility.name}</p><p><strong>{t("photoReview.location")}:</strong> {[selected.facility.city, selected.facility.state].filter(Boolean).join(", ") || "—"}</p><p><strong>{t("photoReview.currentReview")}</strong> {displayStatus(selected.photo.verificationStatus)}</p>{selected.photo.verificationReason && <p><strong>{t("photoReview.reviewReason")}</strong> {selected.photo.verificationReason}</p>}{selected.submission.rejectionReason && <p><strong>{t("photoReview.submissionRejection")}</strong> {selected.submission.rejectionReason}</p>}</CardContent></Card>{["needs_review", "warning"].includes(selected.photo.verificationStatus) && <Card><CardHeader><CardTitle className="text-base">{t("photoReview.actions")}</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2"><Button onClick={() => setDecision("approve")}><CheckCircle2 className="mr-2 h-4 w-4" />{t("photoReview.approveEvidence")}</Button><Button onClick={() => setDecision("reject")} variant="destructive"><XCircle className="mr-2 h-4 w-4" />{t("photoReview.rejectEvidence")}</Button></CardContent></Card>}{selected.administrativeReview && <Card><CardHeader><CardTitle className="text-base">{t("photoReview.administrativeReview")}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>{selected.administrativeReview.resolution ? t("photoReview.reviewResolved") : t("photoReview.reviewOpen")}</p><Link href={`/?reviewId=${encodeURIComponent(selected.administrativeReview.id)}`}><Button size="sm" variant="outline">{t("photoReview.openAdministrativeReview")}<ExternalLink className="ml-2 h-4 w-4" /></Button></Link></CardContent></Card>}<Card><CardHeader><CardTitle className="text-base">{t("photoReview.history")}</CardTitle></CardHeader><CardContent>{selected.history.length === 0 ? <p className="text-sm text-muted-foreground">{t("photoReview.noHistory")}</p> : <ol className="space-y-2 text-sm">{selected.history.map((event) => <li key={event.id} className="border-l-2 pl-3"><p>{displayStatus(event.previousStatus as QueueItem["photo"]["verificationStatus"])} → {displayStatus(event.newStatus as QueueItem["photo"]["verificationStatus"])}</p><p className="text-xs text-muted-foreground">{displayDate(event.createdAt)}{event.reason ? ` · ${event.reason}` : ""}</p></li>)}</ol>}</CardContent></Card></aside></div>}</DialogContent></Dialog>
    <Dialog open={Boolean(selected && decision)} onOpenChange={(open) => { if (!open && !decide.isPending) setDecision(null); }}><DialogContent><DialogHeader><DialogTitle>{decision === "approve" ? t("photoReview.approveTitle") : t("photoReview.rejectTitle")}</DialogTitle><DialogDescription>{t("photoReview.decisionDescription")}</DialogDescription></DialogHeader><label className="grid gap-2 text-sm font-medium">{decision === "reject" ? t("photoReview.rejectionReason") : t("photoReview.decisionNote")}<Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} /></label><label className="flex gap-2 text-sm"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />{t("photoReview.confirmation")}</label>{decide.error && <p className="text-sm text-destructive" role="alert">{t("photoReview.decisionError")}</p>}<DialogFooter><Button variant="outline" onClick={() => setDecision(null)}>{t("common.cancel")}</Button><Button disabled={!confirmed || (decision === "reject" && !reason.trim()) || decide.isPending} onClick={() => decide.mutate()}>{decide.isPending ? t("common.loading") : decision === "approve" ? <><CheckCircle2 className="mr-2 h-4 w-4" />{t("photoReview.approveEvidence")}</> : <><XCircle className="mr-2 h-4 w-4" />{t("photoReview.rejectEvidence")}</>}</Button></DialogFooter></DialogContent></Dialog>
  </div><MobileNav role={user?.role as "admin" | "super_admin"} /></main>;
}
