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

/**
 * node-postgres parses sslmode from a connection string after applying the
 * explicit Pool options. Removing it ensures the narrowly scoped policy above
 * remains the single TLS authority. TLS is still enabled by the Pool `ssl`
 * option in every environment.
 */
export function getDatabaseConnectionString(connectionString: string): string {
  const databaseUrl = new URL(connectionString);
  databaseUrl.searchParams.delete("sslmode");
  return databaseUrl.toString();
}
