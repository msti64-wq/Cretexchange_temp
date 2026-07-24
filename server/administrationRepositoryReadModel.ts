import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "./db";
import { documentClassifications, documentMetadata, documentRelationships, documentSourceVersions, governanceAuditEvents, governedDocuments, publicationManifestEntries, publicationSets, synchronizationResults, synchronizationRuns } from "../shared/schema";
import { isEligibleGovernedDocumentPath, normalizeAdministrationRepositoryQuery } from "./administrationRepository";
import type { SynchronizationEngineResult, InventorySnapshot } from "./administrationRepositorySynchronization";

export const ADMINISTRATION_REPOSITORY_PAGE_SIZE_MAX = 100;
export type AdministrationRepositoryQuery = { page: number; pageSize: number; order: "path_asc" | "updated_desc"; classification?: string; validationState?: string };
export const ADMINISTRATION_REPOSITORY_START_HERE_IDENTIFIER = "README";
export type AdministrationRepositorySearchResult = { identifier: string; title: string; path: string; type: string; ownerReference: string | null; classification: string | null; validationState: string; sourceCommit: string | null; excerpt: string };

export { normalizeAdministrationRepositoryQuery };

export async function getAdministrationRepositoryInventorySnapshot(): Promise<InventorySnapshot[]> {
  const rows = await db.select({ identifier: governedDocuments.documentIdentifier, path: governedDocuments.repositoryPath, checksumSha256: documentSourceVersions.checksumSha256, effectivity: governedDocuments.effectivityState, retention: governedDocuments.retentionState })
    .from(governedDocuments)
    .leftJoin(documentSourceVersions, eq(documentSourceVersions.documentId, governedDocuments.id))
    .orderBy(desc(documentSourceVersions.synchronizedAt));
  const snapshots = new Map<string, InventorySnapshot>();
  for (const row of rows) if (!snapshots.has(row.identifier)) snapshots.set(row.identifier, { identifier: row.identifier, path: row.path, checksumSha256: row.checksumSha256 || null, lifecycle: { effectivity: row.effectivity, retention: row.retention } });
  return Array.from(snapshots.values());
}

/** Controlled transactional publisher for a fully validated engine result. It persists
 * derived metadata only and retains withdrawn records as historical audit evidence. */
