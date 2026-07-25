# MenuSnap Developer Mini-Project

## Objective

Build a small working prototype that helps diners choose dishes using item-level community feedback rather than restaurant-level ratings.

The prototype should use the provided SQLite database and support three core functions:

1. Rank menu items for a restaurant.
2. Let a user record what they ate and how they felt about it.
3. Build a basic taste profile and use it to personalize recommendations.

This is an exploratory mini-project. The exact production user flow is not finalized. Prioritize a coherent implementation over visual polish.

---

## Product Context

A diner often knows that a restaurant is well reviewed but still does not know which individual dish to order. MenuSnap exposes item-level signals such as:

- How many diners tried a dish
- How many would order it again
- Average reaction score
- Common reasons people liked it
- Whether it matches the current user's taste history

Restaurants gain a view into what diners actually enjoyed, rather than only what sold.

---

## Required Deliverable

Build a small full-stack or backend-focused prototype using the supplied `menusnap.db`.

The submission must include:

- A runnable application
- A README with setup instructions
- Any schema migrations or database changes
- A brief explanation of the ranking approach
- At least three automated tests
- A short note describing where AI was used during development

Use any reasonable stack.

---

## Core User Stories

### 1. View restaurant favourites

As a diner, I can select a restaurant and see a ranked list of its menu items.

Each result should show:

- Dish name
- Description
- Price
- Number of recorded diners
- Percentage who would order it again
- Average reaction score
- Up to three common feedback tags
- A short generated or templated explanation of why it ranks where it does

The ranking must not be based only on raw average score. It should account for sample size so that one perfect review does not automatically outrank an item with many strong reviews.

### 2. Log a meal

As a diner, I can record:

- Restaurant
- Menu item
- Reaction from 1 to 5
- Whether I would order it again
- Zero or more feedback tags
- Optional short note

Submitting feedback should immediately affect the restaurant rankings.

### 3. View a taste profile

As a returning diner, I can view a basic taste profile derived from their previous feedback.

The profile should identify patterns such as:

- Preferred cuisines
- Frequently liked tags
- Frequently disliked tags
- Price tendency
- Vegetarian or spice preferences when enough data exists

The profile may be rule-based. It does not need machine learning.

### 4. Personalized recommendations

As a returning diner, I can see menu item recommendations that combine:

- Community ranking
- Similarity to the user's taste profile
- A penalty for dishes the user has already disliked
- Optional novelty so the list is not entirely repetitive

The interface should explain at least one reason for each personalized recommendation.

---

## Suggested Ranking Model

You may design your own model. A reasonable baseline is:

```text
community_score =
    0.45 * bayesian_average_reaction
  + 0.35 * reorder_rate_scaled
  + 0.20 * confidence_score
```

Where:

- `bayesian_average_reaction` smooths item ratings toward the global average.
- `reorder_rate_scaled` converts the reorder percentage to the same approximate scale.
- `confidence_score` increases gradually with review count.

Example Bayesian average:

```text
(v / (v + m)) * R + (m / (v + m)) * C
```

- `R`: item average
- `v`: number of ratings for the item
- `C`: global average across all ratings
- `m`: minimum-review prior, such as 5 or 10

A personalized score can add a taste-match component:

```text
personalized_score =
    0.70 * normalized_community_score
  + 0.30 * taste_match_score
```

Document any assumptions.

---

## Minimum API or Functional Surface

Equivalent non-HTTP implementations are acceptable, but a typical API could include:

```text
GET  /restaurants
GET  /restaurants/:restaurantId/items
GET  /restaurants/:restaurantId/rankings
POST /feedback
GET  /users/:userId/profile
GET  /users/:userId/recommendations?restaurantId=:restaurantId
```

---

## Data Notes

The supplied database contains synthetic data for development only.

Important tables:

- `restaurants`
- `menu_items`
- `users`
- `feedback`
- `feedback_tags`
- `feedback_tag_links`

A convenience view named `item_feedback_summary` is also included.

Do not assume every item has feedback. The application should handle cold-start items gracefully.

---

## Acceptance Criteria

A submission is complete when:

1. Restaurant menu items can be ranked using community feedback.
2. Ranking changes after new feedback is submitted.
3. Low-sample items are handled more carefully than simple average sorting.
4. A user taste profile can be generated from existing feedback.
5. Personalized recommendations differ for at least two supplied users.
6. Empty states and invalid IDs do not crash the application.
7. At least three automated tests pass.
8. Setup instructions work from a clean clone.

---

## Suggested Tests

At minimum, test:

1. An item with one 5-star rating does not automatically outrank a heavily reviewed 4.7-star item.
2. Adding positive feedback increases or preserves an item's rank.
3. Two users with different tag preferences receive different recommendation orders.
4. Feedback validation rejects reactions outside 1–5.
5. A restaurant with no feedback still returns menu items.

---

## Stretch Goals

Choose at most one or two:

- Natural-language summaries of why people liked a dish
- Restaurant dashboard showing loved, polarizing, and underperforming items
- QR/NFC simulation using a restaurant-specific URL
- Time-decayed rankings that weigh recent feedback more heavily
- Similar-dish recommendations across restaurants
- Admin workflow for adding menu items
- Basic fraud or spam resistance

---


