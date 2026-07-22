import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Package, Plus, Search, ToggleLeft, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";

type Location = { id: string; name: string };
type CatalogMaterial = { id: string; slug: string; displayName: string; category?: string | null; description?: string | null };
type FacilityMaterial = {
  id: string;
  materialSlug?: string | null;
  materialKind: "system" | "custom";
  displayName: string;
  category?: string | null;
  description?: string | null;
  customDescription?: string | null;
  ownerInstructions?: string | null;
  active: boolean;
};

function materialQueryKey(locationId: string) {
  return ["/api/owners/locations", locationId, "materials"];
}

export function FacilityMaterialsManager({ location }: { location: Location }) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [customName, setCustomName] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [customActive, setCustomActive] = useState(true);

  const materials = useQuery<FacilityMaterial[]>({
    queryKey: materialQueryKey(location.id),
    queryFn: async () => (await apiRequest("GET", `/api/owners/locations/${location.id}/materials`)).json(),
    enabled: open,
  });
  const catalog = useQuery<CatalogMaterial[]>({
    queryKey: ["/api/owners/materials/catalog"],
    queryFn: async () => (await apiRequest("GET", "/api/owners/materials/catalog")).json(),
    enabled: open && addOpen,
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: materialQueryKey(location.id) });
    await queryClient.invalidateQueries({ queryKey: ["/api/owners/materials/catalog"] });
  };
  const addSystem = useMutation({
    mutationFn: async (materialSlug: string) => apiRequest("POST", `/api/owners/locations/${location.id}/materials/system`, { materialSlug }),
    onSuccess: async () => { await refresh(); toast({ title: t("owner.materials.added") }); },
    onError: (error: Error) => toast({ title: t("common.error"), description: error.message, variant: "destructive" }),
  });
  const addCustom = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/owners/locations/${location.id}/materials/custom`, {
      name: customName,
      category: customCategory || null,
      description: customDescription || null,
      ownerInstructions: customInstructions || null,
      active: customActive,
    }),
    onSuccess: async () => {
      await refresh();
      setCustomName(""); setCustomCategory(""); setCustomDescription(""); setCustomInstructions(""); setCustomActive(true);
      setCustomOpen(false);
      toast({ title: t("owner.materials.customAdded") });
    },
    onError: (error: Error) => toast({ title: t("common.error"), description: error.message, variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => apiRequest("PUT", `/api/owners/locations/${location.id}/materials/${id}`, { active }),
    onSuccess: refresh,
    onError: (error: Error) => toast({ title: t("common.error"), description: error.message, variant: "destructive" }),
  });
  const deactivate = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/owners/locations/${location.id}/materials/${id}`),
    onSuccess: async () => { await refresh(); setDeactivateId(null); toast({ title: t("owner.materials.deactivated") }); },
    onError: (error: Error) => toast({ title: t("common.error"), description: error.message, variant: "destructive" }),
  });

  const categories = useMemo(() => Array.from(new Set((catalog.data || []).map((item) => item.category).filter(Boolean) as string[])).sort(), [catalog.data]);
  const configuredSlugs = new Set((materials.data || []).map((item) => item.materialSlug).filter(Boolean));
  const visibleCatalog = (catalog.data || []).filter((item) =>
    !configuredSlugs.has(item.slug)
    && (category === "all" || item.category === category)
    && `${item.displayName} ${item.category || ""}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const pending = addSystem.isPending || addCustom.isPending || update.isPending || deactivate.isPending;

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <Button variant="outline" size="sm" data-testid={`button-manage-materials-${location.id}`}>
        <Package className="mr-2 h-4 w-4" />{t("owner.materials.manage")}
      </Button>
    </DialogTrigger>
    <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{t("owner.materials.title", { facility: location.name })}</DialogTitle>
        <DialogDescription>{t("owner.materials.description")}</DialogDescription>
      </DialogHeader>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t("owner.materials.accepted")}</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setCustomOpen(true)} disabled={pending} data-testid={`button-add-custom-material-${location.id}`}><Plus className="mr-1 h-4 w-4" />{t("owner.materials.custom")}</Button>
            <Button size="sm" onClick={() => setAddOpen(true)} disabled={pending} data-testid={`button-add-system-material-${location.id}`}><Plus className="mr-1 h-4 w-4" />{t("owner.materials.add")}</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {materials.isLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {!materials.isLoading && (materials.data || []).length === 0 && <p className="text-sm text-muted-foreground" data-testid={`empty-materials-${location.id}`}>{t("owner.materials.empty")}</p>}
          {(materials.data || []).map((material) => <div className="rounded-md border p-3" key={material.id} data-testid={`facility-material-${material.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{material.displayName} <Badge variant="secondary">{material.materialKind === "system" ? t("owner.materials.system") : t("owner.materials.custom")}</Badge></p>
                {material.category && <p className="text-xs text-muted-foreground">{material.category}</p>}
                {material.ownerInstructions && <p className="mt-2 text-sm">{material.ownerInstructions}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={material.active ? "default" : "outline"}>{material.active ? t("owner.materials.accepting") : t("owner.materials.inactive")}</Badge>
                <Button size="icon" variant="ghost" aria-label={material.active ? t("owner.materials.deactivate") : t("owner.materials.activate")} disabled={pending} onClick={() => update.mutate({ id: material.id, active: !material.active })}><ToggleLeft className="h-4 w-4" /></Button>
                {material.active && <Button size="icon" variant="ghost" aria-label={t("owner.materials.deactivate")} disabled={pending} onClick={() => setDeactivateId(material.id)}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            </div>
          </div>)}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("owner.materials.addSystem")}</DialogTitle><DialogDescription>{t("owner.materials.addSystemDescription")}</DialogDescription></DialogHeader>
          <div className="space-y-3"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("owner.materials.search")} data-testid="input-material-search" /><div className="flex flex-wrap gap-2"><Button size="sm" variant={category === "all" ? "default" : "outline"} onClick={() => setCategory("all")}>{t("common.all")}</Button>{categories.map((item) => <Button key={item} size="sm" variant={category === item ? "default" : "outline"} onClick={() => setCategory(item)}>{item}</Button>)}</div></div>
          <div className="max-h-72 space-y-2 overflow-y-auto">{visibleCatalog.map((material) => <div key={material.id} className="flex items-center justify-between rounded border p-2"><div><p className="text-sm font-medium">{material.displayName}</p><p className="text-xs text-muted-foreground">{material.category}</p></div><Button size="sm" disabled={pending} onClick={() => addSystem.mutate(material.slug)}>{t("owner.materials.add")}</Button></div>)}{!catalog.isLoading && visibleCatalog.length === 0 && <p className="text-sm text-muted-foreground">{t("owner.materials.noCatalogMatches")}</p>}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent><DialogHeader><DialogTitle>{t("owner.materials.addCustom")}</DialogTitle><DialogDescription>{t("owner.materials.customDescription")}</DialogDescription></DialogHeader><div className="space-y-3"><div><Label htmlFor="custom-material-name">{t("owner.materials.name")}</Label><Input id="custom-material-name" value={customName} onChange={(event) => setCustomName(event.target.value)} data-testid="input-custom-material-name" /></div><div><Label htmlFor="custom-material-category">{t("owner.materials.categoryOptional")}</Label><Input id="custom-material-category" value={customCategory} onChange={(event) => setCustomCategory(event.target.value)} /></div><div><Label htmlFor="custom-material-description">{t("common.description")}</Label><Textarea id="custom-material-description" value={customDescription} onChange={(event) => setCustomDescription(event.target.value)} /></div><div><Label htmlFor="custom-material-instructions">{t("owner.materials.instructions")}</Label><Textarea id="custom-material-instructions" value={customInstructions} onChange={(event) => setCustomInstructions(event.target.value)} /></div><div className="flex items-center gap-2"><Checkbox id="custom-material-active" checked={customActive} onCheckedChange={(checked) => setCustomActive(checked === true)} /><Label htmlFor="custom-material-active">{t("owner.materials.accepting")}</Label></div></div><DialogFooter><Button variant="outline" onClick={() => setCustomOpen(false)}>{t("common.cancel")}</Button><Button disabled={pending || !customName.trim()} onClick={() => addCustom.mutate()} data-testid="button-save-custom-material">{pending ? t("common.saving") : t("common.save")}</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(deactivateId)} onOpenChange={(value) => !value && setDeactivateId(null)}><DialogContent><DialogHeader><DialogTitle>{t("owner.materials.deactivate")}</DialogTitle><DialogDescription>{t("owner.materials.deactivateDescription")}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeactivateId(null)}>{t("common.cancel")}</Button><Button variant="destructive" disabled={pending} onClick={() => deactivateId && deactivate.mutate(deactivateId)}>{t("owner.materials.deactivate")}</Button></DialogFooter></DialogContent></Dialog>
    </DialogContent>
  </Dialog>;
}
