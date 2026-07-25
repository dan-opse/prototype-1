import { Router } from 'express';
import type { DB } from '../db/index.js';
import { asyncRoute, badRequest, notFound, parseId, parseOptionalId } from '../http.js';
import { getOnboardingStatus } from '../services/onboarding.js';
import { buildForYouFeed } from '../services/feed.js';
import { buildTasteProfile, summarizePreferences } from '../services/tasteProfile.js';
import type { UserRow } from '../types.js';

export async function requireUser(db: DB, userId: number): Promise<UserRow> {
  const user = await db.get<UserRow>(
    'SELECT id, display_name, created_at FROM users WHERE id = ?',
    [userId],
  );
  if (!user) throw notFound(`No user with id ${userId}`);
  return user;
}

export function usersRouter(db: DB): Router {
  const router = Router();

  router.get(
    '/',
    asyncRoute(async (_req, res) => {
      const users = await db.all(
        `SELECT u.id,
                u.display_name,
                u.created_at,
                (SELECT COUNT(*) FROM feedback f WHERE f.user_id = u.id) AS log_count,
                (SELECT COUNT(*) FROM onboarding_swipes s WHERE s.user_id = u.id) AS swipe_count
         FROM users u
         ORDER BY u.id`,
      );
      res.json({ users });
    }),
  );

  router.post(
    '/',
    asyncRoute(async (req, res) => {
      const displayName = typeof req.body?.display_name === 'string' ? req.body.display_name.trim() : '';
      if (!displayName) throw badRequest('display_name is required');
      if (displayName.length > 60) throw badRequest('display_name must be 60 characters or fewer');

      const result = await db.run('INSERT INTO users (display_name) VALUES (?)', [displayName]);
      const user = await requireUser(db, result.lastInsertRowid);
      res.status(201).json({ user, onboarding: await getOnboardingStatus(db, user.id) });
    }),
  );

  router.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const userId = parseId(req.params.id, 'user id');
      const user = await requireUser(db, userId);
      res.json({ user, onboarding: await getOnboardingStatus(db, userId) });
    }),
  );

  router.get(
    '/:id/taste-profile',
    asyncRoute(async (req, res) => {
      const userId = parseId(req.params.id, 'user id');
      await requireUser(db, userId);
      const profile = await buildTasteProfile(db, userId);
      res.json({ profile, summary: summarizePreferences(profile) });
    }),
  );

  router.get(
    '/:id/recommendations',
    asyncRoute(async (req, res) => {
      const userId = parseId(req.params.id, 'user id');
      const restaurantId = parseOptionalId(req.query.restaurantId, 'restaurantId');
      await requireUser(db, userId);
      if (restaurantId !== undefined) {
        const restaurant = await db.get('SELECT id FROM restaurants WHERE id = ?', [restaurantId]);
        if (!restaurant) throw notFound(`No restaurant with id ${restaurantId}`);
      }
      res.json({
        user_id: userId,
        restaurant_id: restaurantId ?? null,
        dishes: await buildForYouFeed(db, userId, restaurantId),
      });
    }),
  );

  return router;
}
