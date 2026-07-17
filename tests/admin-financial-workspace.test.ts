import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  batchStateDescription,
  extractFinancialWorkspaceItems,
  financialWorkspaceErrorKind,
  formatFinancialWorkspaceAge,
  formatFinancialWorkspaceCents,
  financialWorkspaceAuditEventLabel,
  isPlatformOperationsRole,
  normalizeFinancialWorkspacePeriodAnchor,
  normalizeFinancialWorkspaceReference,
  workspaceBatchActions,
  workspaceBatchStateLabel,
} from "../client/src/lib/adminFinancialWorkspace";
import { translate, translations } from "../client/src/lib/i18n";

test("financial workspace uses only the canonical non-executing lifecycle actions", () => {
  assert.deepEqual(workspaceBatchActions("draft"), ["move_to_review", "cancel"]);
  assert.deepEqual(workspaceBatchActions("ready_for_review"), ["approve", "cancel"]);
  assert.deepEqual(workspaceBatchActions("approved"), ["cancel"]);
  assert.deepEqual(workspaceBatchActions("cancelled"), []);
  assert.deepEqual(workspaceBatchActions("unknown"), []);
  assert.equal(workspaceBatchStateLabel("ready_for_review"), "Ready for Review");
  assert.match(batchStateDescription("approved"), /Not executed, charged, paid, or settled/i);
  assert.equal(financialWorkspaceAuditEventLabel("draft_created"), "Created");
  assert.equal(financialWorkspaceAuditEventLabel("membership_released"), "Membership Released");
  assert.equal(financialWorkspaceAuditEventLabel("unknown"), "Unavailable");
});

test("financial workspace preserves unavailable values rather than inventing financial totals or ages", () => {
  assert.equal(formatFinancialWorkspaceCents(1250), "$12.50");
  assert.equal(formatFinancialWorkspaceCents(-1), "Unavailable");
  assert.equal(formatFinancialWorkspaceCents("12.50"), "Unavailable");
  assert.match(formatFinancialWorkspaceAge(60), /1 minute ago/);
  assert.match(formatFinancialWorkspaceAge(60, "Unavailable", "es-US"), /hace 1 minuto/);
  assert.equal(formatFinancialWorkspaceAge(null), "Unavailable");
  assert.equal(formatFinancialWorkspaceAge(-1), "Unavailable");
});

test("temporary assisted-pilot references are normalized, bounded, and never treated as authority", () => {
  assert.equal(normalizeFinancialWorkspaceReference("  activity_123  "), "activity_123");
  assert.equal(normalizeFinancialWorkspaceReference("facility-123"), "facility-123");
  assert.equal(normalizeFinancialWorkspaceReference(""), null);
  assert.equal(normalizeFinancialWorkspaceReference("contains spaces"), null);
  assert.equal(normalizeFinancialWorkspaceReference("bad/reference"), null);
  assert.equal(normalizeFinancialWorkspaceReference("x".repeat(129)), null);
  assert.equal(normalizeFinancialWorkspacePeriodAnchor("2026-07-12"), "2026-07-12");
  assert.equal(normalizeFinancialWorkspacePeriodAnchor("2026-02-30"), null);
  assert.equal(normalizeFinancialWorkspacePeriodAnchor("2026-07-12T00:00:00.000Z"), null);
  assert.equal(financialWorkspaceErrorKind(new Error("backend detail"), true), "reference");
  assert.equal(financialWorkspaceErrorKind(new Error("409 conflict")), "conflict");
  assert.equal(financialWorkspaceErrorKind(new Error("503 unavailable")), "unavailable");
});

test("financial workspace allows only Platform Operations roles and safely handles source shape failures", () => {
  assert.equal(isPlatformOperationsRole("admin"), true);
  assert.equal(isPlatformOperationsRole("super_admin"), true);
  assert.equal(isPlatformOperationsRole("driver"), false);
  assert.equal(isPlatformOperationsRole("owner"), false);
  assert.equal(isPlatformOperationsRole("support"), false);
  assert.equal(isPlatformOperationsRole(null), false);
  assert.deepEqual(extractFinancialWorkspaceItems({ items: [{ reference: "safe" }] }), [{ reference: "safe" }]);
  assert.equal(extractFinancialWorkspaceItems({ items: "not-an-array" }), null);
  assert.equal(extractFinancialWorkspaceItems(null), null);
});

