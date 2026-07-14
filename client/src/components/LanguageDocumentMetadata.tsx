import { useEffect } from "react";
import { type AppLanguage, useLanguage } from "@/lib/i18n";

export function synchronizeDocumentLanguage(
  language: AppLanguage,
  documentElement: Pick<HTMLElement, "lang"> = document.documentElement,
) {
  documentElement.lang = language;
}

/** Keeps document metadata aligned with the shared, persisted language preference. */
export function LanguageDocumentMetadata() {
  const { language } = useLanguage();

  useEffect(() => {
    synchronizeDocumentLanguage(language);
  }, [language]);

  return null;
}
