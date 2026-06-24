export const LEGAL_LANGUAGES = ["en", "es"] as const;
export type LegalLanguage = typeof LEGAL_LANGUAGES[number];

export const LEGAL_DOCUMENT_IDS = {
  TERMS: "terms",
  PRIVACY: "privacy",
  DRIVER_AGREEMENT: "driver_agreement",
  OWNER_AGREEMENT: "owner_agreement",
} as const;

export type LegalDocumentId = typeof LEGAL_DOCUMENT_IDS[keyof typeof LEGAL_DOCUMENT_IDS];
export type LegalDocumentStorageKey = `${LegalDocumentId}.${LegalLanguage}`;

export interface LegalDocumentSection {
  heading: string;
  body: string[];
  bullets?: string[];
}

export interface LegalDocumentVersion {
  id: LegalDocumentId;
  language: LegalLanguage;
  storageKey: LegalDocumentStorageKey;
  title: string;
  subtitle: string;
  version: string;
  effectiveAt: string;
  contentHash: string;
  intro: string;
  sections: LegalDocumentSection[];
  acceptanceText: string;
}

export interface ResolvedLegalDocument {
  document: LegalDocumentVersion;
  requestedLanguage: LegalLanguage;
  fallbackToEnglish: boolean;
  fallbackNotice: string | null;
}

const LEGAL_VERSION_DATE = "2026-06-12";

function makeDocument(
  id: LegalDocumentId,
  language: LegalLanguage,
  document: Omit<LegalDocumentVersion, "id" | "language" | "storageKey" | "version" | "effectiveAt" | "contentHash">,
): LegalDocumentVersion {
  const storageKey = `${id}.${language}` as LegalDocumentStorageKey;
  return {
    id,
    language,
    storageKey,
    version: `${storageKey}.${LEGAL_VERSION_DATE}`,
    effectiveAt: `${LEGAL_VERSION_DATE}T00:00:00.000Z`,
    contentHash: `sha256:${storageKey}.${LEGAL_VERSION_DATE}`,
    ...document,
  };
}

