import type { DB } from './types.js';

/** Convenience wrappers matching the refactor plan naming. */
export async function dbGet<T>(db: DB, sql: string, params?: unknown[]): Promise<T | undefined> {
  return db.get<T>(sql, params);
}

export async function dbAll<T>(db: DB, sql: string, params?: unknown[]): Promise<T[]> {
  return db.all<T>(sql, params);
}

export async function dbRun(db: DB, sql: string, params?: unknown[]): Promise<{ lastInsertRowid: number }> {
  return db.run(sql, params);
}
