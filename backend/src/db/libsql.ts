import { createClient, type Client } from '@libsql/client';
import type { DB } from './types.js';

/** libSQL / Turso adapter — used in production and vercel dev. */
export class LibsqlDB implements DB {
  constructor(private readonly client: Client) {}

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const result = await this.client.execute({ sql, args: params as (string | number | null)[] });
    return (result.rows[0] as T) ?? undefined;
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.client.execute({ sql, args: params as (string | number | null)[] });
    return result.rows as T[];
  }

  async run(sql: string, params: unknown[] = []): Promise<{ lastInsertRowid: number }> {
    const result = await this.client.execute({ sql, args: params as (string | number | null)[] });
    return { lastInsertRowid: Number(result.lastInsertRowid ?? 0) };
  }

  async transaction<T>(fn: (tx: DB) => Promise<T>): Promise<T> {
    const tx = await this.client.transaction('write');
    try {
      const adapter: DB = {
        get: <U>(sql: string, params?: unknown[]) => tx.execute({ sql, args: (params ?? []) as (string | number | null)[] }).then((r) => r.rows[0] as U | undefined),
        all: <U>(sql: string, params?: unknown[]) => tx.execute({ sql, args: (params ?? []) as (string | number | null)[] }).then((r) => r.rows as U[]),
        run: async (sql: string, params?: unknown[]) => {
          const result = await tx.execute({ sql, args: (params ?? []) as (string | number | null)[] });
          return { lastInsertRowid: Number(result.lastInsertRowid ?? 0) };
        },
        transaction: async (inner) => inner(adapter),
        close: async () => {},
      };
      const result = await fn(adapter);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async close(): Promise<void> {
    this.client.close();
  }
}

export function openLibsqlDatabase(url: string, authToken?: string): LibsqlDB {
  const client = createClient({ url, authToken });
  return new LibsqlDB(client);
}
