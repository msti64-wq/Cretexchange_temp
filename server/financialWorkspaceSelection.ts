import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const TOKEN_VERSION = 1;
const TOKEN_TTL_MS = 15 * 60 * 1000;

type SelectionPayload = { version: number; activityId: string; expiresAt: number };

function key(): Buffer | null {
  const secret = process.env.JWT_SECRET;
  return typeof secret === "string" && secret.length >= 32
    ? createHash("sha256").update(secret).digest()
    : null;
}

/** Opaque, short-lived selection token; raw database identifiers never enter the UI. */
export function createFinancialWorkspaceSelectionToken(activityId: string, now = Date.now()): string | null {
  const encryptionKey = key();
  if (!encryptionKey || !activityId) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const payload: SelectionPayload = { version: TOKEN_VERSION, activityId, expiresAt: now + TOKEN_TTL_MS };
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${encrypted.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

export function resolveFinancialWorkspaceSelectionToken(token: unknown, now = Date.now()): string | null {
  const encryptionKey = key();
  if (!encryptionKey || typeof token !== "string" || token.length > 1200) return null;
  const [ivText, encryptedText, tagText, ...extra] = token.split(".");
  if (extra.length || !ivText || !encryptedText || !tagText) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    const raw = Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
    const payload = JSON.parse(raw) as SelectionPayload;
    if (payload.version !== TOKEN_VERSION || typeof payload.activityId !== "string" || !payload.activityId || !Number.isSafeInteger(payload.expiresAt) || payload.expiresAt <= now) return null;
    return payload.activityId;
  } catch {
    return null;
  }
}
