/**
 * TLS is always enabled for PostgreSQL. Railway's internal staging Postgres
 * certificate chain is not publicly trusted, so that environment may opt in
 * to accepting its self-signed chain. The opt-in is deliberately narrower
 * than NODE_ENV because the production start command sets NODE_ENV=production.
 */
export type DatabaseSslEnvironment = Readonly<Record<string, string | undefined>>;

export function getDatabaseSslConfiguration(
  environment: DatabaseSslEnvironment = process.env,
): { rejectUnauthorized: boolean } {
  const allowStagingSelfSigned =
    environment.APP_ENV === "staging" &&
    environment.DATABASE_SSL_ALLOW_SELF_SIGNED === "true";

  return { rejectUnauthorized: !allowStagingSelfSigned };
}
