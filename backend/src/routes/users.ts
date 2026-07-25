import { Router } from 'express';
import type { DB } from '../db/index.js';
import { asyncRoute, badRequest, notFound, parseId } from '../http.js';
import { getOnboardingStatus } from '../services/onboarding.js';
import { buildTasteProfile } from '../services/tasteProfile.js';
import type { UserRow } from '../types.js';

export function requireUser(db: DB, userId: number): UserRow {
  const user = db.prepare('SELECT id, display_name, created_at FROM users WHERE id = ?').get(userId) as
    | UserRow
    | undefined;
  if (!user) throw notFound(`No user with id ${userId}`);
  return user;
}

export function usersRouter(db: DB): Router {
  const router = Router();

  router.get(
    '/',
    asyncRoute((_req, res) => {
      const users = db
        .prepare(
          `SELECT u.id,
                  u.display_name,
                  u.created_at,
                  (SELECT COUNT(*) FROM feedback f WHERE f.user_id = u.id) AS log_count,
                  (SELECT COUNT(*) FROM onboarding_swipes s WHERE s.user_id = u.id) AS swipe_count
           FROM users u
           ORDER BY u.id`,
        )
        .all();
      res.json({ users });
    }),
  );

  router.post(
    '/',
    asyncRoute((req, res) => {
      const displayName = typeof req.body?.display_name === 'string' ? req.body.display_name.trim() : '';
      if (!displayName) throw badRequest('display_name is required');
      if (displayName.length > 60) throw badRequest('display_name must be 60 characters or fewer');

      const result = db.prepare('INSERT INTO users (display_name) VALUES (?)').run(displayName);
      const user = requireUser(db, Number(result.lastInsertRowid));
      res.status(201).json({ user, onboarding: getOnboardingStatus(db, user.id) });
    }),
  );

  router.get(
    '/:id',
    asyncRoute((req, res) => {
      const userId = parseId(req.params.id, 'user id');
      const user = requireUser(db, userId);
      res.json({ user, onboarding: getOnboardingStatus(db, userId) });
    }),
  );

  router.get(
    '/:id/taste-profile',
    asyncRoute((req, res) => {
      const userId = parseId(req.params.id, 'user id');
      requireUser(db, userId);
      res.json({ profile: buildTasteProfile(db, userId) });
    }),
  );

  return router;
}