export async function persistAdministrationRepositorySynchronization(immutableCommitSha: string, result: SynchronizationEngineResult, actorId?: string) {
  if (result.status !== "completed" || result.errors.length) throw new Error("synchronization_result_invalid");
  return db.transaction(async (tx) => {
    const completed = await tx.select({ id: synchronizationRuns.id }).from(synchronizationRuns).where(and(eq(synchronizationRuns.immutableCommitSha, immutableCommitSha), eq(synchronizationRuns.status, "completed"))).limit(1);
    const existingPublication = await tx.select({ id: publicationSets.id }).from(publicationSets).where(eq(publicationSets.immutableCommitSha, immutableCommitSha)).limit(1);
    if (completed[0] && existingPublication[0]) return completed[0].id;
    const [run] = await tx.insert(synchronizationRuns).values({ immutableCommitSha, initiatedBy: actorId, status: "running" }).returning();
    const existingDocuments = await tx.select({ id: governedDocuments.id, identifier: governedDocuments.documentIdentifier, path: governedDocuments.repositoryPath }).from(governedDocuments);
    const existingByIdentifier = new Map(existingDocuments.map((document) => [document.identifier, document]));
    const activeIdentifiers = new Set(result.documents.map((document) => document.identifier));
    const sourceVersions = new Map<string, { id: string; checksumSha256: string }>();

    for (const item of result.documents) {
      const existing = existingByIdentifier.get(item.identifier);
      const values = { documentIdentifier: item.identifier, repositoryPath: item.path, title: item.title, documentType: item.type, scope: item.scope, ownerReference: item.owner, developmentState: item.lifecycle.development, approvalState: item.lifecycle.approval, publicationState: item.lifecycle.publication, effectivityState: item.lifecycle.effectivity, retentionState: item.lifecycle.retention, implementationAuthorizationState: item.lifecycle.implementationAuthorization, productionAdoptionState: item.lifecycle.productionAdoption, validationState: "valid", updatedAt: new Date() };
      const document = existing ? (await tx.update(governedDocuments).set(values).where(eq(governedDocuments.id, existing.id)).returning())[0] : (await tx.insert(governedDocuments).values(values).returning())[0];
      const previousSource = await tx.select({ id: documentSourceVersions.id, checksumSha256: documentSourceVersions.checksumSha256, sourcePath: documentSourceVersions.sourcePath }).from(documentSourceVersions).where(and(eq(documentSourceVersions.documentId, document.id), eq(documentSourceVersions.immutableCommitSha, immutableCommitSha))).limit(1);
      if (previousSource[0] && (previousSource[0].checksumSha256 !== item.checksumSha256 || previousSource[0].sourcePath !== item.path)) throw new Error("immutable_source_conflict");
      const source = previousSource[0] || (await tx.insert(documentSourceVersions).values({ documentId: document.id, immutableCommitSha, checksumSha256: item.checksumSha256, sourcePath: item.path, sourceMetadata: item.sourceMetadata }).returning())[0];
      sourceVersions.set(item.identifier, { id: source.id, checksumSha256: source.checksumSha256 });
      await tx.insert(documentClassifications).values({ documentId: document.id, classification: item.classification, assignedBy: actorId, provenance: "derived" }).onConflictDoUpdate({ target: documentClassifications.documentId, set: { classification: item.classification, assignedBy: actorId, assignedAt: new Date(), provenance: "derived" } });
      await tx.delete(documentRelationships).where(eq(documentRelationships.sourceDocumentId, document.id));
      for (const relationship of item.relationships) await tx.insert(documentRelationships).values({ sourceDocumentId: document.id, targetDocumentIdentifier: relationship.targetIdentifier, relationshipType: relationship.type, provenance: relationship.provenance, validationState: "valid" });
      await tx.insert(synchronizationResults).values({ synchronizationRunId: run.id, documentIdentifier: item.identifier, repositoryPath: item.path, status: "synchronized" });
      await tx.insert(governanceAuditEvents).values({ eventType: existing ? "source_version_changed" : "document_added_to_inventory", documentId: document.id, synchronizationRunId: run.id, actorId, eventMetadata: { checksumSha256: item.checksumSha256, immutableCommitSha, repositoryPath: item.path } });
    }

    for (const existing of existingDocuments.filter((document) => !activeIdentifiers.has(document.identifier))) {
      await tx.update(governedDocuments).set({ publicationState: "withdrawn", effectivityState: "withdrawn", retentionState: "historical", validationState: "valid", updatedAt: new Date() }).where(eq(governedDocuments.id, existing.id));
      await tx.delete(documentRelationships).where(eq(documentRelationships.sourceDocumentId, existing.id));
      await tx.delete(documentRelationships).where(eq(documentRelationships.targetDocumentIdentifier, existing.identifier));
      await tx.insert(synchronizationResults).values({ synchronizationRunId: run.id, documentIdentifier: existing.identifier, repositoryPath: existing.path, status: "withdrawn" });
      await tx.insert(governanceAuditEvents).values({ eventType: "document_withdrawn_from_inventory", documentId: existing.id, synchronizationRunId: run.id, actorId, eventMetadata: { immutableCommitSha, repositoryPath: existing.path } });
    }

    const previousPublication = await tx.select({ id: publicationSets.id }).from(publicationSets).orderBy(desc(publicationSets.generatedAt)).limit(1);
    const [publicationSet] = await tx.insert(publicationSets).values({ publicationSetIdentifier: `admin-repository-${immutableCommitSha}`, immutableCommitSha, targetAudience: "internal", administrativeScope: "administration_repository", validationOutcome: "valid", initiatedBy: actorId, previousPublicationSetId: previousPublication[0]?.id || null }).returning();
    for (const [position, item] of Array.from(Array.from(result.documents).sort((left, right) => left.path.localeCompare(right.path)).entries())) {
      const document = existingByIdentifier.get(item.identifier) || (await tx.select({ id: governedDocuments.id }).from(governedDocuments).where(eq(governedDocuments.documentIdentifier, item.identifier)).limit(1))[0];
      const source = sourceVersions.get(item.identifier);
      if (!document || !source) throw new Error("publication_manifest_source_missing");
      await tx.insert(publicationManifestEntries).values({ publicationSetId: publicationSet.id, documentId: document.id, sourceVersionId: source.id, checksumSha256: source.checksumSha256, position });
    }
    await tx.update(synchronizationRuns).set({ status: "completed", completedAt: new Date(), summary: {
      documentCount: result.documents.length,
      warningCount: result.warnings.length,
      errorCount: 0,
      duplicateIdentifierCount: result.report.duplicateIdentifiers.length,
      relationshipWarningCount: result.report.relationshipWarnings,
      metadataWarningCount: result.report.metadataWarnings,
      searchStatus: result.search.status,
      inventoryStatus: "synchronized",
      reconciliation: result.reconciliation,
    } }).where(eq(synchronizationRuns.id, run.id));
    await tx.insert(governanceAuditEvents).values({ eventType: "synchronization_completed", publicationSetId: publicationSet.id, synchronizationRunId: run.id, actorId, eventMetadata: { immutableCommitSha, documentCount: result.documents.length, warningCount: result.warnings.length, removedCount: result.reconciliation.removed.length } });
    return run.id;
  });
}

