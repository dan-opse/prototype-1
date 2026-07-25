import { Router } from 'express';
import type { DB } from '../db/index.js';
import { asyncRoute, parseId } from '../http.js';
import { buildCommunityFeed, buildForYouFeed } from '../services/feed.js';
import { getOnboardingStatus } from '../services/onboarding.js';
import { requireUser } from './users.js';

export function feedRouter(db: DB): Router {
  const router = Router();

  router.get(
    '/community',
    asyncRoute((_req, res) => {
      res.json({ tab: 'community', dishes: buildCommunityFeed(db) });
    }),
  );

  router.get(
    '/for-you',
    asyncRoute((req, res) => {
      const userId = parseId(req.query.userId, 'userId');
      requireUser(db, userId);
      res.json({
        tab: 'for-you',
        user_id: userId,
        onboarding: getOnboardingStatus(db, userId),
        dishes: buildForYouFeed(db, userId),
      });
    }),
  );

  return router;
}
