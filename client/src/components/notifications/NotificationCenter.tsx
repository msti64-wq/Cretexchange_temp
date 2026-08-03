import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Archive, Bell, Check, CheckCheck, ChevronRight, Megaphone, Trophy } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";
import { localizeCenterNotification, type CenterNotification } from "@/lib/notificationLocalization";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MobileNav } from "@/components/MobileNav";

type Role = "driver" | "owner" | "admin" | "super_admin";
type Page = { items: CenterNotification[]; pagination: { page: number; pageSize: number; total: number; hasMore: boolean } };
const categories = ["all", "operational", "achievement", "competition", "administrative", "system", "announcement"] as const;

export function NotificationCenter({ role }: { role: Role }) {
  const [, navigate] = useLocation();
  const { language, t } = useLanguage();
  const [category, setCategory] = useState<(typeof categories)[number]>("all");
  const query = useInfiniteQuery<Page>({
    queryKey: ["/api/notifications/center", category],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ page: String(pageParam), pageSize: "25" });
      if (category !== "all") params.set("category", category);
      const response = await apiRequest(`/api/notifications/center?${params.toString()}`);
      return response.json();
    },
    getNextPageParam: (last) => last.pagination.hasMore ? last.pagination.page + 1 : undefined,
    staleTime: 60_000,
  });
  const notifications = query.data?.pages.flatMap((page) => page.items) ?? [];
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/notifications/center"] });
    queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"] });
  };
  const markRead = useMutation({ mutationFn: (id: string) => apiRequest(`/api/notifications/${id}/read`, { method: "PUT" }), onSuccess: refresh });
  const markAll = useMutation({ mutationFn: () => apiRequest("/api/notifications/read-all", { method: "PUT" }), onSuccess: refresh });
  const archive = useMutation({ mutationFn: (id: string) => apiRequest(`/api/notifications/${id}/archive`, { method: "POST" }), onSuccess: refresh });

  const openNotification = async (item: CenterNotification) => {
    if (!item.isRead) await markRead.mutateAsync(item.id);
    if (item.deepLink) navigate(item.deepLink);
  };

  return (
    <div className="dark min-h-screen bg-background pb-28 text-foreground">
      <header className="border-b border-border/70 bg-card/95 px-4 py-5">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{t("notification.center.title")}</h1>
            <p className="mt-1 text-sm text-foreground/70">{t("notification.center.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => markAll.mutate()} disabled={markAll.isPending} className="min-h-11">
              <CheckCheck className="mr-2 h-4 w-4" />{t("notification.center.markAll")}
            </Button>
            <Bell aria-hidden="true" className="h-6 w-6" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-4 p-4">
        <label className="block text-sm font-medium" htmlFor="notification-category">{t("notification.center.filter")}</label>
        <select id="notification-category" value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="min-h-11 w-full rounded-md border border-border bg-card px-3 text-foreground sm:max-w-xs">
          {categories.map((value) => <option key={value} value={value}>{t(`notification.category.${value}`)}</option>)}
        </select>
        <div aria-live="polite" className="sr-only">{query.isFetching ? t("notification.center.loading") : t("notification.center.loaded", { count: notifications.length })}</div>
        {query.isLoading ? (
          <div role="status" aria-label={t("notification.center.loading")} className="space-y-3">
            {[1, 2, 3].map((item) => <Card key={item} className="animate-pulse"><CardContent className="p-5"><div className="h-20 rounded bg-muted" /></CardContent></Card>)}
          </div>
        ) : query.isError ? (
          <Card role="alert"><CardContent className="p-10 text-center"><AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-500" /><p>{t("notification.center.error")}</p><Button className="mt-4 min-h-11" onClick={() => query.refetch()}>{t("common.retry")}</Button></CardContent></Card>
        ) : notifications.length === 0 ? (
          <Card><CardContent className="p-10 text-center"><Bell className="mx-auto mb-3 h-10 w-10 text-foreground/50" /><h2 className="font-semibold">{t("notification.center.emptyTitle")}</h2><p className="mt-2 text-sm text-foreground/70">{t("notification.center.emptyDescription")}</p></CardContent></Card>
        ) : (
          <ul className="space-y-3" aria-label={t("notification.center.listAria")}>
            {notifications.map((item) => {
              const localized = localizeCenterNotification(item, language, t);
              const Icon = item.category === "achievement" || item.category === "competition" ? Trophy : item.category === "announcement" ? Megaphone : Bell;
              return <li key={item.id}>
                <Card className={item.isRead ? "border-border bg-card/75" : "border-sky-500/40 bg-card ring-1 ring-sky-500/20"}>
                  <CardContent className="flex gap-3 p-4 sm:p-5">
                    <Icon className="mt-1 h-5 w-5 shrink-0 text-sky-400" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h2 className="font-semibold">{localized.title}</h2>
                        <time dateTime={item.createdAt ?? undefined} className="text-xs text-foreground/60">{item.createdAt ? formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: language === "es" ? es : undefined }) : ""}</time>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-foreground/75">{localized.message}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-border px-2 py-1 text-xs">{t(`notification.category.${item.category}`)}</span>
                        <span className="text-xs font-medium">{item.isRead ? t("notification.center.read") : t("notification.center.unread")}</span>
                        {!item.isRead && <Button variant="outline" size="sm" className="min-h-11" onClick={() => markRead.mutate(item.id)} disabled={markRead.isPending}><Check className="mr-1 h-4 w-4" />{t("notification.center.markRead")}</Button>}
                        {item.deepLink && <Button variant="outline" size="sm" className="min-h-11" onClick={() => void openNotification(item)}><ChevronRight className="mr-1 h-4 w-4" />{t("notification.center.open")}</Button>}
                        <Button variant="ghost" size="sm" className="min-h-11" onClick={() => archive.mutate(item.id)} disabled={archive.isPending}><Archive className="mr-1 h-4 w-4" />{t("notification.center.archive")}</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>;
            })}
          </ul>
        )}
        {query.hasNextPage && <Button className="min-h-11 w-full" variant="outline" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>{query.isFetchingNextPage ? t("notification.center.loading") : t("notification.center.loadMore")}</Button>}
      </main>
      <MobileNav role={role} />
    </div>
  );
}
