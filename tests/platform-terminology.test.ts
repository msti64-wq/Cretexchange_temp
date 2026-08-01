import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { translations, translate } from "../client/src/lib/i18n";
import { DRIVER_ACHIEVEMENT_DEFINITIONS } from "../server/driverAchievements";
import { DRIVER_REPORT_COLUMNS, OWNER_REPORT_COLUMNS } from "../shared/reportColumns";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("English and Spanish workflow terminology uses recovery language", () => {
  const expectations = [
    ["common.washouts", "Recovery Activities", "Actividades de recuperación"],
    ["driver.dashboard.findLocationHelp", "Search nearby recovery facilities", "Busca instalaciones de recuperación cercanas"],
    ["driver.washout.complete", "Submit Recovery Activity", "Enviar actividad de recuperación"],
    ["driver.activity.totalWashouts", "Total Recovery Activities", "Actividades de recuperación totales"],
    ["owner.locations.manageWashoutSites", "Manage recovery facilities", "Gestionar instalaciones de recuperación"],
    ["owner.dashboard.washoutStatusMix", "Recovery Activity Status Mix", "Resumen de estado de actividades de recuperación"],
    ["competition.verified", "Verified activities", "Actividades verificadas"],
    ["driver.intelligence.recoveryHistory", "Recovery history", "Historial de recuperación"],
    ["driver.intelligence.achievements", "Achievements", "Logros"],
  ] as const;

  for (const [key, english, spanish] of expectations) {
    assert.equal(translate(key, "en"), english);
    assert.equal(translate(key, "es"), spanish);
    assert.notEqual(translations.en[key], key);
    assert.notEqual(translations.es[key], key);
  }
});

test("material classifications remain exact business-data values", async () => {
  const fixtures = `${await source("tests/driver-material-intent.test.ts")}${await source("tests/facility-materials.test.ts")}`;
  for (const material of ["Concrete Washout", "Aggregate", "Special Aggregate"]) {
    assert.match(fixtures, new RegExp(material));
  }
  assert.match(fixtures, /slug: "concrete-washout", displayName: "Concrete Washout"/);
});

test("report, CSV, dashboard, intelligence, competition, and achievement labels are modernized", async () => {
  for (const columns of [DRIVER_REPORT_COLUMNS, OWNER_REPORT_COLUMNS]) {
    assert.deepEqual(columns.filter((column) => ["checkInTime", "washoutId", "washoutStatus"].includes(column.key)).map((column) => column.label), [
      "Recovery Activity Date/Time",
      "Recovery Activity ID",
      "Recovery Verification Status",
    ]);
  }

  const visibleSources = await Promise.all([
    source("client/src/lib/reportExport.ts"),
    source("client/src/components/ReportExplorer.tsx"),
    source("client/src/components/PhotoModal.tsx"),
    source("client/src/components/driver/DriverIntelligenceSummary.tsx"),
    source("client/src/pages/driver/reports.tsx"),
    source("client/src/pages/owner/facility-intelligence.tsx"),
    source("client/src/pages/admin/reports.tsx"),
    source("client/src/pages/admin/locations.tsx"),
    source("client/src/pages/admin/network-intelligence.tsx"),
    source("client/index.html"),
  ]);
  const visible = visibleSources.join("\n");
  for (const required of ["Recovery Activities", "Recovery Verification", "Recovery Evidence", "Material Recovery", "Recovery Facilities"]) {
    assert.match(visible, new RegExp(required, "i"));
  }
  assert.doesNotMatch(visible, />\s*Washouts?\b|"Washout (?:Status|Location|Report|Verification|Photos?)/i);
  assert.ok(DRIVER_ACHIEVEMENT_DEFINITIONS.every((definition) => !/washouts?/i.test(`${definition.name} ${definition.description} ${definition.unit}`)));
});

test("browser metadata positions the multi-material recovery platform", async () => {
  const html = await source("client/index.html");
  assert.match(html, /Construction Materials Recovery Platform/);
  assert.match(html, /construction material recovery activity and intelligence/);
  assert.doesNotMatch(html, /Concrete Washout Location Management|manage washout services/i);
});

test("Driver Intelligence and achievements route visible copy through bilingual localization", async () => {
  const component = await source("client/src/components/driver/DriverIntelligenceSummary.tsx");
  assert.match(component, /useLanguage\(\)/);
  for (const phrase of ["Your operational performance", "Recovery history", "Next achievement", "Facility insights", "Activity trends"]) {
    assert.doesNotMatch(component, new RegExp(`>${phrase}<|\"${phrase}\"`));
  }
  const englishKeys = Object.keys(translations.en).filter((key) => key.startsWith("driver.intelligence.")).sort();
  const spanishKeys = Object.keys(translations.es).filter((key) => key.startsWith("driver.intelligence.")).sort();
  assert.deepEqual(spanishKeys, englishKeys);
  assert.ok(englishKeys.length >= 70);
});

test("Driver Dashboard operational cards do not leak hard-coded English into Spanish mode", async () => {
  const dashboard = await source("client/src/pages/driver/dashboard.tsx");
  for (const phrase of ["Unread Notifications", "Stay on top of updates", "Rewards Summary", "Monthly ticket progress", "Current Month Entries", "Location Intelligence", "Nearest suitable stop"]) {
    assert.doesNotMatch(dashboard, new RegExp(`>${phrase}<|"${phrase}"`));
  }
  const englishKeys = Object.keys(translations.en).filter((key) => key.startsWith("driver.dashboard.")).sort();
  const spanishKeys = Object.keys(translations.es).filter((key) => key.startsWith("driver.dashboard.")).sort();
  assert.deepEqual(spanishKeys, englishKeys);
});

test("stable internal identifiers, routes, schema, analytics events, and financial isolation remain intact", async () => {
  const [schema, routes, analytics, policy] = await Promise.all([
    source("shared/schema.ts"),
    source("server/routes.ts"),
    source("server/platformAnalytics.ts"),
    source("server/financialExecutionPolicy.ts"),
  ]);
  assert.match(schema, /pgTable\("washout_activities"/);
  assert.match(schema, /pgTable\("washout_locations"/);
  assert.match(routes, /"\/api\/washout-photos"/);
  assert.match(analytics, /"activity\.verified"/);
  assert.match(analytics, /sourceOperationalTables: \["washout_activities"/);
  assert.match(policy, /FINANCIAL_EXECUTION_ENABLED/);
  assert.match(policy, /financial_execution_disabled/);
});

test("terminology standard records the identifier collision and all governing rules", async () => {
  const [standard, index] = await Promise.all([
    source("docs/standards/CTX-STD-003-product-terminology-standard.md"),
    source("docs/README.md"),
  ]);
  for (const heading of [
    "Platform-positioning language", "Canonical Facility terms", "Canonical activity terms",
    "Canonical reporting terms", "Canonical intelligence terms", "Material-type exception",
    "Concrete Washout preservation rule", "Internal-identifier preservation rule",
    "Legal, regulatory, and quoted terminology rule", "Driver-language simplicity rule",
    "English and Spanish terminology mapping", "Correct and incorrect usage",
  ]) assert.match(standard, new RegExp(heading, "i"));
  assert.match(standard, /CTX-STD-002 \(unavailable/);
  assert.match(index, /CTX-STD-003-product-terminology-standard/);
});
