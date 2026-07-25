import { Router } from 'express';
import type { DB } from '../db/index.js';
import { asyncRoute, badRequest, notFound, parseBoolean, parseId } from '../http.js';
import { getDishById } from '../services/ranking.js';
import { QUIZ_LENGTH, getOnboardingStatus, recordSwipe, selectQuizDishes } from '../services/onboarding.js';
import { requireUser } from './users.js';

export function onboardingRouter(db: DB): Router {
  const router = Router();

  router.get(
    '/quiz-items',
    asyncRoute(async (req, res) => {
      const userId = parseId(req.query.userId, 'userId');
      await requireUser(db, userId);
      const status = await getOnboardingStatus(db, userId);
      const remaining = Math.max(0, QUIZ_LENGTH - status.swipe_count);
      res.json({
        items: remaining === 0 ? [] : await selectQuizDishes(db, userId, remaining),
        onboarding: status,
      });
    }),
  );

  router.post(
    '/swipes',
    asyncRoute(async (req, res) => {
      const userId = parseId(req.body?.userId, 'userId');
      const menuItemId = parseId(req.body?.menuItemId, 'menuItemId');
      const liked = parseBoolean(req.body?.liked, 'liked');

      await requireUser(db, userId);
      if (!(await getDishById(db, menuItemId))) throw notFound(`No menu item with id ${menuItemId}`);

      await recordSwipe(db, userId, menuItemId, liked);
      res.status(201).json({ onboarding: await getOnboardingStatus(db, userId) });
    }),
  );

  router.delete(
    '/swipes',
    asyncRoute(async (req, res) => {
      const userId = parseId(req.query.userId, 'userId');
      await requireUser(db, userId);
      await db.run('DELETE FROM onboarding_swipes WHERE user_id = ?', [userId]);
      res.json({ onboarding: await getOnboardingStatus(db, userId) });
    }),
  );

  router.all('/', () => {
    throw badRequest('Unknown onboarding route');
  });

  return router;
}
