import { Router } from 'express';
import type { DB } from '../db/index.js';
import { asyncRoute, notFound, parseId } from '../http.js';
import {
  communityScore,
  getDishesForRestaurant,
  getGlobalAverageReaction,
  getTagsByDish,
  toFeedDish,
} from '../services/ranking.js';
import type { Restaurant } from '../types.js';

export function restaurantsRouter(db: DB): Router {
  const router = Router();

  router.get(
    '/',
    asyncRoute((_req, res) => {
      const restaurants = db
        .prepare(
          `SELECT r.*, COUNT(mi.id) AS menu_item_count
           FROM restaurants r
           LEFT JOIN menu_items mi ON mi.restaurant_id = r.id AND mi.is_available = 1
           GROUP BY r.id
           ORDER BY r.name`,
        )
        .all();
      res.json({ restaurants });
    }),
  );

  router.get(
    '/:id/menu-items',
    asyncRoute((req, res) => {
      const restaurantId = parseId(req.params.id, 'restaurant id');
      const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId) as
        | Restaurant
        | undefined;
      if (!restaurant) throw notFound(`No restaurant with id ${restaurantId}`);

      const dishes = getDishesForRestaurant(db, restaurantId);
      const globalAverage = getGlobalAverageReaction(db);
      const tagsByDish = getTagsByDish(
        db,
        dishes.map((dish) => dish.id),
      );

      res.json({
        restaurant,
        dishes: dishes.map((dish) => {
          const breakdown = communityScore(
            dish.average_reaction,
            dish.feedback_count,
            dish.reorder_percentage,
            globalAverage,
          );
          return toFeedDish(dish, breakdown, (tagsByDish.get(dish.id) ?? []).slice(0, 3));
        }),
      });
    }),
  );

  return router;
}
