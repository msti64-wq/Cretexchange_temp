import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import test from "node:test";

import { COMPANY_IDENTITY } from "../shared/companyIdentity";
import { translations, translate } from "../client/src/lib/i18n";

const root = new URL("../", import.meta.url);

function source(path: string) {
  return readFileSync(new URL(path, root), "utf8");
}

const ignoredRepositoryDirectories = new Set([
  ".git",
  "coverage",
  "dist",
  "node_modules",
]);

const textExtensions = new Set([
  ".cjs",
  ".css",
  ".env",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sql",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

function repositoryTextFiles(directory = new URL(".", root)): string[] {
  const directoryPath = directory.pathname;
  const files: string[] = [];

  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredRepositoryDirectories.has(entry.name)) {
        files.push(...repositoryTextFiles(new URL(`${entry.name}/`, directory)));
      }
      continue;
    }

    if (entry.isFile() && textExtensions.has(extname(entry.name))) {
      files.push(join(directoryPath, entry.name));
    }
  }

  return files;
}

test("governed company identity exposes exact legal and trade-name forms", () => {
  assert.deepEqual(COMPANY_IDENTITY, {
    legalName: "V8 Industries LLC",
    tradeName: "V8 Labs",
    publicIdentity: "V8 Industries LLC (dba V8 Labs)",
  });
});

test("public English and Spanish presentation preserves the legal entity and trade name", () => {
  for (const language of ["en", "es"] as const) {
    const copyright = translate("public.footer.copyright", language, {
      year: 2026,
      company: COMPANY_IDENTITY.publicIdentity,
    });

    assert.match(copyright, /V8 Industries LLC \(dba V8 Labs\)/);
    assert.doesNotMatch(copyright, /\{\{company\}\}/);
  }

  assert.match(translations.en["public.footer.copyright"], /\{\{company\}\}/);
  assert.match(translations.es["public.footer.copyright"], /\{\{company\}\}/);
  assert.match(source("client/src/pages/landing.tsx"), /COMPANY_IDENTITY\.publicIdentity/);
  assert.match(source("client/src/pages/privacy-policy.tsx"), /COMPANY_IDENTITY\.publicIdentity/);
});

test("current branded brochure uses the public identity while preserving the reviewed external URL", () => {
  const brochure = source("client/public/owner-brochure.html");

  assert.match(brochure, /V8 Industries LLC \(dba V8 Labs\)/);
  assert.match(brochure, /www\.v8laboratories\.com\/cretexchange/);
  assert.doesNotMatch(brochure, /\bV8 Industries\.(?:\s|&nbsp;)/);
});

test("accepted legal-document versions remain unchanged and contain no former entity name", () => {
  const legalDocuments = source("shared/legalDocuments.ts");

  assert.match(legalDocuments, /const LEGAL_VERSION_DATE = "2026-06-12"/);
  assert.doesNotMatch(legalDocuments, /B8\s+(?:Laborator(?:y|ies)|Labs?)|V8\s+Laborator(?:y|ies)/i);
});

test("retired entity names are absent from repository operative and governed text", () => {
  const retiredEntityName = /B8\s+(?:Laborator(?:y|ies)|Labs?)|V8\s+Laborator(?:y|ies)/i;
  const matches = repositoryTextFiles()
    .filter((file) => retiredEntityName.test(readFileSync(file, "utf8")))
    .map((file) => relative(root.pathname, file));

  assert.deepEqual(matches, []);
});

test("protected external URLs and the retained historical artifact remain unchanged", () => {
  const protectedUrlFiles = [
    "attached_assets/cretexchange_owner-brochure_2_1777326386708.html",
    "client/public/driver-business-card.html",
    "client/public/owner-brochure-1page.html",
    "client/public/owner-brochure.html",
  ];
  const protectedUrlCount = protectedUrlFiles.reduce((count, path) => (
    count + (source(path).match(/(?:www\.)?v8laboratories\.com\/cretexchange/g) || []).length
  ), 0);

  assert.equal(protectedUrlCount, 7);
  assert.match(
    source("attached_assets/cretexchange_owner-brochure_2_1777326386708.html"),
    /\bV8 Industries\b/,
  );
});
