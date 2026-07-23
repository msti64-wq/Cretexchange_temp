import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseGovernedDocument } from "../server/administrationRepository";
import { discoverGovernedDocuments, reconcileGovernedDocumentInventory, runAdministrationRepositorySynchronization } from "../server/administrationRepositorySynchronization";

function documentSource(identifier: string, repositoryPath: string, options: { body?: string; status?: string } = {}) {
  return {
    path: repositoryPath,
    body: options.body || `# ${identifier} — Example\n\n- **Document ID:** ${identifier}\n- **Version:** 1.0\n- **Status:** ${options.status || "Draft"}\n- **Owner:** Documentation Governance\n- **Classification:** Internal\n\n## Purpose\n\nExample.`,
  };
}

test("discovers a new governed document from allowlisted source paths", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "cretexchange-admin-repository-"));
  try {
    for (const directory of ["architecture", "standards", "operations", "product", "project", "ux", "business", "research", "vision"]) await mkdir(path.join(root, "docs", directory), { recursive: true });
    await writeFile(path.join(root, "docs", "standards", "policy.md"), documentSource("CTX-POL-099", "docs/standards/policy.md").body);
    await writeFile(path.join(root, "docs", "standards", "README.md"), "# Standards\n");
    const discovered = await discoverGovernedDocuments(root);
    assert.deepEqual(discovered.map((document) => document.path), ["docs/standards/policy.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recognizes configured families and builds deduplicated relationship warnings without blocking publication", async () => {
  const policy = documentSource("CTX-POL-003", "docs/standards/policy.md", { body: `# CTX-POL-003 — Policy\n\n- **Document ID:** CTX-POL-003\n- **Version:** 1.0\n- **Status:** Draft\n- **Owner:** Governance\n- **Classification:** Internal\n\nSee [CTX-RB-003](../operations/runbook.md), [CTX-RB-003](../operations/runbook.md), and [CTX-UX-008](../ux/ux.md).` });
  const runbook = documentSource("CTX-RB-003", "docs/operations/runbook.md");
  const result = await runAdministrationRepositorySynchronization({ sourceCommit: "a".repeat(40), documents: [policy, runbook] });
  assert.equal(result.status, "completed");
  assert.equal(result.documents.find((document) => document.identifier === "CTX-POL-003")?.type, "policy");
  assert.equal(result.documents.find((document) => document.identifier === "CTX-POL-003")?.relationships.length, 2);
  assert.equal(result.warnings.some((warning) => warning.code === "duplicate_relationship_edge"), true);
  assert.equal(result.warnings.some((warning) => warning.code === "orphaned_relationship_target"), true);
});

test("reconciles new, changed, renamed, removed, archived, and superseded inventory deterministically", () => {
  const current = [
    parseGovernedDocument(documentSource("CTX-ARCH-011", "docs/architecture/new-name.md", { body: `${documentSource("CTX-ARCH-011", "docs/architecture/new-name.md").body}\n` })),
    parseGovernedDocument(documentSource("CTX-POL-003", "docs/standards/policy.md", { status: "Archived" })),
  ];
  const plan = reconcileGovernedDocumentInventory(current, [
    { identifier: "CTX-ARCH-011", path: "docs/architecture/old-name.md", checksumSha256: "old" },
    { identifier: "CTX-OPS-002", path: "docs/operations/guide.md", checksumSha256: "old" },
  ]);
  assert.deepEqual(plan.renamed.map((entry) => entry.identifier), ["CTX-ARCH-011"]);
  assert.deepEqual(plan.changed, ["CTX-ARCH-011"]);
  assert.deepEqual(plan.added, ["CTX-POL-003"]);
  assert.deepEqual(plan.removed, ["CTX-OPS-002"]);
  assert.deepEqual(plan.stale, ["CTX-OPS-002"]);
  assert.deepEqual(plan.archived, ["CTX-POL-003"]);
});

test("invalid identities block publication while missing legacy metadata remains a warning", async () => {
  const legacy = documentSource("CTX-GOV-002", "docs/standards/legacy.md", { body: "# CTX-GOV-002 — Legacy\n\n- **Document ID:** CTX-GOV-002\n- **Status:** Draft\n" });
  const invalid = documentSource("CTX-UNKNOWN-001", "docs/standards/invalid.md");
  const result = await runAdministrationRepositorySynchronization({ sourceCommit: "b".repeat(40), documents: [legacy, invalid] });
  assert.equal(result.status, "failed");
  assert.equal(result.errors.some((error) => error.code === "invalid_document_identifier"), true);
  assert.equal(result.warnings.some((warning) => warning.code === "missing_owner_metadata"), true);
});

test("failed publication preserves the previous inventory and repeated successful executions are idempotent", async () => {
  const input = { sourceCommit: "c".repeat(40), documents: [documentSource("CTX-OPS-099", "docs/operations/guide.md")], inventory: [{ identifier: "CTX-OPS-001", path: "docs/operations/old.md", checksumSha256: "old" }] };
  let attempted = 0;
  const failed = await runAdministrationRepositorySynchronization({ ...input, publisher: { async publish() { attempted += 1; throw new Error("transaction rolled back"); } } });
  assert.equal(attempted, 1); assert.equal(failed.status, "failed"); assert.equal(failed.report.publicationStatus, "failed"); assert.equal(failed.errors.at(-1)?.code, "publication_failed");
  const publication = { async publish(result: Awaited<ReturnType<typeof runAdministrationRepositorySynchronization>>) { return { publicationId: "publication-1", documentsPublished: result.documents.length }; } };
  const first = await runAdministrationRepositorySynchronization({ ...input, publisher: publication });
  const second = await runAdministrationRepositorySynchronization({ ...input, publisher: publication });
  assert.equal(first.status, "completed"); assert.equal(second.status, "completed");
  assert.equal(first.report.documentsPublished, 1); assert.equal(second.report.documentsPublished, 1);
  assert.deepEqual(first.reconciliation, second.reconciliation);
});
