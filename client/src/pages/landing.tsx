import { Link } from "wouter";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  ListChecks,
  MapPin,
  Route,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageDocumentMetadata } from "@/components/LanguageDocumentMetadata";
import { LanguageToggle } from "@/components/LanguageToggle";
import { PublicHeader } from "@/components/PublicHeader";
import { CRETEXCHANGE_BRAND } from "@/components/BrandHeaderLogo";
import { useLanguage } from "@/lib/i18n";
import { PUBLIC_LANDING_ROUTES } from "@/lib/publicLanding";
import { COMPANY_IDENTITY } from "@shared/companyIdentity";

const VALUE_CARDS = [
  {
    title: "public.value.driver",
    supporting: "public.value.driverSupporting",
    benefits: ["public.value.driverBenefit1", "public.value.driverBenefit2", "public.value.driverBenefit3", "public.value.driverBenefit4"],
    cta: "public.value.driverCta",
    route: PUBLIC_LANDING_ROUTES.driverRegistration,
    icon: Route,
  },
  {
    title: "public.value.facility",
    supporting: "public.value.facilitySupporting",
    benefits: ["public.value.facilityBenefit1", "public.value.facilityBenefit2", "public.value.facilityBenefit3", "public.value.facilityBenefit4"],
    cta: "public.value.facilityCta",
    route: PUBLIC_LANDING_ROUTES.facilityRegistration,
    icon: Building2,
  },
  {
    title: "public.value.verification",
    supporting: "public.value.verificationSupporting",
    benefits: ["public.value.verificationBenefit1", "public.value.verificationBenefit2", "public.value.verificationBenefit3", "public.value.verificationBenefit4"],
    cta: "public.value.verificationCta",
    route: PUBLIC_LANDING_ROUTES.howItWorksAnchor,
    icon: ShieldCheck,
  },
] as const;

const TRUST_CONCEPTS = [
  { key: "public.trust.verified", icon: CheckCircle2 },
  { key: "public.trust.facilities", icon: Building2 },
  { key: "public.trust.professionals", icon: Truck },
  { key: "public.trust.visibility", icon: Eye },
] as const;

const HOW_IT_WORKS_STEPS = [
  { title: "public.how.step1Title", supporting: "public.how.step1Supporting", icon: ListChecks },
  { title: "public.how.step2Title", supporting: "public.how.step2Supporting", icon: ClipboardCheck },
  { title: "public.how.step3Title", supporting: "public.how.step3Supporting", icon: CheckCircle2 },
  { title: "public.how.step4Title", supporting: "public.how.step4Supporting", icon: Route },
] as const;

const DRIVER_BENEFITS = [
  "public.driver.benefit1",
  "public.driver.benefit2",
  "public.driver.benefit3",
  "public.driver.benefit4",
] as const;

const FACILITY_BENEFITS = [
  "public.facility.benefit1",
  "public.facility.benefit2",
  "public.facility.benefit3",
  "public.facility.benefitVerification",
  "public.facility.benefit4",
  "public.facility.benefit5",
] as const;

