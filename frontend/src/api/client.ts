import type {
  DishDetailResponse,
  DishTag,
  FeedDish,
  OnboardingStatus,
  Restaurant,
  TasteProfile,
  TasteProfileSummary,
  User,
} from '../types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed (${response.status})`);
  }
  return payload as T;
}

export const api = {
  listUsers: () => request<{ users: User[] }>('/users').then((r) => r.users),

  createUser: (displayName: string) =>
    request<{ user: User; onboarding: OnboardingStatus }>('/users', {
      method: 'POST',
      body: JSON.stringify({ display_name: displayName }),
    }),

  getUser: (userId: number) => request<{ user: User; onboarding: OnboardingStatus }>(`/users/${userId}`),

  getTasteProfile: (userId: number) =>
    request<{ profile: TasteProfile; summary: TasteProfileSummary }>(`/users/${userId}/taste-profile`).then(
      (r) => r,
    ),

  getRecommendations: (userId: number, restaurantId?: number) => {
    const query = restaurantId ? `?restaurantId=${restaurantId}` : '';
    return request<{ dishes: FeedDish[] }>(`/users/${userId}/recommendations${query}`).then((r) => r.dishes);
  },

  getQuizItems: (userId: number) =>
    request<{ items: FeedDish[]; onboarding: OnboardingStatus }>(`/onboarding/quiz-items?userId=${userId}`),

  submitSwipe: (userId: number, menuItemId: number, liked: boolean) =>
    request<{ onboarding: OnboardingStatus }>('/onboarding/swipes', {
      method: 'POST',
      body: JSON.stringify({ userId, menuItemId, liked }),
    }),

  resetQuiz: (userId: number) =>
    request<{ onboarding: OnboardingStatus }>(`/onboarding/swipes?userId=${userId}`, { method: 'DELETE' }),

  getCommunityFeed: () => request<{ dishes: FeedDish[] }>('/feed/community').then((r) => r.dishes),

  getForYouFeed: (userId: number, restaurantId?: number) => {
    const query = restaurantId ? `?userId=${userId}&restaurantId=${restaurantId}` : `?userId=${userId}`;
    return request<{ dishes: FeedDish[]; onboarding: OnboardingStatus }>(`/feed/for-you${query}`);
  },

  getDish: (menuItemId: number) => request<DishDetailResponse>(`/menu-items/${menuItemId}`),

  getDishTags: (menuItemId: number) =>
    request<{ suggested: DishTag[]; other: DishTag[] }>(`/menu-items/${menuItemId}/tags`),

  listRestaurants: () => request<{ restaurants: Restaurant[] }>('/restaurants').then((r) => r.restaurants),

  getRestaurantMenu: (restaurantId: number) =>
    request<{ restaurant: Restaurant; dishes: FeedDish[] }>(`/restaurants/${restaurantId}/menu-items`),

  getRestaurantRankings: (restaurantId: number) =>
    request<{ restaurant: Restaurant; dishes: FeedDish[] }>(`/restaurants/${restaurantId}/rankings`),

  logMeal: (payload: {
    userId: number;
    menuItemId: number;
    reaction: number;
    wouldOrderAgain: boolean;
    tagIds: number[];
    note?: string;
  }) =>
    request<{ feedback_id: number; tags_recorded: number; below_soft_tag_target: boolean }>('/feedback', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

export const SOFT_TAG_TARGET = 3;
