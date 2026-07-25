import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DB } from './types.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const FALLBACK_MIGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS onboarding_swipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    liked INTEGER NOT NULL CHECK (liked IN (0,1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, menu_item_id)
);
CREATE INDEX IF NOT EXISTS idx_onboarding_swipes_user ON onboarding_swipes(user_id);
`.trim();

function readMigrationsSql(): string {
  const candidates = [
    path.join(here, 'migrations.sql'),
    path.join(process.cwd(), 'backend/src/db/migrations.sql'),
    path.join(process.cwd(), 'backend/dist/db/migrations.sql'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
  }
  return FALLBACK_MIGRATIONS_SQL;
}

export async function applyMigrations(db: DB): Promise<void> {
  const sql = readMigrationsSql();
  for (const statement of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
    await db.run(statement);
  }
}
