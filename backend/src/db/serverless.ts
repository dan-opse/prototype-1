import { applyMigrations } from './migrations.js';
import { openLibsqlDatabase } from './libsql.js';
import type { DB } from './types.js';

let singleton: DB | null = null;

/** Turso-only DB entry for Vercel — never imports better-sqlite3. */
export async function getServerlessDb(): Promise<DB> {
  if (!singleton) {
    const tursoUrl = process.env.TURSO_DATABASE_URL;
    if (!tursoUrl) {
      throw new Error(
        'TURSO_DATABASE_URL is not set. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel project settings.',
      );
    }
    singleton = openLibsqlDatabase(tursoUrl, process.env.TURSO_AUTH_TOKEN);
    await applyMigrations(singleton);
  }
  return singleton;
}