export type AdministrationRepositoryRefreshAuditEvent =
  | "synchronization_refresh_requested"
  | "synchronization_refresh_authorization_denied"
  | "synchronization_refresh_lock_acquired"
  | "synchronization_refresh_lock_rejected"
  | "synchronization_refresh_completed"
  | "synchronization_refresh_failed";
type RefreshAuditMetadata = Record<string, string | number | boolean | null>;

/** Records request-level refresh evidence without storing document bodies or internal exceptions. */
export async function recordAdministrationRepositoryRefreshAudit(eventType: AdministrationRepositoryRefreshAuditEvent, actorId: string, eventMetadata: RefreshAuditMetadata) {
  await db.insert(governanceAuditEvents).values({ eventType, actorId, eventMetadata });
}

export async function getAdministrationRepositoryRefreshHistory(limit = 20) {
  const boundedLimit = Math.min(100, Math.max(1, limit));
  const [runs, audits] = await Promise.all([
    db.select().from(synchronizationRuns).orderBy(desc(synchronizationRuns.startedAt)).limit(boundedLimit),
    db.select({ id: governanceAuditEvents.id, eventType: governanceAuditEvents.eventType, actorId: governanceAuditEvents.actorId, createdAt: governanceAuditEvents.createdAt, eventMetadata: governanceAuditEvents.eventMetadata })
      .from(governanceAuditEvents)
      .where(inArray(governanceAuditEvents.eventType, ["synchronization_refresh_requested", "synchronization_refresh_authorization_denied", "synchronization_refresh_lock_acquired", "synchronization_refresh_lock_rejected", "synchronization_refresh_completed", "synchronization_refresh_failed"]))
      .orderBy(desc(governanceAuditEvents.createdAt))
      .limit(boundedLimit),
  ]);
  return { runs, auditEvents: audits };
}

export async function getAdministrationRepositoryDocumentationHealth() {
  const [overview, history] = await Promise.all([getAdministrationRepositoryOverview(), getAdministrationRepositoryRefreshHistory(1)]);
  const summary = (history.runs[0]?.summary || {}) as Record<string, unknown>;
  return {
    governedDocuments: overview.summary.documentCount,
    warnings: typeof summary.warningCount === "number" ? summary.warningCount : 0,
    blockingErrors: typeof summary.errorCount === "number" ? summary.errorCount : 0,
    duplicateIdentifiers: typeof summary.duplicateIdentifierCount === "number" ? summary.duplicateIdentifierCount : 0,
    brokenRelationships: typeof summary.relationshipWarningCount === "number" ? summary.relationshipWarningCount : 0,
    missingMetadata: typeof summary.metadataWarningCount === "number" ? summary.metadataWarningCount : 0,
    searchStatus: typeof summary.searchStatus === "string" ? summary.searchStatus : "unknown",
    relationshipStatus: overview.summary.relationshipCount > 0 || overview.summary.documentCount === 0 ? "available" : "unknown",
    inventoryStatus: typeof summary.inventoryStatus === "string" ? summary.inventoryStatus : "unknown",
    latestSynchronization: overview.lastSynchronization,
  };
}

