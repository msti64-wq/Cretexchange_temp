import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPublicationManifest, isAdministrationRepositoryEnabled, isEligibleGovernedDocumentPath, normalizeAdministrationRepositoryQuery, parseGovernedDocument, synchronizeGovernedDocuments, validateLifecycle } from "../server/administrationRepository";

const body = `# CTX-STD-099 — Example Governance Standard

- **Document ID:** CTX-STD-099
- **Status:** **DRAFT — NOT YET APPROVED**
- **Owner:** Documentation Governance
- **Scope:** CreteXchange

## Purpose

See [CTX-STD-002](./CTX-STD-002-documentation-governance-metadata-lifecycle-authority-and-relationships.md).
`;

const governanceStandard = `# CTX-STD-002 — Documentation Governance Standard

- **Document ID:** CTX-STD-002
- **Status:** **DRAFT — NOT YET APPROVED**
- **Owner:** Documentation Governance
- **Scope:** CreteXchange
`;

test("parses deterministic source identity and checksum", () => {
  const item = parseGovernedDocument({ path: "docs/standards/example.md", body });
  assert.equal(item.identifier, "CTX-STD-099"); assert.equal(item.type, "standard"); assert.match(item.checksumSha256, /^[a-f0-9]{64}$/);
  assert.equal(item.lifecycle.approval, "pending"); assert.equal(item.relationships[0]?.targetIdentifier, "CTX-STD-002");
});

test("unsafe paths, malformed documents, metadata conflicts, duplicate identifiers, and orphaned relationships are classified safely", () => {
  assert.equal(isEligibleGovernedDocumentPath("docs/standards/example.md"), true); assert.equal(isEligibleGovernedDocumentPath("server/routes.ts"), false);
  assert.throws(() => parseGovernedDocument({ path: "docs/.env.md", body }), /unsafe_source_path/);
  assert.equal(synchronizeGovernedDocuments("abc1234", [{ path: "docs/standards/bad.md", body: "# Untitled" }]).errors[0]?.code, "missing_document_identity");
  const result = synchronizeGovernedDocuments("abc1234", [{ path: "docs/standards/a.md", body }, { path: "docs/architecture/b.md", body }]);
  assert.equal(result.status, "failed"); assert.equal(result.errors[0]?.code, "duplicate_document_identifier");
  assert.throws(() => parseGovernedDocument({ path: "docs/standards/conflict.md", body: `${body}\n- **Status:** Approved` }), /metadata_conflict/);
  const orphaned = synchronizeGovernedDocuments("abc1234", [{ path: "docs/standards/a.md", body }]);
  assert.equal(orphaned.status, "completed"); assert.equal(orphaned.warnings.some((warning) => warning.code === "orphaned_relationship_target"), true);
});

test("synchronization, lifecycle validation, and manifests are deterministic", () => {
  const source = { path: "docs/standards/example.md", body }; const target = { path: "docs/standards/governance.md", body: governanceStandard }; const first = synchronizeGovernedDocuments("abc1234", [source, target]);
  assert.deepEqual(first.documents, synchronizeGovernedDocuments("abc1234", [source, target]).documents);
  assert.equal(first.auditEvents[0]?.eventType, "synchronization_completed");
  assert.equal(validateLifecycle({ development: "finalized", approval: "pending", publication: "published", effectivity: "effective", retention: "active_record", implementationAuthorization: "not_applicable", productionAdoption: "not_applicable" }), "effective_requires_approval");
  const manifest = createPublicationManifest("admin-foundation-001", "abcdef123", first.documents); assert.equal(manifest.entries.length, 2);
  assert.throws(() => createPublicationManifest("bad set", "branch", first.documents), /invalid_manifest_identity/);
});

test("feature gate defaults closed and pagination is bounded", () => {
  assert.equal(isAdministrationRepositoryEnabled({}), false); assert.equal(isAdministrationRepositoryEnabled({ ADMIN_REPOSITORY_ENABLED: "true" }), true);
  assert.equal(normalizeAdministrationRepositoryQuery({ page: "-2", pageSize: "999", order: "updated_desc" }).pageSize, 100);
});

test("Version 1 library is secured, discoverable, searchable, and read-only", async () => {
  const [routes, page, app, renderer, readModel, exports] = await Promise.all([readFile(new URL("../server/routes.ts", import.meta.url), "utf8"), readFile(new URL("../client/src/pages/admin/administration-repository.tsx", import.meta.url), "utf8"), readFile(new URL("../client/src/App.tsx", import.meta.url), "utf8"), readFile(new URL("../client/src/components/administration-repository-markdown.tsx", import.meta.url), "utf8"), readFile(new URL("../server/administrationRepositoryReadModel.ts", import.meta.url), "utf8"), readFile(new URL("../client/src/lib/administrationRepositoryExport.ts", import.meta.url), "utf8")]);
  assert.match(routes, /requireAdministrationRepositoryActor/); assert.match(routes, /isAdministrationRepositoryEnabled/);
  assert.match(routes, /\/api\/admin\/administration-repository\/documents\/:identifier\/content/); assert.match(routes, /\/api\/admin\/administration-repository\/search/); assert.match(app, /admin\/administration-repository\/document\/:documentId/);
  for (const feature of ["Operations Library", "Start Here", "Quick Search", "Repository browser", "Recently updated", "Recently added", "Combined PDF", "Markdown ZIP", "References", "Referenced by", "no document editing, publishing, approval, upload", "setLocation(\"/admin/administration-repository\", { replace: true })"]) assert.match(page, new RegExp(feature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const feature of ["repository_document_integrity_mismatch", "docs/README.md", "referencedBy", "searchAdministrationRepositoryDocuments", "latestSourceCommit"]) assert.match(readModel, new RegExp(feature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const feature of ["startsWith(\"```\")", "isDivider", "startsWith(\">\")", "list-decimal", "Image omitted for safety", "knownIdentifiers.has"]) assert.match(renderer, new RegExp(feature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const feature of ["downloadPdf", "downloadCombinedPdf", "downloadMarkdownZip", "Page", "CreteXchange"]) assert.match(exports, new RegExp(feature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(routes, /administration-repository\/sync/); assert.doesNotMatch(routes, /administration-repository.*\.post/i);
});

test("foundation migration is additive and never creates an editable document body", async () => {
  const migration = await readFile(new URL("../migrations/0035_add_administration_repository_foundation.sql", import.meta.url), "utf8");
  for (const table of ["governed_documents", "document_source_versions", "publication_sets", "publication_manifest_entries", "document_relationships", "synchronization_runs", "synchronization_results", "governance_audit_events"]) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.doesNotMatch(migration, /document_body|markdown_body|content_body/i);
});
