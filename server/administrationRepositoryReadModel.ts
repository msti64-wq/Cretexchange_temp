import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { documentClassifications, documentMetadata, documentRelationships, documentSourceVersions, governanceAuditEvents, governedDocuments, publicationManifestEntries, publicationSets, synchronizationResults, synchronizationRuns } from "../shared/schema";
import { isEligibleGovernedDocumentPath, normalizeAdministrationRepositoryQuery, type SynchronizationResult } from "./administrationRepository";

export const ADMINISTRATION_REPOSITORY_PAGE_SIZE_MAX = 100;
export type AdministrationRepositoryQuery = { page: number; pageSize: number; order: "path_asc" | "updated_desc"; classification?: string; validationState?: string };
export const ADMINISTRATION_REPOSITORY_START_HERE_IDENTIFIER = "README";
export type AdministrationRepositorySearchResult = { identifier: string; title: string; path: string; type: string; ownerReference: string | null; classification: string | null; validationState: string; sourceCommit: string | null; excerpt: string };

export { normalizeAdministrationRepositoryQuery };

/** Controlled persistence seam for a future authorized synchronizer. It stores only
 * derived metadata/provenance; callers must provide an immutable source commit. */
export async function persistAdministrationRepositorySynchronization(immutableCommitSha: string, result: SynchronizationResult, actorId?: string) {
  if (result.status !== "completed" || result.errors.length) throw new Error("synchronization_result_invalid");
  return db.transaction(async (tx) => {
    const completed = await tx.select({ id: synchronizationRuns.id }).from(synchronizationRuns).where(and(eq(synchronizationRuns.immutableCommitSha, immutableCommitSha), eq(synchronizationRuns.status, "completed"))).limit(1);
    if (completed[0]) return completed[0].id;
    const [run] = await tx.insert(synchronizationRuns).values({ immutableCommitSha, initiatedBy: actorId, status: "running" }).returning();
    for (const item of result.documents) {
      const existing = await tx.select({ id: governedDocuments.id, repositoryPath: governedDocuments.repositoryPath }).from(governedDocuments).where(eq(governedDocuments.documentIdentifier, item.identifier)).limit(1);
      if (existing[0] && existing[0].repositoryPath !== item.path) throw new Error("document_identity_path_conflict");
      const values = { documentIdentifier: item.identifier, repositoryPath: item.path, title: item.title, documentType: item.type, scope: item.scope, ownerReference: item.owner, developmentState: item.lifecycle.development, approvalState: item.lifecycle.approval, publicationState: item.lifecycle.publication, effectivityState: item.lifecycle.effectivity, retentionState: item.lifecycle.retention, implementationAuthorizationState: item.lifecycle.implementationAuthorization, productionAdoptionState: item.lifecycle.productionAdoption, validationState: "valid", updatedAt: new Date() };
      const document = existing[0] ? (await tx.update(governedDocuments).set(values).where(eq(governedDocuments.id, existing[0].id)).returning())[0] : (await tx.insert(governedDocuments).values(values).returning())[0];
      const previousSource = await tx.select({ checksumSha256: documentSourceVersions.checksumSha256 }).from(documentSourceVersions).where(and(eq(documentSourceVersions.documentId, document.id), eq(documentSourceVersions.immutableCommitSha, immutableCommitSha))).limit(1);
      if (previousSource[0] && previousSource[0].checksumSha256 !== item.checksumSha256) throw new Error("immutable_source_checksum_conflict");
      const source = previousSource[0] ? null : (await tx.insert(documentSourceVersions).values({ documentId: document.id, immutableCommitSha, checksumSha256: item.checksumSha256, sourcePath: item.path, sourceMetadata: item.sourceMetadata }).returning())[0];
      await tx.insert(documentClassifications).values({ documentId: document.id, classification: item.classification, assignedBy: actorId, provenance: "derived" }).onConflictDoNothing();
      for (const relationship of item.relationships) await tx.insert(documentRelationships).values({ sourceDocumentId: document.id, targetDocumentIdentifier: relationship.targetIdentifier, relationshipType: relationship.type, provenance: relationship.provenance, validationState: "valid" }).onConflictDoNothing();
      await tx.insert(synchronizationResults).values({ synchronizationRunId: run.id, documentIdentifier: item.identifier, repositoryPath: item.path, status: "synchronized" });
      await tx.insert(governanceAuditEvents).values({ eventType: source ? "source_version_changed" : "document_added_to_inventory", documentId: document.id, synchronizationRunId: run.id, actorId, eventMetadata: { checksumSha256: item.checksumSha256, immutableCommitSha } });
    }
    await tx.update(synchronizationRuns).set({ status: "completed", completedAt: new Date(), summary: { documentCount: result.documents.length, errorCount: 0 } }).where(eq(synchronizationRuns.id, run.id));
    await tx.insert(governanceAuditEvents).values({ eventType: "synchronization_completed", synchronizationRunId: run.id, actorId, eventMetadata: { immutableCommitSha, documentCount: result.documents.length, errorCount: 0 } });
    return run.id;
  });
}

export async function listAdministrationRepositoryDocuments(query: AdministrationRepositoryQuery) {
  const rows = await db.select({ id: governedDocuments.id, identifier: governedDocuments.documentIdentifier, title: governedDocuments.title, path: governedDocuments.repositoryPath, type: governedDocuments.documentType, scope: governedDocuments.scope, ownerReference: governedDocuments.ownerReference, classification: documentClassifications.classification, validationState: governedDocuments.validationState, developmentState: governedDocuments.developmentState, approvalState: governedDocuments.approvalState, publicationState: governedDocuments.publicationState, effectivityState: governedDocuments.effectivityState, retentionState: governedDocuments.retentionState, sourceCommit: documentSourceVersions.immutableCommitSha, checksum: documentSourceVersions.checksumSha256, createdAt: governedDocuments.createdAt, updatedAt: governedDocuments.updatedAt })
    .from(governedDocuments).leftJoin(documentClassifications, eq(documentClassifications.documentId, governedDocuments.id)).leftJoin(documentSourceVersions, eq(documentSourceVersions.documentId, governedDocuments.id))
    .orderBy(query.order === "updated_desc" ? desc(governedDocuments.updatedAt) : asc(governedDocuments.repositoryPath)).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
  const filtered = rows.filter((row) => (!query.classification || row.classification === query.classification) && (!query.validationState || row.validationState === query.validationState));
  return { items: filtered.map((row) => ({ ...row, sourceCommit: row.sourceCommit ? String(row.sourceCommit) : null, checksum: row.checksum ? String(row.checksum) : null })), pagination: { page: query.page, pageSize: query.pageSize, total: filtered.length, hasMore: rows.length === query.pageSize } };
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
  const [documents, runs, relationships] = await Promise.all([db.select().from(governedDocuments), db.select().from(synchronizationRuns).orderBy(desc(synchronizationRuns.startedAt)).limit(1), db.select({ id: documentRelationships.id }).from(documentRelationships)]);
  const validationConflictCount = documents.filter((document) => document.validationState !== "valid").length;
  const lastSynchronization = runs[0] || null;
  return {
    summary: {
      documentCount: documents.length,
      relationshipCount: relationships.length,
      categoryCount: new Set(documents.map((document) => document.documentType)).size,
      validationConflictCount,
      publishedCount: documents.filter((document) => document.publicationState === "published").length,
      health: documents.length > 0 && validationConflictCount === 0 && lastSynchronization?.status === "completed" ? "healthy" : "attention",
      latestSourceCommit: lastSynchronization?.immutableCommitSha || null,
    },
    lastSynchronization,
  };
}
