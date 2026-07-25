import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DB } from '../src/db/index.js';
import {
  bayesianAverageReaction,
  buildCommunityFeed,
  buildCommunityReason,
  communityScore,
  confidenceScore,
  getDishesForRestaurant,
  rankDishesByCommunity,
} from '../src/services/ranking.js';
import { COLD_DISH_ID, createTestDb } from './helpers/testDb.js';

let db: DB;

beforeAll(() => {
  db = createTestDb();
});

afterAll(() => {
  db.close();
});

describe('ranking math', () => {
  it('pulls a small sample toward the global average', () => {
    // m = 7, so three 5-star reviews land at (3/10)*5 + (7/10)*4.
    expect(bayesianAverageReaction(5, 3, 4)).toBeCloseTo(4.3, 10);
  });

  it('returns the global average for a dish with no feedback', () => {
    expect(bayesianAverageReaction(null, 0, 4.1)).toBe(4.1);
  });

  it('caps sample-size confidence at ten reviews', () => {
    expect(confidenceScore(0)).toBe(0);
    expect(confidenceScore(5)).toBe(0.5);
    expect(confidenceScore(10)).toBe(1);
    expect(confidenceScore(40)).toBe(1);
  });

  it('composes community_score from its three weighted terms', () => {
    const breakdown = communityScore(5, 3, 100, 4);
    // bayesian 4.3 -> normalized 0.825; 0.45*0.825 + 0.35*1 + 0.20*0.3
    expect(breakdown.bayesian_average_reaction).toBeCloseTo(4.3, 10);
    expect(breakdown.community_score).toBeCloseTo(0.78125, 10);
  });

  it('ranks a well-sampled good dish above a perfect one-review dish', () => {
    const oneGlowingReview = communityScore(5, 1, 100, 4).community_score;
    const consistentlyGood = communityScore(4.5, 20, 90, 4).community_score;
    expect(consistentlyGood).toBeGreaterThan(oneGlowingReview);
  });
});

describe('community feed', () => {
  it('ranks every available dish by community_score, highest first', () => {
    const feed = buildCommunityFeed(db);
    expect(feed.length).toBe(26);
    const scores = feed.map((dish) => dish.community_score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('keeps cold-start dishes in the feed instead of hiding them', () => {
    const feed = buildCommunityFeed(db);
    const cold = feed.find((dish) => dish.menu_item_id === COLD_DISH_ID);
    expect(cold).toBeDefined();
    expect(cold!.feedback_count).toBe(0);
    expect(cold!.average_reaction).toBeNull();
    expect(cold!.community_score).toBeGreaterThan(0);
    // With no reviews of its own, it scores off the prior and cannot beat proven dishes.
    expect(cold!.community_score).toBeLessThan(feed[0].community_score);
  });

  it('attaches community tags ordered descriptive-first', () => {
    const feed = buildCommunityFeed(db);
    const tagged = feed.find((dish) => dish.top_tags.length > 1)!;
    const firstEvaluative = tagged.top_tags.findIndex((tag) => tag.kind === 'evaluative');
    const lastDescriptive = tagged.top_tags.map((tag) => tag.kind).lastIndexOf('descriptive');
    if (firstEvaluative !== -1) expect(firstEvaluative).toBeGreaterThan(lastDescriptive - 1);
  });

  it('explains every community-ranked dish', () => {
    const feed = buildCommunityFeed(db);
    for (const dish of feed) {
      expect(typeof dish.reason).toBe('string');
      expect(dish.reason!.length).toBeGreaterThan(0);
    }
  });
});

describe('restaurant rankings', () => {
  it('returns every available dish for a restaurant, including cold-start items', () => {
    const dishes = rankDishesByCommunity(db, getDishesForRestaurant(db, 1), 3);
    expect(dishes.length).toBeGreaterThan(0);
    const cold = dishes.find((dish) => dish.menu_item_id === COLD_DISH_ID);
    expect(cold).toBeDefined();
    expect(cold!.reason).toContain('No reviews yet');
  });

  it('sorts dishes by community_score descending', () => {
    const dishes = rankDishesByCommunity(db, getDishesForRestaurant(db, 1), 3);
    const scores = dishes.map((dish) => dish.community_score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('builds a templated reason for well-reviewed dishes', () => {
    const breakdown = communityScore(4.6, 12, 90, 4);
    const reason = buildCommunityReason(breakdown, 12, [{ id: 1, name: 'umami', sentiment: 'positive', kind: 'descriptive', uses: 5 }]);
    expect(reason).toMatch(/reaction|reorder|reviews/i);
  });
});
