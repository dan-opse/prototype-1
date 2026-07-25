import { Router } from 'express';
import type { DB } from '../db/index.js';
import { asyncRoute, badRequest, notFound, parseBoolean, parseId } from '../http.js';
import { communityScore, getDishById, getGlobalAverageReaction } from '../services/ranking.js';
import { requireUser } from './users.js';

/**
 * The log flow nudges toward three tags but does not block submission below that (PRD open
 * question 2, resolved as a soft target so a rushed diner can still log a meal).
 */
export const SOFT_TAG_TARGET = 3;

const MAX_TAGS_PER_LOG = 8;
const MAX_NOTE_LENGTH = 500;

export function feedbackRouter(db: DB): Router {
  const router = Router();

  router.post(
    '/',
    asyncRoute((req, res) => {
      const userId = parseId(req.body?.userId, 'userId');
      const menuItemId = parseId(req.body?.menuItemId, 'menuItemId');
      const reaction = Number(req.body?.reaction);
      if (!Number.isInteger(reaction) || reaction < 1 || reaction > 5) {
        throw badRequest('reaction must be an integer from 1 to 5');
      }
      const wouldOrderAgain = parseBoolean(req.body?.wouldOrderAgain, 'wouldOrderAgain');

      const rawTags = req.body?.tagIds ?? [];
      if (!Array.isArray(rawTags)) throw badRequest('tagIds must be an array');
      if (rawTags.length > MAX_TAGS_PER_LOG) throw badRequest(`tagIds may hold at most ${MAX_TAGS_PER_LOG} tags`);
      const tagIds = [...new Set(rawTags.map((tagId) => parseId(tagId, 'tagId')))];

      const note = req.body?.note;
      if (note !== undefined && note !== null && typeof note !== 'string') {
        throw badRequest('note must be a string');
      }
      const trimmedNote = typeof note === 'string' ? note.trim().slice(0, MAX_NOTE_LENGTH) : null;

      requireUser(db, userId);
      if (!getDishById(db, menuItemId)) throw notFound(`No menu item with id ${menuItemId}`);
      for (const tagId of tagIds) {
        const tag = db.prepare('SELECT id FROM feedback_tags WHERE id = ?').get(tagId);
        if (!tag) throw notFound(`No feedback tag with id ${tagId}`);
      }

      const insert = db.transaction(() => {
        const result = db
          .prepare(
            `INSERT INTO feedback (user_id, menu_item_id, reaction, would_order_again, note)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(userId, menuItemId, reaction, wouldOrderAgain ? 1 : 0, trimmedNote || null);
        const feedbackId = Number(result.lastInsertRowid);
        const link = db.prepare('INSERT INTO feedback_tag_links (feedback_id, tag_id) VALUES (?, ?)');
        for (const tagId of tagIds) link.run(feedbackId, tagId);
        return feedbackId;
      });

      const feedbackId = insert();
      const dish = getDishById(db, menuItemId)!;
      const breakdown = communityScore(
        dish.average_reaction,
        dish.feedback_count,
        dish.reorder_percentage,
        getGlobalAverageReaction(db),
      );

      res.status(201).json({
        feedback_id: feedbackId,
        tags_recorded: tagIds.length,
        below_soft_tag_target: tagIds.length < SOFT_TAG_TARGET,
        updated_dish: {
          menu_item_id: dish.id,
          feedback_count: dish.feedback_count,
          average_reaction: dish.average_reaction,
          reorder_percentage: dish.reorder_percentage,
          community_score: breakdown.community_score,
        },
      });
    }),
  );

  return router;
}
