import path from "node:path";
import { pathToFileURL } from "node:url";
import { isAdministrationRepositoryEnabled } from "../server/administrationRepository";
import { getAdministrationRepositoryInventorySnapshot, persistAdministrationRepositorySynchronization } from "../server/administrationRepositoryReadModel";
import { runAdministrationRepositorySynchronization, type SynchronizationLogger } from "../server/administrationRepositorySynchronization";
import { resolveImmutableSourceCommit, sanitizeCommitSha } from "../server/administrationRepositorySourceCommit";
import { pool } from "../server/db";

function fail(message: string): never { throw new Error(message); }

const logger: SynchronizationLogger = {
  info(event, metadata) { console.log(JSON.stringify({ event, ...metadata })); },
  error(event, metadata) { console.error(JSON.stringify({ event, ...metadata })); },
};

async function main() {
  try {
    if (!isAdministrationRepositoryEnabled()) fail("ADMIN_REPOSITORY_ENABLED=true is required.");
    if (!process.env.DATABASE_URL) fail("DATABASE_URL is required inside the private synchronization job.");

    const sourceCommit = resolveImmutableSourceCommit();
    const immutableCommitSha = sourceCommit.commitSha;
    const isStagingTarget = process.env.SYNCHRONIZATION_TARGET === "staging" && process.env.RAILWAY_ENVIRONMENT_NAME === "staging";
    const isExplicitlyAuthorizedProductionTarget = process.env.SYNCHRONIZATION_TARGET === "production"
      && process.env.RAILWAY_ENVIRONMENT_NAME === "production"
      && process.env.ADMIN_REPOSITORY_PRODUCTION_SYNC_AUTHORIZATION === immutableCommitSha;
    if (!isStagingTarget && !isExplicitlyAuthorizedProductionTarget) {
      fail("Synchronization requires the staging target guard or explicit production authorization for the immutable deployed commit.");
    }

    console.log(`SYNCHRONIZATION_SOURCE_COMMIT variable=${sourceCommit.sourceVariable} sha=${sanitizeCommitSha(immutableCommitSha)}`);
    const inventory = await getAdministrationRepositoryInventorySnapshot();
    let runId = "";
    const result = await runAdministrationRepositorySynchronization({
      sourceCommit: immutableCommitSha,
      inventory,
      rootDirectory: process.cwd(),
      logger,
      publisher: {
        async publish(staged) {
          runId = await persistAdministrationRepositorySynchronization(immutableCommitSha, staged);
          return { publicationId: runId, documentsPublished: staged.documents.length };
        },
      },
    });
    console.log(`SYNCHRONIZATION_PLAN commit=${immutableCommitSha} discovered=${result.report.documentsDiscovered} parsed=${result.report.documentsParsed} warnings=${result.warnings.length} errors=${result.errors.length}`);
    if (result.status !== "completed") {
      for (const error of result.errors) console.error(`SYNCHRONIZATION_VALIDATION_ERROR path=${error.path} code=${error.code}`);
      fail("Governed-source validation or publication failed before a refreshed inventory could become active.");
    }
    console.log(`SYNCHRONIZATION_COMPLETED run=${runId} documents=${result.report.documentsPublished} duration_ms=${result.durationMs}`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`ADMIN_REPOSITORY_SYNCHRONIZATION_FAILED ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  });
}
