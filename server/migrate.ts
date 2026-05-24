// Apply pending Drizzle migrations. Run via `npm run db:migrate` — typically
// as a deploy step before booting the app, never at runtime so a failed
// migration can't leave a half-broken server serving traffic.
//
// Honours the same dual-driver selection as server/db.ts: pg for local
// Postgres URLs, @neondatabase/serverless for hosted Neon.

import pg from 'pg';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migrateNeon } from 'drizzle-orm/neon-serverless/migrator';
import ws from 'ws';
import { fileURLToPath } from 'url';
import path from 'path';

const { Pool: PgPool } = pg;

function isLocalPostgres(url: string): boolean {
  return /\/\/(?:.*@)?(?:localhost|127\.0\.0\.1)(?::\d+)?\//.test(url);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL must be set');
    process.exit(1);
  }
  const migrationsFolder = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'migrations',
  );
  console.log(`[migrate] applying migrations from ${migrationsFolder}`);
  if (isLocalPostgres(url)) {
    const pool = new PgPool({ connectionString: url });
    const db = drizzlePg(pool);
    await migratePg(db, { migrationsFolder });
    await pool.end();
  } else {
    neonConfig.webSocketConstructor = ws;
    const pool = new NeonPool({ connectionString: url });
    const db = drizzleNeon(pool);
    await migrateNeon(db, { migrationsFolder });
    await pool.end();
  }
  console.log('[migrate] done');
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
