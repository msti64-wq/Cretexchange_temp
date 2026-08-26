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
  versionDate = LEGAL_VERSION_DATE,
): LegalDocumentVersion {
  const storageKey = `${id}.${language}` as LegalDocumentStorageKey;
  return {
    id,
    language,
    storageKey,
    version: `${storageKey}.${versionDate}`,
    effectiveAt: `${versionDate}T00:00:00.000Z`,
    contentHash: `sha256:${storageKey}.${versionDate}`,
    ...document,
  };
}

export const LEGAL_DOCUMENTS: Record<LegalDocumentStorageKey, LegalDocumentVersion> = {
  "terms.en": makeDocument(LEGAL_DOCUMENT_IDS.TERMS, "en", {
    title: "Terms & Conditions",
    subtitle: "CreteXchange Platform Terms",
    intro: "These Terms and Conditions (the “Terms”) are an agreement between you and V8 Industries LLC, the operator of CreteXchange (“CreteXchange,” “we,” “us,” or “our”). By accessing or using CreteXchange, you agree to these Terms. If you do not agree, do not use the service.",
    sections: [
      {
        heading: "1. Eligibility and authority",
        body: [
                  "You must be at least 18 years old and legally able to enter a binding agreement. If you use CreteXchange for a company or other organization, you represent that you have authority to bind that organization."
        ],
      },
      {
        heading: "2. What CreteXchange provides",
        body: [
                  "CreteXchange provides digital tools that help drivers, haulers, facilities, contractors, producers, and public-sector participants exchange information about construction-material recovery opportunities and document recovery activity.",
                  "CreteXchange is a technology platform. Unless expressly stated otherwise, we are not a carrier, broker, disposal facility, recycler, contractor, material owner, or operator of participating facilities. We do not take custody of material and do not direct drivers to use a particular route or facility."
        ],
      },
      {
        heading: "3. Independent operational decisions",
        body: [
                  "Drivers remain responsible for deciding whether, when, and how to travel to a facility and for complying with traffic laws, employer policies, site rules, vehicle requirements, and safe-driving practices. Do not interact with a device while driving.",
                  "Facilities independently determine what materials they accept, their operating requirements and availability, and any recovery incentive they choose to offer. Listings, hours, accepted materials, capacity, incentives, and access conditions may change and should be confirmed when necessary."
        ],
      },
      {
        heading: "4. Accounts and accurate information",
        body: [
                  "You must provide accurate, current information; safeguard your credentials; and promptly notify us of suspected unauthorized use. You are responsible for activity performed through your account unless prohibited by law.",
                  "You may not impersonate another person or organization, create deceptive accounts, falsify facility or drop information, manipulate verification records, or use CreteXchange for unlawful activity."
        ],
      },
      {
        heading: "5. Facility responsibilities",
        body: [
                  "Facility users are responsible for maintaining accurate listings, accepted-material information, access instructions, incentive terms, and required permits or authorizations. A facility must not list or accept material it cannot lawfully receive, handle, process, or store."
        ],
      },
      {
        heading: "6. Drop verification",
        body: [
                  "CreteXchange may use account information, timestamps, location signals, geofence results, photographs, facility confirmations, and related records to evaluate whether a drop is verified. Verification indicates that available platform evidence met the applicable workflow; it is not a legal certification of material composition, environmental compliance, title, weight, or regulatory status.",
                  "We may delay, deny, reverse, or review a verification when information is incomplete, inconsistent, duplicated, fraudulent, or reasonably disputed."
        ],
      },
      {
        heading: "7. Fees, incentives, and payments",
        body: [
                  "At the current launch model, drivers and facility owners are not charged a subscription or enrollment fee. Facilities may set a per-drop driver recovery incentive from $0 to any amount they choose. CreteXchange charges the facility $5 for each verified drop processed through the platform.",
                  "Where payment functionality is enabled, additional payment-provider terms may apply. Payment timing, payout eligibility, reversals, failed charges, and dispute procedures may be shown in the platform. Each participant is responsible for its own taxes, reporting, and legal obligations. CreteXchange does not characterize facility-funded incentives as tips or provide tax advice.",
                  "We may change pricing prospectively after providing notice. A pricing change will not retroactively alter a completed transaction."
        ],
      },
      {
        heading: "8. User content and permissions",
        body: [
                  "You retain ownership of information and materials you submit, including photographs, listing information, messages, and verification evidence (“User Content”). You grant CreteXchange a worldwide, non-exclusive, royalty-free license to host, store, reproduce, process, display, and use User Content as reasonably necessary to operate, secure, improve, and document the service and comply with law.",
                  "You represent that you have the rights and permissions needed to submit User Content and that it does not violate law or another party’s rights."
        ],
      },
      {
        heading: "9. Location and camera features",
        body: [
                  "Some features require permission to access location data, a camera, or photographs. You control device permissions, but disabling them may prevent use of facility discovery, geofence, or verification features. Location and map information may be approximate and must not be used as a substitute for safe navigation or site instructions."
        ],
      },
      {
        heading: "10. Prohibited conduct",
        body: [
                  "You may not interfere with the service; bypass security or access controls; introduce malicious code; scrape or copy the service at unreasonable scale; reverse engineer protected portions except where law permits; misuse personal information; submit false recovery events; or use the service to facilitate illegal dumping, improper disposal, unsafe conduct, or regulatory violations."
        ],
      },
      {
        heading: "11. Intellectual property",
        body: [
                  "CreteXchange, its software, branding, designs, documentation, and platform content are owned by V8 Industries LLC or its licensors and are protected by applicable intellectual-property laws. These Terms provide a limited, revocable, non-transferable right to use the service for its intended purpose; they do not transfer ownership."
        ],
      },
      {
        heading: "12. Third-party services",
        body: [
                  "The service may rely on or link to third-party mapping, hosting, payment, communications, storage, or other services. Those services may have separate terms and privacy practices. We are not responsible for third-party services outside our control."
        ],
      },
      {
        heading: "13. Availability and changes",
        body: [
                  "We may modify, suspend, or discontinue features; perform maintenance; establish usage limits; or change eligibility requirements. We do not guarantee uninterrupted access, continuous facility availability, a particular recovery result, incentive, route, environmental outcome, or financial return."
        ],
      },
      {
        heading: "14. Disclaimers",
        body: [
                  "TO THE MAXIMUM EXTENT PERMITTED BY LAW, CRETEXCHANGE IS PROVIDED “AS IS” AND “AS AVAILABLE.” WE DISCLAIM IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. INFORMATION PROVIDED THROUGH THE SERVICE MAY BE INCOMPLETE, DELAYED, OR INACCURATE.",
                  "Nothing in the service replaces professional legal, environmental, safety, tax, engineering, transportation, or regulatory advice."
        ],
      },
      {
        heading: "15. Limitation of liability",
        body: [
                  "TO THE MAXIMUM EXTENT PERMITTED BY LAW, V8 INDUSTRIES LLC AND ITS AFFILIATES, OFFICERS, AND SERVICE PROVIDERS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, DATA, USE, GOODWILL, OR BUSINESS INTERRUPTION ARISING FROM THE SERVICE.",
                  "TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR AGGREGATE LIABILITY ARISING OUT OF THE SERVICE OR THESE TERMS WILL NOT EXCEED THE GREATER OF $100 OR THE AMOUNT YOU PAID DIRECTLY TO CRETEXCHANGE DURING THE SIX MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM. Some jurisdictions do not allow certain limitations, so portions of this section may not apply to you."
        ],
      },
      {
        heading: "16. Indemnification",
        body: [
                  "To the extent permitted by law, you agree to defend, indemnify, and hold harmless V8 Industries LLC and its affiliates, officers, and service providers from claims, losses, liabilities, and reasonable costs arising from your unlawful use of the service, your User Content, your facility or transportation operations, or your violation of these Terms or another party’s rights."
        ],
      },
      {
        heading: "17. Suspension and termination",
        body: [
                  "We may suspend or terminate access when reasonably necessary to protect users, investigate fraud or security issues, enforce these Terms, comply with law, or address risk to the service. You may stop using the service at any time and may request account deletion subject to lawful retention requirements."
        ],
      },
      {
        heading: "18. Governing law and disputes",
        body: [
                  "These Terms are governed by the laws of the State of Texas, without regard to conflict-of-law principles. Unless applicable law requires otherwise, disputes that cannot be resolved informally will be brought in a state or federal court with jurisdiction in Collin County, Texas."
        ],
      },
      {
        heading: "19. Changes to these Terms",
        body: [
                  "We may update these Terms. Material changes will be posted with a revised “Last updated” date and, when appropriate, additional notice. Continued use after updated Terms become effective constitutes acceptance to the extent permitted by law."
        ],
      },
      {
        heading: "20. Contact",
        body: [
                  "Questions about these Terms may be sent to mstiger@cretexchange.com or directed to (469) 269-6709."
        ],
      }
    ],
    acceptanceText: "I have read, understood, and agree to the current Terms & Conditions.",
  }, "2026-08-26"),
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
    intro: "CreteXchange is operated by V8 Industries LLC (“CreteXchange,” “we,” “us,” or “our”). This Privacy Policy applies to our website, platform, and related services (collectively, the “Service”).",
    sections: [
      {
        heading: "1. Information we collect",
        body: [
                  "Information you provide:"
        ],
        bullets: [
                  "Account and contact information, such as name, email address, telephone number, company, and role.",
                  "Facility, jobsite, vehicle, material, and operational information you submit.",
                  "Photographs, messages, support requests, verification evidence, and other content you provide.",
                  "Transaction and incentive information. Payment-card details are generally collected and processed by our payment provider rather than stored in full by CreteXchange.",
                  "Information collected through use of the Service:",
                  "Device, browser, IP address, log, diagnostic, and usage information.",
                  "Approximate or precise location information when you grant permission, including information used for facility discovery, geofence evaluation, routing context, and drop verification.",
                  "Camera and photo-library information when you grant permission and choose to capture or upload verification evidence.",
                  "Cookies and similar technologies used for authentication, security, preferences, and service performance."
        ],
      },
      {
        heading: "2. How we use information",
        body: [
                  "We use information to:"
        ],
        bullets: [
                  "Provide, maintain, personalize, and improve the Service.",
                  "Create and secure accounts and authenticate users.",
                  "Display facility opportunities and support informed destination decisions.",
                  "Evaluate and document recovery events, geofence results, photographs, incentives, fees, and disputes.",
                  "Process payments and payouts where payment features are enabled.",
                  "Communicate service, safety, security, support, and administrative messages.",
                  "Detect fraud, abuse, security incidents, and technical problems.",
                  "Analyze performance and develop aggregated or deidentified insights.",
                  "Comply with law and enforce our agreements."
        ],
      },
      {
        heading: "3. How we share information",
        body: [
                  "We may share information:"
        ],
        bullets: [
                  "With service providers that support hosting, databases, storage, maps, payments, communications, analytics, security, and customer support.",
                  "Between participating drivers, facilities, contractors, and other users when needed to support an opportunity, visit, verification, incentive, dispute, or requested connection.",
                  "With professional advisers, auditors, insurers, or transaction participants in connection with financing, restructuring, merger, acquisition, or sale of assets.",
                  "When required by law or reasonably necessary to protect rights, safety, security, and the integrity of the Service.",
                  "With your direction or consent.",
                  "We do not sell personal information for money, and we do not use personal information for cross-context behavioral advertising. If our practices change, we will update this policy and provide legally required choices."
        ],
      },
      {
        heading: "4. Location information and photographs",
        body: [
                  "Location and photographic evidence can be important to facility discovery and verified-drop workflows. We collect this information only through enabled platform features and applicable device permissions. You may change permissions through your device or browser, but some features may no longer function.",
                  "Location signals can be imprecise. We may retain location, timestamp, geofence, and image evidence when reasonably necessary for verification, safety, fraud prevention, dispute resolution, auditing, or legal compliance."
        ],
      },
      {
        heading: "5. Data retention",
        body: [
                  "We retain personal information for as long as reasonably necessary for the purposes described in this policy, including account administration, transaction and verification records, security, dispute resolution, regulatory obligations, and enforcement. Retention periods vary by data type and legal requirement. We may retain aggregated or deidentified information where it cannot reasonably identify you."
        ],
      },
      {
        heading: "6. Data security",
        body: [
                  "We use reasonable administrative, technical, and organizational safeguards designed to protect information. No internet transmission or storage system is completely secure, and we cannot guarantee absolute security. Protect your credentials and notify us promptly of suspected unauthorized activity."
        ],
      },
      {
        heading: "7. Your choices and privacy rights",
        body: [
                  "You may update certain account information in the Service and may contact us to request access, correction, deletion, or a copy of personal information, or to opt out of nonessential communications. We may need to verify your identity and may retain information when permitted or required by law.",
                  "Residents of Texas, California, and other jurisdictions may have additional rights where the applicable law covers CreteXchange and the relevant processing. These may include rights to confirm processing, access, correct, delete, or obtain a portable copy of data, and to opt out of certain sales, targeted advertising, sharing, or profiling. CreteXchange does not discriminate against users for exercising applicable privacy rights.",
                  "Submit a request to mstiger@cretexchange.com or call (469) 269-6709. If an applicable law provides an appeal right and we deny a request, you may appeal by replying to our decision with “Privacy Appeal” in the subject line."
        ],
      },
      {
        heading: "8. Children’s privacy",
        body: [
                  "The Service is intended for business users age 18 and older and is not directed to children. We do not knowingly collect personal information from children under 13. If you believe a child has provided personal information, contact us so we can investigate and take appropriate action."
        ],
      },
      {
        heading: "9. Third-party services",
        body: [
                  "The Service may link to or integrate with third-party services. Their privacy practices are governed by their own policies, and this policy does not cover information they process independently."
        ],
      },
      {
        heading: "10. Processing and transfers",
        body: [
                  "Information may be processed in the United States and other locations where our service providers operate. Where required, we use appropriate safeguards for cross-border transfers."
        ],
      },
      {
        heading: "11. Changes to this policy",
        body: [
                  "We may update this Privacy Policy as the Service, our practices, or legal requirements change. We will post the revised policy with an updated date and provide additional notice when required."
        ],
      },
      {
        heading: "12. Contact",
        body: [
                  "Questions or privacy requests may be sent to mstiger@cretexchange.com or directed to (469) 269-6709."
        ],
      }
    ],
    acceptanceText: "I have read and understand the current Privacy Policy.",
  }, "2026-08-26"),
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
