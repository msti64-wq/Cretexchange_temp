import { createHash } from "node:crypto";

export const ADMINISTRATION_REPOSITORY_FEATURE_ENV = "ADMIN_REPOSITORY_ENABLED";
export const GOVERNED_DOCUMENT_ROOTS = ["docs/architecture/", "docs/standards/", "docs/operations/", "docs/product/", "docs/project/", "docs/ux/", "docs/business/", "docs/research/", "docs/vision/"] as const;
export const ADMINISTRATION_CLASSIFICATIONS = ["internal", "restricted", "security_restricted", "legal_privileged", "investor_confidential", "public_candidate", "historical"] as const;
export type AdministrationClassification = typeof ADMINISTRATION_CLASSIFICATIONS[number];
export type Lifecycle = { development: string; approval: string; publication: string; effectivity: string; retention: string; implementationAuthorization: string; productionAdoption: string };
export type ParsedGovernedDocument = { identifier: string; title: string; path: string; type: string; scope: string | null; owner: string | null; classification: AdministrationClassification; lifecycle: Lifecycle; relationships: Array<{ type: string; targetIdentifier: string; provenance: "declared" }>; checksumSha256: string; sourceMetadata: Record<string, string> };
export type SourceDocument = { path: string; body: string };
export type SyncError = { path: string; code: string; message: string };
export type SynchronizationResult = { status: "completed" | "failed"; documents: ParsedGovernedDocument[]; errors: SyncError[]; auditEvents: Array<{ eventType: string; documentIdentifier?: string; metadata: Record<string, string> }> };

const stateValues = {
  development: new Set(["draft", "under_review", "finalized", "rejected"]),
  approval: new Set(["not_required", "pending", "conditionally_approved", "approved", "rejected", "revoked"]),
  publication: new Set(["repository_only", "eligible", "included", "published", "stale", "withdrawn", "unpublished"]),
  effectivity: new Set(["not_effective", "scheduled", "effective", "expired", "superseded", "withdrawn"]),
  retention: new Set(["active_record", "historical", "archived", "tombstoned", "deleted_under_retention_rule"]),
  implementationAuthorization: new Set(["not_applicable", "not_authorized", "authorized", "completed", "revoked"]),
  productionAdoption: new Set(["not_applicable", "not_authorized", "authorized", "adopted", "withdrawn"]),
};

export function isAdministrationRepositoryEnabled(environment = process.env): boolean {
  return environment[ADMINISTRATION_REPOSITORY_FEATURE_ENV] === "true";
}

