import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Trash2, TrendingUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MobileNav } from "@/components/MobileNav";
import {
  downloadUnitEconomicsCsv,
  fetchUnitEconomicsCsv,
  fetchUnitEconomicsReport,
  shouldShowUnitEconomicsFoundationWarning,
  unitEconomicsAccessErrorMessage,
  type UnitEconomicsReport,
} from "@/lib/unitEconomicsClient";

const currentMonth = new Date().toISOString().slice(0, 7);
const money = (cents: number | null | undefined) => cents == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default function UnitEconomicsPage() {
  const { user } = useAuth(); const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth);
  const [cost, setCost] = useState({ provider: "", category: "hosting", dollars: "", notes: "", sourceUrl: "" });
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const queryKey = ["/api/superadmin/unit-economics", month];
  const report = useQuery<UnitEconomicsReport>({ queryKey, queryFn: () => fetchUnitEconomicsReport(month) });
  const data = report.data;
  const [draft, setDraft] = useState<any>(null);
  const assumptions = useMemo(() => draft || data?.assumptions || { feePerValidatedLoadCents: 500, paymentProcessingPercent: 2.9, paymentProcessingFixedCents: 30, evidenceStorageProvider: "Unconfirmed", evidenceStorageNotes: "" }, [draft, data]);
  const refresh = () => { setDraft(null); queryClient.invalidateQueries({ queryKey }); };
  const saveAssumptions = useMutation({ mutationFn: () => apiRequest("PUT", "/api/superadmin/unit-economics/assumptions", { month, ...assumptions }), onSuccess: refresh });
  const addCost = useMutation({ mutationFn: () => apiRequest("POST", "/api/superadmin/unit-economics/costs", { month, provider: cost.provider, category: cost.category, amountCents: Math.round(Number(cost.dollars) * 100), notes: cost.notes, sourceUrl: cost.sourceUrl }), onSuccess: () => { setCost({ provider: "", category: "hosting", dollars: "", notes: "", sourceUrl: "" }); refresh(); } });
  const removeCost = useMutation({ mutationFn: (id: string) => apiRequest("DELETE", `/api/superadmin/unit-economics/costs/${id}`), onSuccess: refresh });
  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const { blob, filename } = await fetchUnitEconomicsCsv(month);
      downloadUnitEconomicsCsv(blob, filename);
    } catch (error) {
      setDownloadError(unitEconomicsAccessErrorMessage(error) || "Unable to download the unit-economics CSV.");
    } finally {
      setIsDownloading(false);
    }
  };
  if (user?.role !== "super_admin") return <div className="p-8"><h1 className="text-2xl font-semibold">Superadmin access required</h1></div>;
  const metrics = data?.metrics;
  const reportError = report.isError
    ? unitEconomicsAccessErrorMessage(report.error) || "Unable to load unit economics."
    : null;
  return <div className="mx-auto min-h-screen max-w-7xl space-y-6 p-4 pb-28 md:p-8 md:pb-28" data-testid="unit-economics-dashboard">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-primary">Superadmin</p><h1 className="text-3xl font-semibold tracking-tight">Monthly Unit Economics</h1><p className="text-muted-foreground">Validate whether the $5.00 fee per verified load covers platform and provider costs.</p></div><div className="flex gap-2"><Input aria-label="Reporting month" type="month" value={month} onChange={e=>{setMonth(e.target.value);setDraft(null);}}/><Button variant="outline" onClick={handleDownload} disabled={isDownloading}><Download className="mr-2 h-4 w-4"/>{isDownloading ? "Downloading…" : "Download"}</Button></div></div>
    {report.isLoading && <p>Loading monthly economics…</p>}
    {reportError && <Card className="border-destructive" role="alert"><CardHeader><CardTitle>Unable to load unit economics</CardTitle><CardDescription>{reportError}</CardDescription></CardHeader></Card>}
    {downloadError && <p className="text-sm text-destructive" role="alert">{downloadError}</p>}
    {shouldShowUnitEconomicsFoundationWarning(data, report.isSuccess) && <Card className="border-amber-500"><CardHeader><CardTitle>Migration 0043 is not applied</CardTitle><CardDescription>The dashboard code is ready, but its empty data foundation must be applied through the controlled migration process before values can be stored. No migration was run by this change.</CardDescription></CardHeader></Card>}
    {metrics && <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
      ["Validated loads", String(metrics.validatedLoads)], ["Gross revenue", money(metrics.grossRevenueCents)], ["Total monthly costs", money(metrics.fixedCostsCents + metrics.variableCostsCents)], ["Contribution profit", money(metrics.contributionProfitCents)]
    ].map(([label,value])=><Card key={label}><CardHeader className="pb-2"><CardDescription>{label}</CardDescription><CardTitle className="text-2xl">{value}</CardTitle></CardHeader></Card>)}</div>
    <Card className={metrics.isFiveDollarFeeProfitable ? "border-emerald-500" : "border-amber-500"}><CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5"/>$5.00 fee assessment</CardTitle><CardDescription>{metrics.isFiveDollarFeeProfitable ? "Profitable for this month using the recorded assumptions." : "Not yet profitable for this month using the recorded assumptions."} Break-even: {metrics.breakEvenLoads ?? "unavailable"} validated loads. Profit per current validated load: {money(metrics.profitPerValidatedLoadCents)}.</CardDescription></CardHeader></Card></>}
    {data?.foundationReady && <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>Revenue and evidence assumptions</CardTitle><CardDescription>Record the actual payment terms and confirm where photographic evidence is stored.</CardDescription></CardHeader><CardContent className="grid gap-4">
      <Field label="Fee per validated load ($)"><Input type="number" step="0.01" value={assumptions.feePerValidatedLoadCents/100} onChange={e=>setDraft({...assumptions,feePerValidatedLoadCents:Math.round(Number(e.target.value)*100)})}/></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Processing percent"><Input type="number" step="0.01" value={assumptions.paymentProcessingPercent} onChange={e=>setDraft({...assumptions,paymentProcessingPercent:Number(e.target.value)})}/></Field><Field label="Fixed processing fee ($)"><Input type="number" step="0.01" value={assumptions.paymentProcessingFixedCents/100} onChange={e=>setDraft({...assumptions,paymentProcessingFixedCents:Math.round(Number(e.target.value)*100)})}/></Field></div>
      <Field label="Evidence storage provider"><Input value={assumptions.evidenceStorageProvider} onChange={e=>setDraft({...assumptions,evidenceStorageProvider:e.target.value})} placeholder="Railway, S3, Google Cloud Storage…"/></Field>
      <Field label="Evidence storage notes"><Input value={assumptions.evidenceStorageNotes} onChange={e=>setDraft({...assumptions,evidenceStorageNotes:e.target.value})} placeholder="Bucket/account and invoice location; do not enter secrets"/></Field>
      <Button onClick={()=>saveAssumptions.mutate()} disabled={saveAssumptions.isPending}>Save assumptions</Button>
    </CardContent></Card><Card><CardHeader><CardTitle>Add monthly provider cost</CardTitle><CardDescription>Include Railway, Vercel, Neon, Squarespace email/domain/DNS, evidence storage, and other invoices.</CardDescription></CardHeader><CardContent className="grid gap-4">
      <div className="grid grid-cols-2 gap-3"><Field label="Provider"><Input value={cost.provider} onChange={e=>setCost({...cost,provider:e.target.value})}/></Field><Field label="Monthly cost ($)"><Input type="number" step="0.01" value={cost.dollars} onChange={e=>setCost({...cost,dollars:e.target.value})}/></Field></div>
      <Field label="Category"><Select value={cost.category} onValueChange={category=>setCost({...cost,category})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["hosting","database","email","domain_dns","evidence_storage","payments","other"].map(v=><SelectItem key={v} value={v}>{v.replaceAll("_"," ")}</SelectItem>)}</SelectContent></Select></Field>
      <Field label="Notes"><Input value={cost.notes} onChange={e=>setCost({...cost,notes:e.target.value})}/></Field><Field label="Invoice or source URL"><Input value={cost.sourceUrl} onChange={e=>setCost({...cost,sourceUrl:e.target.value})}/></Field>
      <Button onClick={()=>addCost.mutate()} disabled={!cost.provider || !cost.dollars || addCost.isPending}><Plus className="mr-2 h-4 w-4"/>Add cost</Button>
    </CardContent></Card></div>}
    {data?.foundationReady && <Card><CardHeader><CardTitle>Recorded provider costs</CardTitle></CardHeader><CardContent>{data.costs.length===0?<p className="text-muted-foreground">No provider invoices have been recorded for this month.</p>:<div className="divide-y">{data.costs.map((entry:any)=><div key={entry.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center"><div><p className="font-medium">{entry.provider}</p><p className="text-xs text-muted-foreground">{entry.category.replaceAll("_"," ")}</p></div><div className="text-sm text-muted-foreground">{entry.notes || "No notes"}</div><div className="font-semibold">{money(entry.amountCents)}</div><Button size="icon" variant="ghost" aria-label={`Delete ${entry.provider} cost`} onClick={()=>removeCost.mutate(entry.id)}><Trash2 className="h-4 w-4"/></Button></div>)}</div>}</CardContent></Card>}
    <MobileNav role={user?.role} />
  </div>;
}

function Field({label,children}:{label:string;children:ReactNode}) { return <div className="grid gap-2"><Label>{label}</Label>{children}</div>; }
