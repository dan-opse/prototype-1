# MenuSnap — Vercel Refactor Plan

This document describes how to refactor MenuSnap for **Vercel-only hosting** while keeping the same logic, API shapes, and feature functionality as the current Express + SQLite setup.

---

## Current vs target

| What you have now | Why it breaks on Vercel |
| --- | --- |
| Express listening on port 4000 | Vercel has no long-running servers |
| `menusnap.db` as a local file | Serverless filesystem is ephemeral; writes don't persist |
| `better-sqlite3` (native module) | Painful / unreliable in serverless builds |

**Frontend on Vercel is trivial.** The refactor is almost entirely backend + database.

---

## Target architecture

```
vercel.app (single deployment)
├── /                    → React static build (frontend/dist)
├── /restaurants         → React (client-side routing)
└── /api/*               → One serverless function running your Express app
                              ↓
                         Turso (hosted SQLite) — persistent DB
```

- Same URLs as today (`/api/feed/community`, etc.)
- No separate API host
- No CORS changes

---

## Recommended database: Turso (libSQL)

Turso is **remote SQLite** — SQL, schema, and seed data stay almost identical. It is the standard pairing for “SQLite app → serverless.”

- Free tier is enough for this assignment
- Keeps `item_feedback_summary` view, joins, migrations
- Removes `better-sqlite3` from production (cleaner Vercel builds)

**Strictly Vercel-only alternative:** Vercel Postgres (Neon). Works, but requires rewriting SQL (views, SQLite quirks) — more risk, same features, more work. Turso is the better fit for “exact same logic.”

---

## Refactor phases

### Phase 1 — Project layout for Vercel (~1 hr)

Add at repo root:

```
api/
  index.ts          ← Vercel serverless entry (wraps Express)
vercel.json         ← build, rewrites, function config
```

`vercel.json` (conceptually):

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "frontend/dist",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

- `/api/*` → serverless function
- Everything else → React SPA

**Frontend:** no API URL env var needed in production (same origin).

**Local dev:** replace `npm run dev` with `vercel dev` (runs frontend + API together), or keep the current setup with Turso credentials in `.env.local`.

---

### Phase 2 — Express → serverless entry (~1 hr)

`createApp(db)` already exists in `backend/src/app.ts`. The split is mostly done.

**Remove** `server.ts` `app.listen()` from the Vercel path.

**Add** `api/index.ts`:

```typescript
import { createApp } from '../backend/src/app';
import { getDb } from '../backend/src/db';

// Lazy-init: reuse app across warm invocations
let app: ReturnType<typeof createApp> | undefined;

export default async function handler(req, res) {
  if (!app) app = createApp(await getDb());
  return app(req, res);
}
```

All existing routes, services, ranking math, and test logic stay in `backend/`.

---

### Phase 3 — Database layer: sync → async (~4–6 hrs)

This is the biggest change. Every `db.prepare(...).get()` becomes async.

#### 3a. New DB client (`backend/src/db/client.ts`)

Wrap `@libsql/client`:

```typescript
export async function dbGet<T>(sql: string, params?: unknown[]): Promise<T | undefined>
export async function dbAll<T>(sql: string, params?: unknown[]): Promise<T[]>
export async function dbRun(sql: string, params?: unknown[]): Promise<{ lastInsertRowid: number }>
```

Keep SQL strings **unchanged**.

#### 3b. Refactor consumers (~12 files)

| Area | Files | Change |
| --- | --- | --- |
| Routes | `users`, `feed`, `restaurants`, `feedback`, `menuItems`, `onboarding` | `await dbGet(...)` |
| Services | `ranking`, `tasteProfile`, `feed`, `onboarding` | async functions |
| `asyncRoute` | `http.ts` | Already supports async handlers — minimal change |

Example:

```typescript
// before
const user = db.prepare('SELECT ...').get(userId);

// after
const user = await dbGet<UserRow>('SELECT ...', [userId]);
```

#### 3c. Connection handling

- `getDb()` opens a libsql client from env vars
- Reuse one client per warm lambda (module-level singleton)
- Run `migrations.sql` on first connect (`CREATE TABLE IF NOT EXISTS` — same as now)

#### 3d. Environment variables (Vercel dashboard)

```
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=...
```

---

### Phase 4 — Seed Turso once (~30 min)