export const LEGAL_DOCUMENTS: Record<LegalDocumentStorageKey, LegalDocumentVersion> = {
  "terms.en": makeDocument(LEGAL_DOCUMENT_IDS.TERMS, "en", {
    title: "Terms & Conditions",
    subtitle: "CreteXchange Platform Terms",
    intro: "These Terms & Conditions govern access to and use of the CreteXchange platform.",
    sections: [
      {
        heading: "1. Platform Role",
        body: [
          "CreteXchange provides a technology platform that connects washout location owners with drivers who need compliant concrete washout services.",
          "Users are responsible for maintaining accurate account, business, vehicle, and contact information.",
        ],
      },
      {
        heading: "2. Account Responsibilities",
        body: [
          "You must keep your login credentials secure and promptly report unauthorized account activity.",
          "You agree to use the platform only for lawful business purposes and in compliance with environmental, safety, and payment rules that apply to your work.",
        ],
      },
      {
        heading: "3. Fees, Payments, and Records",
        body: [
          "Owner charges are currently limited to per-washout platform fees and any other fees disclosed in the app's current pricing and billing settings. Owners are not currently charged recurring subscription fees.",
          "CreteXchange may retain operational records needed for billing, dispute resolution, compliance, and support.",
          "CreteXchange may change fees in the future with advance notice and updated terms.",
        ],
      },
      {
        heading: "4. Changes to Terms",
        body: [
          "CreteXchange may update these terms. Material version changes require acceptance of the current document version before continued use of affected features.",
        ],
      },
    ],
    acceptanceText: "I have read, understood, and agree to the current Terms & Conditions.",
  }),
  "terms.es": makeDocument(LEGAL_DOCUMENT_IDS.TERMS, "es", {
    title: "Términos y condiciones",
    subtitle: "Términos de la plataforma CreteXchange",
    intro: "Estos Términos y condiciones rigen el acceso y uso de la plataforma CreteXchange.",
    sections: [
      {
        heading: "1. Función de la plataforma",
        body: [
          "CreteXchange proporciona una plataforma tecnológica que conecta a propietarios de ubicaciones de lavado con conductores que necesitan servicios de lavado de concreto.",
          "Los usuarios son responsables de mantener actualizada la información de cuenta, negocio, vehículo y contacto.",
        ],
      },
      {
        heading: "2. Responsabilidades de la cuenta",
        body: [
          "Debes proteger tus credenciales de acceso y reportar de inmediato cualquier actividad no autorizada.",
          "Aceptas usar la plataforma solo para fines comerciales legales y de acuerdo con las reglas ambientales, de seguridad y de pago aplicables.",
        ],
      },
      {
        heading: "3. Tarifas, pagos y registros",
        body: [
          "Los cargos para propietarios actualmente se limitan a tarifas de plataforma por lavado y cualquier otra tarifa revelada en la configuración actual de precios y facturación de la app. Actualmente no se cobran cuotas de suscripción recurrentes a los propietarios.",
          "CreteXchange puede conservar registros operativos necesarios para facturación, disputas, cumplimiento y soporte.",
          "CreteXchange puede cambiar las tarifas en el futuro con aviso previo y términos actualizados.",
        ],
      },
      {
        heading: "4. Cambios a los términos",
        body: [
          "CreteXchange puede actualizar estos términos. Los cambios materiales de versión requieren aceptar la versión vigente antes de seguir usando las funciones afectadas.",
        ],
      },
    ],
    acceptanceText: "He leído, entendido y acepto los Términos y condiciones vigentes.",
  }),
  "privacy.en": makeDocument(LEGAL_DOCUMENT_IDS.PRIVACY, "en", {
    title: "Privacy Policy",
    subtitle: "CreteXchange Data and Privacy Notice",
    intro: "This Privacy Policy explains how CreteXchange collects, uses, shares, and protects information when you use the service.",
    sections: [
      {
        heading: "1. Information We Collect",
        body: [
          "We collect account information, contact details, role-specific profile data, location activity, photos submitted for washout verification, support messages, device data, and payment-related identifiers.",
          "Bank, tax, and identity details collected through Stripe or other payment providers are handled by those providers according to their secure hosted flows.",
        ],
      },
      {
        heading: "2. How We Use Information",
        body: [
          "We use information to operate the platform, verify washouts, support driver payouts, process owner billing, prevent fraud, provide support, and comply with legal obligations.",
        ],
      },
      {
        heading: "3. Sharing Information",
        body: [
          "We share information with service providers such as payment processors, cloud storage providers, mapping providers, and communication tools as needed to run the service.",
          "We may disclose information when required by law, to protect users, or to resolve billing and operational disputes.",
        ],
      },
      {
        heading: "4. Choices and Updates",
        body: [
          "You may update account information in the app. Some records may be retained where needed for legal, tax, payment, security, or dispute-resolution purposes.",
        ],
      },
    ],
    acceptanceText: "I have read and understand the current Privacy Policy.",
  }),
  "privacy.es": makeDocument(LEGAL_DOCUMENT_IDS.PRIVACY, "es", {
    title: "Política de privacidad",
    subtitle: "Aviso de datos y privacidad de CreteXchange",
    intro: "Esta Política de privacidad explica cómo CreteXchange recopila, usa, comparte y protege información cuando usas el servicio.",
    sections: [
      {
        heading: "1. Información que recopilamos",
        body: [
          "Recopilamos información de cuenta, datos de contacto, perfil según el rol, actividad de ubicación, fotos enviadas para verificar lavados, mensajes de soporte, datos del dispositivo e identificadores relacionados con pagos.",
          "Los datos bancarios, fiscales y de identidad recopilados por Stripe u otros proveedores de pago se manejan mediante sus flujos seguros alojados.",
        ],
      },
      {
        heading: "2. Cómo usamos la información",
        body: [
          "Usamos la información para operar la plataforma, verificar lavados, apoyar pagos a conductores, procesar facturación de propietarios, prevenir fraude, brindar soporte y cumplir obligaciones legales.",
        ],
      },
      {
        heading: "3. Cómo compartimos información",
        body: [
          "Compartimos información con proveedores de servicios como procesadores de pago, almacenamiento en la nube, mapas y herramientas de comunicación cuando es necesario para operar el servicio.",
          "Podemos divulgar información cuando la ley lo requiera, para proteger a usuarios o para resolver disputas operativas y de facturación.",
        ],
      },
      {
        heading: "4. Opciones y actualizaciones",
        body: [
          "Puedes actualizar información de cuenta en la app. Algunos registros pueden conservarse cuando sea necesario por motivos legales, fiscales, de pago, seguridad o resolución de disputas.",
        ],
      },
    ],
    acceptanceText: "He leído y entiendo la Política de privacidad vigente.",
  }),
  "driver_agreement.en": makeDocument(LEGAL_DOCUMENT_IDS.DRIVER_AGREEMENT, "en", {
    title: "Driver Agreement",
    subtitle: "Driver Service and Payout Agreement",
    intro: "This Driver Agreement applies to drivers who use CreteXchange to locate washout sites, submit washout evidence, and receive owner-funded payouts or incentives.",
    sections: [
      {
        heading: "1. Driver Status and Duties",
        body: [
          "Drivers operate as independent service providers and are not employees of CreteXchange.",
          "Drivers must follow site rules, safety requirements, environmental requirements, and all applicable laws when performing washout services.",
        ],
      },
      {
        heading: "2. Washout Submission Requirements",
        body: [
          "Drivers must check in at the correct location, complete the washout service, and submit accurate photo evidence for owner review.",
          "Fraudulent, duplicate, altered, or misleading submissions may result in non-payment, account suspension, or removal from the platform.",
        ],
      },
      {
        heading: "3. Driver Payouts",
        body: [
          "Drivers do not pay CreteXchange to receive owner-funded tips or incentives.",
          "Driver Stripe onboarding is used only to set up a connected account for ACH payouts to the driver's personal bank account.",
          "Drivers must complete Stripe-hosted onboarding and satisfy Stripe requirements before payouts can be marked ready.",
        ],
      },
      {
        heading: "4. Taxes and Compliance",
        body: [
          "Drivers are responsible for their own taxes, licenses, insurance, and business expenses.",
          "Drivers must keep personal, tax, banking, and contact information accurate in the appropriate secure provider flow.",
        ],
      },
    ],
    acceptanceText: "I have read, understood, and agree to the current Driver Agreement.",
  }),
  "driver_agreement.es": makeDocument(LEGAL_DOCUMENT_IDS.DRIVER_AGREEMENT, "es", {
    title: "Acuerdo del conductor",
    subtitle: "Acuerdo de servicio y pagos del conductor",
    intro: "Este Acuerdo del conductor aplica a conductores que usan CreteXchange para encontrar sitios de lavado, enviar evidencia y recibir pagos o incentivos financiados por propietarios.",
    sections: [
      {
        heading: "1. Estado y obligaciones del conductor",
        body: [
          "Los conductores operan como proveedores independientes y no son empleados de CreteXchange.",
          "Los conductores deben seguir las reglas del sitio, requisitos de seguridad, requisitos ambientales y todas las leyes aplicables al realizar servicios de lavado.",
        ],
      },
      {
        heading: "2. Requisitos de envío de lavados",
        body: [
          "Los conductores deben registrarse en la ubicación correcta, completar el servicio de lavado y enviar evidencia fotográfica precisa para revisión del propietario.",
          "Los envíos fraudulentos, duplicados, alterados o engañosos pueden causar falta de pago, suspensión de cuenta o retiro de la plataforma.",
        ],
      },
      {
        heading: "3. Pagos al conductor",
        body: [
          "Los conductores no pagan a CreteXchange para recibir propinas o incentivos financiados por propietarios.",
          "La incorporación de Stripe para conductores se usa solo para configurar una cuenta conectada para pagos ACH a la cuenta bancaria personal del conductor.",
          "Los conductores deben completar la incorporación alojada por Stripe y cumplir los requisitos de Stripe antes de estar listos para recibir pagos.",
        ],
      },
      {
        heading: "4. Impuestos y cumplimiento",
        body: [
          "Los conductores son responsables de sus propios impuestos, licencias, seguros y gastos comerciales.",
          "Los conductores deben mantener correcta la información personal, fiscal, bancaria y de contacto en el flujo seguro correspondiente.",
        ],
      },
    ],
    acceptanceText: "He leído, entendido y acepto el Acuerdo del conductor vigente.",
  }),
  "owner_agreement.en": makeDocument(LEGAL_DOCUMENT_IDS.OWNER_AGREEMENT, "en", {
    title: "Owner Agreement",
    subtitle: "Location Owner Service Agreement",
    intro: "This Owner Agreement applies to owners who list and manage washout locations on CreteXchange.",
    sections: [
      {
        heading: "1. Location Management",
        body: [
          "Owners are responsible for providing accurate location details, rates, availability, operating rules, permits, and site instructions.",
          "Owners must maintain safe, accessible, and compliant facilities for concrete washout activity.",
        ],
      },
      {
        heading: "2. Washout Review",
        body: [
          "Owners must review driver submissions promptly and approve only legitimate washouts performed at their location.",
          "Pending washouts may be subject to platform review windows and auto-approval rules shown in the app.",
        ],
      },
      {
        heading: "3. Owner Billing and Driver Incentives",
        body: [
          "Owners are not currently charged recurring subscription fees.",
          "Owners may still be charged per-washout platform fees, and any owner/location-configured driver incentive tips are separate from platform fees.",
          "Owner billing is separate from driver payout onboarding. Drivers do not add cards or pay CreteXchange to receive funded tips.",
          "CreteXchange may change fees in the future with advance notice and updated terms.",
        ],
      },
      {
        heading: "4. Compliance",
        body: [
          "Owners are responsible for environmental compliance, permits, insurance, taxes, and site operations.",
          "CreteXchange may suspend locations or accounts that create safety, fraud, payment, or compliance risk.",
        ],
      },
    ],
    acceptanceText: "I have read, understood, and agree to the current Owner Agreement.",
  }),
  "owner_agreement.es": makeDocument(LEGAL_DOCUMENT_IDS.OWNER_AGREEMENT, "es", {
    title: "Acuerdo del propietario",
    subtitle: "Acuerdo de servicio para propietarios de ubicaciones",
    intro: "Este Acuerdo del propietario aplica a propietarios que publican y administran ubicaciones de lavado en CreteXchange.",
    sections: [
      {
        heading: "1. Administración de ubicaciones",
        body: [
          "Los propietarios son responsables de proporcionar detalles correctos de ubicación, tarifas, disponibilidad, reglas de operación, permisos e instrucciones del sitio.",
          "Los propietarios deben mantener instalaciones seguras, accesibles y conformes para actividades de lavado de concreto.",
        ],
      },
      {
        heading: "2. Revisión de lavados",
        body: [
          "Los propietarios deben revisar oportunamente los envíos de conductores y aprobar solo lavados legítimos realizados en su ubicación.",
          "Los lavados pendientes pueden estar sujetos a ventanas de revisión y reglas de aprobación automática mostradas en la app.",
        ],
      },
      {
        heading: "3. Facturación del propietario e incentivos al conductor",
        body: [
          "Actualmente no se cobran cuotas de suscripción recurrentes a los propietarios.",
          "Los propietarios aún pueden ser cobrados por tarifas de plataforma por lavado, y cualquier propina de incentivo al conductor configurada por el propietario o por la ubicación es independiente de las tarifas de plataforma.",
          "La facturación del propietario es independiente de la incorporación de pagos del conductor. Los conductores no agregan tarjetas ni pagan a CreteXchange para recibir propinas financiadas.",
          "CreteXchange puede cambiar las tarifas en el futuro con aviso previo y términos actualizados.",
        ],
      },
      {
        heading: "4. Cumplimiento",
        body: [
          "Los propietarios son responsables del cumplimiento ambiental, permisos, seguros, impuestos y operación del sitio.",
          "CreteXchange puede suspender ubicaciones o cuentas que generen riesgos de seguridad, fraude, pago o cumplimiento.",
        ],
      },
    ],
    acceptanceText: "He leído, entendido y acepto el Acuerdo del propietario vigente.",
  }),
};