test("workspace translations have complete English and Spanish operational equivalents", () => {
  const keys = [
    "financialWorkspace.title",
    "financialWorkspace.temporary.notice",
    "financialWorkspace.action.createVerifiedObligation",
    "financialWorkspace.obligation.type",
    "financialWorkspace.reasonCategory",
    "financialWorkspace.summary.title",
    "financialWorkspace.unavailableCanonical",
    "financialWorkspace.validation.previewUnavailable",
    "financialWorkspace.validation.auditSchemaUnavailable",
    "financialWorkspace.auditSchemaUnavailable",
    "financialWorkspace.action.createDraft",
    "financialWorkspace.action.review",
    "financialWorkspace.action.approve",
    "financialWorkspace.action.cancel",
    "financialWorkspace.approved.description",
    "financialWorkspace.success.approved",
    "financialWorkspace.action.cancelNonExecuted",
    "financialWorkspace.state.membership_released",
    "financialWorkspace.error.generic",
    "financialWorkspace.preview.unavailable",
    "financialWorkspace.preview.retry",
  ];
  for (const key of keys) {
    assert.ok(translations.en[key], `English ${key} is present`);
    assert.ok(translations.es[key], `Spanish ${key} is present`);
    assert.notEqual(translate(key, "es"), key);
  }
  assert.match(translate("financialWorkspace.approved.description", "en"), /Not executed\. Not charged\. Not paid\. Not settled\./);
  assert.match(translate("financialWorkspace.approved.description", "es"), /No ejecutado\. No cobrado\. No pagado\. No liquidado\./);
  assert.match(translate("financialWorkspace.success.approved", "en"), /Not executed\. Not charged\. Not paid\. Not settled\./);
  assert.match(translate("financialWorkspace.label.facilityTotal", "es"), /Cargo de la instalación/);
});

