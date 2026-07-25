import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Express } from 'express';

export const config = {
  maxDuration: 10,
};

let app: Express | undefined;

async function loadApp(): Promise<Express> {
  if (!app) {
    // Vercel compiles api/ to CommonJS; backend dist is ESM — must use dynamic import.
    const { createApp } = await import('../backend/dist/app.js');
    const { getServerlessDb } = await import('../backend/dist/db/serverless.js');
    app = createApp(await getServerlessDb());
  }
  return app;
}

function runExpress(appInstance: Express, req: VercelRequest, res: VercelResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    appInstance(req, res, (error: unknown) => {
      if (error) reject(error);
    });
    res.on('finish', () => resolve());
    res.on('close', () => resolve());
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await runExpress(await loadApp(), req, res);
  } catch (error) {
    console.error('API failed', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }
}
