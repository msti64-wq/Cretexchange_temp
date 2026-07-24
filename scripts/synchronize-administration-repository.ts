import path from "node:path";
import { pathToFileURL } from "node:url";
import { isAdministrationRepositoryEnabled } from "../server/administrationRepository";
import { authorizeAdministrationRepositoryRefresh } from "../server/administrationRepositoryRefreshAuthorization";
import { administrationRepositoryRefreshLock } from "../server/administrationRepositoryRefreshLock";
import { getAdministrationRepositoryInventorySnapshot, persistAdministrationRepositorySynchronization } from "../server/administrationRepositoryReadModel";
import { runAdministrationRepositorySynchronization, type SynchronizationLogger } from "../server/administrationRepositorySynchronization";
import { sanitizeCommitSha } from "../server/administrationRepositorySourceCommit";
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

    const authorization = authorizeAdministrationRepositoryRefresh();
    if (!authorization.allowed) fail(`Synchronization authorization denied: ${authorization.code}.`);
    const { sourceCommit } = authorization;
    const immutableCommitSha = sourceCommit.commitSha;
    const lease = await administrationRepositoryRefreshLock.acquire();
    if (!lease) fail("Synchronization is already in progress.");

    try {
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
            return { inventoryGenerationId: runId, documentsSynchronized: staged.documents.length };
          },
        },
      });
      console.log(`SYNCHRONIZATION_PLAN commit=${immutableCommitSha} discovered=${result.report.documentsDiscovered} parsed=${result.report.documentsParsed} warnings=${result.warnings.length} errors=${result.errors.length}`);
      if (result.status !== "completed") {
        for (const error of result.errors) console.error(`SYNCHRONIZATION_VALIDATION_ERROR path=${error.path} code=${error.code}`);
        fail("Governed-source validation or publication failed before a refreshed inventory could become active.");
      }
      console.log(`SYNCHRONIZATION_COMPLETED run=${runId} documents=${result.report.documentsSynchronized} duration_ms=${result.durationMs}`);
    } finally {
      await lease.release();
    }
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