test("workspace page renders localized discovery, empty, unavailable, detail, responsive, and accessible contracts", async () => {
  const source = await readFile(new URL("../client/src/pages/admin/financial-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /useLanguage\(\)/);
  assert.match(source, /financialWorkspace\.missing\.title/);
  assert.match(source, /financialWorkspace\.unbatched\.title/);
  assert.match(source, /financialWorkspace\.exceptions\.title/);
  assert.match(source, /state="draft"/);
  assert.match(source, /state="ready_for_review"/);
  assert.match(source, /state="approved"/);
  assert.match(source, /state="cancelled"/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /role="alert"/);
  assert.match(source, /aria-invalid/);
  assert.match(source, /aria-describedby/);
  assert.match(source, /max-h-\[90vh\] overflow-y-auto/);
  assert.match(source, /grid gap-3 lg:grid-cols-2/);
  assert.match(source, /overflow-x-auto/);
  assert.match(source, /financialWorkspace\.auditTimeline/);
  assert.match(source, /financialWorkspace\.memberships/);
  assert.match(source, /financialWorkspace\.detailExceptions/);
  assert.match(source, /stateKey\(batch\.state\)/);
  assert.equal(/stripe|treasury|process-batch|process-payout|scheduler|reconciliation|wallet/i.test(source), false);
});

test("missing-obligation dialog preserves an administrator escape path when a preview fails", async () => {
  const source = await readFile(new URL("../client/src/pages/admin/financial-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /financialWorkspace\.preview\.unavailable/);
  assert.match(source, /financialWorkspace\.preview\.retry/);
  assert.match(source, /onRetryPreview/);
  assert.match(source, /obligationPreview\.refetch/);
  assert.match(source, /onEscapeKeyDown/);
  assert.match(source, /onInteractOutside/);
  assert.match(source, /financialWorkspace\.action\.cancel/);
  assert.match(source, /role="alert" aria-live="assertive"/);
});

test("workspace keeps preview available while fail-closing creation without verified audit storage", async () => {
  const source = await readFile(new URL("../client/src/pages/admin/financial-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /financial-workspace\/capabilities/);
  assert.match(source, /creationAvailable/);
  assert.match(source, /financialWorkspace\.auditSchemaUnavailable/);
  assert.match(source, /financialWorkspace\.validation\.auditSchemaUnavailable/);
  assert.match(source, /role="alert"/);
});

test("workspace page limits network access to canonical discovery and lifecycle routes", async () => {
  const source = await readFile(new URL("../client/src/pages/admin/financial-workspace.tsx", import.meta.url), "utf8");
  for (const endpoint of [
    "/api/admin/financial-obligations/missing",
    "/api/admin/financial-obligations/unbatched",
    "/api/admin/financial-obligations/exceptions",
    "/api/admin/financial-obligations/create",
    "/api/admin/financial-obligations/preview",
    "/api/admin/financial-workspace/summary",
    "/api/admin/financial-batches",
    "ready-for-review",
  ]) assert.match(source, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(/api\/payments|api\/driver|api\/stripe|api\/treasury/i.test(source), false);
});

test("workspace keeps manual references request-local and maps backend failures to safe localized messages", async () => {
  const source = await readFile(new URL("../client/src/pages/admin/financial-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /Temporary assisted-pilot reference entry|financialWorkspace\.temporary\.title/);
  assert.match(source, /autoComplete="off"/);
  assert.match(source, /normalizeFinancialWorkspaceReference/);
  assert.match(source, /financialWorkspaceErrorKind/);
  assert.match(source, /financialWorkspace\.error\.\$\{/);
  assert.match(source, /normalizeFinancialWorkspacePeriodAnchor/);
  assert.match(source, /financialWorkspace\.validation\.periodInvalid/);
  assert.match(source, /financialWorkspace\.validation\.referenceInvalid/);
  assert.doesNotMatch(source, /description:\s*error\.message/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\.|window\.location/);
});

test("PD-054 workspace creation is selected-record only, fixed-type, bilingual, and non-executing", async () => {
  const source = await readFile(new URL("../client/src/pages/admin/financial-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /selectionToken/);
  assert.match(source, /missing_canonical_obligation/);
  assert.match(source, /financialWorkspace\.componentExplanation/);
  assert.match(source, /financialWorkspace\.summary\.approved/);
  assert.match(source, /financialWorkspace\.validation\.previewUnavailable/);
  assert.doesNotMatch(source, /activities\/\$\{encodeURIComponent\(reference/);
  assert.match(translate("financialWorkspace.action.createVerifiedObligation", "es"), /actividad verificada/i);
  assert.match(translate("financialWorkspace.unavailableCanonical", "en"), /canonical/i);
});

test("workspace guards denied queries and makes approved lifecycle feedback and cancellation non-executing", async () => {
  const source = await readFile(new URL("../client/src/pages/admin/financial-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /enabled: allowed/);
  assert.match(source, /if \(!allowed\) return/);
  assert.match(source, /financialWorkspace\.success\.approved/);
  assert.match(source, /financialWorkspace\.action\.cancelNonExecuted/);
  assert.match(source, /onMutate: \(\) => setLiveMessage\(t\("financialWorkspace\.validation\.inProgress"\)\)/);
  assert.match(source, /if \(errorKind === "state" \|\| errorKind === "conflict"\) clearAction\(\)/);
});

test("workspace detail uses available actor references and truthfully discloses partial API detail", async () => {
  const source = await readFile(new URL("../client/src/pages/admin/financial-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /reviewActorReference/);
  assert.match(source, /approvalActorReference/);
  assert.match(source, /cancellationActorReference/);
  assert.match(source, /financialWorkspace\.roleUnavailable/);
  assert.match(source, /financialWorkspace\.partialAudit/);
  assert.match(source, /financialWorkspace\.detailExceptions/);
});

test("routing and mobile navigation restrict the workspace to Platform Operations roles", async () => {
  const app = await readFile(new URL("../client/src/App.tsx", import.meta.url), "utf8");
  const nav = await readFile(new URL("../client/src/components/MobileNav.tsx", import.meta.url), "utf8");
  assert.match(app, /path="\/financial-workspace"/);
  assert.match(nav, /financialWorkspace\.nav/);
  assert.equal((nav.match(/path: "\/financial-workspace"/g) || []).length, 2);
});
