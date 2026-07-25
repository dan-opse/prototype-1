import type { DB } from '../db/index.js';
import type { DishRow, DishTag, FeedDish, ScoreBreakdown, TagKind } from '../types.js';

/** Minimum-review prior for the bayesian average. PRD allows 5 to 10. */
export const PRIOR_WEIGHT = 7;

/** Feedback count at which we treat a dish's sample size as fully trustworthy. */
export const CONFIDENCE_SAMPLE_SIZE = 10;

/** Fallback global average used when the database holds no feedback at all. */
export const NEUTRAL_REACTION = 3;

export const COMMUNITY_WEIGHTS = {
  bayesian: 0.45,
  reorder: 0.35,
  confidence: 0.2,
} as const;

/**
 * Tags that describe a physical property of the dish and converge to community consensus,
 * versus tags a diner judges against their own baseline. The split drives both how much a
 * quiz swipe is allowed to teach us (see tasteProfile.ts) and the tag order in the log flow.
 */
const EVALUATIVE_TAGS = new Set([
  'too salty',
  'too sweet',
  'bland',
  'overcooked',
  'great value',
  'big portion',
  'small portion',
]);

export function tagKind(tagName: string): TagKind {
  return EVALUATIVE_TAGS.has(tagName) ? 'evaluative' : 'descriptive';
}

export function bayesianAverageReaction(
  itemAverage: number | null,
  ratingCount: number,
  globalAverage: number,
  priorWeight: number = PRIOR_WEIGHT,
): number {
  if (ratingCount <= 0 || itemAverage === null) return globalAverage;
  const v = ratingCount;
  const m = priorWeight;
  return (v / (v + m)) * itemAverage + (m / (v + m)) * globalAverage;
}

export function confidenceScore(ratingCount: number): number {
  return Math.min(1, Math.max(0, ratingCount) / CONFIDENCE_SAMPLE_SIZE);
}

/** Maps a 1-5 reaction onto 0-1 so every term of community_score shares one scale. */
export function normalizeReaction(reaction: number): number {
  return (reaction - 1) / 4;
}

export function communityScore(
  itemAverage: number | null,
  ratingCount: number,
  reorderPercentage: number | null,
  globalAverage: number,
): ScoreBreakdown {
  const bayesian = bayesianAverageReaction(itemAverage, ratingCount, globalAverage);
  const reorderRateScaled = (reorderPercentage ?? 0) / 100;
  const confidence = confidenceScore(ratingCount);
  const score =
    COMMUNITY_WEIGHTS.bayesian * normalizeReaction(bayesian) +
    COMMUNITY_WEIGHTS.reorder * reorderRateScaled +
    COMMUNITY_WEIGHTS.confidence * confidence;

  return {
    bayesian_average_reaction: bayesian,
    reorder_rate_scaled: reorderRateScaled,
    confidence_score: confidence,
    community_score: score,
  };
}

export async function getGlobalAverageReaction(db: DB): Promise<number> {
  const row = await db.get<{ avg_reaction: number | null }>(
    'SELECT AVG(reaction) AS avg_reaction FROM feedback',
  );
  return row?.avg_reaction ?? NEUTRAL_REACTION;
}

const DISH_SELECT = `
  SELECT
      mi.id,
      mi.restaurant_id,
      mi.name,
      mi.description,
      mi.category,
      mi.price_cents,
      mi.is_vegetarian,
      mi.spice_level,
      mi.is_available,
      r.name AS restaurant_name,
      r.slug AS restaurant_slug,
      r.cuisine AS cuisine,
      r.price_level AS restaurant_price_level,
      s.feedback_count AS feedback_count,
      s.average_reaction AS average_reaction,
      s.reorder_percentage AS reorder_percentage
  FROM menu_items mi
  JOIN restaurants r ON r.id = mi.restaurant_id
  JOIN item_feedback_summary s ON s.menu_item_id = mi.id
`;

export async function getAllDishes(db: DB): Promise<DishRow[]> {
  return db.all<DishRow>(`${DISH_SELECT} WHERE mi.is_available = 1`);
}

export async function getDishById(db: DB, menuItemId: number): Promise<DishRow | undefined> {
  return db.get<DishRow>(`${DISH_SELECT} WHERE mi.id = ?`, [menuItemId]);
}

export async function getDishesForRestaurant(db: DB, restaurantId: number): Promise<DishRow[]> {
  return db.all<DishRow>(
    `${DISH_SELECT} WHERE mi.restaurant_id = ? AND mi.is_available = 1 ORDER BY mi.category, mi.name`,
    [restaurantId],
  );
}

interface TagRow {
  menu_item_id: number;
  id: number;
  name: string;
  sentiment: DishTag['sentiment'];
  uses: number;
}

