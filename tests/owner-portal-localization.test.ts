import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readStoredLanguage, setStoredLanguage, translate, translations } from "../client/src/lib/i18n";

const ownerRoutes = [
  "dashboard.tsx",
  "locations.tsx",
  "drivers.tsx",
  "payments.tsx",
  "wallet.tsx",
  "notifications.tsx",
  "profile.tsx",
  "payment-methods.tsx",
  "reports.tsx",
  "subscribe.tsx",
];

test("Owner Portal routes use the shared language hook", () => {
  for (const route of ownerRoutes) {
    const source = readFileSync(new URL(`../client/src/pages/owner/${route}`, import.meta.url), "utf8");
    assert.match(source, /useLanguage/, `${route} must use the shared Owner Portal language state`);
  }
});

test("English and Spanish translation keys remain aligned for the Owner Portal", () => {
  const ownerOrCommonKey = (key: string) => key.startsWith("owner.") || key.startsWith("common.") || key.startsWith("header.");
  const english = Object.keys(translations.en).filter(ownerOrCommonKey).sort();
  const spanish = Object.keys(translations.es).filter(ownerOrCommonKey).sort();
  assert.deepEqual(spanish, english);
});

test("shared language selection persists for navigation and refresh", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  setStoredLanguage("es", storage);
  assert.equal(readStoredLanguage(storage), "es");
  assert.equal(translate("owner.notifications.title", readStoredLanguage(storage)), "Notificaciones");
});

test("owner status and pluralized count labels are localized without changing canonical values", () => {
  assert.equal(translate("owner.drivers.locationCount", "es", { count: 1 }), "1 ubicación");
  assert.equal(translate("owner.drivers.locationCount_plural", "es", { count: 2 }), "2 ubicaciones");
  assert.equal(translate("common.pending", "es"), "Pendiente");
  assert.equal(translate("common.approved", "es"), "Aprobado");
});

test("owner-facing localization does not introduce raw common English headings", () => {
  const files = ["drivers.tsx", "payments.tsx", "reports.tsx", "wallet.tsx", "notifications.tsx"];
  for (const file of files) {
    const source = readFileSync(new URL(`../client/src/pages/owner/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, />\s*(Owner Reports|Wallet Dashboard|Payment Account|Notifications|Driver Activity)\s*</, file);
  }
});
