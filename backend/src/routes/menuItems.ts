import { Router } from 'express';
import type { DB } from '../db/index.js';
import { asyncRoute, notFound, parseId } from '../http.js';
import {
  communityScore,
  getDishById,
  getGlobalAverageReaction,
  getTagsByDish,
  tagKind,
  toFeedDish,
} from '../services/ranking.js';
import type { DishTag } from '../types.js';

export function menuItemsRouter(db: DB): Router {
  const router = Router();

  router.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const menuItemId = parseId(req.params.id, 'menu item id');
      const dish = await getDishById(db, menuItemId);
      if (!dish) throw notFound(`No menu item with id ${menuItemId}`);

      const breakdown = communityScore(
        dish.average_reaction,
        dish.feedback_count,
        dish.reorder_percentage,
        await getGlobalAverageReaction(db),
      );
      const tags = (await getTagsByDish(db, [menuItemId])).get(menuItemId) ?? [];
      const feedDish = toFeedDish(dish, breakdown, tags);

      res.json({
        dish: feedDish,
        restaurant: await db.get('SELECT * FROM restaurants WHERE id = ?', [dish.restaurant_id]),
        recent_notes: await db.all(
          `SELECT f.note, f.reaction, f.created_at, u.display_name
           FROM feedback f
           JOIN users u ON u.id = f.user_id
           WHERE f.menu_item_id = ? AND f.note IS NOT NULL AND TRIM(f.note) <> ''
           ORDER BY f.created_at DESC
           LIMIT 5`,
          [menuItemId],
        ),
      });
    }),
  );

  /**
   * Tags offered during the log flow: what the community already used on this dish, most common
   * first, descriptive before evaluative. Dishes with no history fall back to the full vocabulary
   * so the flow still works on a cold item.
   */
  router.get(
    '/:id/tags',
    asyncRoute(async (req, res) => {
      const menuItemId = parseId(req.params.id, 'menu item id');
      if (!(await getDishById(db, menuItemId))) throw notFound(`No menu item with id ${menuItemId}`);

      const communityTags = (await getTagsByDish(db, [menuItemId])).get(menuItemId) ?? [];
      const seen = new Set(communityTags.map((tag) => tag.id));
      const allTags = await db.all<{
        id: number;
        name: string;
        sentiment: DishTag['sentiment'];
      }>('SELECT id, name, sentiment FROM feedback_tags ORDER BY name');

      const rest: DishTag[] = allTags
        .filter((tag) => !seen.has(tag.id))
        .map((tag) => ({ ...tag, kind: tagKind(tag.name), uses: 0 }))
        .sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === 'descriptive' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

      res.json({ suggested: communityTags, other: rest });
    }),
  );

  return router;
}
