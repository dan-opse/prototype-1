import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../backend/src/app.js';
import { getDb } from '../backend/src/db/index.js';

// Lazy-init: reuse app across warm invocations
let app: ReturnType<typeof createApp> | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!app) app = createApp(await getDb());
    return app(req, res);
  } catch (error) {
    console.error('API init failed', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
