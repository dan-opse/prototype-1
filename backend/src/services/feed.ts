import type { DB } from '../db/index.js';
import type { FeedDish } from '../types.js';
import {
  buildCommunityFeed,
  communityScore,
  getAllDishes,
  getGlobalAverageReaction,
  getTagsByDish,
  toFeedDish,
} from './ranking.js';
import { buildReason, buildTasteProfile, personalizedScore, tasteMatch } from './tasteProfile.js';

export { buildCommunityFeed };

export function buildForYouFeed(db: DB, userId: number): FeedDish[] {
  const profile = buildTasteProfile(db, userId);
  const globalAverage = getGlobalAverageReaction(db);
  const dishes = getAllDishes(db);
  const tagsByDish = getTagsByDish(db);

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
      feedDish.personalized_score = personalizedScore(breakdown.community_score, match.score);
      feedDish.reason = buildReason(profile, match);
      return feedDish;
    })
    .sort(
      (a, b) => (b.personalized_score ?? 0) - (a.personalized_score ?? 0) || a.name.localeCompare(b.name),
    );
}