export function normalizeAdministrationRepositoryQuery(input: Record<string, unknown>) {
  const page = Math.max(1, Number.parseInt(String(input.page || "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(input.pageSize || "25"), 10) || 25));
  return { page, pageSize, order: input.order === "updated_desc" ? "updated_desc" as const : "path_asc" as const, classification: typeof input.classification === "string" ? input.classification : undefined, validationState: typeof input.validationState === "string" ? input.validationState : undefined };
}

export function isEligibleGovernedDocumentPath(path: string): boolean {
  return !path.includes("..") && path.endsWith(".md") && GOVERNED_DOCUMENT_ROOTS.some((root) => path.startsWith(root));
}

function normalizedState(value: string | undefined, fallback: string): string { return String(value || fallback).trim().toLowerCase().replace(/[ -]+/g, "_"); }
function declaredValues(lines: string[], label: string): string[] {
  const pattern = new RegExp(`^-\\s*\\*\\*${label}:\\*\\*\\s*(.+?)\\s*$`, "i");
  return lines.flatMap((line) => {
    const value = line.match(pattern)?.[1]?.replace(/\*\*/g, "").trim();
    return value ? [value] : [];
  });
}
function getDeclared(lines: string[], label: string): string | undefined {
  return declaredValues(lines, label)[0];
}
function assertNoMetadataConflict(lines: string[], label: string): void {
  if (new Set(declaredValues(lines, label).map((value) => value.toLowerCase())).size > 1) throw new Error("metadata_conflict");
}
function deriveType(identifier: string, path: string): string {
  if (identifier.startsWith("CTX-STD")) return "standard";
  if (identifier.startsWith("CTX-ARCH")) return "architecture";
  if (identifier.startsWith("ADR")) return "adr";
  if (path.includes("/reviews/")) return "architecture_review";
  if (path.includes("/approvals/")) return "approval_record";
  if (path.includes("/operations/")) return "operational_record";
  return "supporting_document";
}
function inferLifecycle(status: string): Lifecycle {
  const normalized = normalizedState(status, "draft");
  return {
    development: normalized.includes("draft") ? "draft" : normalized.includes("review") ? "under_review" : "finalized",
    approval: normalized.includes("not_yet_approved") ? "pending" : normalized.includes("conditionally_approved") ? "conditionally_approved" : normalized.includes("approved") ? "approved" : "not_required",
    publication: "repository_only",
    effectivity: normalized.includes("approved") && !normalized.includes("not_yet") ? "effective" : "not_effective",
    retention: normalized.includes("historical") || normalized.includes("archived") ? "historical" : "active_record",
    implementationAuthorization: normalized.includes("not_authorized") || normalized.includes("not_yet") ? "not_authorized" : "not_applicable",
    productionAdoption: normalized.includes("not_authorized") || normalized.includes("not_yet") ? "not_authorized" : "not_applicable",
  };
}

export function validateLifecycle(lifecycle: Lifecycle): string | null {
  for (const [dimension, values] of Object.entries(stateValues)) if (!values.has(lifecycle[dimension as keyof Lifecycle])) return `invalid_${dimension}_state`;
  if (lifecycle.effectivity === "effective" && !["approved", "not_required"].includes(lifecycle.approval)) return "effective_requires_approval";
  if (lifecycle.effectivity === "superseded" && lifecycle.retention === "active_record") return "superseded_requires_historical_retention";
  if (lifecycle.publication === "published" && lifecycle.effectivity === "effective" && lifecycle.approval !== "approved") return "published_effective_requires_approval";
  return null;
}

export function parseGovernedDocument(source: SourceDocument): ParsedGovernedDocument {
  if (!isEligibleGovernedDocumentPath(source.path)) throw new Error("unsafe_source_path");
  const lines = source.body.split(/\r?\n/); const heading = lines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, "").trim();
  for (const label of ["Document ID", "Status", "Classification"]) assertNoMetadataConflict(lines, label);
  const identifier = getDeclared(lines, "Document ID") || heading?.match(/\b(?:CTX-(?:STD|ARCH|DEP|DB)-\d{3}|CTX-OPS-\d{3}|ADR-\d{3}|PD-\d{3})\b/)?.[0];
  if (!heading || !identifier) throw new Error("missing_document_identity");
  const status = getDeclared(lines, "Status") || "Draft";
  const lifecycle = inferLifecycle(status);
  const lifecycleError = validateLifecycle(lifecycle); if (lifecycleError) throw new Error(lifecycleError);
  const classification = (getDeclared(lines, "Classification") || "internal").toLowerCase().replace(/[ /-]+/g, "_") as AdministrationClassification;
  if (!ADMINISTRATION_CLASSIFICATIONS.includes(classification)) throw new Error("invalid_classification");
  const relationships = Array.from(source.body.matchAll(/\[[^\]]*\b(CTX-(?:STD|ARCH|DEP|DB)-\d{3}|CTX-OPS-\d{3}|ADR-\d{3}|PD-\d{3})\b[^\]]*\]\([^)]*\)/g)).map((match) => ({ type: "references", targetIdentifier: match[1], provenance: "declared" as const }));
  return { identifier, title: heading.replace(/^CTX-[A-Z-]+-\d{3}\s*[—-]\s*/, ""), path: source.path, type: deriveType(identifier, source.path), scope: getDeclared(lines, "Scope") || getDeclared(lines, "Product") || null, owner: getDeclared(lines, "Owner") || null, classification, lifecycle, relationships, checksumSha256: createHash("sha256").update(source.body).digest("hex"), sourceMetadata: { status } };
}

export function synchronizeGovernedDocuments(sourceCommit: string, documents: SourceDocument[]): SynchronizationResult {
  const errors: SyncError[] = []; const parsed: ParsedGovernedDocument[] = []; const identifiers = new Set<string>();
  for (const source of documents) {
    try {
      const item = parseGovernedDocument(source);
      if (identifiers.has(item.identifier)) throw new Error("duplicate_document_identifier");
      identifiers.add(item.identifier); parsed.push(item);
    } catch (error) { errors.push({ path: source.path, code: error instanceof Error ? error.message : "malformed_document", message: "Governed document could not be synchronized safely." }); }
  }
  for (const document of parsed) {
    for (const relationship of document.relationships) {
      if (!identifiers.has(relationship.targetIdentifier)) {
        errors.push({ path: document.path, code: "invalid_relationship_target", message: "A declared relationship does not resolve within the governed source set." });
      }
    }
  }
  const auditEvents = [{ eventType: errors.length ? "synchronization_failed" : "synchronization_completed", metadata: { sourceCommit, documentCount: String(parsed.length), errorCount: String(errors.length) } }, ...parsed.map((document) => ({ eventType: "document_added_to_inventory", documentIdentifier: document.identifier, metadata: { checksumSha256: document.checksumSha256, sourceCommit } }))];
  return { status: errors.length ? "failed" : "completed", documents: parsed, errors, auditEvents };
}

export function createPublicationManifest(publicationSetIdentifier: string, immutableCommitSha: string, documents: ParsedGovernedDocument[]) {
  const sorted = [...documents].sort((a, b) => a.path.localeCompare(b.path));
  if (!/^[A-Za-z0-9._:-]{3,128}$/.test(publicationSetIdentifier) || !/^[a-f0-9]{7,64}$/i.test(immutableCommitSha)) throw new Error("invalid_manifest_identity");
  const invalid = sorted.find((document) => document.lifecycle.publication === "withdrawn" || validateLifecycle(document.lifecycle));
  if (invalid) throw new Error("manifest_contains_invalid_document");
  return { publicationSetIdentifier, immutableCommitSha, validationOutcome: "valid", entries: sorted.map((document, position) => ({ documentIdentifier: document.identifier, repositoryPath: document.path, checksumSha256: document.checksumSha256, position })) };
}
