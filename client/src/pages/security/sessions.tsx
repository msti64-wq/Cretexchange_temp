import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Laptop, LogOut, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { useLocation } from "wouter";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageToggle } from "@/components/LanguageToggle";
import { MobileNav } from "@/components/MobileNav";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";

type SessionSummary = {
  id: string;
  deviceLabel: string;
  createdAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  current: boolean;
};

type Confirmation =
  | { kind: "one"; session: SessionSummary }
  | { kind: "others" }
  | { kind: "all" }
  | null;

export default function SecuritySessions() {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [confirmation, setConfirmation] = useState<Confirmation>(null);

  const sessionsQuery = useQuery<{ sessions: SessionSummary[] }>({
    queryKey: ["/api/auth/sessions"],
    queryFn: async () => (await apiRequest("GET", "/api/auth/sessions")).json(),
    retry: false,
  });

  const sessions = useMemo(() => [...(sessionsQuery.data?.sessions || [])].sort((a, b) => Number(b.current) - Number(a.current)), [sessionsQuery.data]);
  const otherCount = sessions.filter((session) => !session.current).length;
  const formatDateTime = (value: string) => new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

  const revokeMutation = useMutation({
    mutationFn: async (action: Exclude<Confirmation, null>) => {
      if (action.kind === "one") return apiRequest("DELETE", `/api/auth/sessions/${encodeURIComponent(action.session.id)}`);
      if (action.kind === "others") return apiRequest("POST", "/api/auth/sessions/sign-out-others");
      return apiRequest("POST", "/api/auth/sessions/sign-out-all");
    },
    onSuccess: async (_response, action) => {
      setConfirmation(null);
      if (action.kind === "all" || (action.kind === "one" && action.session.current)) {
        localStorage.removeItem("authToken");
        queryClient.clear();
        setLocation("/login");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/sessions"] });
      toast({ title: t("security.sessions.successTitle"), description: t("security.sessions.successDescription") });
    },
    onError: (error: Error) => {
      setConfirmation(null);
      toast({ title: t("security.sessions.errorTitle"), description: error.message || t("security.sessions.errorDescription"), variant: "destructive" });
    },
  });

  const confirmationText = confirmation?.kind === "all"
    ? t("security.sessions.confirmAll")
    : confirmation?.kind === "others"
      ? t("security.sessions.confirmOthers")
      : t("security.sessions.confirmOne");

  return (
    <div className="min-h-screen overflow-x-hidden bg-background pb-28 text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Button type="button" variant="ghost" onClick={() => setLocation("/profile")} aria-label={t("security.sessions.backAria")}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("security.sessions.back")}
          </Button>
          <LanguageToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 sm:px-6" aria-labelledby="security-sessions-title">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">{t("security.sessions.eyebrow")}</span>
          </div>
          <h1 id="security-sessions-title" className="text-2xl font-semibold sm:text-3xl">{t("security.sessions.title")}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">{t("security.sessions.description")}</p>
        </div>

        {sessionsQuery.isLoading ? (
          <Card role="status" aria-live="polite"><CardContent className="flex items-center gap-3 p-6"><RefreshCw className="h-5 w-5 animate-spin" aria-hidden="true" />{t("security.sessions.loading")}</CardContent></Card>
        ) : sessionsQuery.isError ? (
          <Card role="alert">
            <CardHeader><CardTitle>{t("security.sessions.unavailableTitle")}</CardTitle><CardDescription>{t("security.sessions.unavailableDescription")}</CardDescription></CardHeader>
            <CardContent><Button type="button" variant="outline" onClick={() => sessionsQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />{t("common.retry")}</Button></CardContent>
          </Card>
        ) : (
          <>
            <section className="grid gap-4" aria-label={t("security.sessions.listAria")}>
              {sessions.length === 0 ? (
                <Card><CardContent className="p-6 text-sm text-muted-foreground">{t("security.sessions.empty")}</CardContent></Card>
              ) : sessions.map((session) => {
                const DeviceIcon = session.deviceLabel.toLocaleLowerCase().includes("mobile") ? Smartphone : Laptop;
                return (
                  <Card key={session.id} data-testid={`session-card-${session.current ? "current" : "other"}`}>
                    <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <DeviceIcon className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
                        <div className="min-w-0">
                          <CardTitle className="break-words text-base">{session.deviceLabel}</CardTitle>
                          <CardDescription>{session.current ? t("security.sessions.currentDescription") : t("security.sessions.otherDescription")}</CardDescription>
                        </div>
                      </div>
                      {session.current ? <Badge>{t("security.sessions.current")}</Badge> : (
                        <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setConfirmation({ kind: "one", session })} data-testid="button-revoke-session">
                          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />{t("security.sessions.revoke")}
                        </Button>
                      )}
                    </CardHeader>
                    <CardContent>
                      <dl className="grid gap-3 text-sm sm:grid-cols-2">
                        <div><dt className="text-muted-foreground">{t("security.sessions.lastActive")}</dt><dd>{formatDateTime(session.lastSeenAt)}</dd></div>
                        <div><dt className="text-muted-foreground">{t("security.sessions.signedIn")}</dt><dd>{formatDateTime(session.createdAt)}</dd></div>
                        <div><dt className="text-muted-foreground">{t("security.sessions.inactivityExpiry")}</dt><dd>{formatDateTime(session.idleExpiresAt)}</dd></div>
                        <div><dt className="text-muted-foreground">{t("security.sessions.absoluteExpiry")}</dt><dd>{formatDateTime(session.absoluteExpiresAt)}</dd></div>
                      </dl>
                    </CardContent>
                  </Card>
                );
              })}
            </section>

            <Card>
              <CardHeader><CardTitle>{t("security.sessions.actionsTitle")}</CardTitle><CardDescription>{t("security.sessions.privacyNotice")}</CardDescription></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <Button type="button" variant="outline" disabled={otherCount === 0 || revokeMutation.isPending} onClick={() => setConfirmation({ kind: "others" })} data-testid="button-sign-out-other-devices">
                  {t("security.sessions.signOutOthers")}
                </Button>
                <Button type="button" variant="destructive" disabled={revokeMutation.isPending} onClick={() => setConfirmation({ kind: "all" })} data-testid="button-sign-out-all-devices">
                  {t("security.sessions.signOutAll")}
                </Button>
              </CardContent>
            </Card>
          </>
        )}
        <p className="sr-only" aria-live="polite">{revokeMutation.isPending ? t("security.sessions.revoking") : ""}</p>
      </main>

      <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open && !revokeMutation.isPending) setConfirmation(null); }}>
        <AlertDialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto overflow-x-hidden sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("security.sessions.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{confirmationText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeMutation.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={!confirmation || revokeMutation.isPending} onClick={() => confirmation && revokeMutation.mutate(confirmation)}>
              {revokeMutation.isPending ? t("security.sessions.revoking") : t("security.sessions.confirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MobileNav role={user?.role as "driver" | "owner" | "admin" | "super_admin"} />
    </div>
  );
}
