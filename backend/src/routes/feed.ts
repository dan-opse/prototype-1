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
    asyncRoute(async (_req, res) => {
      res.json({ tab: 'community', dishes: await buildCommunityFeed(db) });
    }),
  );

  router.get(
    '/for-you',
    asyncRoute(async (req, res) => {
      const userId = parseId(req.query.userId, 'userId');
      const restaurantId = parseOptionalId(req.query.restaurantId, 'restaurantId');
      await requireUser(db, userId);
      if (restaurantId !== undefined) {
        const restaurant = await db.get('SELECT id FROM restaurants WHERE id = ?', [restaurantId]);
        if (!restaurant) throw notFound(`No restaurant with id ${restaurantId}`);
      }
      res.json({
        tab: 'for-you',
        user_id: userId,
        restaurant_id: restaurantId ?? null,
        onboarding: await getOnboardingStatus(db, userId),
        dishes: await buildForYouFeed(db, userId, restaurantId),
      });
    }),
  );

  return router;
}
