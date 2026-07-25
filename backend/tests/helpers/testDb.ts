import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from '../../src/db/index.js';
import { SqliteDB } from '../../src/db/sqlite.js';
import type { DB } from '../../src/db/types.js';

/**
 * Builds a throwaway in-memory database from the supplied schema and seed files, so tests never
 * touch (or depend on the state of) the checked-in menusnap.db.
 */
export function createTestDb(): DB {
  const raw = new Database(':memory:');
  raw.exec(fs.readFileSync(path.join(projectRoot, 'schema.sql'), 'utf8'));
  raw.exec(fs.readFileSync(path.join(projectRoot, 'seed.sql'), 'utf8'));
  const db = new SqliteDB(raw);
  // applyMigrations is async but schema is sync here — run migration SQL directly.
  raw.exec(fs.readFileSync(path.join(projectRoot, 'backend/src/db/migrations.sql'), 'utf8'));
  raw.pragma('foreign_keys = ON');
  return db;
}

/** Mandu carries no feedback in the seed data, which makes it the cold-start case. */
export const COLD_DISH_ID = 8;
