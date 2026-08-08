import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2, CheckCircle2, History, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { MobileNav } from "@/components/MobileNav";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  buildFacilityControlMutation,
  createFacilityControlRequestReference,
  validateFacilityControlDraft,
  type FacilityControlDraftError,
  type FacilityControlResponse,
  type FacilityControlState,
} from "@/lib/adminFacilityGeofenceControls";
import { useLanguage } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { FacilityScopedGeofenceFeatureFlag } from "@shared/featureFlags";

type FacilityOption = { id: string; name: string; state: string };
type MutationDraft = {
  flagKey: FacilityScopedGeofenceFeatureFlag;
  enabled: boolean;
  reason: string;
  requestReference: string;
  confirmed: boolean;
};

const labelKeyByFlag: Record<FacilityScopedGeofenceFeatureFlag, string> = {
  geofence_submission_enforcement: "facilityControls.control.enforcement",
  geofence_notifications: "facilityControls.control.notifications",
  geofence_legacy_transition: "facilityControls.control.legacy",
};

const descriptionKeyByFlag: Record<FacilityScopedGeofenceFeatureFlag, string> = {
  geofence_submission_enforcement: "facilityControls.control.enforcementDescription",
  geofence_notifications: "facilityControls.control.notificationsDescription",
  geofence_legacy_transition: "facilityControls.control.legacyDescription",
};

function StateIndicator({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <Badge variant={enabled ? "default" : "secondary"} className="gap-1.5" data-state={enabled ? "enabled" : "disabled"}>
      {enabled ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <XCircle className="h-3.5 w-3.5" aria-hidden="true" />}
      {label}
    </Badge>
  );
}

