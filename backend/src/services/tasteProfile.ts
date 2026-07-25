import type { DB } from '../db/index.js';
import type {
  DishRow,
  DishTag,
  PreferenceEntry,
  PreferenceSource,
  TagKind,
  TasteProfile,
} from '../types.js';
import { getAllDishes, getTagsByDish, tagKind } from './ranking.js';

/**
 * Signal weights, per PRD "Onboarding taste quiz".
 *
 * A quiz swipe and a logged meal both say something about the diner, but not with equal
 * authority. Structural attributes are read straight off the dish, so a swipe is worth as much as
 * a log. Descriptive tags are community consensus about the food itself, so a swipe is worth
 * nearly as much. Evaluative tags are judged against a personal baseline, so a swipe barely
 * counts and real logs quickly outweigh it: because scores are weighted averages, ~2 logged meals
 * already dominate a full 10-swipe quiz on any evaluative dimension.
 */
export const SIGNAL_WEIGHTS = {
  quiz: { structural: 1.0, descriptive: 0.9, evaluative: 0.2 },
  log: { structural: 1.0, descriptive: 1.0, evaluative: 1.0 },
} as const;

/** A quiz swipe may teach us about at most this many evaluative tags, capping its total say. */
const MAX_EVALUATIVE_TAGS_PER_SWIPE = 2;

/** Community tags considered when a swipe stands in for tasting the dish. */
const MAX_TAGS_PER_SWIPE = 5;

/** Tag preferences start with a small say and grow to this share once the user has logged meals. */
export const TAG_WEIGHT_FLOOR = 0.15;
export const TAG_WEIGHT_CEILING = 0.5;
export const LOGS_FOR_FULL_TAG_WEIGHT = 8;

export const PERSONALIZATION_WEIGHTS = { community: 0.7, taste: 0.3 } as const;

type DimensionGroup = 'cuisine' | 'price' | 'spice' | 'vegetarian' | 'tag';

interface Accumulator {
  group: DimensionGroup;
  label: string;
  kind?: TagKind;
  weightedSum: number;
  weight: number;
  sources: Set<PreferenceSource>;
}

export function priceBucket(priceCents: number): 1 | 2 | 3 | 4 {
  if (priceCents <= 1199) return 1;
  if (priceCents <= 1799) return 2;
  if (priceCents <= 2299) return 3;
  return 4;
}

const PRICE_LABELS = ['$', '$$', '$$$', '$$$$'];
const SPICE_LABELS = ['Not spicy', 'Mild', 'Medium', 'Hot'];

export function priceLabel(priceCents: number): string {
  return PRICE_LABELS[priceBucket(priceCents) - 1];
}

export function spiceLabel(spiceLevel: number): string {
  return SPICE_LABELS[Math.min(Math.max(spiceLevel, 0), 3)];
}

export function vegetarianLabel(isVegetarian: boolean): string {
  return isVegetarian ? 'Vegetarian' : 'Meat or seafood';
}

/** How positive a logged meal was, on the same -1..1 scale a yes/no swipe uses. */
export function logSignal(reaction: number, wouldOrderAgain: boolean): number {
  return 0.6 * ((reaction - 3) / 2) + 0.4 * (wouldOrderAgain ? 1 : -1);
}

interface SignalEvent {
  source: PreferenceSource;
  sign: number;
  dish: DishRow;
  tags: { name: string; kind: TagKind }[];
}

function dimensionKey(group: DimensionGroup, label: string): string {
  return `${group}:${label}`;
}

function accumulate(
  accumulators: Map<string, Accumulator>,
  group: DimensionGroup,
  label: string,
  sign: number,
  weight: number,
  source: PreferenceSource,
  kind?: TagKind,
): void {
  if (weight <= 0) return;
  const key = dimensionKey(group, label);
  const existing = accumulators.get(key) ?? {
    group,
    label,
    kind,
    weightedSum: 0,
    weight: 0,
    sources: new Set<PreferenceSource>(),
  };
  existing.weightedSum += sign * weight;
  existing.weight += weight;
  existing.sources.add(source);
  accumulators.set(key, existing);
}

