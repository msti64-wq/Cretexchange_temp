import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, HelpCircle, Map, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatLocalizedDate, useLanguage } from "@/lib/i18n";
import { FacilityBoundaryEditor, type BoundaryMode, type BoundaryPoint } from "@/components/owner/FacilityBoundaryEditor";
import { LanguageToggle } from "@/components/LanguageToggle";

type Boundary = {
  id: string; version: number; mode: BoundaryMode; center: BoundaryPoint | null; radiusMeters: number | null;
  geometry: { type: "Polygon"; coordinates: BoundaryPoint[][] } | null; status: string;
  effectiveFrom: string | null; effectiveTo: string | null; createdAt: string; activatedAt: string | null;
};
type Payload = {
  facility: { id: string; name: string; latitude: number; longitude: number };
  readiness: "configured" | "not_configured";
  active: Boundary | null;
  versions: Boundary[];
  history: Array<{ id: string; boundaryVersionId: string; eventType: string; reasonCode: string; actorRole: string | null; safeMetadata: Record<string, unknown>; createdAt: string }>;
};

const STATUS_TRANSLATION_KEYS: Record<string, string> = {
  active: "geofence.owner.status.active",
  draft: "geofence.owner.status.draft",
  superseded: "geofence.owner.status.superseded",
};

const EVENT_TRANSLATION_KEYS: Record<string, string> = {
  draft_created: "geofence.owner.event.draftCreated",
  activated: "geofence.owner.event.activated",
  superseded: "geofence.owner.event.superseded",
  assistance_requested: "geofence.owner.event.assistanceRequested",
  correction_recorded: "geofence.owner.event.correctionRecorded",
};

const REASON_TRANSLATION_KEYS: Record<string, string> = {
  OWNER_DRAFT_CREATED: "geofence.owner.reason.ownerDraftCreated",
  OWNER_CONFIRMED_OPERATIONAL_AREA: "geofence.owner.reason.ownerConfirmedOperationalArea",
  MAP_HELP: "geofence.owner.reason.mapHelp",
  BOUNDARY_CORRECTION_HELP: "geofence.owner.reason.boundaryCorrectionHelp",
  LOCATION_DATA_HELP: "geofence.owner.reason.locationDataHelp",
  TEMPORARY_EXCEPTION_CONTEXT: "geofence.owner.reason.temporaryExceptionContext",
  OTHER: "geofence.owner.reason.other",
};

function defaultPolygon(center: BoundaryPoint): BoundaryPoint[] {
  const [lng, lat] = center;
  const delta = 0.00035;
  return [[lng - delta, lat - delta], [lng + delta, lat - delta], [lng + delta, lat + delta], [lng - delta, lat + delta]];
}

