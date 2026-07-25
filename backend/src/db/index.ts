import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openLibsqlDatabase } from './libsql.js';
import type { DB } from './types.js';

export type { DB } from './types.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root, where the supplied menusnap.db lives. */
export const projectRoot = path.resolve(here, '../../..');

export const defaultDbPath = process.env.MENUSNAP_DB
  ? path.resolve(process.env.MENUSNAP_DB)
  : path.join(projectRoot, 'menusnap.db');

const migrationsPath = path.join(here, 'migrations.sql');

const FALLBACK_MIGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS onboarding_swipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    liked INTEGER NOT NULL CHECK (liked IN (0,1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, menu_item_id)
);
CREATE INDEX IF NOT EXISTS idx_onboarding_swipes_user ON onboarding_swipes(user_id);
`.trim();

function readMigrationsSql(): string {
  const candidates = [
    migrationsPath,
    path.join(process.cwd(), 'backend/src/db/migrations.sql'),
    path.join(process.cwd(), 'backend/dist/db/migrations.sql'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
  }
  return FALLBACK_MIGRATIONS_SQL;
}

export async function applyMigrations(db: DB): Promise<void> {
  const sql = readMigrationsSql();
  // Split on semicolons for multi-statement migration files.
  for (const statement of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
    await db.run(statement);
  }
}

export async function openDatabase(dbPath: string = defaultDbPath): Promise<DB> {
  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `Database not found at ${dbPath}. Create it with: sqlite3 menusnap.db < schema.sql && sqlite3 menusnap.db < seed.sql`,
    );
  }
  const db = (await import('./sqlite.js')).openSqliteDatabase(dbPath);
  await applyMigrations(db);
  return db;
}

let singleton: DB | null = null;

/** Shared connection used by the running server. Tests open their own throwaway copies instead. */
export async function getDb(): Promise<DB> {
  if (!singleton) {
    const tursoUrl = process.env.TURSO_DATABASE_URL;
    if (tursoUrl) {
      singleton = openLibsqlDatabase(tursoUrl, process.env.TURSO_AUTH_TOKEN);
      await applyMigrations(singleton);
    } else if (process.env.VERCEL) {
      throw new Error(
        'TURSO_DATABASE_URL is not set. Vercel cannot use the local menusnap.db file — create a Turso database, seed it, and add TURSO_DATABASE_URL + TURSO_AUTH_TOKEN in the Vercel project settings.',
      );
    } else {
      singleton = await openDatabase();
    }
  }
  return singleton;
}
