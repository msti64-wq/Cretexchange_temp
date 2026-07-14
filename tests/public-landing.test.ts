import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  LANGUAGE_STORAGE_KEY,
  readStoredLanguage,
  setStoredLanguage,
  translations,
  translate,
  type LanguageStorage,
} from "../client/src/lib/i18n";
import { synchronizeDocumentLanguage } from "../client/src/components/LanguageDocumentMetadata";
import { PUBLIC_LANDING_ROUTES, PUBLIC_LANDING_TRANSLATION_KEYS } from "../client/src/lib/publicLanding";

function createLanguageStorage(initialValues: Record<string, string> = {}) {
  const values = new Map<string, string>(Object.entries(initialValues));
  const storage: LanguageStorage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };

  return { storage, values };
}

test("public landing content resolves in English and Spanish without raw keys", () => {
  for (const language of ["en", "es"] as const) {
    for (const key of PUBLIC_LANDING_TRANSLATION_KEYS) {
      const value = translate(key, language);
      assert.notEqual(value, key);
      assert.ok(value.trim().length > 0);
    }
  }

  assert.equal(translations.en["public.hero.headline"], "Connecting Construction Through Verified Material Recovery");
});

test("public landing uses the approved existing registration and navigation routes", () => {
  assert.equal(PUBLIC_LANDING_ROUTES.driverRegistration, "/register/driver");
  assert.equal(PUBLIC_LANDING_ROUTES.facilityRegistration, "/register/owner");
  assert.equal(PUBLIC_LANDING_ROUTES.login, "/login");
  assert.equal(PUBLIC_LANDING_ROUTES.valuePropositionAnchor, "#value-proposition");
});

test("public landing foundation avoids legacy payment and settlement marketing", () => {
  const publicCopy = PUBLIC_LANDING_TRANSLATION_KEYS
    .flatMap((key) => [translations.en[key], translations.es[key]])
    .join(" ");

  assert.doesNotMatch(publicCopy, /earn money|rate|weekly payment|payment processing|settlement|stripe|wallet/i);
});

test("landing source has one page-level heading and semantic route CTAs", () => {
  const source = readFileSync(new URL("../client/src/pages/landing.tsx", import.meta.url), "utf8");

  assert.match(source, /<h1[\s>]/);
  assert.equal((source.match(/<h1[\s>]/g) ?? []).length, 1);
  assert.match(source, /<Link href=\{PUBLIC_LANDING_ROUTES\.driverRegistration\}/);
  assert.match(source, /<Link href=\{PUBLIC_LANDING_ROUTES\.facilityRegistration\}/);
  assert.match(source, /<a href=\{PUBLIC_LANDING_ROUTES\.valuePropositionAnchor\}/);
  assert.doesNotMatch(source, /onClick=\{\(\) => setSelectedRole/);
});

test("saved language preference defaults safely and preserves supported values", () => {
  assert.equal(readStoredLanguage(createLanguageStorage().storage), "en");
  assert.equal(readStoredLanguage(createLanguageStorage({ [LANGUAGE_STORAGE_KEY]: "en" }).storage), "en");
  assert.equal(readStoredLanguage(createLanguageStorage({ [LANGUAGE_STORAGE_KEY]: "es" }).storage), "es");
  assert.equal(readStoredLanguage(createLanguageStorage({ [LANGUAGE_STORAGE_KEY]: "fr" }).storage), "en");
});

test("setting saved language writes supported values and storage failures stay safe", () => {
  const { storage, values } = createLanguageStorage();
  setStoredLanguage("en", storage);
  assert.equal(values.get(LANGUAGE_STORAGE_KEY), "en");
  setStoredLanguage("es", storage);
  assert.equal(values.get(LANGUAGE_STORAGE_KEY), "es");

  const unavailableStorage: LanguageStorage = {
    getItem() { throw new Error("storage unavailable"); },
    setItem() { throw new Error("storage unavailable"); },
  };
  assert.equal(readStoredLanguage(unavailableStorage), "en");
  assert.doesNotThrow(() => setStoredLanguage("es", unavailableStorage));
});

test("LanguageDocumentMetadata writes valid document language metadata as the active language changes", () => {
  const documentElement = { lang: "en" } as Pick<HTMLElement, "lang">;

  synchronizeDocumentLanguage("en", documentElement);
  assert.equal(documentElement.lang, "en");
  synchronizeDocumentLanguage("es", documentElement);
  assert.equal(documentElement.lang, "es");

  // The component has no cleanup because the last valid language remains safe after Landing unmounts.
  assert.match(
    readFileSync(new URL("../client/src/components/LanguageDocumentMetadata.tsx", import.meta.url), "utf8"),
    /synchronizeDocumentLanguage\(language\)/,
  );
  assert.equal(documentElement.lang, "es");
});
