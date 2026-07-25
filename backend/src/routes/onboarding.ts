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
    asyncRoute((req, res) => {
      const userId = parseId(req.query.userId, 'userId');
      requireUser(db, userId);
      const status = getOnboardingStatus(db, userId);
      const remaining = Math.max(0, QUIZ_LENGTH - status.swipe_count);
      res.json({ items: remaining === 0 ? [] : selectQuizDishes(db, userId, remaining), onboarding: status });
    }),
  );

  router.post(
    '/swipes',
    asyncRoute((req, res) => {
      const userId = parseId(req.body?.userId, 'userId');
      const menuItemId = parseId(req.body?.menuItemId, 'menuItemId');
      const liked = parseBoolean(req.body?.liked, 'liked');

      requireUser(db, userId);
      if (!getDishById(db, menuItemId)) throw notFound(`No menu item with id ${menuItemId}`);

      recordSwipe(db, userId, menuItemId, liked);
      res.status(201).json({ onboarding: getOnboardingStatus(db, userId) });
    }),
  );

  router.delete(
    '/swipes',
    asyncRoute((req, res) => {
      const userId = parseId(req.query.userId, 'userId');
      requireUser(db, userId);
      db.prepare('DELETE FROM onboarding_swipes WHERE user_id = ?').run(userId);
      res.json({ onboarding: getOnboardingStatus(db, userId) });
    }),
  );

  router.all('/', () => {
    throw badRequest('Unknown onboarding route');
  });

  return router;
}
