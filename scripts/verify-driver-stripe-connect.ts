import type { Driver, User } from "../shared/schema";

const secretKey = process.env.STRIPE_SECRET_KEY?.trim();

if (!secretKey) {
  console.error("STRIPE_SECRET_KEY is required.");
  process.exit(1);
}

if (!secretKey.startsWith("sk_test_") && process.env.ALLOW_LIVE_STRIPE_CONNECT_DIAGNOSTIC !== "true") {
  console.error("Refusing to run driver Stripe Connect diagnostic without a test-mode Stripe key.");
  console.error("Use STRIPE_SECRET_KEY=sk_test_... or set ALLOW_LIVE_STRIPE_CONNECT_DIAGNOSTIC=true intentionally.");
  process.exit(1);
}

process.env.JWT_SECRET =
  process.env.JWT_SECRET || "diagnostic-jwt-secret-32-characters-min";
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || "diagnostic-session-secret";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgres://user:pass@127.0.0.1:1/diagnostic";

const {
  buildDriverStripePayoutAccountParams,
  createDriverStripePayoutAccount,
  createDriverStripeOnboardingLink,
} = await import("../server/routes");

const timestamp = Date.now();
const diagnosticUser = {
  id: `diagnostic_user_${timestamp}`,
  username: `driver-connect-diagnostic-${timestamp}`,
  email: process.env.DRIVER_STRIPE_CONNECT_DIAGNOSTIC_EMAIL || `driver-connect-diagnostic-${timestamp}@example.com`,
  firstName: "Driver",
  lastName: "Diagnostic",
  phone: undefined,
  street: undefined,
  city: undefined,
  state: undefined,
  zip: undefined,
  role: "driver",
} as unknown as User;

const diagnosticDriver = {
  id: `diagnostic_driver_${timestamp}`,
  userId: diagnosticUser.id,
} as unknown as Driver;

const accountPayload = buildDriverStripePayoutAccountParams(diagnosticUser, diagnosticDriver);

console.log("[DRIVER_STRIPE_CONNECT_DIAGNOSTIC] Account create payload:");
console.log(JSON.stringify(accountPayload, null, 2));

const account = await createDriverStripePayoutAccount(
  diagnosticUser,
  diagnosticDriver,
  {
    isComplete: true,
    missingFields: [],
    invalidFields: [],
  },
);

function normalizeDiagnosticAppUrl(value: string, source: string) {
  const trimmedValue = value.trim().replace(/\/+$/, "");
  if (source === "RAILWAY_PUBLIC_DOMAIN" && !/^[a-z][a-z\d+.-]*:\/\//i.test(trimmedValue)) {
    return `https://${trimmedValue}`;
  }
  return trimmedValue;
}

const railwayPublicDomain = process.env.RAILWAY_PUBLIC_DOMAIN
  ? normalizeDiagnosticAppUrl(process.env.RAILWAY_PUBLIC_DOMAIN, "RAILWAY_PUBLIC_DOMAIN")
  : undefined;
const diagnosticAppUrl =
  process.env.PUBLIC_APP_URL ||
  process.env.APP_BASE_URL ||
  railwayPublicDomain ||
  process.env.DRIVER_STRIPE_CONNECT_DIAGNOSTIC_APP_URL ||
  "https://example.com";
if (!process.env.PUBLIC_APP_URL && !process.env.APP_BASE_URL && !process.env.RAILWAY_PUBLIC_DOMAIN) {
  process.env.APP_BASE_URL = diagnosticAppUrl;
}
const parsedDiagnosticAppUrl = new URL(diagnosticAppUrl);
const req = {
  protocol: parsedDiagnosticAppUrl.protocol.replace(":", ""),
  get(header: string) {
    return header.toLowerCase() === "host" ? parsedDiagnosticAppUrl.host : undefined;
  },
};

const accountLink = await createDriverStripeOnboardingLink(req, account.id, account);

console.log("[DRIVER_STRIPE_CONNECT_DIAGNOSTIC] Created test connected account and onboarding link:");
console.log(JSON.stringify({
  accountId: account.id,
  accountType: account.type,
  capabilities: account.capabilities,
  detailsSubmitted: account.details_submitted,
  payoutsEnabled: account.payouts_enabled,
  onboardingUrl: accountLink.url,
  expiresAt: accountLink.expires_at,
  note: "This script uses synthetic user/driver metadata and does not read or write CreteXchange driver records.",
}, null, 2));
