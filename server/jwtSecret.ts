const MIN_JWT_SECRET_LENGTH = 32;
const DISALLOWED_JWT_SECRETS = new Set([
  "your-jwt-secret-key-change-in-production",
  "development-secret",
  "development-secret-key-change-in-production",
]);

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }

  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters long`);
  }

  if (DISALLOWED_JWT_SECRETS.has(secret)) {
    throw new Error("JWT_SECRET must not use a fallback or placeholder value");
  }

  return secret;
}
