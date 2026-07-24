import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  GOVERNED_DOCUMENT_FAMILIES,
  GOVERNED_DOCUMENT_ROOTS,
  isEligibleGovernedDocumentPath,
  synchronizeGovernedDocuments,
  type DocumentFamily,
  type ParsedGovernedDocument,
  type SourceDocument,
  type SynchronizationResult,
} from "./administrationRepository";

export type InventorySnapshot = {
  identifier: string;
  path: string;
  checksumSha256: string | null;
  lifecycle?: Pick<ParsedGovernedDocument["lifecycle"], "effectivity" | "retention">;
};

export type InventoryReconciliation = {
  added: string[];
  changed: string[];
  renamed: Array<{ identifier: string; from: string; to: string }>;
  removed: string[];
  unchanged: string[];
  superseded: string[];
  archived: string[];
  stale: string[];
};

export type SearchRefreshPlan = { documentCount: number; indexedFields: readonly string[]; status: "ready" | "blocked" };
export type SynchronizationEngineResult = SynchronizationResult & {
  durationMs: number;
  reconciliation: InventoryReconciliation;
  search: SearchRefreshPlan;
};

export type SynchronizationLogger = { info(event: string, metadata: Record<string, string | number | boolean>): void; error(event: string, metadata: Record<string, string | number | boolean>): void };
export type SynchronizationPublisher = { publish(result: SynchronizationEngineResult): Promise<{ inventoryGenerationId: string; documentsSynchronized: number }> };
export type SynchronizationEngineInput = {
  sourceCommit: string;
  documents?: SourceDocument[];
  inventory?: InventorySnapshot[];
  rootDirectory?: string;
  families?: readonly DocumentFamily[];
  publisher?: SynchronizationPublisher;
  logger?: SynchronizationLogger;
};

const DOCUMENT_ID_MARKER = /^-\s*\*\*Document ID:\*\*/mi;

function identifierPattern(families: readonly DocumentFamily[]): RegExp {
  return new RegExp(`\\b(?:${families.map((family) => `${family.prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}-\\d{3}`).join("|")})\\b`, "m");
}