function collectEvents(db: DB, userId: number): SignalEvent[] {
  const dishes = new Map(getAllDishes(db).map((dish) => [dish.id, dish]));
  const communityTags = getTagsByDish(db);
  const events: SignalEvent[] = [];

  const swipes = db
    .prepare('SELECT menu_item_id, liked FROM onboarding_swipes WHERE user_id = ? ORDER BY id')
    .all(userId) as { menu_item_id: number; liked: number }[];

  for (const swipe of swipes) {
    const dish = dishes.get(swipe.menu_item_id);
    if (!dish) continue;
    // Cold dishes carry no community tags yet, so they contribute structural signal only.
    const tags = (communityTags.get(dish.id) ?? []).slice(0, MAX_TAGS_PER_SWIPE);
    events.push({
      source: 'quiz',
      sign: swipe.liked === 1 ? 1 : -1,
      dish,
      tags: tags.map((tag) => ({ name: tag.name, kind: tag.kind })),
    });
  }

  const logs = db
    .prepare('SELECT id, menu_item_id, reaction, would_order_again FROM feedback WHERE user_id = ? ORDER BY id')
    .all(userId) as { id: number; menu_item_id: number; reaction: number; would_order_again: number }[];

  const logTags = db.prepare(
    `SELECT ft.name
     FROM feedback_tag_links ftl
     JOIN feedback_tags ft ON ft.id = ftl.tag_id
     WHERE ftl.feedback_id = ?`,
  );

  for (const log of logs) {
    const dish = dishes.get(log.menu_item_id);
    if (!dish) continue;
    const names = logTags.all(log.id) as { name: string }[];
    events.push({
      source: 'log',
      sign: logSignal(log.reaction, log.would_order_again === 1),
      dish,
      tags: names.map(({ name }) => ({ name, kind: tagKind(name) })),
    });
  }

  return events;
}

function toEntry(acc: Accumulator): PreferenceEntry {
  return {
    label: acc.label,
    score: acc.weight === 0 ? 0 : acc.weightedSum / acc.weight,
    weight: acc.weight,
    confidence: acc.sources.has('log') ? 'confident' : 'still_learning',
    sources: [...acc.sources],
  };
}

/** Tag preferences count for more as real logged history accumulates. */
export function tagWeightForLogCount(logCount: number): number {
  const growth = (TAG_WEIGHT_CEILING - TAG_WEIGHT_FLOOR) * Math.min(1, logCount / LOGS_FOR_FULL_TAG_WEIGHT);
  return TAG_WEIGHT_FLOOR + growth;
}

export function buildTasteProfile(db: DB, userId: number): TasteProfile {
  const events = collectEvents(db, userId);
  const accumulators = new Map<string, Accumulator>();

  for (const event of events) {
    const weights = SIGNAL_WEIGHTS[event.source];
    const { dish, sign, source } = event;

    accumulate(accumulators, 'cuisine', dish.cuisine, sign, weights.structural, source);
    accumulate(accumulators, 'price', priceLabel(dish.price_cents), sign, weights.structural, source);
    accumulate(accumulators, 'spice', spiceLabel(dish.spice_level), sign, weights.structural, source);
    accumulate(
      accumulators,
      'vegetarian',
      vegetarianLabel(dish.is_vegetarian === 1),
      sign,
      weights.structural,
      source,
    );

    let evaluativeUsed = 0;
    for (const tag of event.tags) {
      if (tag.kind === 'evaluative') {
        if (source === 'quiz' && evaluativeUsed >= MAX_EVALUATIVE_TAGS_PER_SWIPE) continue;
        evaluativeUsed += 1;
        accumulate(accumulators, 'tag', tag.name, sign, weights.evaluative, source, 'evaluative');
      } else {
        accumulate(accumulators, 'tag', tag.name, sign, weights.descriptive, source, 'descriptive');
      }
    }
  }

  const profile: TasteProfile = {
    user_id: userId,
    log_count: events.filter((event) => event.source === 'log').length,
    swipe_count: events.filter((event) => event.source === 'quiz').length,
    tag_weight: 0,
    structural_weight: 0,
    cuisines: {},
    price_levels: {},
    spice_levels: {},
    vegetarian: {},
    tags: {},
  };

  profile.tag_weight = tagWeightForLogCount(profile.log_count);
  profile.structural_weight = 1 - profile.tag_weight;

  for (const acc of accumulators.values()) {
    const entry = toEntry(acc);
    switch (acc.group) {
      case 'cuisine':
        profile.cuisines[acc.label] = entry;
        break;
      case 'price':
        profile.price_levels[acc.label] = entry;
        break;
      case 'spice':
        profile.spice_levels[acc.label] = entry;
        break;
      case 'vegetarian':
        profile.vegetarian[acc.label] = entry;
        break;
      case 'tag':
        profile.tags[acc.label] = { ...entry, kind: acc.kind ?? 'descriptive' };
        break;
    }
  }

  return profile;
}

