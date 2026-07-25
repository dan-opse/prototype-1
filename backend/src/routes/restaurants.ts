import { Router } from 'express';
import type { DB } from '../db/index.js';
import { asyncRoute, notFound, parseId } from '../http.js';
import { buildRestaurantRankings } from '../services/feed.js';
import type { Restaurant } from '../types.js';

export function restaurantsRouter(db: DB): Router {
  const router = Router();

  router.get(
    '/',
    asyncRoute(async (_req, res) => {
      const restaurants = await db.all(
        `SELECT r.*, COUNT(mi.id) AS menu_item_count
         FROM restaurants r
         LEFT JOIN menu_items mi ON mi.restaurant_id = r.id AND mi.is_available = 1
         GROUP BY r.id
         ORDER BY r.name`,
      );
      res.json({ restaurants });
    }),
  );

  router.get(
    '/:id/rankings',
    asyncRoute(async (req, res) => {
      const restaurantId = parseId(req.params.id, 'restaurant id');
      const restaurant = await db.get<Restaurant>('SELECT * FROM restaurants WHERE id = ?', [restaurantId]);
      if (!restaurant) throw notFound(`No restaurant with id ${restaurantId}`);

      res.json({
        restaurant,
        dishes: await buildRestaurantRankings(db, restaurantId),
      });
    }),
  );

  router.get(
    '/:id/menu-items',
    asyncRoute(async (req, res) => {
      const restaurantId = parseId(req.params.id, 'restaurant id');
      const restaurant = await db.get<Restaurant>('SELECT * FROM restaurants WHERE id = ?', [restaurantId]);
      if (!restaurant) throw notFound(`No restaurant with id ${restaurantId}`);

      res.json({
        restaurant,
        dishes: await buildRestaurantRankings(db, restaurantId),
      });
    }),
  );

  return router;
}
