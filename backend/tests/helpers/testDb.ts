import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { applyMigrations, projectRoot, type DB } from '../../src/db/index.js';

/**
 * Builds a throwaway in-memory database from the supplied schema and seed files, so tests never
 * touch (or depend on the state of) the checked-in menusnap.db.
 */
export function createTestDb(): DB {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(path.join(projectRoot, 'schema.sql'), 'utf8'));
  db.exec(fs.readFileSync(path.join(projectRoot, 'seed.sql'), 'utf8'));
  applyMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

/** Mandu carries no feedback in the seed data, which makes it the cold-start case. */
export const COLD_DISH_ID = 8;
