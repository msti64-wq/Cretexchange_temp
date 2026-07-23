export const RAILWAY_DEPLOYMENT_COMMIT_ENV = "RAILWAY_GIT_COMMIT_SHA";
export const ADMIN_REPOSITORY_SOURCE_COMMIT_ENV = "ADMIN_REPOSITORY_SOURCE_COMMIT";

export type SourceCommitResolution = {
  commitSha: string;
  sourceVariable: typeof RAILWAY_DEPLOYMENT_COMMIT_ENV | typeof ADMIN_REPOSITORY_SOURCE_COMMIT_ENV;
};

function fail(message: string): never { throw new Error(message); }

function requireFullCommitSha(value: string, variableName: string): string {
  const normalized = value.trim();
  if (!/^[a-f0-9]{40}$/i.test(normalized)) fail(`${variableName} must be a full 40-character hexadecimal Git SHA.`);
  return normalized.toLowerCase();
}

/** Resolves only immutable deployment provenance; it never interrogates the filesystem or a Git executable. */
export function resolveImmutableSourceCommit(environment: Record<string, string | undefined> = process.env): SourceCommitResolution {
  const railwayValue = environment[RAILWAY_DEPLOYMENT_COMMIT_ENV];
  const explicitValue = environment[ADMIN_REPOSITORY_SOURCE_COMMIT_ENV];
  if (!railwayValue && !explicitValue) fail("An immutable deployment source commit is required.");

  const railwayCommit = railwayValue ? requireFullCommitSha(railwayValue, RAILWAY_DEPLOYMENT_COMMIT_ENV) : undefined;
  const explicitCommit = explicitValue ? requireFullCommitSha(explicitValue, ADMIN_REPOSITORY_SOURCE_COMMIT_ENV) : undefined;
  if (railwayCommit && explicitCommit && railwayCommit !== explicitCommit) fail("Conflicting immutable deployment source commits were supplied.");

  return railwayCommit
    ? { commitSha: railwayCommit, sourceVariable: RAILWAY_DEPLOYMENT_COMMIT_ENV }
    : { commitSha: explicitCommit!, sourceVariable: ADMIN_REPOSITORY_SOURCE_COMMIT_ENV };
}

export function sanitizeCommitSha(commitSha: string): string { return `${commitSha.slice(0, 12)}…${commitSha.slice(-4)}`; }
