import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);

function source(path: string) {
  return readFileSync(new URL(path, root), "utf8");
}

test("landing keeps the approved primary hero fully visible outside the legacy graphic card", () => {
  const landing = source("client/src/pages/landing.tsx");

  assert.match(landing, /CRETEXCHANGE_BRAND\.primaryHero/);
  assert.match(landing, /data-testid="landing-primary-hero-logo"/);
  assert.match(landing, /className="h-auto w-full object-contain"/);
  assert.doesNotMatch(landing, /landing-primary-hero-logo[\s\S]{0,300}object-cover/);
  assert.doesNotMatch(landing, /min-h-56[\s\S]{0,800}object-cover/);
});

test("shared header logo assigns corporate and compact artwork to their responsive surfaces", () => {
  const headerLogo = source("client/src/components/BrandHeaderLogo.tsx");

  assert.match(headerLogo, /corporateLogo: "\/brand\/cretexchange-corporate-horizontal-logo\.png"/);
  assert.match(headerLogo, /compactMark: "\/brand\/cretexchange-cx-mark\.png"/);
  assert.match(headerLogo, /hidden w-auto object-contain sm:block/);
  assert.match(headerLogo, /w-auto object-contain sm:hidden/);
  assert.doesNotMatch(headerLogo, /app-icon-1024/);
});

test("public, driver, owner, and admin headers share the approved brand header component", () => {
  const headers = [
    "client/src/components/PublicHeader.tsx",
    "client/src/components/DriverHeader.tsx",
    "client/src/components/OwnerHeader.tsx",
    "client/src/pages/admin/dashboard.tsx",
  ];

  for (const path of headers) {
    const file = source(path);
    assert.match(file, /import \{ BrandHeaderLogo \} from "@\/components\/BrandHeaderLogo"/);
    assert.match(file, /<BrandHeaderLogo/);
    assert.doesNotMatch(file, /@assets\/cretexchange-logo/);
    assert.doesNotMatch(file, /brand-frame/);
  }

  assert.doesNotMatch(source("client/src/index.css"), /\.brand-frame\s*\{/);
});

test("browser favicon and installed application icon use their distinct approved roles", () => {
  const index = source("client/index.html");
  const manifest = JSON.parse(source("client/public/manifest.json")) as { icons: Array<{ src: string; purpose: string }> };
  const serviceWorker = source("client/public/sw.js");

  for (const href of ["/favicon.ico", "/favicon-16x16.png", "/favicon-32x32.png", "/favicon-48x48.png"]) {
    assert.match(index, new RegExp(href.replace(/[./-]/g, "\\$&")));
  }
  assert.match(index, /apple-touch-icon" sizes="180x180" href="\/icons\/icon-180x180\.png"/);
  assert.ok(manifest.icons.some((icon) => icon.src === "/brand/cretexchange-app-icon-1024.png" && icon.purpose === "maskable"));
  assert.match(serviceWorker, /CACHE_VERSION = 'cx-v6'/);

  for (const path of [
    "client/public/favicon.ico",
    "client/public/favicon-16x16.png",
    "client/public/favicon-32x32.png",
    "client/public/favicon-48x48.png",
    "client/public/icons/icon-180x180.png",
    "client/public/icons/icon-192x192.png",
    "client/public/icons/icon-512x512.png",
  ]) {
    assert.ok(existsSync(new URL(path, root)), `${path} must exist`);
  }
});
