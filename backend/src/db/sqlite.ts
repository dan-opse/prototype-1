import Database from 'better-sqlite3';
import type { DB } from './types.js';

/** better-sqlite3 adapter — used for local file DB and in-memory tests. */
export class SqliteDB implements DB {
  constructor(private readonly db: Database.Database) {}

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  async run(sql: string, params: unknown[] = []): Promise<{ lastInsertRowid: number }> {
    const result = this.db.prepare(sql).run(...params);
    return { lastInsertRowid: Number(result.lastInsertRowid) };
  }

  async transaction<T>(fn: (tx: DB) => Promise<T>): Promise<T> {
    await this.run('BEGIN');
    try {
      const result = await fn(this);
      await this.run('COMMIT');
      return result;
    } catch (error) {
      await this.run('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}

export function openSqliteDatabase(dbPath: string): SqliteDB {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return new SqliteDB(db);
}
