import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Express } from 'express';
import { createApp } from '../backend/dist/app.js';
import { getServerlessDb } from '../backend/dist/db/serverless.js';

export const config = {
  maxDuration: 10,
};

let app: Express | undefined;

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
    if (!app) app = createApp(await getServerlessDb());
    await runExpress(app, req, res);
  } catch (error) {
    console.error('API failed', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }
}