export interface TasteMatch {
  /** -1..1 */
  score: number;
  structural_match: number;
  tag_match: number;
  matched_tags: { name: string; score: number }[];
  matched_structural: { label: string; score: number }[];
}

function lookup(entries: Record<string, PreferenceEntry>, label: string): PreferenceEntry | undefined {
  return entries[label];
}

export function tasteMatch(profile: TasteProfile, dish: DishRow, dishTags: DishTag[]): TasteMatch {
  const structuralCandidates = [
    lookup(profile.cuisines, dish.cuisine),
    lookup(profile.price_levels, priceLabel(dish.price_cents)),
    lookup(profile.spice_levels, spiceLabel(dish.spice_level)),
    lookup(profile.vegetarian, vegetarianLabel(dish.is_vegetarian === 1)),
  ];

  const structuralLabels = [
    dish.cuisine,
    priceLabel(dish.price_cents),
    spiceLabel(dish.spice_level),
    vegetarianLabel(dish.is_vegetarian === 1),
  ];

  const known = structuralCandidates
    .map((entry, index) => ({ entry, label: structuralLabels[index] }))
    .filter((candidate): candidate is { entry: PreferenceEntry; label: string } => candidate.entry !== undefined);

  const structuralMatch = known.length === 0 ? 0 : known.reduce((sum, c) => sum + c.entry.score, 0) / known.length;

  // Tag match leans on how often the community actually applies each tag to this dish.
  let tagWeightSum = 0;
  let tagWeightedScore = 0;
  const matchedTags: { name: string; score: number }[] = [];
  for (const tag of dishTags) {
    const entry = profile.tags[tag.name];
    if (!entry) continue;
    tagWeightSum += tag.uses;
    tagWeightedScore += tag.uses * entry.score;
    matchedTags.push({ name: tag.name, score: entry.score });
  }
  const tagMatch = tagWeightSum === 0 ? 0 : tagWeightedScore / tagWeightSum;

  const score = profile.structural_weight * structuralMatch + profile.tag_weight * tagMatch;

  return {
    score,
    structural_match: structuralMatch,
    tag_match: tagMatch,
    matched_tags: matchedTags.sort((a, b) => b.score - a.score),
    matched_structural: known
      .map((candidate) => ({ label: candidate.label, score: candidate.entry.score }))
      .sort((a, b) => b.score - a.score),
  };
}

/** taste_match_score is -1..1; community_score is already 0..1, so shift before blending. */
export function personalizedScore(community: number, taste: number): number {
  return PERSONALIZATION_WEIGHTS.community * community + PERSONALIZATION_WEIGHTS.taste * ((taste + 1) / 2);
}

const POSITIVE_THRESHOLD = 0.15;

export function buildReason(profile: TasteProfile, match: TasteMatch): string {
  const quizOnly = profile.log_count === 0 && profile.swipe_count > 0;
  const suffix = quizOnly ? ' (from your quiz)' : '';

  const positiveTags = match.matched_tags.filter((tag) => tag.score >= POSITIVE_THRESHOLD).slice(0, 2);
  if (positiveTags.length > 0) {
    return `You go for ${positiveTags.map((tag) => tag.name).join(' and ')} dishes${suffix}`;
  }

  const positiveStructural = match.matched_structural.filter((entry) => entry.score >= POSITIVE_THRESHOLD).slice(0, 2);
  if (positiveStructural.length > 0) {
    return `Matches your taste for ${positiveStructural.map((entry) => entry.label.toLowerCase()).join(' and ')}${suffix}`;
  }

  if (profile.swipe_count === 0 && profile.log_count === 0) {
    return 'Well reviewed by the community — take the quiz to personalize this';
  }

  return 'Outside your usual pattern, but well reviewed';
}
