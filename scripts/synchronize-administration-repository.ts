import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { isAdministrationRepositoryEnabled, isEligibleGovernedDocumentPath, synchronizeGovernedDocuments, type SourceDocument } from "../server/administrationRepository";
import { persistAdministrationRepositorySynchronization } from "../server/administrationRepositoryReadModel";

const DOCUMENT_MARKER = /(?:^#\s+.*\b(?:CTX-(?:STD|ARCH|DEP|DB)-\d{3}|CTX-OPS-\d{3}|ADR-\d{3}|PD-\d{3})\b|^-\s*\*\*Document ID:\*\*)/mi;

function fail(message: string): never { throw new Error(message); }

async function collectMarkdown(relativeDirectory: string): Promise<SourceDocument[]> {
  const absoluteDirectory = path.resolve(relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const nested = await Promise.all(entries.sort((a, b) => a.name.localeCompare(b.name)).map(async (entry) => {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) return collectMarkdown(relativePath);
    if (!entry.isFile() || !relativePath.endsWith(".md") || !isEligibleGovernedDocumentPath(relativePath)) return [];
    const body = await readFile(path.resolve(relativePath), "utf8");
    return DOCUMENT_MARKER.test(body) ? [{ path: relativePath, body }] : [];
  }));
  return nested.flat();
}

async function main() {
  if (!isAdministrationRepositoryEnabled()) fail("ADMIN_REPOSITORY_ENABLED=true is required.");
  if (process.env.SYNCHRONIZATION_TARGET !== "staging" || process.env.RAILWAY_ENVIRONMENT_NAME !== "staging") fail("Synchronization is staging-only and requires explicit staging target guards.");
  if (!process.env.DATABASE_URL) fail("DATABASE_URL is required inside the private staging synchronization job.");

  const immutableCommitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (!/^[a-f0-9]{40}$/i.test(immutableCommitSha)) fail("Unable to determine immutable source commit.");
  const documents = (await Promise.all(["docs/architecture", "docs/standards", "docs/operations", "docs/product", "docs/project", "docs/ux", "docs/business", "docs/research", "docs/vision"].map(collectMarkdown))).flat().sort((a, b) => a.path.localeCompare(b.path));
  const result = synchronizeGovernedDocuments(immutableCommitSha, documents);
  console.log(`SYNCHRONIZATION_PLAN commit=${immutableCommitSha} candidates=${documents.length} parsed=${result.documents.length} errors=${result.errors.length}`);
  if (result.status !== "completed") {
    for (const error of result.errors) console.error(`SYNCHRONIZATION_VALIDATION_ERROR path=${error.path} code=${error.code}`);
    fail("Governed-source validation failed before database persistence.");
  }
  const runId = await persistAdministrationRepositorySynchronization(immutableCommitSha, result);
  console.log(`SYNCHRONIZATION_COMPLETED run=${runId} documents=${result.documents.length}`);
}

main().catch((error) => {
  console.error(`ADMIN_REPOSITORY_SYNCHRONIZATION_FAILED ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
