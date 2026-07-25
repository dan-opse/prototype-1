import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DB } from '../src/db/index.js';
import { COLD_DISH_ID, createTestDb } from './helpers/testDb.js';

let db: DB;
let app: Express;

beforeEach(() => {
  db = createTestDb();
  app = createApp(db);
});

afterEach(() => {
  db.close();
});

describe('feeds', () => {
  it('serves a community feed that is identical for everyone', async () => {
    const first = await request(app).get('/api/feed/community').expect(200);
    const second = await request(app).get('/api/feed/community').expect(200);

    expect(first.body.dishes).toHaveLength(26);
    expect(first.body.dishes.map((d: { name: string }) => d.name)).toEqual(
      second.body.dishes.map((d: { name: string }) => d.name),
    );
    expect(first.body.dishes[0]).toHaveProperty('reorder_percentage');
    expect(first.body.dishes[0]).not.toHaveProperty('personalized_score');
  });

  it('recommends differently for two diners with different histories', async () => {
    const miguel = await request(app).get('/api/feed/for-you?userId=1').expect(200);
    const priya = await request(app).get('/api/feed/for-you?userId=2').expect(200);

    const miguelOrder = miguel.body.dishes.map((d: { menu_item_id: number }) => d.menu_item_id);
    const priyaOrder = priya.body.dishes.map((d: { menu_item_id: number }) => d.menu_item_id);

    expect(miguelOrder).not.toEqual(priyaOrder);
    expect([...miguelOrder].sort()).toEqual([...priyaOrder].sort());

    // Same dish, different fit: the two profiles disagree about at least one item.
    const miguelScores = new Map(
      miguel.body.dishes.map((d: { menu_item_id: number; taste_match_score: number }) => [
        d.menu_item_id,
        d.taste_match_score,
      ]),
    );
    const disagreements = priya.body.dishes.filter(
      (d: { menu_item_id: number; taste_match_score: number }) =>
        Math.abs((miguelScores.get(d.menu_item_id) as number) - d.taste_match_score) > 0.05,
    );
    expect(disagreements.length).toBeGreaterThan(0);
  });

  it('explains every For You card with a reason', async () => {
    const response = await request(app).get('/api/feed/for-you?userId=1').expect(200);
    for (const dish of response.body.dishes) {
      expect(typeof dish.reason).toBe('string');
      expect(dish.reason.length).toBeGreaterThan(0);
    }
  });
});

describe('logging a meal', () => {
  it('changes the community ranking after new feedback arrives', async () => {
    const before = await request(app).get('/api/feed/community').expect(200);
    const rankBefore = before.body.dishes.findIndex(
      (d: { menu_item_id: number }) => d.menu_item_id === COLD_DISH_ID,
    );
    const scoreBefore = before.body.dishes[rankBefore].community_score;

    for (const userId of [5, 6, 7, 8, 9, 10, 11, 12]) {
      await request(app)
        .post('/api/feedback')
        .send({ userId, menuItemId: COLD_DISH_ID, reaction: 5, wouldOrderAgain: true, tagIds: [3, 17] })
        .expect(201);
    }

    const after = await request(app).get('/api/feed/community').expect(200);
    const rankAfter = after.body.dishes.findIndex(
      (d: { menu_item_id: number }) => d.menu_item_id === COLD_DISH_ID,
    );
    const dishAfter = after.body.dishes[rankAfter];

    expect(dishAfter.feedback_count).toBe(8);
    expect(dishAfter.community_score).toBeGreaterThan(scoreBefore);
    expect(rankAfter).toBeLessThan(rankBefore);
  });

  it('records tags and reports when the diner stayed under the soft target', async () => {
    const response = await request(app)
      .post('/api/feedback')
      .send({ userId: 1, menuItemId: 1, reaction: 4, wouldOrderAgain: true, tagIds: [16], note: '  tasty  ' })
      .expect(201);

    expect(response.body.tags_recorded).toBe(1);
    expect(response.body.below_soft_tag_target).toBe(true);

    const detail = await request(app).get('/api/menu-items/1').expect(200);
    expect(detail.body.recent_notes[0].note).toBe('tasty');
  });

  it('offers the dish-specific tags first, descriptive before evaluative', async () => {
    const response = await request(app).get('/api/menu-items/26/tags').expect(200);
    const suggested = response.body.suggested as { name: string; kind: string; uses: number }[];

    expect(suggested.length).toBeGreaterThan(0);
    expect(suggested.every((tag) => tag.uses > 0)).toBe(true);
    const lastDescriptive = suggested.map((tag) => tag.kind).lastIndexOf('descriptive');
    const firstEvaluative = suggested.findIndex((tag) => tag.kind === 'evaluative');
    if (firstEvaluative !== -1) expect(firstEvaluative).toBeGreaterThan(lastDescriptive);
    // Tags nobody used on this dish are still reachable, just not suggested.
    expect(response.body.other.length).toBeGreaterThan(0);
  });
});