function isGovernedSource(body: string, families: readonly DocumentFamily[]): boolean {
  return DOCUMENT_ID_MARKER.test(body) || identifierPattern(families).test(body.split(/\r?\n/).find((line) => /^#\s+/.test(line)) || "");
}

async function collectMarkdown(relativeDirectory: string, rootDirectory: string, families: readonly DocumentFamily[]): Promise<SourceDocument[]> {
  const entries = await readdir(path.resolve(rootDirectory, relativeDirectory), { withFileTypes: true });
  const results: SourceDocument[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      results.push(...await collectMarkdown(relativePath, rootDirectory, families));
      continue;
    }
    if (!entry.isFile() || !isEligibleGovernedDocumentPath(relativePath)) continue;
    const body = await readFile(path.resolve(rootDirectory, relativePath), "utf8");
    if (isGovernedSource(body, families)) results.push({ path: relativePath, body });
  }
  return results;
}

/** Discovers only allowlisted Markdown sources. It does not parse, validate, or mutate inventory. */
export async function discoverGovernedDocuments(rootDirectory = process.cwd(), families: readonly DocumentFamily[] = GOVERNED_DOCUMENT_FAMILIES): Promise<SourceDocument[]> {
  return (await Promise.all(GOVERNED_DOCUMENT_ROOTS.map((root) => collectMarkdown(root.slice(0, -1), rootDirectory, families)))).flat().sort((left, right) => left.path.localeCompare(right.path));
}

export function reconcileGovernedDocumentInventory(documents: ParsedGovernedDocument[], inventory: InventorySnapshot[] = []): InventoryReconciliation {
  const previous = new Map(inventory.map((item) => [item.identifier, item]));
  const current = new Set(documents.map((document) => document.identifier));
  const reconciliation: InventoryReconciliation = { added: [], changed: [], renamed: [], removed: [], unchanged: [], superseded: [], archived: [], stale: [] };

  for (const document of documents) {
    const existing = previous.get(document.identifier);
    if (!existing) reconciliation.added.push(document.identifier);
    else if (existing.path !== document.path) {
      reconciliation.renamed.push({ identifier: document.identifier, from: existing.path, to: document.path });
      if (existing.checksumSha256 !== document.checksumSha256) reconciliation.changed.push(document.identifier);
    } else if (existing.checksumSha256 !== document.checksumSha256) reconciliation.changed.push(document.identifier);
    else reconciliation.unchanged.push(document.identifier);

    if (document.lifecycle.effectivity === "superseded") reconciliation.superseded.push(document.identifier);
    if (document.lifecycle.retention === "historical" || document.lifecycle.retention === "archived") reconciliation.archived.push(document.identifier);
  }

  for (const item of inventory) if (!current.has(item.identifier)) reconciliation.removed.push(item.identifier);
  reconciliation.stale.push(...reconciliation.removed);
  return reconciliation;
}

function withEngineFields(result: SynchronizationResult, startedAt: number, reconciliation: InventoryReconciliation, inventoryGenerationStatus: "not_attempted" | "synchronized" | "failed" = "not_attempted", documentsSynchronized = 0): SynchronizationEngineResult {
  return {
    ...result,
    durationMs: Date.now() - startedAt,
    reconciliation,
    search: { documentCount: result.documents.length, indexedFields: ["identifier", "title", "path", "owner", "classification", "status", "body", "relationships"], status: result.status === "completed" ? "ready" : "blocked" },
    report: { ...result.report, documentsSynchronized, inventoryGenerationStatus },
  };
}

/**
 * Reusable Synchronization Engine. It stages discovery, parsing, validation, graph building,
 * reconciliation, search planning, publication, and audit-ready reporting without embedding CLI logic.
 */
export async function runAdministrationRepositorySynchronization(input: SynchronizationEngineInput): Promise<SynchronizationEngineResult> {
  const startedAt = Date.now();
  const families = input.families || GOVERNED_DOCUMENT_FAMILIES;
  input.logger?.info("administration_repository_synchronization_started", { sourceCommit: input.sourceCommit });

  let documents: SourceDocument[];
  try {
    documents = input.documents || await discoverGovernedDocuments(input.rootDirectory, families);
  } catch (error) {
    const failed = synchronizeGovernedDocuments(input.sourceCommit, [], families);
    failed.status = "failed";
    failed.errors.push({ path: "docs", code: "discovery_failed", message: error instanceof Error ? error.message : "Governed document discovery failed." });
    const result = withEngineFields(failed, startedAt, reconcileGovernedDocumentInventory([], input.inventory), "not_attempted");
    input.logger?.error("administration_repository_synchronization_failed", { sourceCommit: input.sourceCommit, stage: "scan", errors: result.errors.length });
    return result;
  }

  const staged = synchronizeGovernedDocuments(input.sourceCommit, documents, families);
  const reconciliation = reconcileGovernedDocumentInventory(staged.documents, input.inventory);
  let result = withEngineFields(staged, startedAt, reconciliation);
  if (result.status !== "completed") {
    input.logger?.error("administration_repository_synchronization_failed", { sourceCommit: input.sourceCommit, stage: "validate", errors: result.errors.length, warnings: result.warnings.length });
    return result;
  }

  if (!input.publisher) {
    input.logger?.info("administration_repository_synchronization_ready", { sourceCommit: input.sourceCommit, documents: result.documents.length, warnings: result.warnings.length, durationMs: result.durationMs });
    return result;
  }

  try {
    const inventoryGeneration = await input.publisher.publish(result);
    result = withEngineFields(staged, startedAt, reconciliation, "synchronized", inventoryGeneration.documentsSynchronized);
    input.logger?.info("administration_repository_synchronization_completed", { sourceCommit: input.sourceCommit, documents: result.documents.length, synchronized: inventoryGeneration.documentsSynchronized, warnings: result.warnings.length, durationMs: result.durationMs });
    return result;
  } catch (error) {
    const failed = { ...staged, status: "failed" as const, errors: [...staged.errors, { path: "publication", code: "publication_failed", message: error instanceof Error ? error.message : "Publication failed; prior inventory was preserved." }] };
    result = withEngineFields(failed, startedAt, reconciliation, "failed");
    input.logger?.error("administration_repository_synchronization_failed", { sourceCommit: input.sourceCommit, stage: "publish", errors: result.errors.length, warnings: result.warnings.length, durationMs: result.durationMs });
    return result;
  }
}
