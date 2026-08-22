import pg, { Pool } from "pg";

/**
 * Return DATE columns as plain 'YYYY-MM-DD' strings.
 *
 * By default node-postgres turns them into JS Date objects at local midnight,
 * which silently shifts the day for anyone whose server runs in a different
 * timezone than the trip — exactly the bug that would only show up on stage.
 * A trip day is a calendar date, not an instant, so it stays a string.
 */
pg.types.setTypeParser(1082, (value: string) => value);

// Next.js hot-reloads modules in development, which would otherwise create a
// new pool on every edit until the database refuses connections.
const globalForDb = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForDb.pool ??
  new Pool({
    // TLS is configured entirely by `sslmode` in the connection string. An
    // earlier version overrode it with `rejectUnauthorized: false`, which
    // silently turned off certificate verification — the opposite of what a
    // URL saying "require" leads you to expect. Hosted Postgres providers
    // present certificates signed by public authorities, so verifying them
    // costs nothing. Use `?sslmode=verify-full` in DATABASE_URL.
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await pool.query(text, params as never[]);
  return res.rows as T[];
}

export async function one<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
