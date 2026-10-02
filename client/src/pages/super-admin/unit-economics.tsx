import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Trash2, TrendingUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MobileNav } from "@/components/MobileNav";
import {
  downloadUnitEconomicsCsv,
  fetchUnitEconomicsCsv,
  fetchUnitEconomicsReport,
  shouldShowUnitEconomicsFoundationWarning,
  unitEconomicsAccessErrorMessage,
  unitEconomicsReportQueryKey,
  type UnitEconomicsProviderEntry,
  type UnitEconomicsReport,
} from "@/lib/unitEconomicsClient";
import type { UnitEconomicsScenarioOverrides } from "../../../../shared/unitEconomics";

const currentMonth = new Date().toISOString().slice(0, 7);
const money = (cents: number | null | undefined) => cents == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default function UnitEconomicsPage() {
  const { user } = useAuth(); const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth);
  const [cost, setCost] = useState({ provider: "", category: "hosting", dollars: "", notes: "", sourceUrl: "" });
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [scenarioOverrides, setScenarioOverrides] = useState<UnitEconomicsScenarioOverrides>({});
  useEffect(() => {
    const saved = localStorage.getItem(`unit-economics-scenarios:${month}`);
    setScenarioOverrides(saved ? JSON.parse(saved) as UnitEconomicsScenarioOverrides : {});
  }, [month]);
  const queryKey = unitEconomicsReportQueryKey(month, scenarioOverrides);
  const report = useQuery<UnitEconomicsReport>({
    queryKey,
    queryFn: () => fetchUnitEconomicsReport(month, scenarioOverrides),
    staleTime: 0,
  });
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
      const { blob, filename } = await fetchUnitEconomicsCsv(month, scenarioOverrides);
      downloadUnitEconomicsCsv(blob, filename);
    } catch (error) {
      setDownloadError(unitEconomicsAccessErrorMessage(error) || "Unable to download the unit-economics CSV.");
    } finally {
      setIsDownloading(false);
    }
  };
  if (user?.role !== "super_admin") return <div className="p-8"><h1 className="text-2xl font-semibold">Superadmin access required</h1></div>;
  const metrics = data?.metrics;
  const updateUsageInput = (provider: string, componentId: string, scenario: "low" | "expected" | "high", value: string) => {
    const current = scenarioOverrides[provider]?.usageInputs?.[componentId] || {};
    const next = {
      ...scenarioOverrides,
      [provider]: {
        ...scenarioOverrides[provider],
        usageInputs: {
          ...scenarioOverrides[provider]?.usageInputs,
          [componentId]: { ...current, [scenario]: value === "" ? 0 : Number(value) },
        },
      },
    };
    localStorage.setItem(`unit-economics-scenarios:${month}`, JSON.stringify(next));
    setScenarioOverrides(next);
  };
  const updateComponentRate = (provider: string, componentId: string, value: string) => {
    const next = {
      ...scenarioOverrides,
      [provider]: {
        ...scenarioOverrides[provider],
        unitRatesCentsPerUnit: {
          ...scenarioOverrides[provider]?.unitRatesCentsPerUnit,
          [componentId]: value === "" ? 0 : Number(value),
        },
      },
    };
    localStorage.setItem(`unit-economics-scenarios:${month}`, JSON.stringify(next));
    setScenarioOverrides(next);
  };
  const updatePercentageRate = (provider: string, componentId: string, value: string) => {
    const next = {
      ...scenarioOverrides,
      [provider]: {
        ...scenarioOverrides[provider],
        percentageRates: {
          ...scenarioOverrides[provider]?.percentageRates,
          [componentId]: value === "" ? 0 : Number(value),
        },
      },
    };
    localStorage.setItem(`unit-economics-scenarios:${month}`, JSON.stringify(next));
    setScenarioOverrides(next);
  };
  const updateUsageAssumption = (provider: string, value: string) => {
    const next = { ...scenarioOverrides, [provider]: { ...scenarioOverrides[provider], launchUsageAssumptions: value } };
    localStorage.setItem(`unit-economics-scenarios:${month}`, JSON.stringify(next));
    setScenarioOverrides(next);
  };
  const clearScenario = (provider: string) => {
    const next = { ...scenarioOverrides };
    delete next[provider];
    localStorage.setItem(`unit-economics-scenarios:${month}`, JSON.stringify(next));
    setScenarioOverrides(next);
  };
  const reportError = report.isError
    ? unitEconomicsAccessErrorMessage(report.error) || "Unable to load unit economics."
    : null;
  return <div className="mx-auto min-h-screen max-w-7xl space-y-6 p-4 pb-28 md:p-8 md:pb-28" data-testid="unit-economics-dashboard">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-primary">Superadmin</p><h1 className="text-3xl font-semibold tracking-tight">Monthly Unit Economics</h1><p className="text-muted-foreground">Validate whether the $5.00 fee per verified load covers platform and provider costs.</p></div><div className="flex gap-2"><Input aria-label="Reporting month" type="month" value={month} onChange={e=>{setMonth(e.target.value);setDraft(null);}}/><Button variant="outline" onClick={handleDownload} disabled={isDownloading}><Download className="mr-2 h-4 w-4"/>{isDownloading ? "Downloading…" : "Download"}</Button></div></div>
    {report.isLoading && <p>Loading monthly economics…</p>}
    {reportError && <Card className="border-destructive" role="alert"><CardHeader><CardTitle>Unable to load unit economics</CardTitle><CardDescription>{reportError}</CardDescription></CardHeader></Card>}
    {downloadError && <p className="text-sm text-destructive" role="alert">{downloadError}</p>}
    {shouldShowUnitEconomicsFoundationWarning(data, report.isSuccess) && <Card className="border-amber-500"><CardHeader><CardTitle>Migration 0043 is not applied</CardTitle><CardDescription>The dashboard code is ready, but its empty data foundation must be applied through the controlled migration process before values can be stored. No migration was run by this change.</CardDescription></CardHeader></Card>}
    {metrics && <>{data?.profitabilityComplete === false && <Card className="border-amber-500" role="alert"><CardHeader><CardTitle>Planning total requires confirmation</CardTitle><CardDescription>{data.missingProviderCount} provider{data.missingProviderCount === 1 ? " requires" : "s require"} confirmation: {data.missingProviders?.join(", ")}. The low/expected/high totals include transparent editable quote proxies and conditional plan assumptions for comparison; they are not confirmed invoices. Break-even is preliminary until those assumptions are reconciled.</CardDescription></CardHeader></Card>}<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
      ["Validated loads", String(metrics.validatedLoads)], ["Gross revenue", money(metrics.grossRevenueCents)], ["Modeled monthly costs", money(metrics.fixedCostsCents + metrics.variableCostsCents)], ["Contribution (modeled costs)", money(metrics.contributionProfitCents)]
    ].map(([label,value])=><Card key={label}><CardHeader className="pb-2"><CardDescription>{label}</CardDescription><CardTitle className="text-2xl">{value}</CardTitle></CardHeader></Card>)}</div>
    <Card className={data?.profitabilityComplete && metrics.isFiveDollarFeeProfitable ? "border-emerald-500" : "border-amber-500"}><CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5"/>$5.00 fee assessment</CardTitle><CardDescription>{data?.profitabilityComplete ? (metrics.isFiveDollarFeeProfitable ? "Preliminary result: profitable using current estimates and recorded costs." : "Preliminary result: not profitable using current estimates and recorded costs.") : "Preliminary result includes planning assumptions and quote proxies for unconfirmed vendors. It is incomplete and may overstate or understate actual costs."} Break-even: {metrics.breakEvenLoads ?? "unavailable"} validated loads at the current $5 fee. Profit per current validated load: {money(metrics.profitPerValidatedLoadCents)}. This is an analysis assumption only; it does not configure billing.</CardDescription></CardHeader></Card>
    {data?.scenarioMonthlyCostsCents && <Card><CardHeader><CardTitle>Production-plan monthly scenario range</CardTitle><CardDescription>Totals are calculated from the displayed unit rates and low/expected/high numeric usage inputs. Explicit unconfirmed quote proxies and conditional production options are included and remain labeled; costs are not confirmed invoices. Stripe processing is variable and appears once in these volume scenarios, not in fixed operating costs.</CardDescription></CardHeader><CardContent className="grid grid-cols-3 gap-4"><div><p className="text-sm text-muted-foreground">Low</p><p className="text-lg font-semibold">{money(data.scenarioMonthlyCostsCents.low)}</p></div><div><p className="text-sm text-muted-foreground">Expected</p><p className="text-lg font-semibold">{money(data.scenarioMonthlyCostsCents.expected)}</p></div><div><p className="text-sm text-muted-foreground">High</p><p className="text-lg font-semibold">{money(data.scenarioMonthlyCostsCents.high)}</p></div></CardContent></Card>}</>}
    {data?.foundationReady && <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>Revenue and evidence assumptions</CardTitle><CardDescription>Record the actual payment terms and confirm where photographic evidence is stored.</CardDescription></CardHeader><CardContent className="grid gap-4">
      <Field label="Fee per validated load ($, analysis assumption)"><Input type="number" step="0.01" value={assumptions.feePerValidatedLoadCents/100} onChange={e=>setDraft({...assumptions,feePerValidatedLoadCents:Math.round(Number(e.target.value)*100)})}/></Field>
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
    {data?.foundationReady && <Card><CardHeader><CardTitle>Third-party vendor operating-cost register</CardTitle><CardDescription>Public plan prices and the production scenarios are separate from CreteXchange customer revenue. Unknown account quotes are unpriced, not $0. Actual monthly entries override that provider’s estimate and range. Scenario estimates are browser-local by reporting month and are included in CSV exports.</CardDescription></CardHeader><CardContent>{data.costs.length===0?<p className="text-muted-foreground">No providers are configured.</p>:<div className="divide-y">{data.costs.map((entry:UnitEconomicsProviderEntry)=><div key={entry.id || entry.provider} className="space-y-3 py-5">
      <div className="flex flex-col justify-between gap-2 md:flex-row"><div><p className="font-semibold">{entry.provider}</p><p className="text-xs text-muted-foreground">{entry.category.replaceAll("_"," ")} · {entry.evidenceStatus.replaceAll("_"," ")} · researched {entry.researchDate}{entry.separatelyCalculated ? " · calculated separately" : ""}{entry.isRecorded ? " · recorded month override" : ""}</p></div><div className="text-sm font-medium">{entry.amountCents == null ? "Quote/usage required" : money(entry.amountCents)}{!entry.isRecorded && entry.status === "estimated" && <span className="ml-1 text-xs text-amber-700">Estimated</span>}</div></div>
      <div className="grid gap-3 text-sm md:grid-cols-2"><Detail label="Current plan / evidence" value={entry.currentPlan}/><Detail label="Production plan/agreement" value={entry.productionPlan}/><Detail label="Fixed commitment" value={entry.fixedCommitment}/><Detail label="Included usage / credits" value={entry.includedUsage}/><Detail label="Metered / overage rates" value={entry.meteredRates}/><Detail label="Formula" value={entry.formula}/><Detail label="Evidence" value={entry.notes}/></div>
      <Field label="Monthly scenario notes (optional)"><Textarea aria-label={`${entry.provider} usage notes`} maxLength={500} value={scenarioOverrides[entry.provider]?.launchUsageAssumptions ?? entry.launchUsageAssumptions} disabled={entry.isRecorded} onChange={event=>updateUsageAssumption(entry.provider,event.target.value)}/></Field>
      <div className="grid gap-2 rounded-md bg-muted/30 p-3 text-sm sm:grid-cols-3"><ScenarioResult label="Low calculated monthly cost" value={entry.lowMonthlyCostCents}/><ScenarioResult label="Expected calculated monthly cost" value={entry.expectedMonthlyCostCents}/><ScenarioResult label="High calculated monthly cost" value={entry.highMonthlyCostCents}/></div>
      <div className="space-y-3 rounded-md border p-3"><p className="text-sm font-medium">Formula-based monthly usage inputs and rates</p>{entry.usageComponents.map(component=><div key={component.id} className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_repeat(3,minmax(8rem,0.7fr))] sm:items-end">
        <div className="grid gap-2"><Detail label={`${component.label} (${component.unit})`} value={component.isDerived ? `Calculated from ${component.quantityInput} × ${component.percentageBasisInput} at ${component.percentageRate}%` : `Included allowance: ${component.includedUnits ?? 0} ${component.unit}${component.percentageBasisInput ? `; percent basis: ${component.percentageBasisInput}` : ""}`}/>{!component.isDerived && <Field label="Rate (¢ per unit)"><Input type="number" min="0" step="any" aria-label={`${entry.provider} ${component.label} rate`} value={component.unitRateCents} disabled={entry.isRecorded} onChange={event=>updateComponentRate(entry.provider,component.id,event.target.value)}/></Field>}{!component.isDerived && component.percentageRate != null && <Field label="Percent rate"><Input type="number" min="0" max="100" step="any" aria-label={`${entry.provider} ${component.label} percent rate`} value={component.percentageRate} disabled={entry.isRecorded} onChange={event=>updatePercentageRate(entry.provider,component.id,event.target.value)}/></Field>}</div>
        {component.isDerived ? <span className="text-xs text-muted-foreground sm:col-span-3">Derived from the usage inputs above.</span> : (["low","expected","high"] as const).map(scenario=><Field key={`${component.id}-${scenario}`} label={`${scenario} use`}><Input type="number" min="0" step="any" aria-label={`${entry.provider} ${component.label} ${scenario}`} value={scenarioOverrides[entry.provider]?.usageInputs?.[component.id]?.[scenario] ?? entry.defaultUsageInputs[component.id]?.[scenario] ?? 0} disabled={entry.isRecorded} onChange={event=>updateUsageInput(entry.provider,component.id,scenario,event.target.value)}/></Field>)}
      </div>)}</div>
      <div className="flex flex-wrap items-center gap-3 text-xs"><span>{entry.includedInCalculation ? "Included in scenario totals" : "Excluded until active use or price is confirmed"}</span>{entry.evidenceStatus === "account_quote_required" && <span className="font-medium text-amber-700">Planning proxy only — confirm vendor quote</span>}{entry.sourceUrl && <a className="text-primary underline" href={entry.sourceUrl} target="_blank" rel="noreferrer">Official source</a>}<span className="text-muted-foreground">{entry.billingCadence.replaceAll("_"," ")} · {entry.costModel}</span>{scenarioOverrides[entry.provider] && <Button type="button" size="sm" variant="ghost" onClick={()=>clearScenario(entry.provider)}>Reset scenario</Button>}{entry.id && <Button type="button" size="sm" variant="ghost" aria-label={`Delete ${entry.provider} cost`} onClick={()=>{if(entry.id) removeCost.mutate(entry.id);}}><Trash2 className="mr-1 h-4 w-4"/>Remove recorded entry</Button>}</div>
    </div>)}</div>}</CardContent></Card>}
    <MobileNav role={user?.role} />
  </div>;
}

function Field({label,children}:{label:string;children:ReactNode}) { return <div className="grid gap-2"><Label>{label}</Label>{children}</div>; }
function Detail({label,value}:{label:string;value:string}) { return <div><p className="text-xs font-medium text-muted-foreground">{label}</p><p>{value}</p></div>; }
function ScenarioResult({label,value}:{label:string;value:number|null}) { return <div><p className="text-muted-foreground">{label}</p><p className="font-semibold">{value == null ? "Unpriced" : money(value)}</p></div>; }
