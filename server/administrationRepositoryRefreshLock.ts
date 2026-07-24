import { pool } from "./db";

// A stable, namespaced PostgreSQL advisory-lock key. It holds no business data and
// needs no migration; PostgreSQL releases it if the owning database session ends.
export const ADMINISTRATION_REPOSITORY_REFRESH_LOCK_KEY = 913517683;

type AdvisoryLockQueryResult = { rows: Array<{ acquired?: boolean }> };
export type AdministrationRepositoryLockClient = {
  query(sql: string, values?: readonly unknown[]): Promise<AdvisoryLockQueryResult>;
  release(error?: Error): void;
};
export type AdministrationRepositoryLockConnection = {
  connect(): Promise<AdministrationRepositoryLockClient>;
};
export type AdministrationRepositoryRefreshLease = { release(): Promise<void> };
export type AdministrationRepositoryRefreshLock = { acquire(): Promise<AdministrationRepositoryRefreshLease | null> };

/**
 * PostgreSQL session advisory locking is authoritative across service replicas.
 * A lost session automatically releases the lock; release also unlocks explicitly
 * before returning the dedicated client to the connection pool.
 */
export function createPostgresAdministrationRepositoryRefreshLock(connection: AdministrationRepositoryLockConnection = pool): AdministrationRepositoryRefreshLock {
  return {
    async acquire(): Promise<AdministrationRepositoryRefreshLease | null> {
      const client = await connection.connect();
      try {
        const result = await client.query("SELECT pg_try_advisory_lock($1::integer) AS acquired", [ADMINISTRATION_REPOSITORY_REFRESH_LOCK_KEY]);
        if (result.rows[0]?.acquired !== true) {
          client.release();
          return null;
        }
      } catch (error) {
        client.release(error instanceof Error ? error : new Error("administration_repository_refresh_lock_failure"));
        throw error;
      }

      let released = false;
      return {
        async release(): Promise<void> {
          if (released) return;
          released = true;
          try {
            await client.query("SELECT pg_advisory_unlock($1::integer)", [ADMINISTRATION_REPOSITORY_REFRESH_LOCK_KEY]);
            client.release();
          } catch (error) {
            // Destroying a failed session is safe: PostgreSQL releases its advisory locks.
            client.release(error instanceof Error ? error : new Error("administration_repository_refresh_unlock_failure"));
          }
        },
      };
    },
  };
}

export const administrationRepositoryRefreshLock = createPostgresAdministrationRepositoryRefreshLock();
