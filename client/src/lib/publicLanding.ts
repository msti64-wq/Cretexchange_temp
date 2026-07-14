export const PUBLIC_LANDING_ROUTES = {
  home: "/",
  login: "/login",
  register: "/register",
  driverRegistration: "/register/driver",
  facilityRegistration: "/register/owner",
  privacy: "/privacy-policy",
  valuePropositionAnchor: "#value-proposition",
} as const;

export const PUBLIC_LANDING_TRANSLATION_KEYS = [
  "public.header.howItWorks",
  "public.header.login",
  "public.header.register",
  "public.hero.eyebrow",
  "public.hero.headline",
  "public.hero.supporting",
  "public.hero.driverCta",
  "public.hero.facilityCta",
  "public.hero.learnMore",
  "public.hero.visualLabel",
  "public.hero.participatingLocation",
  "public.hero.verifiedActivity",
  "public.value.eyebrow",
  "public.value.heading",
  "public.value.supporting",
  "public.value.driver",
  "public.value.facility",
  "public.value.verification",
  "public.footer.privacy",
  "public.footer.copyright",
] as const;

export type PublicLandingTranslationKey = (typeof PUBLIC_LANDING_TRANSLATION_KEYS)[number];
