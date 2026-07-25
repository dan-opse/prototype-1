import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openLibsqlDatabase } from './libsql.js';
import { openSqliteDatabase } from './sqlite.js';
import type { DB } from './types.js';

export type { DB } from './types.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root, where the supplied menusnap.db lives. */
export const projectRoot = path.resolve(here, '../../..');

export const defaultDbPath = process.env.MENUSNAP_DB
  ? path.resolve(process.env.MENUSNAP_DB)
  : path.join(projectRoot, 'menusnap.db');

const migrationsPath = path.join(here, 'migrations.sql');

export async function applyMigrations(db: DB): Promise<void> {
  const sql = fs.readFileSync(migrationsPath, 'utf8');
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
  const db = openSqliteDatabase(dbPath);
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
    } else {
      singleton = await openDatabase();
    }
  }
  return singleton;
}