export async function listAdministrationRepositoryDocuments(query: AdministrationRepositoryQuery) {
  const [documents, sourceVersions] = await Promise.all([
    db.select({ id: governedDocuments.id, identifier: governedDocuments.documentIdentifier, title: governedDocuments.title, path: governedDocuments.repositoryPath, type: governedDocuments.documentType, scope: governedDocuments.scope, ownerReference: governedDocuments.ownerReference, classification: documentClassifications.classification, validationState: governedDocuments.validationState, developmentState: governedDocuments.developmentState, approvalState: governedDocuments.approvalState, publicationState: governedDocuments.publicationState, effectivityState: governedDocuments.effectivityState, retentionState: governedDocuments.retentionState, createdAt: governedDocuments.createdAt, updatedAt: governedDocuments.updatedAt }).from(governedDocuments).leftJoin(documentClassifications, eq(documentClassifications.documentId, governedDocuments.id)).where(ne(governedDocuments.publicationState, "withdrawn")),
    db.select({ documentId: documentSourceVersions.documentId, sourceCommit: documentSourceVersions.immutableCommitSha, checksum: documentSourceVersions.checksumSha256, synchronizedAt: documentSourceVersions.synchronizedAt }).from(documentSourceVersions).orderBy(desc(documentSourceVersions.synchronizedAt)),
  ]);
  const latestSourceByDocument = new Map<string, { sourceCommit: string; checksum: string }>();
  for (const source of sourceVersions) if (!latestSourceByDocument.has(source.documentId)) latestSourceByDocument.set(source.documentId, { sourceCommit: source.sourceCommit, checksum: source.checksum });
  const filtered = documents
    .filter((row) => (!query.classification || row.classification === query.classification) && (!query.validationState || row.validationState === query.validationState))
    .sort((left, right) => query.order === "updated_desc" ? Number(right.updatedAt || 0) - Number(left.updatedAt || 0) : left.path.localeCompare(right.path));
  const offset = (query.page - 1) * query.pageSize;
  const page = filtered.slice(offset, offset + query.pageSize);
  return { items: page.map((row) => ({ ...row, sourceCommit: latestSourceByDocument.get(row.id)?.sourceCommit || null, checksum: latestSourceByDocument.get(row.id)?.checksum || null })), pagination: { page: query.page, pageSize: query.pageSize, total: filtered.length, hasMore: offset + page.length < filtered.length } };
}

function repositorySearchExcerpt(body: string, query: string): string {
  const normalized = body.replace(/\s+/g, " ").trim();
  const position = normalized.toLowerCase().indexOf(query.toLowerCase());
  if (position < 0) return normalized.slice(0, 220);
  return `${position > 80 ? "…" : ""}${normalized.slice(Math.max(0, position - 80), position + query.length + 140)}${position + query.length + 140 < normalized.length ? "…" : ""}`;
}

export async function searchAdministrationRepositoryDocuments(query: string): Promise<AdministrationRepositorySearchResult[]> {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) return [];
  const documents = await listAdministrationRepositoryDocuments({ page: 1, pageSize: 100, order: "path_asc" });
  const matches: AdministrationRepositorySearchResult[] = [];
  for (const document of documents.items) {
    const haystack = `${document.identifier} ${document.title} ${document.path} ${document.ownerReference || ""} ${document.scope || ""} ${document.type} ${document.classification || ""} ${document.approvalState} ${document.effectivityState}`.toLowerCase();
    let body = "";
    if (!haystack.includes(normalized)) {
      try {
        const source = await readRepositoryDocument(document.path);
        if (source.checksum !== document.checksum) continue;
        body = source.body;
        if (!body.toLowerCase().includes(normalized)) continue;
      } catch { continue; }
    }
    matches.push({ identifier: document.identifier, title: document.title, path: document.path, type: document.type, ownerReference: document.ownerReference || null, classification: document.classification || null, validationState: document.validationState, sourceCommit: document.sourceCommit, excerpt: body ? repositorySearchExcerpt(body, query) : `${document.title} · ${document.path}` });
  }
  return matches.slice(0, 50);
}

