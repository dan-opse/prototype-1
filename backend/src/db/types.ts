/** Thin async DB interface — same SQL, swappable drivers (better-sqlite3 in tests, libsql in production). */
export interface DB {
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ lastInsertRowid: number }>;
  transaction<T>(fn: (tx: DB) => Promise<T>): Promise<T>;
  close(): void | Promise<void>;
}
