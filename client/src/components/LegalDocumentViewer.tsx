import {
  LEGAL_DOCUMENT_IDS,
  type LegalDocumentId,
  type LegalLanguage,
  getRequiredLegalDocumentsForRole,
  resolveLegalDocument,
} from "@shared/legalDocuments";

interface LegalDocumentViewerProps {
  role?: "driver" | "owner";
  documentIds?: LegalDocumentId[];
  language: LegalLanguage;
  showAcceptanceSection?: boolean;
}

export function LegalDocumentViewer({
  role,
  documentIds,
  language,
  showAcceptanceSection = false,
}: LegalDocumentViewerProps) {
  const resolvedDocuments = documentIds?.length
    ? documentIds.map((documentId) => resolveLegalDocument(documentId, language))
    : getRequiredLegalDocumentsForRole(role, language);

  return (
    <div className="space-y-6">
      {resolvedDocuments.map(({ document, fallbackToEnglish, fallbackNotice }) => (
        <article
          key={document.storageKey}
          className="space-y-4 border rounded-lg p-4 bg-background"
          data-testid={`legal-document-${document.storageKey}`}
        >
          {fallbackToEnglish && fallbackNotice && (
            <div
              className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
              data-testid="legal-document-fallback-notice"
            >
              {fallbackNotice}
            </div>
          )}

          <div className="text-center">
            <h3 className="font-bold text-lg mb-1">{document.title}</h3>
            <p className="font-semibold">{document.subtitle}</p>
            <p className="font-medium text-muted-foreground">
              Version: {document.version}
            </p>
            <p className="font-medium text-muted-foreground">
              Effective Date: {new Date(document.effectiveAt).toLocaleDateString(
                language === "es" ? "es-US" : "en-US",
              )}
            </p>
          </div>

          <p className="text-center text-sm">{document.intro}</p>

          <div className="space-y-4">
            {document.sections.map((section) => (
              <section key={section.heading} className="space-y-2">
                <h4 className="font-semibold">{section.heading}</h4>
                <div className="space-y-2 text-xs leading-relaxed">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {section.bullets?.length ? (
                    <ul className="list-disc pl-5 space-y-1">
                      {section.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </section>
            ))}
          </div>

          {showAcceptanceSection ? (
            <div className="border-t pt-4 bg-green-50 p-3 rounded">
              <p className="font-semibold text-green-800 text-center">
                {document.acceptanceText}
              </p>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export const PRIVACY_DOCUMENT_ID = LEGAL_DOCUMENT_IDS.PRIVACY;
