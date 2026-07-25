import express, { type NextFunction, type Request, type Response } from 'express';
import type { DB } from './db/index.js';
import { HttpError } from './http.js';
import { feedRouter } from './routes/feed.js';
import { feedbackRouter, SOFT_TAG_TARGET } from './routes/feedback.js';
import { menuItemsRouter } from './routes/menuItems.js';
import { onboardingRouter } from './routes/onboarding.js';
import { restaurantsRouter } from './routes/restaurants.js';
import { usersRouter } from './routes/users.js';
import { QUIZ_LENGTH } from './services/onboarding.js';

export function createApp(db: DB) {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, quiz_length: QUIZ_LENGTH, soft_tag_target: SOFT_TAG_TARGET });
  });

  app.use('/api/users', usersRouter(db));
  app.use('/api/onboarding', onboardingRouter(db));
  app.use('/api/feed', feedRouter(db));
  app.use('/api/menu-items', menuItemsRouter(db));
  app.use('/api/restaurants', restaurantsRouter(db));
  app.use('/api/feedback', feedbackRouter(db));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Unknown endpoint' });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({ error: 'Request body is not valid JSON' });
      return;
    }
    console.error('Unhandled error', error);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