export function isLegalLanguage(value: unknown): value is LegalLanguage {
  return typeof value === "string" && LEGAL_LANGUAGES.includes(value as LegalLanguage);
}

export function normalizeLegalLanguage(value: unknown): LegalLanguage {
  return isLegalLanguage(value) ? value : "en";
}

export function isLegalDocumentId(value: unknown): value is LegalDocumentId {
  return typeof value === "string" && Object.values(LEGAL_DOCUMENT_IDS).includes(value as LegalDocumentId);
}

export function resolveLegalDocument(
  documentId: LegalDocumentId,
  languageInput: unknown,
): ResolvedLegalDocument {
  const requestedLanguage = normalizeLegalLanguage(languageInput);
  const requestedKey = `${documentId}.${requestedLanguage}` as LegalDocumentStorageKey;
  const fallbackKey = `${documentId}.en` as LegalDocumentStorageKey;
  const document = LEGAL_DOCUMENTS[requestedKey] || LEGAL_DOCUMENTS[fallbackKey];
  const fallbackToEnglish = document.language !== requestedLanguage;

  return {
    document,
    requestedLanguage,
    fallbackToEnglish,
    fallbackNotice: fallbackToEnglish
      ? "This legal document is not available in Spanish yet, so the English version is shown."
      : null,
  };
}

export function getRequiredLegalDocumentIdsForRole(role?: string | null): LegalDocumentId[] {
  if (role === "driver") {
    return [
      LEGAL_DOCUMENT_IDS.TERMS,
      LEGAL_DOCUMENT_IDS.PRIVACY,
      LEGAL_DOCUMENT_IDS.DRIVER_AGREEMENT,
    ];
  }

  if (role === "owner") {
    return [
      LEGAL_DOCUMENT_IDS.TERMS,
      LEGAL_DOCUMENT_IDS.PRIVACY,
      LEGAL_DOCUMENT_IDS.OWNER_AGREEMENT,
    ];
  }

  return [];
}

export function getRequiredLegalDocumentsForRole(
  role: string | null | undefined,
  languageInput: unknown,
): ResolvedLegalDocument[] {
  return getRequiredLegalDocumentIdsForRole(role).map((documentId) => (
    resolveLegalDocument(documentId, languageInput)
  ));
}

export const ALL_LEGAL_DOCUMENT_VERSIONS = Object.values(LEGAL_DOCUMENTS);
