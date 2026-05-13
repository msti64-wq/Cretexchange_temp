const REDACTED = "[REDACTED]";
const REDACTED_EMAIL = "[REDACTED_EMAIL]";
const REDACTED_PHONE = "[REDACTED_PHONE]";
const REDACTED_SSN = "[REDACTED_SSN]";
const REDACTED_TOKEN = "[REDACTED_TOKEN]";
const REDACTED_SECRET = "[REDACTED_SECRET]";
const REDACTED_ACCOUNT_ID = "[REDACTED_ACCOUNT_ID]";

const SENSITIVE_KEYS = /^(authorization|cookie|cookies|password|passwordhash|token|resettoken|clientsecret|secret|webhooksecret|sessionid|access_token|accesstoken|stripe.*accountid|stripe.*customerid|stripe.*paymentmethodid|stripe.*paymentintentid|stripe.*cardholderid|stripe.*treasuryaccountid|accountid|account_id|bankaccount|bankaccountid|cardlast4|cardnumber|cvv|cvc|ssn|government_id|dob|dateofbirth|email|phone|firstName|lastName|street|city|state|zip|address|photo|photos|photourl|photourls|uploadurl)$/i;
const RESPONSE_BODY_LABELS = /(response data|upload result|activity data|photo data|setup intent data|financial connections returned|stored photo metadata|backend save failed|error object|result)$/i;

const ACCOUNT_ID_PATTERNS = [
  /\bacct_[A-Za-z0-9]+\b/g,
  /\bcus_[A-Za-z0-9]+\b/g,
  /\bpi_[A-Za-z0-9]+\b/g,
  /\bpm_[A-Za-z0-9]+\b/g,
  /\bseti_[A-Za-z0-9]+\b/g,
  /\bevt_[A-Za-z0-9]+\b/g,
  /\bcard_[A-Za-z0-9]+\b/g,
  /\bba_[A-Za-z0-9]+\b/g,
  /\btok_[A-Za-z0-9]+\b/g,
  /\bwhsec_[A-Za-z0-9]+\b/g,
  /\bsk_[A-Za-z0-9]+\b/g,
  /\bshp_[A-Za-z0-9]+\b/g,
];

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;
const SSN_PATTERN = /\b\d{3}-?\d{2}-?\d{4}\b/g;
const CONNECT_COOKIE_PATTERN = /(connect\.sid=)[^;]+/gi;
const GENERIC_BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/g;
const SECRET_LABEL_PATTERN = /(secret|token|password|authorization|cookie)/i;

function sanitizeString(value: string): string {
  let sanitized = value;

  sanitized = sanitized.replace(CONNECT_COOKIE_PATTERN, "$1[REDACTED]");
  sanitized = sanitized.replace(GENERIC_BEARER_PATTERN, "Bearer [REDACTED]");
  sanitized = sanitized.replace(JWT_PATTERN, REDACTED_TOKEN);
  sanitized = sanitized.replace(EMAIL_PATTERN, REDACTED_EMAIL);
  sanitized = sanitized.replace(PHONE_PATTERN, REDACTED_PHONE);
  sanitized = sanitized.replace(SSN_PATTERN, REDACTED_SSN);

  for (const pattern of ACCOUNT_ID_PATTERNS) {
    sanitized = sanitized.replace(pattern, REDACTED_ACCOUNT_ID);
  }

  if (SECRET_LABEL_PATTERN.test(sanitized) && sanitized.length > 32) {
    sanitized = sanitized.replace(/(:\s*).+$/, `$1${REDACTED_SECRET}`);
  }

  return sanitized;
}

function sanitizeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value as object)) {
      return "[Circular]";
    }
    seen.add(value as object);

    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(key)) {
        output[key] = REDACTED;
        continue;
      }

      if (RESPONSE_BODY_LABELS.test(key)) {
        output[key] = REDACTED;
        continue;
      }

      output[key] = sanitizeValue(entry, seen);
    }

    seen.delete(value as object);
    return output;
  }

  return sanitizeString(String(value));
}

export function redactLogArgs(args: unknown[]): unknown[] {
  if (args.length === 0) {
    return args;
  }

  const [first, ...rest] = args;
  const firstString = typeof first === "string" ? sanitizeString(first) : first;
  const shouldSuppressBody = typeof first === "string" && RESPONSE_BODY_LABELS.test(first);

  if (shouldSuppressBody) {
    return [firstString, REDACTED];
  }

  return [firstString, ...rest.map((entry) => sanitizeValue(entry))];
}

export function installConsoleRedaction(): void {
  const globalAny = globalThis as typeof globalThis & { __consoleRedactionInstalled?: boolean };
  if (globalAny.__consoleRedactionInstalled) {
    return;
  }
  globalAny.__consoleRedactionInstalled = true;

  const methods: Array<keyof Console> = ["log", "info", "warn", "error", "debug"];
  for (const method of methods) {
    const original = console[method] as (...args: unknown[]) => void;
    (console as unknown as Record<keyof Console, (...args: unknown[]) => void>)[method] = (
      ...args: unknown[]
    ) => original(...redactLogArgs(args));
  }
}