export default function OwnerFacilityGeofence() {
  const { locationId } = useParams<{ locationId: string }>();
  const [, navigate] = useLocation();
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [mode, setMode] = useState<BoundaryMode>("radius");
  const [center, setCenter] = useState<BoundaryPoint | null>(null);
  const [radiusMeters, setRadiusMeters] = useState(100);
  const [polygon, setPolygon] = useState<BoundaryPoint[]>([]);
  const [exceptionDistanceMeters, setExceptionDistanceMeters] = useState(1609.344);
  const [validation, setValidation] = useState<{ valid: boolean; reasonCode?: string } | null>(null);
  const [activationReason, setActivationReason] = useState("");
  const [assistanceNote, setAssistanceNote] = useState("");

  const query = useQuery<Payload>({ queryKey: [`/api/owners/locations/${locationId}/geofence`] });
  const facilityCenter: BoundaryPoint | null = query.data ? [query.data.facility.longitude, query.data.facility.latitude] : null;
  const effectiveCenter = center || facilityCenter;
  const effectivePolygon = polygon.length ? polygon : facilityCenter ? defaultPolygon(facilityCenter) : [];
  const latestDraft = query.data?.versions.find((boundary) => boundary.status === "draft") || null;
  const localizedStatus = (status: string) => t(STATUS_TRANSLATION_KEYS[status] || "geofence.owner.status.unknown");
  const localizedMode = (boundaryMode: BoundaryMode) => t(boundaryMode === "radius" ? "geofence.owner.radius" : "geofence.owner.polygon");
  const localizedEvent = (eventType: string) => t(EVENT_TRANSLATION_KEYS[eventType] || "geofence.owner.event.updated");
  const localizedReason = (reasonCode: string) => REASON_TRANSLATION_KEYS[reasonCode]
    ? t(REASON_TRANSLATION_KEYS[reasonCode])
    : reasonCode.replaceAll("_", " ").toLocaleLowerCase(language);

  const requestBody = useMemo(() => mode === "radius"
    ? { mode, center: effectiveCenter, radiusMeters, exceptionDistanceMeters }
    : { mode, geometry: { type: "Polygon", coordinates: [[...effectivePolygon, effectivePolygon[0]]] }, exceptionDistanceMeters },
  [mode, effectiveCenter, radiusMeters, effectivePolygon, exceptionDistanceMeters]);

  const validateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/owners/locations/${locationId}/geofence/validate`, { method: "POST", body: JSON.stringify(requestBody) });
      return response.json();
    },
    onSuccess: (result) => setValidation(result),
    onError: (error) => setValidation({ valid: false, reasonCode: error instanceof Error ? error.message : "BOUNDARY_INVALID" }),
  });
  const draftMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/owners/locations/${locationId}/geofence/drafts`, { method: "POST", body: JSON.stringify(requestBody) });
      return response.json();
    },
    onSuccess: async () => {
      setValidation({ valid: true });
      await queryClient.invalidateQueries({ queryKey: [`/api/owners/locations/${locationId}/geofence`] });
      toast({ title: t("geofence.owner.draftSaved"), description: t("geofence.owner.draftSavedHelp") });
    },
  });
  const activateMutation = useMutation({
    mutationFn: async (boundaryId: string) => {
      const response = await apiRequest(`/api/owners/locations/${locationId}/geofence/versions/${boundaryId}/activate`, { method: "POST", body: JSON.stringify({ confirmationAcknowledged: true, reasonCode: activationReason }) });
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/owners/locations/${locationId}/geofence`] });
      toast({ title: t("geofence.owner.activated"), description: t("geofence.owner.activatedHelp") });
    },
  });
  const assistanceMutation = useMutation({
    mutationFn: async (boundaryVersionId: string) => apiRequest(`/api/owners/locations/${locationId}/geofence/assistance`, { method: "POST", body: JSON.stringify({ boundaryVersionId, reasonCode: "BOUNDARY_CORRECTION_HELP", note: assistanceNote || undefined }) }),
    onSuccess: () => toast({ title: t("geofence.owner.assistanceSent"), description: t("geofence.owner.assistanceSentHelp") }),
  });

  const editFromVersion = (boundary: Boundary) => {
    setMode(boundary.mode);
    if (boundary.center) setCenter(boundary.center);
    if (boundary.radiusMeters) setRadiusMeters(boundary.radiusMeters);
    if (boundary.geometry?.coordinates[0]) setPolygon(boundary.geometry.coordinates[0].slice(0, -1));
    setValidation(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (query.isLoading) return <div className="space-y-4 p-4" role="status"><div className="h-10 animate-pulse rounded bg-muted" /><div className="h-[440px] animate-pulse rounded bg-muted" /><span className="sr-only">{t("geofence.owner.loading")}</span></div>;
  if (query.isError || !query.data || !effectiveCenter) return <div className="p-4"><Card><CardContent className="space-y-3 py-8 text-center"><AlertTriangle className="mx-auto h-10 w-10 text-amber-500" /><p>{t("geofence.owner.loadFailed")}</p><Button onClick={() => query.refetch()}>{t("common.retry")}</Button></CardContent></Card></div>;

  return (
    <main className="space-y-6 p-4 pb-24" data-testid="owner-facility-geofence-page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><Button variant="ghost" className="mb-2 px-0" onClick={() => navigate("/locations")}><ArrowLeft className="mr-2 h-4 w-4" />{t("geofence.owner.back")}</Button><h1 className="text-2xl font-bold">{t("geofence.owner.title")}</h1><p className="text-muted-foreground">{query.data.facility.name}</p></div>
        <div className="flex items-center gap-2 sm:flex-col sm:items-end"><LanguageToggle /><Badge variant={query.data.active ? "default" : "secondary"} className="w-fit"><ShieldCheck className="mr-1 h-4 w-4" />{query.data.active ? t("geofence.owner.ready") : t("geofence.owner.notReady")}</Badge></div>
      </div>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Map className="h-5 w-5" />{t("geofence.owner.editor")}</CardTitle></CardHeader><CardContent className="space-y-5">
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">{t("geofence.owner.guidance")}</div>
        <div className="flex gap-2" role="group" aria-label={t("geofence.owner.mode")}><Button variant={mode === "radius" ? "default" : "outline"} onClick={() => { setMode("radius"); setValidation(null); }}>{t("geofence.owner.radius")}</Button><Button variant={mode === "polygon" ? "default" : "outline"} onClick={() => { setMode("polygon"); setValidation(null); }}>{t("geofence.owner.polygon")}</Button></div>
        <FacilityBoundaryEditor facilityCenter={facilityCenter!} mode={mode} center={effectiveCenter} radiusMeters={radiusMeters} polygon={effectivePolygon} onCenterChange={setCenter} onRadiusChange={setRadiusMeters} onPolygonChange={setPolygon} />
        <div className="max-w-sm"><Label htmlFor="exception-distance">{t("geofence.owner.exceptionDistance")}</Label><Input id="exception-distance" type="number" min="1" max="1609.344" value={exceptionDistanceMeters} onChange={(event) => { setExceptionDistanceMeters(Number(event.target.value)); setValidation(null); }} /><p className="mt-1 text-xs text-muted-foreground">{t("geofence.owner.exceptionDistanceHelp")}</p></div>
        {validation && <div className={`rounded-lg border p-3 text-sm ${validation.valid ? "border-green-300 bg-green-50 text-green-950" : "border-red-300 bg-red-50 text-red-950"}`} role="status">{validation.valid ? t("geofence.owner.valid") : `${t("geofence.owner.invalid")}: ${validation.reasonCode}`}</div>}
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={validateMutation.isPending} onClick={() => validateMutation.mutate()}>{t("geofence.owner.validate")}</Button><Button disabled={draftMutation.isPending || validation?.valid !== true} onClick={() => draftMutation.mutate()}>{t("geofence.owner.saveDraft")}</Button></div>
      </CardContent></Card>

      {latestDraft && <Card className="border-blue-300"><CardHeader><CardTitle>{t("geofence.owner.activation")}</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm">{t("geofence.owner.activationWarning", { version: latestDraft.version })}</p><div><Label htmlFor="activation-reason">{t("geofence.owner.activationReason")}</Label><Input id="activation-reason" value={activationReason} placeholder={t("geofence.owner.activationReasonPlaceholder")} onChange={(event) => setActivationReason(event.target.value)} /></div><Button disabled={activateMutation.isPending || activationReason.trim().length < 3} onClick={() => activateMutation.mutate(latestDraft.id)}><ShieldCheck className="mr-2 h-4 w-4" />{t("geofence.owner.activate")}</Button></CardContent></Card>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>{t("geofence.owner.versions")}</CardTitle></CardHeader><CardContent className="space-y-3">{query.data.versions.length === 0 ? <p className="text-sm text-muted-foreground">{t("geofence.owner.noVersions")}</p> : query.data.versions.map((boundary) => <div key={boundary.id} className="flex items-start justify-between gap-3 rounded-lg border p-3"><div><div className="flex items-center gap-2"><strong>{t("geofence.owner.version", { version: boundary.version })}</strong><Badge variant={boundary.status === "active" ? "default" : "secondary"}>{localizedStatus(boundary.status)}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{localizedMode(boundary.mode)} · {boundary.effectiveFrom ? formatLocalizedDate(boundary.effectiveFrom, language, { dateStyle: "medium", timeStyle: "short" }) : t("geofence.owner.notEffective")}</p></div><Button size="sm" variant="outline" onClick={() => editFromVersion(boundary)}>{t("geofence.owner.correctVersion")}</Button></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5" />{t("geofence.owner.history")}</CardTitle></CardHeader><CardContent className="space-y-3">{query.data.history.length === 0 ? <p className="text-sm text-muted-foreground">{t("geofence.owner.noHistory")}</p> : query.data.history.map((event) => <div key={event.id} className="border-b pb-3 text-sm last:border-0"><strong>{localizedEvent(event.eventType)}</strong><p className="text-muted-foreground">{localizedReason(event.reasonCode)} · {formatLocalizedDate(event.createdAt, language, { dateStyle: "medium", timeStyle: "short" })}</p></div>)}</CardContent></Card>
      </div>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><HelpCircle className="h-5 w-5" />{t("geofence.owner.assistance")}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">{t("geofence.owner.assistanceHelp")}</p><Textarea value={assistanceNote} onChange={(event) => setAssistanceNote(event.target.value)} maxLength={500} placeholder={t("geofence.owner.assistancePlaceholder")} /><Button variant="outline" disabled={!query.data.versions[0] || assistanceMutation.isPending} onClick={() => assistanceMutation.mutate(query.data.versions[0].id)}>{t("geofence.owner.requestAssistance")}</Button></CardContent></Card>
    </main>
  );
}
