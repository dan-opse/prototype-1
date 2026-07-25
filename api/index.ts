import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../backend/src/app.js';
import { getDb } from '../backend/src/db/index.js';

// Lazy-init: reuse app across warm invocations
let app: ReturnType<typeof createApp> | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!app) app = createApp(await getDb());
  return app(req, res);
}
