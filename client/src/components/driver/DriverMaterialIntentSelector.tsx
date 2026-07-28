import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";

export type DriverMaterial = { slug: string; displayName: string; category?: string | null; description?: string | null };
export type DriverMaterialIntent = { materialSlug: string | null; material: DriverMaterial | null };

export const driverMaterialCatalogKey = ["/api/drivers/materials/catalog"] as const;
export const driverMaterialIntentKey = ["/api/drivers/material-intent"] as const;

export function DriverMaterialIntentSelector({ compact = false }: { compact?: boolean }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(!compact);
  const catalog = useQuery<DriverMaterial[]>({ queryKey: driverMaterialCatalogKey, queryFn: async () => (await apiRequest("GET", "/api/drivers/materials/catalog")).json() });
  const intent = useQuery<DriverMaterialIntent>({ queryKey: driverMaterialIntentKey, queryFn: async () => (await apiRequest("GET", "/api/drivers/material-intent")).json() });
  const save = useMutation({
    mutationFn: async (materialSlug: string) => (await apiRequest("PUT", "/api/drivers/material-intent", { materialSlug })).json(),
    onSuccess: (value) => {
      queryClient.setQueryData(driverMaterialIntentKey, value);
      queryClient.removeQueries({ queryKey: ["/api/drivers/locations"] });
      setExpanded(false);
    },
  });
  const visible = useMemo(() => (catalog.data || []).filter((material) => `${material.displayName} ${material.category || ""}`.toLowerCase().includes(search.toLowerCase())), [catalog.data, search]);
  const active = intent.data?.material;

  if (compact && !expanded) return <Card className="border-border/70 bg-card/90"><CardContent className="flex items-center justify-between gap-3 p-3"><div><p className="text-xs font-semibold uppercase text-muted-foreground">{t("driver.material.active")}</p><p className="font-medium">{intent.isLoading ? t("driver.material.intentLoading") : intent.isError ? t("driver.material.intentUnavailable") : active?.displayName || t("driver.material.none")}</p></div>{intent.isError ? <Button variant="outline" size="sm" onClick={() => void intent.refetch()} data-testid="button-retry-active-material">{t("driver.material.retryIntent")}</Button> : <Button variant="outline" size="sm" onClick={() => setExpanded(true)} data-testid="button-change-active-material">{t("driver.material.change")}</Button>}</CardContent></Card>;

  return <Card className="border-border/70 bg-card/90" data-testid="driver-material-intent-selector"><CardContent className="space-y-3 p-4"><div><p className="font-semibold">{t("driver.material.question")}</p><p className="text-sm text-muted-foreground">{t("driver.material.help")}</p></div>{catalog.isLoading ? <p className="text-sm text-muted-foreground" data-testid="driver-material-catalog-loading">{t("driver.material.catalogLoading")}</p> : catalog.isError ? <div className="space-y-2" data-testid="driver-material-catalog-unavailable"><p className="text-sm text-destructive">{t("driver.material.catalogUnavailable")}</p><Button type="button" variant="outline" size="sm" onClick={() => void catalog.refetch()}>{t("driver.material.retryCatalog")}</Button></div> : intent.isLoading ? <p className="text-sm text-muted-foreground" data-testid="driver-material-intent-loading">{t("driver.material.intentLoading")}</p> : intent.isError ? <div className="space-y-2" data-testid="driver-material-intent-unavailable"><p className="text-sm text-destructive">{t("driver.material.intentUnavailable")}</p><Button type="button" variant="outline" size="sm" onClick={() => void intent.refetch()}>{t("driver.material.retryIntent")}</Button></div> : <><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("driver.material.search")} data-testid="input-driver-material-search" /></div>{visible.length === 0 && catalog.data?.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="driver-material-catalog-empty">{t("driver.material.emptyCatalog")}</p> : <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">{visible.map((material) => <Button key={material.slug} type="button" variant={active?.slug === material.slug ? "default" : "outline"} className="h-auto justify-start whitespace-normal p-3 text-left" disabled={save.isPending} onClick={() => save.mutate(material.slug)} data-testid={`button-driver-material-${material.slug}`}><span className="flex w-full items-start justify-between gap-2"><span><span className="block font-semibold">{material.displayName}</span>{material.category && <span className="block text-xs opacity-75">{material.category}</span>}</span>{active?.slug === material.slug && <Check className="h-4 w-4 shrink-0" />}</span></Button>)}</div>}{visible.length === 0 && (catalog.data?.length || 0) > 0 && <p className="text-sm text-muted-foreground">{t("driver.material.noMatches")}</p>}{save.isError && <p className="text-sm text-destructive">{t("driver.material.saveFailed")}</p>}{save.isSuccess && <p className="text-sm text-emerald-600">{t("driver.material.saved")}</p>}</>}</CardContent></Card>;
}
