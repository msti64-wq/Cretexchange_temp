import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/LanguageToggle";
import { BrandHeaderLogo } from "@/components/BrandHeaderLogo";
import { useLanguage } from "@/lib/i18n";
import { PUBLIC_LANDING_ROUTES } from "@/lib/publicLanding";

export function PublicHeader() {
  const { t } = useLanguage();

  return (
    <header className="border-b border-slate-800 bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href={PUBLIC_LANDING_ROUTES.home} className="flex min-w-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950">
          <BrandHeaderLogo alt="CreteXchange — Verified Material Recovery Network" size="compact" />
        </Link>

        <nav aria-label="Public navigation" className="flex w-full flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3 sm:w-auto sm:border-t-0 sm:pt-0">
          <a href={PUBLIC_LANDING_ROUTES.howItWorksAnchor} className="rounded-md px-2 py-2 text-sm text-slate-200 underline-offset-4 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
            {t("public.header.howItWorks")}
          </a>
          <LanguageToggle labelMode="full" className="h-10 shrink-0" />
          <Button asChild variant="outline" size="sm" className="h-10 shrink-0 border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white">
            <Link href={PUBLIC_LANDING_ROUTES.login}>{t("public.header.login")}</Link>
          </Button>
          <Button asChild size="sm" className="h-10 shrink-0 bg-sky-500 text-slate-950 hover:bg-sky-400">
            <Link href={PUBLIC_LANDING_ROUTES.register}>{t("public.header.register")}</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
