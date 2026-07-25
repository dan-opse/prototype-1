export interface Restaurant {
  id: number;
  name: string;
  slug: string;
  cuisine: string;
  address: string | null;
  price_level: number;
}

export interface MenuItemRow {
  id: number;
  restaurant_id: number;
  name: string;
  description: string | null;
  category: string;
  price_cents: number;
  is_vegetarian: number;
  spice_level: number;
  is_available: number;
}

/** A menu item joined with its restaurant and its community feedback aggregates. */
export interface DishRow extends MenuItemRow {
  restaurant_name: string;
  restaurant_slug: string;
  cuisine: string;
  restaurant_price_level: number;
  feedback_count: number;
  average_reaction: number | null;
  reorder_percentage: number | null;
}

export interface DishTag {
  id: number;
  name: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  /** Descriptive tags describe the food itself; evaluative tags are judged against a personal baseline. */
  kind: TagKind;
  uses: number;
}

export type TagKind = 'descriptive' | 'evaluative';

export interface ScoreBreakdown {
  bayesian_average_reaction: number;
  reorder_rate_scaled: number;
  confidence_score: number;
  community_score: number;
}

export interface FeedDish {
  menu_item_id: number;
  name: string;
  description: string | null;
  category: string;
  price_cents: number;
  is_vegetarian: boolean;
  spice_level: number;
  restaurant: {
    id: number;
    name: string;
    cuisine: string;
    price_level: number;
  };
  feedback_count: number;
  average_reaction: number | null;
  reorder_percentage: number | null;
  community_score: number;
  score_breakdown: ScoreBreakdown;
  top_tags: DishTag[];
  /** Present on the For You feed only. */
  personalized_score?: number;
  taste_match_score?: number;
  reason?: string;
}

export interface UserRow {
  id: number;
  display_name: string;
  created_at: string;
}

export type PreferenceSource = 'log' | 'quiz';

export interface PreferenceEntry {
  /** Human-readable label, e.g. "Korean" or "crispy". */
  label: string;
  /** -1 (strongly avoids) to +1 (strongly prefers). */
  score: number;
  /** Total signal weight behind this score. */
  weight: number;
  /** Whether any real logged meal contributed, vs quiz swipes alone. */
  confidence: 'confident' | 'still_learning';
  sources: PreferenceSource[];
}

export interface TasteProfile {
  user_id: number;
  log_count: number;
  swipe_count: number;
  /** How heavily tag preferences count in taste_match_score right now (grows with log history). */
  tag_weight: number;
  structural_weight: number;
  cuisines: Record<string, PreferenceEntry>;
  price_levels: Record<string, PreferenceEntry>;
  spice_levels: Record<string, PreferenceEntry>;
  vegetarian: Record<string, PreferenceEntry>;
  tags: Record<string, PreferenceEntry & { kind: TagKind }>;
}