/** Community tag counts per dish, most used first, descriptive tags ahead of evaluative ones. */
export async function getTagsByDish(db: DB, menuItemIds?: number[]): Promise<Map<number, DishTag[]>> {
  const filter = menuItemIds?.length ? `WHERE f.menu_item_id IN (${menuItemIds.map(() => '?').join(',')})` : '';
  const rows = await db.all<TagRow>(
    `SELECT f.menu_item_id, ft.id, ft.name, ft.sentiment, COUNT(*) AS uses
     FROM feedback f
     JOIN feedback_tag_links ftl ON ftl.feedback_id = f.id
     JOIN feedback_tags ft ON ft.id = ftl.tag_id
     ${filter}
     GROUP BY f.menu_item_id, ft.id
     ORDER BY uses DESC, ft.name ASC`,
    menuItemIds ?? [],
  );

  const byDish = new Map<number, DishTag[]>();
  for (const row of rows) {
    const list = byDish.get(row.menu_item_id) ?? [];
    list.push({ id: row.id, name: row.name, sentiment: row.sentiment, kind: tagKind(row.name), uses: row.uses });
    byDish.set(row.menu_item_id, list);
  }
  for (const list of byDish.values()) {
    list.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'descriptive' ? -1 : 1;
      if (b.uses !== a.uses) return b.uses - a.uses;
      return a.name.localeCompare(b.name);
    });
  }
  return byDish;
}

/** Templated explanation of why a dish ranks where it does in the community list. */
export function buildCommunityReason(
  breakdown: ScoreBreakdown,
  feedbackCount: number,
  tags: DishTag[],
): string {
  if (feedbackCount === 0) {
    return 'No reviews yet — scored from the global average prior, so it sits below proven dishes';
  }

  const parts: string[] = [];

  if (breakdown.bayesian_average_reaction >= 4.3) {
    parts.push('consistently high average reaction');
  } else if (breakdown.bayesian_average_reaction <= 3.2) {
    parts.push('reaction scores trail the dataset average');
  }

  if (breakdown.reorder_rate_scaled >= 0.85) {
    parts.push('most diners would order it again');
  } else if (breakdown.reorder_rate_scaled <= 0.5 && feedbackCount >= 3) {
    parts.push('reorder rate is below average');
  }

  if (breakdown.confidence_score >= 0.7) {
    parts.push(`${feedbackCount} reviews give the score strong sample-size confidence`);
  } else if (feedbackCount > 0 && feedbackCount < 5) {
    parts.push(
      `only ${feedbackCount} review${feedbackCount === 1 ? '' : 's'} so far — Bayesian smoothing still pulls the score toward the global average`,
    );
  }

  const topTag = tags[0];
  if (topTag && parts.length < 2) {
    parts.push(`commonly tagged "${topTag.name}"`);
  }

  return parts.slice(0, 2).join('; ') || 'Community feedback is mixed across reaction and reorder signals';
}

export async function rankDishesByCommunity(
  db: DB,
  dishes: DishRow[],
  tagLimit = 3,
): Promise<FeedDish[]> {
  const globalAverage = await getGlobalAverageReaction(db);
  const tagsByDish = await getTagsByDish(
    db,
    dishes.map((dish) => dish.id),
  );

  return dishes
    .map((dish) => {
      const tags = (tagsByDish.get(dish.id) ?? []).slice(0, tagLimit);
      const breakdown = communityScore(
        dish.average_reaction,
        dish.feedback_count,
        dish.reorder_percentage,
        globalAverage,
      );
      const feedDish = toFeedDish(dish, breakdown, tags);
      feedDish.reason = buildCommunityReason(breakdown, dish.feedback_count, tags);
      return feedDish;
    })
    .sort(
      (a, b) => b.community_score - a.community_score || a.name.localeCompare(b.name),
    );
}

export function toFeedDish(dish: DishRow, breakdown: ScoreBreakdown, tags: DishTag[]): FeedDish {
  return {
    menu_item_id: dish.id,
    name: dish.name,
    description: dish.description,
    category: dish.category,
    price_cents: dish.price_cents,
    is_vegetarian: dish.is_vegetarian === 1,
    spice_level: dish.spice_level,
    restaurant: {
      id: dish.restaurant_id,
      name: dish.restaurant_name,
      cuisine: dish.cuisine,
      price_level: dish.restaurant_price_level,
    },
    feedback_count: dish.feedback_count,
    average_reaction: dish.average_reaction,
    reorder_percentage: dish.reorder_percentage,
    community_score: breakdown.community_score,
    score_breakdown: breakdown,
    top_tags: tags,
  };
}

/**
 * Every available dish ranked by community_score alone. Cold items (no feedback yet) stay in the
 * list, scored off the bayesian prior, rather than being hidden.
 */
export async function buildCommunityFeed(db: DB): Promise<FeedDish[]> {
  return rankDishesByCommunity(db, await getAllDishes(db), 5);
}
