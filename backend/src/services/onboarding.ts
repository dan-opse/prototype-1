import type { DB } from '../db/index.js';
import type { DishRow, FeedDish } from '../types.js';
import { communityScore, getAllDishes, getGlobalAverageReaction, getTagsByDish, toFeedDish } from './ranking.js';

export const QUIZ_LENGTH = 10;

export interface OnboardingStatus {
  swipe_count: number;
  log_count: number;
  quiz_length: number;
  has_completed_quiz: boolean;
}

export async function getOnboardingStatus(db: DB, userId: number): Promise<OnboardingStatus> {
  const swipes = await db.get<{ count: number }>(
    'SELECT COUNT(*) AS count FROM onboarding_swipes WHERE user_id = ?',
    [userId],
  );
  const logs = await db.get<{ count: number }>(
    'SELECT COUNT(*) AS count FROM feedback WHERE user_id = ?',
    [userId],
  );
  return {
    swipe_count: Number(swipes?.count ?? 0),
    log_count: Number(logs?.count ?? 0),
    quiz_length: QUIZ_LENGTH,
    has_completed_quiz: Number(swipes?.count ?? 0) >= QUIZ_LENGTH,
  };
}

/**
 * Deals the quiz round-robin across restaurants so ten swipes span every cuisine rather than
 * ten dishes from whichever restaurant happens to sort first. Within a restaurant, dishes with
 * more community feedback come first, since those carry the tag signal a swipe can learn from.
 */
export async function selectQuizDishes(db: DB, userId: number, limit: number = QUIZ_LENGTH): Promise<FeedDish[]> {
  const swipedRows = await db.all<{ menu_item_id: number }>(
    'SELECT menu_item_id FROM onboarding_swipes WHERE user_id = ?',
    [userId],
  );
  const swiped = new Set(swipedRows.map((row) => row.menu_item_id));

  const byRestaurant = new Map<number, DishRow[]>();
  for (const dish of await getAllDishes(db)) {
    if (swiped.has(dish.id)) continue;
    const list = byRestaurant.get(dish.restaurant_id) ?? [];
    list.push(dish);
    byRestaurant.set(dish.restaurant_id, list);
  }
  for (const list of byRestaurant.values()) {
    list.sort((a, b) => b.feedback_count - a.feedback_count || a.id - b.id);
  }

  const queues = [...byRestaurant.entries()].sort(([a], [b]) => a - b).map(([, list]) => list);
  const picked: DishRow[] = [];
  let round = 0;
  while (picked.length < limit && queues.some((queue) => queue.length > round)) {
    for (const queue of queues) {
      if (picked.length >= limit) break;
      const dish = queue[round];
      if (dish) picked.push(dish);
    }
    round += 1;
  }

  const globalAverage = await getGlobalAverageReaction(db);
  const tagsByDish = await getTagsByDish(
    db,
    picked.map((dish) => dish.id),
  );

  return picked.map((dish) => {
    const breakdown = communityScore(
      dish.average_reaction,
      dish.feedback_count,
      dish.reorder_percentage,
      globalAverage,
    );
    return toFeedDish(dish, breakdown, (tagsByDish.get(dish.id) ?? []).slice(0, 4));
  });
}

export async function recordSwipe(db: DB, userId: number, menuItemId: number, liked: boolean): Promise<void> {
  await db.run(
    `INSERT INTO onboarding_swipes (user_id, menu_item_id, liked)
     VALUES (?, ?, ?)
     ON CONFLICT (user_id, menu_item_id) DO UPDATE SET liked = excluded.liked`,
    [userId, menuItemId, liked ? 1 : 0],
  );
}
