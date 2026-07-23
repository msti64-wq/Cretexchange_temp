import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { documentClassifications, documentRelationships, documentSourceVersions, governanceAuditEvents, governedDocuments, publicationManifestEntries, publicationSets, synchronizationResults, synchronizationRuns } from "../shared/schema";
import { normalizeAdministrationRepositoryQuery, type SynchronizationResult } from "./administrationRepository";

export const ADMINISTRATION_REPOSITORY_PAGE_SIZE_MAX = 100;
export type AdministrationRepositoryQuery = { page: number; pageSize: number; order: "path_asc" | "updated_desc"; classification?: string; validationState?: string };

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
  const rows = await db.select({ id: governedDocuments.id, identifier: governedDocuments.documentIdentifier, title: governedDocuments.title, path: governedDocuments.repositoryPath, type: governedDocuments.documentType, classification: documentClassifications.classification, validationState: governedDocuments.validationState, developmentState: governedDocuments.developmentState, approvalState: governedDocuments.approvalState, publicationState: governedDocuments.publicationState, effectivityState: governedDocuments.effectivityState, retentionState: governedDocuments.retentionState, sourceCommit: documentSourceVersions.immutableCommitSha, checksum: documentSourceVersions.checksumSha256, updatedAt: governedDocuments.updatedAt })
    .from(governedDocuments).leftJoin(documentClassifications, eq(documentClassifications.documentId, governedDocuments.id)).leftJoin(documentSourceVersions, eq(documentSourceVersions.documentId, governedDocuments.id))
    .orderBy(query.order === "updated_desc" ? desc(governedDocuments.updatedAt) : asc(governedDocuments.repositoryPath)).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
  const filtered = rows.filter((row) => (!query.classification || row.classification === query.classification) && (!query.validationState || row.validationState === query.validationState));
  return { items: filtered.map((row) => ({ ...row, sourceCommit: row.sourceCommit ? String(row.sourceCommit) : null, checksum: row.checksum ? String(row.checksum) : null })), pagination: { page: query.page, pageSize: query.pageSize, total: filtered.length, hasMore: rows.length === query.pageSize } };
}

export async function getAdministrationRepositoryDocument(identifier: string) {
  const document = await db.select().from(governedDocuments).where(eq(governedDocuments.documentIdentifier, identifier)).limit(1); if (!document[0]) return null;
  const [sources, relationships, memberships] = await Promise.all([
    db.select().from(documentSourceVersions).where(eq(documentSourceVersions.documentId, document[0].id)),
    db.select().from(documentRelationships).where(eq(documentRelationships.sourceDocumentId, document[0].id)),
    db.select({ publicationSetIdentifier: publicationSets.publicationSetIdentifier, validationOutcome: publicationSets.validationOutcome }).from(publicationManifestEntries).innerJoin(publicationSets, eq(publicationSets.id, publicationManifestEntries.publicationSetId)).where(eq(publicationManifestEntries.documentId, document[0].id)),
  ]);
  return { document: document[0], sources, relationships, publicationSets: memberships };
}

export async function getAdministrationRepositoryOverview() {
  const [documents, runs] = await Promise.all([db.select().from(governedDocuments), db.select().from(synchronizationRuns).orderBy(desc(synchronizationRuns.startedAt)).limit(1)]);
  return { summary: { documentCount: documents.length, validationConflictCount: documents.filter((document) => document.validationState !== "valid").length, publishedCount: documents.filter((document) => document.publicationState === "published").length }, lastSynchronization: runs[0] || null };
}
