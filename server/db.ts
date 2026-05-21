import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import pg from 'pg';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import ws from 'ws';
import * as schema from '@shared/schema';

// pg is a CJS module; pull Pool off the default export to keep ESM happy.
const { Pool: PgPool } = pg;

// Use the standard pg driver for local Postgres (localhost / 127.0.0.1) and the
// Neon serverless driver (WebSocket-based) for hosted Neon databases.
function isLocalPostgres(url: string): boolean {
  return /\/\/(?:.*@)?(?:localhost|127\.0\.0\.1)(?::\d+)?\//.test(url);
}

type AnyPool = NeonPool | pg.Pool;
type AnyDb = ReturnType<typeof drizzleNeon> | ReturnType<typeof drizzlePg>;

let _pool: AnyPool | null = null;
let _db: AnyDb | null = null;

export function getPool(): AnyPool {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL must be set to use database storage.');
  }
  if (isLocalPostgres(url)) {
    _pool = new PgPool({ connectionString: url });
  } else {
    neonConfig.webSocketConstructor = ws;
    _pool = new NeonPool({ connectionString: url });
  }
  return _pool;
}

export function getDb(): AnyDb {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL must be set to use database storage.');
  }
  if (isLocalPostgres(url)) {
    _db = drizzlePg({ client: getPool() as pg.Pool, schema });
  } else {
    _db = drizzleNeon({ client: getPool() as NeonPool, schema });
  }
  return _db;
}

// Backward-compatible exports (lazy)
export const pool = new Proxy({} as AnyPool, {
  get(_target, prop) {
    return (getPool() as any)[prop];
  },
});

export const db = new Proxy({} as AnyDb, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
});
