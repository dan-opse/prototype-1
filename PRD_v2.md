# MenuSnap PRD v2

## Why this version exists

The original PRD scoped MenuSnap as: pick a restaurant, then see item-level rankings for that restaurant. That's a fine data exercise, but it doesn't answer the question a hungry person actually has, which is "where should I go." This version keeps the original data model and ranking math, but moves the entry point to dish-first, cross-restaurant discovery, personalized to the user from the moment they open the app. Restaurant-first browsing already exists everywhere (Yelp, Google Maps). Dish-first, personalized-from-day-one browsing does not.

Open questions from the original PRD that are still genuinely open are marked as such below rather than papered over. This is meant to guide a prototype, not lock in a final design.

---

## Product Context

A diner often knows a restaurant is well reviewed but still doesn't know which dish to order there, or which restaurant has the dish they'd actually enjoy most tonight. MenuSnap flips the browsing unit from restaurant to dish: the user describes or demonstrates their taste, and the app surfaces individual dishes across every restaurant in the dataset that fit, with the restaurant attached as context rather than the entry point.

---

## Core User Stories

### 1. Onboarding taste quiz (new)

As a new user with no feedback history, I swipe through a short sequence of individual dishes (target: 10), answering yes or no to "would you order this." This seeds a taste profile before any real meal has been logged, so the app isn't generic on day one.

Each swipe contributes two kinds of signal, weighted differently:

- **Structural preferences** (cuisine, price level, spice level, vegetarian flag): pulled directly from the dish's own attributes, no feedback needed. Full weight from the first swipe.
- **Descriptive tag preferences** (crispy, umami, tender, fresh, rich, light, good texture, good sauce, filling, comforting, balanced, vegetarian-friendly): pulled from the tags the community has already attached to that dish, since these tags describe a physical property of the food and converge to consensus once a dish has a few reviews. Near-full weight from swipes on dishes that already carry these tags.
- **Evaluative tags** (too salty, too sweet, bland, overcooked, great value, portion size): these are judged against a person's own baseline, not a fixed property of the dish, so a swipe contributes only a small, capped weight here. Confidence in this part of the profile grows only as the user logs real meals, and the quiz-derived guess is gradually displaced by their own logged history.

Cold items with no prior feedback fall back to structural signal only, since there's nothing else to draw from.

### 2. Home feed (revised): personalized, dish-first, cross-restaurant

As a hungry diner with no restaurant in mind, I open the app to a tabbed feed of individual dishes pulled from every restaurant in the dataset:

- **For You**: ranked by `personalized_score` (community score blended with taste match). Leans harder on structural match early in a user's life, shifts toward logged taste-tag data as their history grows.
- **Community**: ranked by `community_score` alone, identical for every user. This is the cold-start safety net and the "objectively well-reviewed" view.
- **Wildcard**: definition deferred. Candidates discussed: dishes that push slightly against the user's established pattern ("adjacent taste"), or well-liked dishes with low sample size that the Bayesian smoothing is currently suppressing ("underdog"). Not required for the prototype's first pass.

Each card, visible before any tap, shows: dish name, restaurant name, price, average reaction score, reorder percentage, and (on the For You tab) a short reason string tied to the user's profile. Reaction score and reorder percentage are shown together, not one in place of the other, since the two answer different questions (was it good vs. would they get it again).

### 3. Dish detail view

Tapping a card opens the full dish view: description, all of the above stats, common tags, and restaurant info. This is a secondary, exploratory path, not the primary logging path.

### 4. Log a meal (fast path)

As a diner who just ate somewhere, I log the meal through a dedicated flow, not by navigating to the restaurant and dish through the browse feed:

1. **Two-step picker**: choose the restaurant, then choose the dish. (A single global search across all dishes regardless of restaurant was considered but not chosen, users think "I ate at X, then had Y.")
2. **Reaction (1 to 5)** and **would-order-again**: one tap each, minimal friction.
3. **Tags: core to the flow, not an optional afterthought.** The tag list shown is contextual, i.e. it's the tags the community has already used on that specific dish, ranked by frequency, so the user is usually confirming rather than generating from a blank twenty-item list. Descriptive tags surface before evaluative ones, since they're faster to judge. Showing community tags here also functions as a mild anchor on what the user notices about their own meal. This is a known and accepted tradeoff, not an oversight, since it also nudges tag data toward the shared vocabulary needed for cross-user comparison, though it's worth watching in testing for whether it flattens individual variation too much.
4. **Note**: optional, unchanged from the original PRD.

The exact minimum number of required tags to submit (a hard floor vs. a soft, UI-nudged target of three) is an open design question, to be settled during prototyping rather than fixed here.

### 5. Taste profile (revised)

As a returning diner, I can view a taste profile built from two distinguishable sources:

- Patterns the app is confident about, built from real logged meals over time.
- Early guesses seeded by the onboarding quiz, still present but explicitly marked as lower-confidence until enough real logs replace them.

This distinction should be visible in the UI itself (e.g. "confident" vs. "still learning" framing), rather than presenting quiz-derived guesses and log-derived patterns as equally certain.

---

## Ranking Model (unchanged from original PRD)

```text
community_score =
    0.45 * bayesian_average_reaction
  + 0.35 * reorder_rate_scaled
  + 0.20 * confidence_score
```

```text
bayesian_average_reaction = (v / (v + m)) * R + (m / (v + m)) * C
```

- `R`: item average, `v`: number of ratings, `C`: global average, `m`: minimum-review prior (5 to 10)

```text
personalized_score =
    0.70 * normalized_community_score
  + 0.30 * taste_match_score
```

`taste_match_score` is now explicitly a blend of structural match (always available) and tag-based match (confidence-weighted by how much real log history the user has), rather than a single undifferentiated number.

---

## Location

Location-agnostic for this prototype. Distance/proximity is planned as a real factor later (once the app is no longer dataset-bound to four restaurants in one city), but is out of scope now.

---

## Data Notes (unchanged)

Uses the supplied `menusnap.db` (`restaurants`, `menu_items`, `users`, `feedback`, `feedback_tags`, `feedback_tag_links`, and the `item_feedback_summary` view). Cold-start items with no feedback must still appear (with structural info only) rather than being hidden.

---

## Open Questions Carried Forward

1. Wildcard tab definition (adjacent-taste vs. underdog vs. a blend).
2. Hard vs. soft minimum tag count on the log flow.
3. Whether the app should ever proactively prompt someone to log a meal, or stay fully user-initiated (treated as a stretch goal, not core).
4. How much the "show community tags during logging" anchoring effect actually distorts individual tag data in practice, worth watching once real users test the flow.

---

## Acceptance Criteria (retained from original, still apply)

1. Dishes can be ranked using community feedback, accounting for sample size (not raw average).
2. Ranking changes after new feedback is submitted.
3. A user taste profile can be generated from onboarding quiz data alone, and improves as logs accumulate.
4. Personalized recommendations differ for at least two users.
5. Empty states and invalid IDs do not crash the application.
6. At least three automated tests pass.
7. Setup instructions work from a clean clone.
