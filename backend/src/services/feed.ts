import type { DB } from '../db/index.js';
import type { FeedDish } from '../types.js';
import {
  buildCommunityFeed,
  communityScore,
  getAllDishes,
  getDishesForRestaurant,
  getGlobalAverageReaction,
  getTagsByDish,
  rankDishesByCommunity,
  toFeedDish,
} from './ranking.js';
import {
  applyPersonalizationAdjustments,
  buildReason,
  buildTasteProfile,
  getUserDishHistory,
  personalizedScore,
  tasteMatch,
} from './tasteProfile.js';

export { buildCommunityFeed };

export async function buildForYouFeed(db: DB, userId: number, restaurantId?: number): Promise<FeedDish[]> {
  const profile = await buildTasteProfile(db, userId);
  const history = await getUserDishHistory(db, userId);
  const globalAverage = await getGlobalAverageReaction(db);
  const dishes = restaurantId ? await getDishesForRestaurant(db, restaurantId) : await getAllDishes(db);
  const tagsByDish = await getTagsByDish(db);

  return dishes
    .map((dish) => {
      const tags = tagsByDish.get(dish.id) ?? [];
      const breakdown = communityScore(
        dish.average_reaction,
        dish.feedback_count,
        dish.reorder_percentage,
        globalAverage,
      );
      const match = tasteMatch(profile, dish, tags);
      const feedDish = toFeedDish(dish, breakdown, tags.slice(0, 5));
      feedDish.taste_match_score = match.score;
      const base = personalizedScore(breakdown.community_score, match.score);
      feedDish.personalized_score = applyPersonalizationAdjustments(base, dish.id, history);
      feedDish.reason = buildReason(profile, match, history, dish.id);
      return feedDish;
    })
    .sort(
      (a, b) => (b.personalized_score ?? 0) - (a.personalized_score ?? 0) || a.name.localeCompare(b.name),
    );
}

export async function buildRestaurantRankings(db: DB, restaurantId: number): Promise<FeedDish[]> {
  return rankDishesByCommunity(db, await getDishesForRestaurant(db, restaurantId), 3);
}
