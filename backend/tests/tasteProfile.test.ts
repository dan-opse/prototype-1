import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '../src/db/index.js';
import { recordSwipe } from '../src/services/onboarding.js';
import {
  PERSONALIZATION_WEIGHTS,
  applyPersonalizationAdjustments,
  buildTasteProfile,
  getUserDishHistory,
  logSignal,
  personalizedScore,
  summarizePreferences,
  tagWeightForLogCount,
} from '../src/services/tasteProfile.js';
import { buildForYouFeed } from '../src/services/feed.js';
import { buildCommunityFeed } from '../src/services/ranking.js';
import { createTestDb } from './helpers/testDb.js';

/** Korean and Mexican dishes with heat, versus light vegetarian dishes. */
const SPICY_DISH_IDS = [4, 5, 16, 21, 22];
const LIGHT_DISH_IDS = [18, 20, 13, 14, 6];

const TOO_SWEET_TAG_ID = 10;
const CHURROS_ID = 26;
const TTEOKBOKKI_ID = 5;

let db: DB;
let userId: number;

async function createUser(name: string): Promise<number> {
  const result = await db.run('INSERT INTO users (display_name) VALUES (?)', [name]);
  return result.lastInsertRowid;
}

async function logMeal(user: number, dishId: number, reaction: number, wouldOrderAgain: boolean, tagIds: number[] = []) {
  const result = await db.run(
    'INSERT INTO feedback (user_id, menu_item_id, reaction, would_order_again) VALUES (?, ?, ?, ?)',
    [user, dishId, reaction, wouldOrderAgain ? 1 : 0],
  );
  const feedbackId = result.lastInsertRowid;
  for (const tagId of tagIds) {
    await db.run('INSERT INTO feedback_tag_links (feedback_id, tag_id) VALUES (?, ?)', [feedbackId, tagId]);
  }
}

async function takeQuiz(user: number) {
  for (const dishId of SPICY_DISH_IDS) await recordSwipe(db, user, dishId, true);
  for (const dishId of LIGHT_DISH_IDS) await recordSwipe(db, user, dishId, false);
}

beforeEach(async () => {
  db = createTestDb();
  userId = await createUser('Quiz Only Diner');
});

afterEach(() => {
  void db.close();
});

describe('taste profile from the onboarding quiz alone', () => {
  it('produces a usable profile with no logged meals', async () => {
    await takeQuiz(userId);
    const profile = await buildTasteProfile(db, userId);

    expect(profile.swipe_count).toBe(10);
    expect(profile.log_count).toBe(0);
    expect(Object.keys(profile.cuisines).length).toBeGreaterThan(0);
    expect(Object.keys(profile.tags).length).toBeGreaterThan(0);
    expect(profile.spice_levels['Hot'].score).toBeGreaterThan(0);
    expect(profile.cuisines['Japanese'].score).toBeLessThan(0);
  });

  it('marks every quiz-derived preference as still learning', async () => {
    await takeQuiz(userId);
    const profile = await buildTasteProfile(db, userId);
    const entries = [
      ...Object.values(profile.cuisines),
      ...Object.values(profile.spice_levels),
      ...Object.values(profile.tags),
    ];

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.confidence).toBe('still_learning');
      expect(entry.sources).toEqual(['quiz']);
    }
  });

  it('lets a quiz alone reorder the feed away from the community ranking', async () => {
    await takeQuiz(userId);
    const personalized = (await buildForYouFeed(db, userId)).map((dish) => dish.menu_item_id);
    const community = (await buildCommunityFeed(db)).map((dish) => dish.menu_item_id);

    expect(personalized).not.toEqual(community);
    expect([...personalized].sort()).toEqual([...community].sort());
  });

  it('weighs a swipe less for evaluative tags than for descriptive ones', async () => {
    // Churros carry both a descriptive tag (crispy) and an evaluative one (too sweet).
    await recordSwipe(db, userId, CHURROS_ID, true);
    const profile = await buildTasteProfile(db, userId);

    expect(profile.tags['crispy'].weight).toBeCloseTo(0.9, 10);
    expect(profile.tags['too sweet'].weight).toBeCloseTo(0.2, 10);
    expect(profile.cuisines['Mexican'].weight).toBeCloseTo(1.0, 10);
  });
});

describe('logged meals displacing quiz guesses', () => {
  it('flips an evaluative tag the quiz guessed wrong once real meals disagree', async () => {
    await recordSwipe(db, userId, CHURROS_ID, false);
    expect((await buildTasteProfile(db, userId)).tags['too sweet'].score).toBeLessThan(0);

    await logMeal(userId, TTEOKBOKKI_ID, 5, true, [TOO_SWEET_TAG_ID]);
    await logMeal(userId, CHURROS_ID, 5, true, [TOO_SWEET_TAG_ID]);

    const profile = await buildTasteProfile(db, userId);
    expect(profile.tags['too sweet'].score).toBeGreaterThan(0);
    expect(profile.tags['too sweet'].confidence).toBe('confident');
    expect(profile.tags['too sweet'].sources).toContain('quiz');
  });

  it('grows the share tags hold in the match score as logs accumulate', async () => {
    expect(tagWeightForLogCount(0)).toBeCloseTo(0.15, 10);
    expect(tagWeightForLogCount(4)).toBeCloseTo(0.325, 10);
    expect(tagWeightForLogCount(8)).toBeCloseTo(0.5, 10);
    expect(tagWeightForLogCount(50)).toBeCloseTo(0.5, 10);

    await takeQuiz(userId);
    expect((await buildTasteProfile(db, userId)).tag_weight).toBeCloseTo(0.15, 10);
    for (const dishId of SPICY_DISH_IDS) await logMeal(userId, dishId, 5, true);
    expect((await buildTasteProfile(db, userId)).tag_weight).toBeGreaterThan(0.15);
  });
});

describe('score composition', () => {
  it('reads a logged meal on the same -1..1 scale a swipe uses', () => {
    expect(logSignal(5, true)).toBeCloseTo(1, 10);
    expect(logSignal(1, false)).toBeCloseTo(-1, 10);
    expect(logSignal(3, true)).toBeCloseTo(0.4, 10);
  });

  it('blends community and taste match at the PRD weights', () => {
    expect(PERSONALIZATION_WEIGHTS).toEqual({ community: 0.7, taste: 0.3 });
    expect(personalizedScore(1, 1)).toBeCloseTo(1, 10);
    expect(personalizedScore(0, -1)).toBeCloseTo(0, 10);
    expect(personalizedScore(0.8, 0)).toBeCloseTo(0.71, 10);
  });

  it('penalizes dishes the diner previously disliked', async () => {
    await logMeal(userId, CHURROS_ID, 1, false);
    const history = await getUserDishHistory(db, userId);
    expect(history.disliked.has(CHURROS_ID)).toBe(true);
    expect(applyPersonalizationAdjustments(0.8, CHURROS_ID, history)).toBeLessThan(0.8);
  });

  it('gives a small novelty boost to dishes the diner has never logged', async () => {
    const history = await getUserDishHistory(db, userId);
    expect(applyPersonalizationAdjustments(0.8, CHURROS_ID, history)).toBeGreaterThan(0.8);
  });
});

describe('preference summary', () => {
  it('splits liked and disliked dimensions for the profile UI', async () => {
    await takeQuiz(userId);
    const summary = summarizePreferences(await buildTasteProfile(db, userId));
    expect(summary.liked.spice_levels.some((entry) => entry.label === 'Hot')).toBe(true);
    expect(summary.disliked.cuisines.some((entry) => entry.label === 'Japanese')).toBe(true);
  });
});
