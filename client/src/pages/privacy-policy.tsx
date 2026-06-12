import { Link } from "wouter";
import logoPath from "@assets/cretexchange-logo-transparent.png";
import { LanguageToggle } from "@/components/LanguageToggle";
import { LegalDocumentViewer, PRIVACY_DOCUMENT_ID } from "@/components/LegalDocumentViewer";
import { useLanguage } from "@/lib/i18n";

export default function PrivacyPolicy() {
  const { language, t } = useLanguage();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <img src={logoPath} alt="CreteXchange Logo" className="h-12 w-12" />
              <span className="text-xl font-bold">
                Crete<span className="text-orange-500">X</span>change
              </span>
            </Link>
            <div className="flex items-center gap-3">
              <LanguageToggle />
              <Link href="/login">
                <button className="px-4 py-2 text-sm font-medium text-primary hover:text-primary/80">
                  {t("header.signIn")}
                </button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <LegalDocumentViewer documentIds={[PRIVACY_DOCUMENT_ID]} language={language} />
      </main>

      <footer className="border-t border-border bg-card mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-sm text-muted-foreground">
            <p>&copy; 2025 V8 Industries LLC. All rights reserved.</p>
            <div className="mt-2 space-x-4">
              <Link href="/privacy-policy" className="hover:text-primary">
                {t("legal.privacyPolicy")}
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
