export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordPolicyContext = Readonly<{
  username?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}>;

export type PasswordPolicyResult =
  | { valid: true }
  | { valid: false; code: "too_short" | "too_long" | "common" | "context_specific"; message: string };

// Deliberately local and deterministic: authentication requests never disclose a
// candidate password to a third-party breach service. This seed list covers the
// most frequently compromised/common choices and obvious keyboard/date variants.
// It can be expanded through the governed release process without changing the
// password format or authentication contract.
const COMMON_OR_COMPROMISED_PASSWORDS = new Set([
  "123456", "12345678", "123456789", "1234567890", "111111", "000000",
  "password", "password1", "password123", "password1234", "passw0rd",
  "qwerty", "qwerty123", "qwertyuiop", "abc123", "letmein", "welcome",
  "welcome1", "admin", "administrator", "admin123", "root", "login",
  "iloveyou", "monkey", "dragon", "football", "baseball", "sunshine",
  "princess", "master", "shadow", "trustno1", "freedom", "whatever",
  "secret", "changeme", "default", "temp1234", "test1234", "asdfghjkl",
  "1q2w3e4r", "1q2w3e4r5t", "zaq12wsx", "qazwsx", "123qwe", "654321",
  "superman", "michael", "jennifer", "charlie", "donald", "pokemon",
]);

function comparable(value: string): string {
  return Array.from(value.normalize("NFKC").toLocaleLowerCase("en-US"))
    .filter((character) => /[a-z0-9]/i.test(character) || character.toLocaleLowerCase() !== character.toLocaleUpperCase())
    .join("");
}

function contextTokens(context: PasswordPolicyContext): string[] {
  const emailLocal = context.email?.split("@", 1)[0] || "";
  return [context.username, emailLocal, context.firstName, context.lastName, "cretexchange"]
    .filter((value): value is string => typeof value === "string")
    .map(comparable)
    .filter((value) => value.length >= 4);
}

export function validatePasswordPolicy(password: unknown, context: PasswordPolicyContext = {}): PasswordPolicyResult {
  if (typeof password !== "string" || Array.from(password).length < PASSWORD_MIN_LENGTH) {
    return { valid: false, code: "too_short", message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  if (Array.from(password).length > PASSWORD_MAX_LENGTH) {
    return { valid: false, code: "too_long", message: `Password must be no more than ${PASSWORD_MAX_LENGTH} characters.` };
  }

  const normalized = comparable(password);
  if (COMMON_OR_COMPROMISED_PASSWORDS.has(normalized)) {
    return { valid: false, code: "common", message: "Choose a password that is not commonly used or known to be compromised." };
  }
  if (contextTokens(context).some((token) => normalized.includes(token))) {
    return { valid: false, code: "context_specific", message: "Choose a password that does not contain your name, username, email name, or CreteXchange." };
  }
  return { valid: true };
}
