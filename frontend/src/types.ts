export type TagKind = 'descriptive' | 'evaluative';

export interface DishTag {
  id: number;
  name: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  kind: TagKind;
  uses: number;
}

export interface FeedDish {
  menu_item_id: number;
  name: string;
  description: string | null;
  category: string;
  price_cents: number;
  is_vegetarian: boolean;
  spice_level: number;
  restaurant: { id: number; name: string; cuisine: string; price_level: number };
  feedback_count: number;
  average_reaction: number | null;
  reorder_percentage: number | null;
  community_score: number;
  score_breakdown: {
    bayesian_average_reaction: number;
    reorder_rate_scaled: number;
    confidence_score: number;
    community_score: number;
  };
  top_tags: DishTag[];
  personalized_score?: number;
  taste_match_score?: number;
  reason?: string;
}

export interface User {
  id: number;
  display_name: string;
  created_at: string;
  log_count?: number;
  swipe_count?: number;
}

export interface OnboardingStatus {
  swipe_count: number;
  log_count: number;
  quiz_length: number;
  has_completed_quiz: boolean;
}

export interface Restaurant {
  id: number;
  name: string;
  slug: string;
  cuisine: string;
  address: string | null;
  price_level: number;
  menu_item_count?: number;
}

export interface PreferenceEntry {
  label: string;
  score: number;
  weight: number;
  confidence: 'confident' | 'still_learning';
  sources: ('log' | 'quiz')[];
  kind?: TagKind;
}

export interface TasteProfileSummary {
  liked: {
    cuisines: PreferenceEntry[];
    price_levels: PreferenceEntry[];
    spice_levels: PreferenceEntry[];
    vegetarian: PreferenceEntry[];
    tags: (PreferenceEntry & { kind: TagKind })[];
  };
  disliked: {
    cuisines: PreferenceEntry[];
    price_levels: PreferenceEntry[];
    spice_levels: PreferenceEntry[];
    vegetarian: PreferenceEntry[];
    tags: (PreferenceEntry & { kind: TagKind })[];
  };
}

export interface TasteProfile {
  user_id: number;
  log_count: number;
  swipe_count: number;
  tag_weight: number;
  structural_weight: number;
  cuisines: Record<string, PreferenceEntry>;
  price_levels: Record<string, PreferenceEntry>;
  spice_levels: Record<string, PreferenceEntry>;
  vegetarian: Record<string, PreferenceEntry>;
  tags: Record<string, PreferenceEntry & { kind: TagKind }>;
}

export interface DishDetailResponse {
  dish: FeedDish;
  restaurant: Restaurant;
  recent_notes: { note: string; reaction: number; created_at: string; display_name: string }[];
}