export default function AdminFacilityGeofenceControls() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const allowed = user?.role === "admin" || user?.role === "super_admin";
  const [facilityId, setFacilityId] = useState("");
  const [draft, setDraft] = useState<MutationDraft | null>(null);

  const facilities = useQuery<FacilityOption[]>({
    queryKey: ["/api/admin/locations", "geofence-control-options"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/locations?view=network-filter")).json(),
    enabled: allowed,
    retry: false,
  });

  const controlEndpoint = facilityId
    ? `/api/admin/facilities/${encodeURIComponent(facilityId)}/geofence-controls`
    : "";
  const controls = useQuery<FacilityControlResponse>({
    queryKey: ["/api/admin/facilities/geofence-controls", facilityId],
    queryFn: async () => (await apiRequest("GET", controlEndpoint)).json(),
    enabled: allowed && Boolean(facilityId),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: async (pending: MutationDraft) => {
      const request = buildFacilityControlMutation({
        facilityId,
        flagKey: pending.flagKey,
        enabled: pending.enabled,
        reason: pending.reason,
        requestReference: pending.requestReference,
        confirmed: pending.confirmed,
      });
      return (await apiRequest(
        `/api/admin/facilities/${encodeURIComponent(request.facilityId)}/geofence-controls/${encodeURIComponent(request.flagKey)}`,
        {
          method: "PUT",
          headers: { "x-request-id": request.requestReference },
          body: JSON.stringify(request.body),
        },
      )).json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/facilities/geofence-controls", facilityId] });
      setDraft(null);
      toast({ title: t("facilityControls.mutation.successTitle"), description: t("facilityControls.mutation.successDescription") });
    },
    onError: (error: Error) => {
      toast({
        title: t("facilityControls.mutation.errorTitle"),
        description: error.message || t("facilityControls.mutation.errorDescription"),
        variant: "destructive",
      });
    },
  });

  const selectedFacility = useMemo(
    () => facilities.data?.find((facility) => facility.id === facilityId) || null,
    [facilities.data, facilityId],
  );

  const draftError = draft
    ? validateFacilityControlDraft({ facilityId, ...draft })
    : null;

  const openMutation = (control: FacilityControlState, enabled: boolean) => {
    setDraft({
      flagKey: control.flagKey,
      enabled,
      reason: "",
      requestReference: createFacilityControlRequestReference(),
      confirmed: false,
    });
    mutation.reset();
  };

  const localizedDraftError = (error: FacilityControlDraftError | null) => {
    if (!error) return "";
    return t(`facilityControls.validation.${error}`);
  };

  const stateLabel = (enabled: boolean) => t(enabled ? "facilityControls.state.enabled" : "facilityControls.state.disabled");
  const sourceLabel = (source: string) => t(`facilityControls.source.${source}`);
  const formatDate = (value: string | null) => value
    ? new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : t("facilityControls.notAvailable");

  if (!allowed) {
    return <main className="p-6" role="alert">{t("facilityControls.accessRequired")}</main>;
  }

  return (
    <main className="min-h-screen bg-background pb-28">
      <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-primary">{t("facilityControls.eyebrow")}</p>
            <h1 className="text-3xl font-semibold tracking-tight">{t("facilityControls.title")}</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">{t("facilityControls.description")}</p>
          </div>
          <LanguageToggle />
        </header>

        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-5 w-5 text-amber-500" />{t("facilityControls.safety.title")}</CardTitle>
            <CardDescription>{t("facilityControls.safety.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>{t("facilityControls.safety.enforcement")}</p>
            <p>{t("facilityControls.safety.authorization")}</p>
            <p>{t("facilityControls.safety.noPageMutation")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />{t("facilityControls.facility.title")}</CardTitle>
            <CardDescription>{t("facilityControls.facility.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {facilities.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" />{t("facilityControls.facility.loading")}</div>
            ) : facilities.isError ? (
              <div className="flex flex-wrap items-center gap-3" role="alert"><span className="text-sm text-destructive">{t("facilityControls.facility.error")}</span><Button variant="outline" size="sm" onClick={() => void facilities.refetch()}><RefreshCw className="mr-2 h-4 w-4" />{t("facilityControls.retry")}</Button></div>
            ) : facilities.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("facilityControls.facility.empty")}</p>
            ) : (
              <label className="grid max-w-2xl gap-2 text-sm font-medium" htmlFor="facility-control-selector">
                {t("facilityControls.facility.select")}
                <select
                  id="facility-control-selector"
                  className="h-11 rounded-md border bg-background px-3"
                  value={facilityId}
                  onChange={(event) => { setFacilityId(event.target.value); setDraft(null); }}
                  data-testid="select-facility-geofence-control"
                >
                  <option value="">{t("facilityControls.facility.placeholder")}</option>
                  {(facilities.data || []).map((facility) => <option key={facility.id} value={facility.id}>{facility.name} ({facility.state})</option>)}
                </select>
              </label>
            )}
            {selectedFacility && (
              <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-sm" data-testid="selected-facility-identity">
                <p className="font-semibold">{selectedFacility.name}</p>
                <p className="break-all font-mono text-xs text-muted-foreground">{t("facilityControls.facility.id")}: {selectedFacility.id}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {!facilityId ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">{t("facilityControls.selectPrompt")}</CardContent></Card>
        ) : controls.isLoading ? (
          <Card><CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground" role="status"><Loader2 className="h-5 w-5 animate-spin" />{t("facilityControls.loading")}</CardContent></Card>
        ) : controls.isError ? (
          <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center" role="alert"><p className="text-sm text-destructive">{t("facilityControls.error")}</p><Button variant="outline" onClick={() => void controls.refetch()}><RefreshCw className="mr-2 h-4 w-4" />{t("facilityControls.retry")}</Button></CardContent></Card>
        ) : controls.data ? (
          <>
            <section aria-labelledby="facility-control-state-heading" className="space-y-3">
              <div><h2 id="facility-control-state-heading" className="text-xl font-semibold">{t("facilityControls.controls.title")}</h2><p className="text-sm text-muted-foreground">{t("facilityControls.controls.description")}</p><p className="mt-1 text-xs text-muted-foreground">{t("facilityControls.controls.userOverrideNote")}</p></div>
              <div className="grid gap-4 lg:grid-cols-3">
                {controls.data.controls.map((control) => (
                  <Card key={control.flagKey} data-testid={`facility-control-${control.flagKey}`}>
                    <CardHeader>
                      <CardTitle className="text-base">{t(labelKeyByFlag[control.flagKey])}</CardTitle>
                      <CardDescription>{t(descriptionKeyByFlag[control.flagKey])}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <dl className="grid gap-3 text-sm">
                        <div className="flex items-center justify-between gap-3"><dt>{t("facilityControls.global")}</dt><dd><StateIndicator enabled={control.globalEnabled} label={stateLabel(control.globalEnabled)} /></dd></div>
                        <div className="flex items-center justify-between gap-3"><dt>{t("facilityControls.override")}</dt><dd>{control.overrideEnabled === null ? <Badge variant="outline">{t("facilityControls.notSet")}</Badge> : <StateIndicator enabled={control.overrideEnabled} label={stateLabel(control.overrideEnabled)} />}</dd></div>
                        <div className="flex items-center justify-between gap-3"><dt>{t("facilityControls.effective")}</dt><dd><StateIndicator enabled={control.effectiveEnabled} label={stateLabel(control.effectiveEnabled)} /></dd></div>
                        <div className="flex items-center justify-between gap-3"><dt>{t("facilityControls.source")}</dt><dd className="font-medium">{sourceLabel(control.source)}</dd></div>
                      </dl>
                      {control.overrideReason && <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground"><span className="font-semibold">{t("facilityControls.lastReason")}:</span> {control.overrideReason}<br />{formatDate(control.overrideUpdatedAt)}</p>}
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                        <Button type="button" onClick={() => openMutation(control, true)} disabled={control.overrideEnabled === true} data-testid={`enable-${control.flagKey}`}>{t("facilityControls.enable")}</Button>
                        <Button type="button" variant="outline" onClick={() => openMutation(control, false)} disabled={control.overrideEnabled === false} data-testid={`disable-${control.flagKey}`}>{t("facilityControls.disable")}</Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />{t("facilityControls.history.title")}</CardTitle><CardDescription>{t("facilityControls.history.description")}</CardDescription></CardHeader>
              <CardContent>
                {controls.data.history.length === 0 ? <p className="text-sm text-muted-foreground">{t("facilityControls.history.empty")}</p> : (
                  <div className="space-y-3" aria-label={t("facilityControls.history.aria")}>
                    {controls.data.history.map((event) => (
                      <article key={event.id} className="rounded-lg border p-3 text-sm" data-testid="facility-control-history-event">
                        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{t(labelKeyByFlag[event.flagKey])}</p><time className="text-xs text-muted-foreground" dateTime={event.createdAt}>{formatDate(event.createdAt)}</time></div>
                        <p className="mt-2">{stateLabel(event.priorEnabled)} → {stateLabel(event.newEnabled)}</p>
                        <p className="mt-1 text-muted-foreground">{event.reason}</p>
                        <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{t("facilityControls.history.request")}: {event.requestId} · {event.actorRole}</p>
                      </article>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open && !mutation.isPending) setDraft(null); }}>
        <DialogContent aria-describedby="facility-control-confirmation-description">
          <DialogHeader>
            <DialogTitle>{t("facilityControls.confirm.title")}</DialogTitle>
            <DialogDescription id="facility-control-confirmation-description">{t("facilityControls.confirm.description")}</DialogDescription>
          </DialogHeader>
          {draft && selectedFacility && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-semibold">{selectedFacility.name}</p>
                <p className="break-all font-mono text-xs text-muted-foreground">{selectedFacility.id}</p>
                <p className="mt-2 font-semibold">{t(labelKeyByFlag[draft.flagKey])}</p>
                <p className="font-mono text-xs text-muted-foreground">{draft.flagKey}</p>
                <p className="mt-2">{t("facilityControls.confirm.newState")}: <strong>{stateLabel(draft.enabled)}</strong></p>
              </div>
              {draft.flagKey === "geofence_submission_enforcement" && <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm" role="alert">{t("facilityControls.confirm.enforcementWarning")}</p>}
              {draft.flagKey !== "geofence_submission_enforcement" && <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm" role="alert">{t("facilityControls.confirm.authorizationWarning")}</p>}
              <div className="space-y-2"><Label htmlFor="facility-control-reason">{t("facilityControls.confirm.reason")}</Label><Textarea id="facility-control-reason" maxLength={500} value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} placeholder={t("facilityControls.confirm.reasonPlaceholder")} /><p className="text-xs text-muted-foreground">{draft.reason.trim().length}/500</p></div>
              <div className="space-y-2"><Label htmlFor="facility-control-request-reference">{t("facilityControls.confirm.requestReference")}</Label><Input id="facility-control-request-reference" maxLength={160} value={draft.requestReference} onChange={(event) => setDraft({ ...draft, requestReference: event.target.value })} /><p className="text-xs text-muted-foreground">{t("facilityControls.confirm.requestHelp")}</p></div>
              <label className="flex items-start gap-3 rounded-lg border p-3 text-sm" htmlFor="facility-control-confirmed"><input id="facility-control-confirmed" type="checkbox" className="mt-1 h-4 w-4" checked={draft.confirmed} onChange={(event) => setDraft({ ...draft, confirmed: event.target.checked })} /><span>{t("facilityControls.confirm.checkbox", { facility: selectedFacility.name, feature: t(labelKeyByFlag[draft.flagKey]) })}</span></label>
              {draftError && <p className="text-sm text-destructive" role="alert">{localizedDraftError(draftError)}</p>}
              {mutation.isError && <p className="text-sm text-destructive" role="alert">{t("facilityControls.mutation.inlineError")}</p>}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={mutation.isPending}>{t("facilityControls.cancel")}</Button>
            <Button type="button" onClick={() => draft && mutation.mutate(draft)} disabled={!draft || Boolean(draftError) || mutation.isPending} data-testid="confirm-facility-control-mutation">
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("facilityControls.confirm.apply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileNav role={user?.role as "admin" | "super_admin"} />
    </main>
  );
}
