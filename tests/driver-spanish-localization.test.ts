import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { localizeDriverNotification } from "../client/src/lib/driverNotificationLocalization";
import { translate, translateMaterialCatalogLabel, translations } from "../client/src/lib/i18n";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const es = (key: string, values?: Record<string, string | number>) => translate(key, "es", values);

test("approved catalog labels localize without changing stored material identity", async () => {
  const material = { slug: "concrete-washout", displayName: "Concrete Washout" };
  assert.equal(translateMaterialCatalogLabel(material, (key) => translate(key, "en")), "Concrete Washout");
  assert.equal(translateMaterialCatalogLabel(material, (key) => translate(key, "es")), "Lavado de concreto");
  assert.equal(material.slug, "concrete-washout");
  assert.equal(material.displayName, "Concrete Washout");
  const migration = await source("migrations/0033_add_facility_material_management.sql");
  assert.match(migration, /\('concrete-washout', 'Concrete Washout'/);
  const selector = await source("client/src/components/driver/DriverMaterialIntentSelector.tsx");
  assert.match(selector, /translateMaterialCatalogLabel/);
  assert.match(selector, /save\.mutate\(material\.slug\)/);
});

test("authenticated Driver shell keeps Spanish metadata, loading, and logout copy aligned", async () => {
  const [app, header, dashboard, profile] = await Promise.all([
    source("client/src/App.tsx"),
    source("client/src/components/DriverHeader.tsx"),
    source("client/src/pages/driver/dashboard.tsx"),
    source("client/src/pages/driver/profile.tsx"),
  ]);
  assert.match(app, /<LanguageDocumentMetadata \/>/);
  assert.match(app, /t\("common\.loadingView"\)/);
  assert.match(app, /<Route path="\/dashboard" component=\{DriverDashboard\} \/>/);
  assert.match(header, /label=\{t\("common\.logout"\)\}/);
  assert.match(dashboard, /formatLocalizedDate\(/);
  assert.match(dashboard, /language === "es" \? es : undefined/);
  assert.match(dashboard, /localizeDriverNotification\(notification, language, t\)/);
  assert.match(profile, /formatLocalizedDate\(termsStatus\.agreedAt, language\)/);
  assert.equal(es("common.logout"), "Cerrar sesión");
  assert.equal(es("common.loadingView"), "Cargando vista");
  assert.equal(es("driver.payout.onboardingComplete"), "Configuración inicial completa:");
});

test("mobile install prompt is localized while install behavior is preserved", async () => {
  const prompt = await source("client/src/components/InstallPrompt.tsx");
  assert.match(prompt, /useLanguage\(\)/);
  assert.match(prompt, /await install\(\)/);
  assert.match(prompt, /markInstallPromptHandledThisSession\(\)/);
  for (const phrase of ["Add CreteXchange to Your Phone", "To install on iPhone/iPad", "Add to Home Screen", "Not Now"]) {
    assert.doesNotMatch(prompt, new RegExp(`>${phrase}<|"${phrase}"`));
  }
  assert.equal(es("install.addHome"), "Agregar a pantalla de inicio");
  assert.equal(es("install.dismissAria"), "Cerrar indicaciones de instalación");
});

test("Message Center routes visible copy through localization and preserves user-authored bodies", async () => {
  const [page, app, nav] = await Promise.all([
    source("client/src/pages/driver/notifications.tsx"),
    source("client/src/App.tsx"),
    source("client/src/components/MobileNav.tsx"),
  ]);
  assert.match(page, /localizeDriverNotification/);
  assert.match(page, /locale: language === "es"/);
  assert.match(app, /path="\/messages" component=\{DriverNotifications\}/);
  assert.match(nav, /path: "\/messages".*nav\.messages/);
  for (const phrase of ["Message Center", "Mark all read", "No messages yet", "Mark read"]) {
    assert.doesNotMatch(page, new RegExp(`>${phrase}<|"${phrase}"`));
  }
  const system = localizeDriverNotification({ title: "Bank Account Connected", message: "Your bank account has been successfully connected and verified. You can now receive payments!", type: "success" }, "es", es);
  assert.equal(system.title, "Cuenta bancaria conectada");
  const authored = localizeDriverNotification({ title: "Custom", message: "Keep this exact body", type: "custom" }, "es", es);
  assert.equal(authored.message, "Keep this exact body");
});

test("Wallet uses localized display copy and keeps financial endpoints and fail-closed controls unchanged", async () => {
  const [wallet, app, policy] = await Promise.all([
    source("client/src/pages/driver/wallet.tsx"),
    source("client/src/App.tsx"),
    source("server/financialExecutionPolicy.ts"),
  ]);
  assert.match(app, /path="\/wallet" component=\{DriverWallet\}/);
  assert.match(app, /path="\/billing" component=\{LegacyDriverBillingRedirect\}/);
  assert.match(app, /setLocation\("\/wallet", \{ replace: true \}\)/);
  assert.match(wallet, /POST", "\/api\/wallet\/withdraw"/);
  assert.match(policy, /FINANCIAL_EXECUTION_ENABLED/);
  for (const phrase of ["My Wallet", "Wallet Balance", "Payment Account Status", "Request Withdrawal", "Transaction History"]) {
    assert.doesNotMatch(wallet, new RegExp(`>${phrase}<|"${phrase}"`));
  }
  assert.equal(es("wallet.title"), "Mi billetera");
  assert.equal(es("wallet.transactions"), "Historial de transacciones");
});

test("Rewards page is fully routed through bilingual localization without calculation changes", async () => {
  const rewards = await source("client/src/pages/driver/rewards.tsx");
  assert.match(rewards, /useLanguage\(\)/);
  assert.match(rewards, /localizeDriverNotification/);
  assert.match(rewards, /entriesEarned \|\| 0/);
  assert.match(rewards, /lotteryStatusData\?\.driverEntryCount/);
  for (const phrase of ["Driver Rewards", "Rewards Center", "Current Entries", "Drawing history", "Ticket ledger", "Prize Fulfillment Status", "Ticket details"]) {
    assert.doesNotMatch(rewards, new RegExp(`>${phrase}<|"${phrase}"`));
  }
  assert.equal(es("rewards.center"), "Centro de recompensas");
  assert.equal(es("rewards.ticketLedger"), "Registro de entradas");
});

test("Driver remediation translation namespaces have English and Spanish key parity", () => {
  for (const prefix of ["material.catalog.", "material.category.", "install.", "messages.", "wallet.", "rewards."]) {
    const english = Object.keys(translations.en).filter((key) => key.startsWith(prefix)).sort();
    const spanish = Object.keys(translations.es).filter((key) => key.startsWith(prefix)).sort();
    assert.deepEqual(spanish, english, `${prefix} key mismatch`);
    assert.ok(english.length > 0, `${prefix} must not be empty`);
  }
});

test("PWA publication checks compare the built client SHA with the active deployment", async () => {
  const [hook, serviceWorker, vite, routes] = await Promise.all([
    source("client/src/hooks/usePWAInstall.ts"),
    source("client/public/sw.js"),
    source("vite.config.ts"),
    source("server/routes.ts"),
  ]);
  assert.match(serviceWorker, /CACHE_VERSION = 'cx-v6'/);
  assert.match(vite, /RAILWAY_GIT_COMMIT_SHA/);
  assert.match(vite, /VITE_APP_COMMIT_SHA/);
  assert.match(hook, /fetch\("\/api\/version", \{ cache: "no-store"/);
  assert.match(hook, /registration\?\.update\(\)/);
  assert.match(hook, /isNewDeploymentAvailable\(CLIENT_APP_COMMIT_SHA, version\.commitSha\)/);
  assert.match(routes, /commitSha: activeDeploymentCommit\(\)/);
  assert.match(routes, /Cache-Control', 'no-store'/);
});
