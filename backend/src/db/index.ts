import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type DB = Database.Database;

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root, where the supplied menusnap.db lives. */
export const projectRoot = path.resolve(here, '../../..');

export const defaultDbPath = process.env.MENUSNAP_DB
  ? path.resolve(process.env.MENUSNAP_DB)
  : path.join(projectRoot, 'menusnap.db');

const migrationsPath = path.join(here, 'migrations.sql');

export function applyMigrations(db: DB): void {
  db.exec(fs.readFileSync(migrationsPath, 'utf8'));
}

export function openDatabase(dbPath: string = defaultDbPath): DB {
  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `Database not found at ${dbPath}. Create it with: sqlite3 menusnap.db < schema.sql && sqlite3 menusnap.db < seed.sql`,
    );
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  return db;
}

let singleton: DB | null = null;

/** Shared connection used by the running server. Tests open their own throwaway copies instead. */
export function getDb(): DB {
  if (!singleton) singleton = openDatabase();
  return singleton;
}
