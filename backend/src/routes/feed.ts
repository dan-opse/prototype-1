import { Router } from 'express';
import type { DB } from '../db/index.js';
import { asyncRoute, notFound, parseId, parseOptionalId } from '../http.js';
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
      const restaurantId = parseOptionalId(req.query.restaurantId, 'restaurantId');
      requireUser(db, userId);
      if (restaurantId !== undefined) {
        const restaurant = db.prepare('SELECT id FROM restaurants WHERE id = ?').get(restaurantId);
        if (!restaurant) throw notFound(`No restaurant with id ${restaurantId}`);
      }
      res.json({
        tab: 'for-you',
        user_id: userId,
        restaurant_id: restaurantId ?? null,
        onboarding: getOnboardingStatus(db, userId),
        dishes: buildForYouFeed(db, userId, restaurantId),
      });
    }),
  );

  return router;
}
