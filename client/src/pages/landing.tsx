import { Link } from "wouter";
import {
  Building2,
  CheckCircle2,
  MapPin,
  Network,
  Route,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageDocumentMetadata } from "@/components/LanguageDocumentMetadata";
import { LanguageToggle } from "@/components/LanguageToggle";
import { PublicHeader } from "@/components/PublicHeader";
import { useLanguage } from "@/lib/i18n";
import { PUBLIC_LANDING_ROUTES } from "@/lib/publicLanding";

const VALUE_CONCEPTS = [
  { key: "public.value.driver", icon: Route },
  { key: "public.value.facility", icon: Building2 },
  { key: "public.value.verification", icon: CheckCircle2 },
] as const;

export default function Landing() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <LanguageDocumentMetadata />
      <PublicHeader />

      <main>
        <section className="gradient-bg border-b border-slate-800 text-slate-100">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] lg:items-center lg:gap-12 lg:py-24">
            <div className="min-w-0">
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

            <div className="relative mx-auto w-full max-w-lg" aria-label={t("public.hero.visualLabel")}>
              <div className="overflow-hidden rounded-3xl border border-white/15 bg-slate-900/45 p-5 shadow-2xl shadow-slate-950/30 backdrop-blur sm:p-7">
                <div aria-hidden="true" className="relative min-h-56 overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.28),_transparent_42%),linear-gradient(145deg,_rgba(15,23,42,0.86),_rgba(19,78,74,0.72))] sm:min-h-72">
                  <div className="absolute inset-x-7 top-8 flex items-center justify-between text-sky-200/90">
                    <Building2 className="h-10 w-10" />
                    <Network className="h-8 w-8" />
                    <Truck className="h-10 w-10" />
                  </div>
                  <div className="absolute inset-x-10 top-[42%] border-t border-dashed border-sky-300/50" />
                  <div className="absolute left-[22%] top-[39%] h-3 w-3 rounded-full bg-sky-300 shadow-[0_0_0_6px_rgba(125,211,252,0.16)]" />
                  <div className="absolute right-[22%] top-[39%] h-3 w-3 rounded-full bg-teal-300 shadow-[0_0_0_6px_rgba(94,234,212,0.16)]" />
                  <div className="absolute inset-x-7 bottom-7 flex items-center justify-between text-xs font-medium text-slate-200">
                    <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-sky-300" /> {t("public.hero.participatingLocation")}</span>
                    <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-teal-300" /> {t("public.hero.verifiedActivity")}</span>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-300">{t("public.hero.visualLabel")}</p>
              </div>
            </div>
          </div>
        </section>

        <section id="value-proposition" className="scroll-mt-4 border-b border-border bg-card px-4 py-12 sm:px-6 sm:py-16" aria-labelledby="value-proposition-heading">
          <div className="mx-auto max-w-6xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("public.value.eyebrow")}</p>
            <h2 id="value-proposition-heading" className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              {t("public.value.heading")}
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
              {t("public.value.supporting")}
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {VALUE_CONCEPTS.map(({ key, icon: Icon }) => (
                <Card key={key} className="border-border/80 bg-background shadow-sm">
                  <CardContent className="flex min-h-32 flex-col justify-center p-5">
                    <Icon aria-hidden="true" className="mb-4 h-6 w-6 text-primary" />
                    <h3 className="text-lg font-semibold">{t(key)}</h3>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 bg-slate-950 px-4 py-7 text-slate-300 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>{t("public.footer.copyright", { year: new Date().getFullYear() })}</p>
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