describe('onboarding quiz', () => {
  it('personalizes a brand new diner from quiz answers alone', async () => {
    const created = await request(app).post('/api/users').send({ display_name: 'Test Diner' }).expect(201);
    const userId = created.body.user.id as number;
    expect(created.body.onboarding.has_completed_quiz).toBe(false);

    const quiz = await request(app).get(`/api/onboarding/quiz-items?userId=${userId}`).expect(200);
    expect(quiz.body.items).toHaveLength(10);
    // The quiz spans restaurants rather than dealing ten dishes from one menu.
    const restaurantIds = new Set(
      quiz.body.items.map((item: { restaurant: { id: number } }) => item.restaurant.id),
    );
    expect(restaurantIds.size).toBeGreaterThan(1);

    for (const item of quiz.body.items as { menu_item_id: number; is_vegetarian: boolean }[]) {
      await request(app)
        .post('/api/onboarding/swipes')
        .send({ userId, menuItemId: item.menu_item_id, liked: item.is_vegetarian })
        .expect(201);
    }

    const status = await request(app).get(`/api/users/${userId}`).expect(200);
    expect(status.body.onboarding).toMatchObject({ swipe_count: 10, log_count: 0, has_completed_quiz: true });

    const profile = await request(app).get(`/api/users/${userId}/taste-profile`).expect(200);
    expect(profile.body.profile.vegetarian['Vegetarian'].score).toBeGreaterThan(0);
    expect(profile.body.profile.vegetarian['Vegetarian'].confidence).toBe('still_learning');

    const feed = await request(app).get(`/api/feed/for-you?userId=${userId}`).expect(200);
    const community = await request(app).get('/api/feed/community').expect(200);
    expect(feed.body.dishes.map((d: { menu_item_id: number }) => d.menu_item_id)).not.toEqual(
      community.body.dishes.map((d: { menu_item_id: number }) => d.menu_item_id),
    );
  });

  it('stops handing out quiz items once the quiz is done', async () => {
    const created = await request(app).post('/api/users').send({ display_name: 'Finisher' }).expect(201);
    const userId = created.body.user.id as number;

    const quiz = await request(app).get(`/api/onboarding/quiz-items?userId=${userId}`).expect(200);
    for (const item of quiz.body.items as { menu_item_id: number }[]) {
      await request(app)
        .post('/api/onboarding/swipes')
        .send({ userId, menuItemId: item.menu_item_id, liked: true })
        .expect(201);
    }

    const after = await request(app).get(`/api/onboarding/quiz-items?userId=${userId}`).expect(200);
    expect(after.body.items).toEqual([]);
    expect(after.body.onboarding.has_completed_quiz).toBe(true);
  });
});

describe('empty states and invalid input', () => {
  it('404s on unknown ids instead of crashing', async () => {
    await request(app).get('/api/menu-items/99999').expect(404);
    await request(app).get('/api/users/99999').expect(404);
    await request(app).get('/api/users/99999/taste-profile').expect(404);
    await request(app).get('/api/restaurants/99999/menu-items').expect(404);
    await request(app).get('/api/feed/for-you?userId=99999').expect(404);
    await request(app).get('/api/nope').expect(404);
  });

  it('400s on malformed ids and bodies', async () => {
    await request(app).get('/api/menu-items/abc').expect(400);
    await request(app).get('/api/menu-items/-1').expect(400);
    await request(app).get('/api/feed/for-you').expect(400);
    await request(app).post('/api/users').send({ display_name: '   ' }).expect(400);
    await request(app)
      .post('/api/feedback')
      .send({ userId: 1, menuItemId: 1, reaction: 9, wouldOrderAgain: true })
      .expect(400);
    await request(app)
      .post('/api/feedback')
      .send({ userId: 1, menuItemId: 1, reaction: 4, wouldOrderAgain: 'maybe' })
      .expect(400);
    await request(app)
      .post('/api/feedback')
      .send({ userId: 1, menuItemId: 1, reaction: 4, wouldOrderAgain: true, tagIds: 'crispy' })
      .expect(400);
  });

  it('serves a dish that nobody has reviewed without erroring', async () => {
    const response = await request(app).get(`/api/menu-items/${COLD_DISH_ID}`).expect(200);
    expect(response.body.dish.feedback_count).toBe(0);
    expect(response.body.dish.average_reaction).toBeNull();
    expect(response.body.dish.top_tags).toEqual([]);
    expect(response.body.recent_notes).toEqual([]);
    expect(response.body.dish.community_score).toBeGreaterThan(0);
  });

  it('gives a diner with no history the community ordering and an honest reason', async () => {
    const created = await request(app).post('/api/users').send({ display_name: 'Blank Slate' }).expect(201);
    const userId = created.body.user.id as number;

    const feed = await request(app).get(`/api/feed/for-you?userId=${userId}`).expect(200);
    const community = await request(app).get('/api/feed/community').expect(200);

    expect(feed.body.dishes.map((d: { menu_item_id: number }) => d.menu_item_id)).toEqual(
      community.body.dishes.map((d: { menu_item_id: number }) => d.menu_item_id),
    );
    expect(feed.body.dishes[0].reason).toContain('take the quiz');
  });

  it('rejects a swipe on a dish that does not exist', async () => {
    await request(app)
      .post('/api/onboarding/swipes')
      .send({ userId: 1, menuItemId: 99999, liked: true })
      .expect(404);
  });
});
