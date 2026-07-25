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

export function getOnboardingStatus(db: DB, userId: number): OnboardingStatus {
  const swipes = db
    .prepare('SELECT COUNT(*) AS count FROM onboarding_swipes WHERE user_id = ?')
    .get(userId) as { count: number };
  const logs = db.prepare('SELECT COUNT(*) AS count FROM feedback WHERE user_id = ?').get(userId) as {
    count: number;
  };
  return {
    swipe_count: swipes.count,
    log_count: logs.count,
    quiz_length: QUIZ_LENGTH,
    has_completed_quiz: swipes.count >= QUIZ_LENGTH,
  };
}

/**
 * Deals the quiz round-robin across restaurants so ten swipes span every cuisine rather than
 * ten dishes from whichever restaurant happens to sort first. Within a restaurant, dishes with
 * more community feedback come first, since those carry the tag signal a swipe can learn from.
 */
export function selectQuizDishes(db: DB, userId: number, limit: number = QUIZ_LENGTH): FeedDish[] {
  const swiped = new Set(
    (db.prepare('SELECT menu_item_id FROM onboarding_swipes WHERE user_id = ?').all(userId) as {
      menu_item_id: number;
    }[]).map((row) => row.menu_item_id),
  );

  const byRestaurant = new Map<number, DishRow[]>();
  for (const dish of getAllDishes(db)) {
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

  const globalAverage = getGlobalAverageReaction(db);
  const tagsByDish = getTagsByDish(
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

export function recordSwipe(db: DB, userId: number, menuItemId: number, liked: boolean): void {
  db.prepare(
    `INSERT INTO onboarding_swipes (user_id, menu_item_id, liked)
     VALUES (?, ?, ?)
     ON CONFLICT (user_id, menu_item_id) DO UPDATE SET liked = excluded.liked`,
  ).run(userId, menuItemId, liked ? 1 : 0);
}