export default function Landing() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <LanguageDocumentMetadata />
      <PublicHeader />

      <main>
        <section className="gradient-bg border-b border-slate-800 text-slate-100">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
            <div className="mx-auto w-full max-w-5xl">
              <img
                src={CRETEXCHANGE_BRAND.primaryHero}
                alt="CreteXchange — Building Tomorrow. Nothing Wasted."
                width={985}
                height={407}
                className="h-auto w-full object-contain"
                data-testid="landing-primary-hero-logo"
              />
            </div>
            <div className="mx-auto mt-8 max-w-3xl text-center sm:mt-12">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
                {t("public.hero.eyebrow")}
              </p>
              <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
                {t("public.hero.headline")}
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg sm:leading-8">
                {t("public.hero.supporting")}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button asChild size="lg" className="min-h-12 bg-sky-500 text-slate-950 hover:bg-sky-400 motion-reduce:transition-none">
                  <Link href={PUBLIC_LANDING_ROUTES.driverRegistration}>{t("public.hero.driverCta")}</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="min-h-12 border-slate-500 bg-slate-900/40 text-white hover:bg-slate-800 hover:text-white motion-reduce:transition-none">
                  <Link href={PUBLIC_LANDING_ROUTES.facilityRegistration}>{t("public.hero.facilityCta")}</Link>
                </Button>
                <Button asChild size="lg" variant="ghost" className="min-h-12 text-slate-100 hover:bg-white/10 hover:text-white motion-reduce:transition-none">
                  <a href={PUBLIC_LANDING_ROUTES.valuePropositionAnchor}>{t("public.hero.learnMore")}</a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section id="value-proposition" className="scroll-mt-4 border-b border-border bg-card px-4 py-12 sm:px-6 sm:py-16" aria-labelledby="value-proposition-heading">
          <div className="mx-auto max-w-6xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("public.value.eyebrow")}</p>
            <h2 id="value-proposition-heading" className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">{t("public.value.heading")}</h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">{t("public.value.supporting")}</p>
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {VALUE_CARDS.map(({ title, supporting, benefits, cta, route, icon: Icon }) => (
                <Card key={title} className="flex border-border/80 bg-background shadow-sm">
                  <CardContent className="flex flex-1 flex-col p-6">
                    <Icon aria-hidden="true" className="mb-5 h-7 w-7 text-primary" />
                    <h3 className="text-xl font-semibold">{t(title)}</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{t(supporting)}</p>
                    <ul className="mt-5 space-y-2.5 text-sm text-foreground">
                      {benefits.map((benefit) => <li key={benefit} className="flex gap-2"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{t(benefit)}</li>)}
                    </ul>
                    <Button asChild variant="link" className="mt-auto h-auto justify-start px-0 pt-6 text-primary hover:text-primary/80"><Link href={route}>{t(cta)}<ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" /></Link></Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-slate-800 bg-slate-950 px-4 py-7 text-slate-100 sm:px-6" aria-label={t("public.trust.verified")}>
          <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST_CONCEPTS.map(({ key, icon: Icon }) => <div key={key} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"><Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-sky-300" /><span className="text-sm font-medium">{t(key)}</span></div>)}
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-4 border-b border-border bg-background px-4 py-12 sm:px-6 sm:py-16" aria-labelledby="how-it-works-heading">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("public.how.eyebrow")}</p><h2 id="how-it-works-heading" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{t("public.how.heading")}</h2><p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">{t("public.how.supporting")}</p></div>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {HOW_IT_WORKS_STEPS.map(({ title, supporting, icon: Icon }, index) => <li key={title} className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex items-center justify-between"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{index + 1}</span><Icon aria-hidden="true" className="h-5 w-5 text-primary" /></div><h3 className="mt-5 text-lg font-semibold">{t(title)}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{t(supporting)}</p></li>)}
            </ol>
          </div>
        </section>

        <section className="border-b border-border bg-card px-4 py-12 sm:px-6 sm:py-16" aria-labelledby="drivers-heading">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
            <div aria-hidden="true" className="order-2 flex min-h-48 items-center justify-center rounded-3xl border border-sky-200 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.2),_transparent_58%),linear-gradient(145deg,_rgba(15,23,42,1),_rgba(12,74,110,0.9))] p-8 lg:order-1"><div className="flex items-center gap-4 text-sky-200"><Route className="h-12 w-12" /><div className="h-px w-20 border-t border-dashed border-sky-300/70" /><Truck className="h-14 w-14" /></div></div>
            <div className="order-1 lg:order-2"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("public.driver.eyebrow")}</p><h2 id="drivers-heading" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{t("public.driver.heading")}</h2><p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{t("public.driver.supporting")}</p><ul className="mt-6 grid gap-3 sm:grid-cols-2">{DRIVER_BENEFITS.map((benefit) => <li key={benefit} className="flex gap-2 text-sm"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{t(benefit)}</li>)}</ul><Button asChild size="lg" className="mt-8 min-h-12"><Link href={PUBLIC_LANDING_ROUTES.driverRegistration}>{t("public.driver.cta")}</Link></Button></div>
          </div>
        </section>

        <section className="border-b border-border bg-background px-4 py-12 sm:px-6 sm:py-16" aria-labelledby="facilities-heading">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16">
            <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("public.facility.eyebrow")}</p><h2 id="facilities-heading" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{t("public.facility.heading")}</h2><p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{t("public.facility.supporting")}</p><ul className="mt-6 grid gap-3 sm:grid-cols-2">{FACILITY_BENEFITS.map((benefit) => <li key={benefit} className="flex gap-2 text-sm"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{t(benefit)}</li>)}</ul><Button asChild size="lg" className="mt-8 min-h-12"><Link href={PUBLIC_LANDING_ROUTES.facilityRegistration}>{t("public.facility.cta")}</Link></Button></div>
            <div aria-hidden="true" className="flex min-h-48 items-center justify-center rounded-3xl border border-teal-200 bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.22),_transparent_58%),linear-gradient(145deg,_rgba(15,23,42,1),_rgba(19,78,74,0.9))] p-8"><div className="flex items-center gap-4 text-teal-200"><Building2 className="h-14 w-14" /><div className="h-px w-20 border-t border-dashed border-teal-300/70" /><ClipboardCheck className="h-12 w-12" /></div></div>
          </div>
        </section>
      </main>
      <footer className="border-t border-slate-800 bg-slate-950 px-4 py-7 text-slate-300 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>{t("public.footer.copyright", { year: new Date().getFullYear(), company: COMPANY_IDENTITY.publicIdentity })}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href={PUBLIC_LANDING_ROUTES.privacy} className="rounded-md underline underline-offset-4 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
              {t("public.footer.privacy")}
            </Link>
            <Link href={PUBLIC_LANDING_ROUTES.login} className="rounded-md underline underline-offset-4 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
              {t("public.header.login")}
            </Link>
            <LanguageToggle labelMode="full" />
          </div>
        </div>
      </footer>
    </div>
  );
}
