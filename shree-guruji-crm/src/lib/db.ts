import 'server-only';
import pg from 'pg';

// DATE columns come back as 'YYYY-MM-DD' strings, never shifted through a JS Date.
pg.types.setTypeParser(1082, v => v);

function config(): pg.PoolConfig {
  if (process.env.DB_HOST) {
    return {
      host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), database: process.env.DB_NAME,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    };
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  return { connectionString: process.env.DATABASE_URL };
}

const g = globalThis as unknown as { __sgPool?: pg.Pool };
export const pool: pg.Pool = g.__sgPool ?? (g.__sgPool = new pg.Pool({ ...config(), max: 10 }));

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(text, params);
  return r.rows as T[];
}

export async function one<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const r = await pool.query(text, params);
  return (r.rows[0] as T) ?? null;
}

export type Tx = pg.PoolClient;

export async function tx<T>(fn: (c: Tx) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

export const dbName = () => process.env.DB_NAME || (process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname.slice(1) : '');