export async function getAdministrationRepositoryDocument(identifier: string) {
  const document = await db.select().from(governedDocuments).where(eq(governedDocuments.documentIdentifier, identifier)).limit(1); if (!document[0]) return null;
  const [sources, relationships, memberships, metadata, referencedBy] = await Promise.all([
    db.select().from(documentSourceVersions).where(eq(documentSourceVersions.documentId, document[0].id)),
    db.select().from(documentRelationships).where(eq(documentRelationships.sourceDocumentId, document[0].id)),
    db.select({ publicationSetIdentifier: publicationSets.publicationSetIdentifier, validationOutcome: publicationSets.validationOutcome }).from(publicationManifestEntries).innerJoin(publicationSets, eq(publicationSets.id, publicationManifestEntries.publicationSetId)).where(eq(publicationManifestEntries.documentId, document[0].id)),
    db.select({ key: documentMetadata.metadataKey, value: documentMetadata.metadataValue }).from(documentMetadata).where(eq(documentMetadata.documentId, document[0].id)),
    db.select({ sourceIdentifier: governedDocuments.documentIdentifier, sourceTitle: governedDocuments.title, sourceType: governedDocuments.documentType, relationshipType: documentRelationships.relationshipType, provenance: documentRelationships.provenance }).from(documentRelationships).innerJoin(governedDocuments, eq(documentRelationships.sourceDocumentId, governedDocuments.id)).where(eq(documentRelationships.targetDocumentIdentifier, identifier)),
  ]);
  return { document: document[0], sources, relationships, referencedBy, publicationSets: memberships, metadata };
}

function repositoryDocumentPath(repositoryPath: string, allowStartHere = false): string {
  if (!isEligibleGovernedDocumentPath(repositoryPath) && !(allowStartHere && repositoryPath === "docs/README.md")) throw new Error("unsafe_repository_document_path");
  const documentRoot = resolve(process.cwd(), "docs");
  const fullPath = resolve(process.cwd(), repositoryPath);
  if (relative(documentRoot, fullPath).startsWith("..")) throw new Error("unsafe_repository_document_path");
  return fullPath;
}

async function readRepositoryDocument(repositoryPath: string, allowStartHere = false): Promise<{ body: string; checksum: string }> {
  const body = await readFile(repositoryDocumentPath(repositoryPath, allowStartHere), "utf8");
  return { body, checksum: createHash("sha256").update(body).digest("hex") };
}

export async function getAdministrationRepositoryDocumentContent(identifier: string) {
  const detail = await getAdministrationRepositoryDocument(identifier);
  if (!detail) return null;
  const source = await readRepositoryDocument(detail.document.repositoryPath);
  if (!detail.sources.some((version) => version.checksumSha256 === source.checksum)) throw new Error("repository_document_integrity_mismatch");
  return { ...detail, body: source.body };
}

export async function getAdministrationRepositoryStartHere() {
  const source = await readRepositoryDocument("docs/README.md", true);
  return {
    identifier: ADMINISTRATION_REPOSITORY_START_HERE_IDENTIFIER,
    title: "CreteXchange Documentation — Start Here",
    repositoryPath: "docs/README.md",
    body: source.body,
    checksum: source.checksum,
  };
}

export async function getAdministrationRepositoryOverview() {
  const [documents, runs, relationships] = await Promise.all([db.select().from(governedDocuments).where(ne(governedDocuments.publicationState, "withdrawn")), db.select().from(synchronizationRuns).orderBy(desc(synchronizationRuns.startedAt)).limit(1), db.select({ id: documentRelationships.id }).from(documentRelationships)]);
  const validationConflictCount = documents.filter((document) => document.validationState !== "valid").length;
  const lastSynchronization = runs[0] || null;
  return {
    summary: {
      documentCount: documents.length,
      relationshipCount: relationships.length,
      categoryCount: new Set(documents.map((document) => document.documentType)).size,
      validationConflictCount,
      synchronizedInventoryDocumentCount: documents.length,
      health: documents.length > 0 && validationConflictCount === 0 && lastSynchronization?.status === "completed" ? "healthy" : "attention",
      latestSourceCommit: lastSynchronization?.immutableCommitSha || null,
    },
    lastSynchronization,
  };
}