One-time import of existing data:

```bash
# Install Turso CLI, create DB
turso db create menusnap
turso db shell menusnap < schema.sql
turso db shell menusnap < seed.sql
# Apply onboarding_swipes migration
turso db shell menusnap < backend/src/db/migrations.sql
```

After that, production uses the remote DB. No `menusnap.db` file in the deployment.

---

### Phase 5 — Tests (~2 hrs)

Keep **two drivers**, same SQL:

| Environment | Driver | Why |
| --- | --- | --- |
| `npm test` | `better-sqlite3` in-memory (current) | Fast, no network, 40 tests unchanged in spirit |
| Production / `vercel dev` | `@libsql/client` → Turso | Real persistence |

Add a thin `DB` interface so services don't care which driver runs. Tests keep using `createTestDb()` with SQLite in-memory; only the adapter changes.

Optional: one integration test against Turso in CI (can skip for assignment).

---

### Phase 6 — Build & dependencies (~1 hr)

**Root `package.json` build:**

```json
"build": "npm run build -w backend && npm run build -w frontend"
```

**Dependency moves:**

| Package | Production | Dev only |
| --- | --- | --- |
| `@libsql/client` | ✅ | |
| `better-sqlite3` | ❌ remove | ✅ tests |
| `express` | ✅ | |

**`vercel.json` function config:**

```json
"functions": {
  "api/index.ts": {
    "memory": 1024,
    "maxDuration": 10
  }
}
```

Feed ranking over 26 dishes is fine within limits; cold starts may add ~1–2s on first load.

---

### Phase 7 — Frontend tweaks (~30 min)

Minimal changes:

1. Keep `fetch('/api/...')` — works on Vercel same-origin
2. `vite.config.ts` proxy — keep for optional non-Vercel local dev
3. Confirm React Router paths work via `vercel.json` SPA fallback

No feature changes.

---

### Phase 8 — Deploy (~30 min)

1. Push repo to GitHub
2. Import project in Vercel (root directory = repo root)
3. Set `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`
4. Deploy
5. Smoke test: restaurants, feed, log meal, taste profile, quiz

---

## What stays identical

| Layer | Changes? |
| --- | --- |
| Ranking formulas (Bayesian, personalization, dislike penalty) | ❌ None |
| Taste profile weighting | ❌ None |
| API routes & response shapes | ❌ None |
| React pages & UX | ❌ None |
| SQL queries | ❌ Nearly none (parameter style may shift slightly) |
| Test assertions | ❌ Same behavior, async wrappers |

---

## What actually changes

| Layer | Change |
| --- | --- |
| DB driver | `better-sqlite3` → `@libsql/client` |
| DB location | Local file → Turso |
| Call style | Sync → `async/await` throughout backend |
| Server entry | `server.ts` listen → `api/index.ts` serverless |
| Local dev | `vercel dev` (recommended) |
| Hosting | One Vercel project |

---

## Effort estimate

| Phase | Time |
| --- | --- |
| Vercel layout + Express wrapper | ~2 hrs |
| Async DB refactor | ~4–6 hrs |
| Turso setup + seed | ~1 hr |
| Tests + build config | ~2 hrs |
| Deploy + smoke test | ~1 hr |
| **Total** | **~10–12 hrs** |

---

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Cold starts feel slow | Acceptable for assignment; warm invocations are fast |
| Turso is “not Vercel” | Standard SQLite-on-serverless choice; Vercel Postgres is the all-Vercel DB option but needs more SQL rewrites |
| Async refactor introduces bugs | Keep 40 tests green; change driver, not formulas |
| Concurrent writes on feed recompute | Fine at assignment scale; Turso handles it |

---

## Suggested execution order

1. Turso DB + import seed data
2. DB abstraction layer + one route working async
3. Refactor remaining routes/services
4. `api/index.ts` + `vercel.json`
5. `vercel dev` locally until feature parity
6. Tests green
7. Deploy

---

## Bottom line

The project **is** frontend + backend today. For Vercel-only hosting:

- **Frontend** → static build on Vercel (already fits)
- **Backend** → one serverless function wrapping the existing Express app
- **Database** → Turso so writes persist (non-negotiable on Vercel)
- **Main work** → sync → async DB calls (~12 files), not rewriting product logic
