import { Pool } from "pg";

const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
};

function createPool(): Pool {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    // Opening a TLS connection costs several network round trips, so keep idle
    // connections warm for a few minutes instead of reconnecting after every
    // pause. keepAlive stops routers from silently dropping them meanwhile.
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 5 * 60_000,
    keepAlive: true,
    // A query on a connection that died mid-flight would otherwise wait forever.
    query_timeout: 45_000,
  });

  // An idle connection that dies (network blip, database restart) emits an
  // error on the pool; without a listener Node would crash the whole server.
  // The broken connection is discarded and the next query opens a fresh one.
  pool.on("error", (error) => {
    console.warn("Database connection dropped; it will be replaced:", error.message);
  });

  return pool;
}

export const pool = globalForDb.pool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}
