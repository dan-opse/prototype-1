import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyMigrations } from './migrations.js';
import { openLibsqlDatabase } from './libsql.js';
import type { DB } from './types.js';

export type { DB } from './types.js';
export { applyMigrations } from './migrations.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root, where the supplied menusnap.db lives. */
export const projectRoot = path.resolve(here, '../../..');

export const defaultDbPath = process.env.MENUSNAP_DB
  ? path.resolve(process.env.MENUSNAP_DB)
  : path.join(projectRoot, 'menusnap.db');

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
