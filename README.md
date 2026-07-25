# MenuSnap

Dish-level community feedback and personalized recommendations, built against the supplied
[`PRD.md`](PRD.md) (original assignment) and extended with [`PRD_v2.md`](PRD_v2.md) for dish-first
discovery. The app helps diners choose **what to order** — not just which restaurant is popular — by
ranking individual dishes with sample-size-aware community scores and matching them to each diner's
taste profile.

## Requirements

- Node.js 20 or newer (developed on Node 25)
- npm 10 or newer
- `sqlite3` on your PATH only if you want to reset the database

## Setup from a clean clone

```bash
npm install     # installs the backend and frontend workspaces
npm run dev     # API on http://localhost:4000, web app on http://localhost:5173
```

Open http://localhost:5173. The Vite dev server proxies `/api` to the backend.

Run the tests:

```bash
npm test        # 40 backend tests (Vitest + Supertest, in-memory database)
```

Other useful scripts:

```bash
npm run typecheck   # TypeScript across both workspaces
npm run build       # compile the API and build the production web bundle
npm run dev:backend # API only
npm run dev:frontend # web app only (expects the API on :4000)
```

## Try it out

Four seeded diners have distinct histories, so their For You feeds diverge:

- **Miguel Santos** — spicy, savoury, filling food
- **Priya Shah** — vegetarian, fresh, lighter food
- **Noah Williams** — crispy, rich comfort food
- **Emma Chen** — balanced, umami-forward dishes

A walkthrough that touches every PRD feature:

1. Open **Restaurants**, pick one, and read the **community ranking** — each dish shows name,
   description, price, review count, reorder %, average reaction, top tags, and a templated
   explanation of why it ranks where it does.
2. Switch to Miguel in the top-right selector. On the restaurant page, compare the community list with
   **Your recommendations here** (same restaurant, personalized order).
3. Open the **Feed** and compare **For You** vs **Community** tabs across all restaurants.
4. Click **New diner**, take the taste quiz, then open **Taste profile** — liked vs disliked patterns
   on top, confident vs still-learning below.
5. Use **Log a meal**. Rankings and your profile update immediately; log something you disliked and
   watch it drop in your personalized lists.

## Features mapped to the original PRD

| PRD user story | Where it lives |
| --- | --- |
| View restaurant favourites (ranked dishes + stats + explanation) | **Restaurants** nav → pick a restaurant |
| Log a meal (reaction, reorder, tags, note) | **Log a meal** nav |
| Taste profile (cuisines, tags, price, spice, vegetarian) | **Taste profile** nav — split into liked/disliked and confident/still learning |
| Personalized recommendations | **Feed → For You**, restaurant page, `GET /api/users/:id/recommendations` |
| Ranking changes after feedback | Immediate — feeds recompute on every request |
| Cold-start dishes | Stay in lists, scored from the Bayesian prior |
| Invalid IDs / empty states | 400/404 responses; UI empty states |

The v2 extension adds a cross-restaurant **Feed** and an **onboarding taste quiz** so new diners are
not generic on day one. Restaurant-first browsing remains a first-class path via the **Restaurants**
page, as the original PRD specifies.

---

## Ranking models — deep dive

MenuSnap uses two related scoring pipelines: a **community score** (objective, identical for every
user) and a **personalized score** (subjective, per diner). Both are implemented in
`backend/src/services/ranking.ts` and `backend/src/services/tasteProfile.ts`.

### 1. Community score

The PRD suggests blending three signals so a single perfect review cannot beat a dish with many
strong reviews:

```text
community_score =
    0.45 × normalized_bayesian_average_reaction
  + 0.35 × reorder_rate
  + 0.20 × confidence_score
```

Every term is on a **0–1 scale** before weighting, so the coefficients sum to a meaningful whole.

#### Bayesian average reaction

```text
bayesian = (v / (v + m)) × R + (m / (v + m)) × C
```

| Symbol | Meaning |
| --- | --- |
| `R` | Raw average reaction (1–5) for this dish |
| `v` | Number of ratings for this dish |
| `C` | Global average reaction across all feedback |
| `m` | Prior weight — **7** (PRD allows 5–10) |

A dish with no ratings (`v = 0`) receives `bayesian = C`. That keeps cold-start items in the list with
a defensible score instead of hiding them or treating them as zero.

The bayesian result is then mapped to 0–1:

```text
normalized_bayesian = (bayesian − 1) / 4
```

#### Reorder rate

```text
reorder_rate = reorder_percentage / 100        # 0 if nobody has reviewed the dish yet
```

The reorder term is **not** Bayesian-smoothed in this implementation (only reaction is, per the PRD
wording). That means a dish with zero reviews contributes `0` here — a known tradeoff documented
below under assumptions.

#### Confidence score

```text
confidence_score = min(1, v / 10)
```

Review count ramps linearly to full confidence at 10 reviews. A one-review dish gets `confidence =
0.1`, so even a 5-star rating cannot dominate the leaderboard without more data.

#### Worked example

Dish A: 1 review, reaction 5, 100% reorder. Global average `C = 4`.

```text
bayesian     = (1/8)×5 + (7/8)×4 = 4.125  → normalized 0.781
reorder      = 1.0
confidence   = 0.1
community    = 0.45×0.781 + 0.35×1.0 + 0.20×0.1 = 0.671
```

Dish B: 20 reviews, reaction 4.5, 90% reorder.

```text
bayesian     = (20/27)×4.5 + (7/27)×4 ≈ 4.37  → normalized 0.843
reorder      = 0.9
confidence   = 1.0
community    = 0.45×0.843 + 0.35×0.9 + 0.20×1.0 = 0.894
```

Dish B ranks higher despite Dish A's perfect raw score — exactly what the PRD asks for. This case is
covered by an automated test.

#### Community ranking explanations

Each ranked dish carries a templated `reason` string built from its score breakdown — e.g. high
bayesian reaction, strong reorder rate, low sample size pulling the score toward the prior, or the
most common community tag. No LLM is involved; the strings are deterministic.

### 2. Taste match score

Personalization blends community quality with fit to the diner:

```text
personalized_score = 0.70 × community_score + 0.30 × normalized(taste_match_score)
```

`taste_match_score` ranges from **−1 to +1** and is itself a weighted blend:

```text
taste_match = structural_weight × structural_match + tag_weight × tag_match

tag_weight = 0.15 + 0.35 × min(1, logged_meals / 8)     # grows from 15% to 50%
structural_weight = 1 − tag_weight
```

**Structural match** compares the dish's cuisine, price band (derived from `price_cents`, not
restaurant `price_level`), spice level, and vegetarian flag against the diner's preference scores on
those dimensions.

**Tag match** compares the dish's community tags to the diner's tag preferences, weighting each tag by
how often the community actually applies it to that dish (`uses` count).

#### Building the taste profile

Every signal — a quiz swipe or a logged meal — contributes a signed strength (−1 to +1):

| Source | Structural | Descriptive tags | Evaluative tags |
| --- | --- | --- | --- |
| Quiz swipe | 1.0 | 0.9 | 0.2 (max 2 per swipe) |
| Logged meal | 1.0 | 1.0 | 1.0 |

Logged meal strength:

```text
log_signal = 0.6 × ((reaction − 3) / 2) + 0.4 × (would_order_again ? 1 : −1)
```

Dimensions the diner has never expressed an opinion on contribute `0` to tag match and are skipped in
structural match.

The profile API also returns a **summary** splitting dimensions into frequently liked (score ≥
0.12) and frequently disliked (score ≤ −0.12), plus confident (backed by a real log) vs still
learning (quiz only).

### 3. Personalization adjustments

After the base personalized score, two PRD-motivated adjustments apply:

| Adjustment | Rule | Effect |
| --- | --- | --- |
| **Dislike penalty** | Dish previously logged with reaction ≤ 2 or `would_order_again = false` | `score × 0.35` |
| **Novelty bonus** | Dish never logged by this diner | `score + 0.04` |

The dislike penalty stops a dish you hated from resurfacing just because the community loves it. The
novelty bonus nudges untried dishes up so the list is not entirely dishes you have already eaten.

Personalized cards explain themselves: matched tags, structural fit, dislike penalty, or a prompt to
take the quiz when no history exists.

### 4. Assumptions and known limitations

- **Prior `m = 7`**, confidence cap at **10 reviews** — reasonable middle of the PRD's suggested range.
- **Reorder rate is raw**, not shrunk toward a global reorder average. Cold items lose 35% of their
  community score from this term until their first review.
- **Price bands** use dish `price_cents` because all four seeded restaurants share `price_level = 2`.
- **Spice and price** match on exact buckets; neighbouring levels get no partial credit.
- **Feeds recompute on every request** — fine for 26 dishes; a production system would cache aggregates.
- **No auth** — the selected diner is stored in `localStorage`, matching the assignment's demo framing.

---

## Acceptance criteria

Mapped to the checklist at the bottom of the original PRD:

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Restaurant menu items ranked using community feedback | ✅ | `GET /api/restaurants/:id/rankings`, **Restaurants** UI |
| 2 | Ranking changes after new feedback | ✅ | `api.test.ts` — cold dish climbs after 8 positive reviews |
| 3 | Low-sample items handled carefully | ✅ | Bayesian prior + confidence; `ranking.test.ts` |
| 4 | User taste profile from feedback | ✅ | `GET /api/users/:id/taste-profile` (+ quiz seeding) |
| 5 | Personalized recommendations differ for ≥2 users | ✅ | Miguel vs Priya test in `api.test.ts` |
| 6 | Empty states and invalid IDs do not crash | ✅ | 400/404 tests; UI empty states |
| 7 | ≥ 3 automated tests pass | ✅ | **40 tests** pass |
| 8 | Setup works from clean clone | ✅ | Instructions above |

Suggested tests from the PRD:

| Suggested test | Covered by |
| --- | --- |
| One 5-star review does not beat heavily reviewed 4.5+ | `ranking.test.ts` |
| Positive feedback increases rank | `api.test.ts` |
| Two users get different recommendation orders | `api.test.ts` |
| Reactions outside 1–5 rejected | `api.test.ts` |
| Restaurant with no-feedback dishes still returns items | `api.test.ts` + `ranking.test.ts` |

---

## AI usage during development

AI assistants (Cursor / Claude) were used in the following ways:

- **Scaffolding and iteration** — initial project structure, API route wiring, React page layout, and
  test harness setup were pair-programmed with an AI assistant.
- **Ranking copy and README** — templated ranking explanation strings and this documentation were
  drafted with AI help, then reviewed and adjusted for accuracy against the actual formulas in code.
- **Not used at runtime** — no LLM calls in the application. Community ranking explanations and
  personalized reason strings are deterministic templates driven by score breakdowns and profile
  data.

All ranking math, taste-profile weighting, and test assertions were verified against the PRD and the
seed database manually.

---

## Project layout

```
backend/                  Express + TypeScript API (better-sqlite3)
  src/db/                 connection and the additive migration
  src/services/ranking.ts community score, Bayesian average, ranking explanations
  src/services/tasteProfile.ts  signal weighting, taste match, dislike penalty, profile summary
  src/services/feed.ts    For You / Community feed assembly
  src/services/onboarding.ts    quiz selection and swipe recording
  src/routes/             users, onboarding, feed, menu-items, restaurants, feedback
  tests/                  Vitest suites
frontend/                 React + Vite web app
  src/pages/              Home, Restaurants, RestaurantRankings, Onboarding, DishDetail, LogMeal, TasteProfilePage
  src/components/         DishCard, UserSwitcher, states, formatting
  src/state/              selected-diner context
menusnap.db               supplied SQLite database (the app reads and writes this file)
schema.sql, seed.sql      supplied schema and deterministic seed data
PRD.md                    original assignment PRD (reference copy)
PRD_v2.md                 extended product direction for dish-first discovery
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | liveness plus quiz length and soft tag target |
| GET | `/api/users` | diners for the selector |
| POST | `/api/users` | create a diner (`{ display_name }`) |
| GET | `/api/users/:id` | diner plus onboarding status |
| GET | `/api/users/:id/taste-profile` | taste profile + liked/disliked summary |
| GET | `/api/users/:id/recommendations?restaurantId=` | personalized dishes (optional restaurant filter) |
| GET | `/api/onboarding/quiz-items?userId=` | next quiz dishes |
| POST | `/api/onboarding/swipes` | record one quiz answer |
| DELETE | `/api/onboarding/swipes?userId=` | clear quiz answers |
| GET | `/api/feed/community` | every dish ranked by community score |
| GET | `/api/feed/for-you?userId=&restaurantId=` | personalized feed |
| GET | `/api/restaurants` | restaurant list |
| GET | `/api/restaurants/:id/rankings` | dishes at one restaurant, ranked by community score |
| GET | `/api/restaurants/:id/menu-items` | same as rankings (alias for the log flow) |
| GET | `/api/menu-items/:id` | dish detail, stats, tags, notes |
| GET | `/api/menu-items/:id/tags` | contextual tags for the log flow |
| POST | `/api/feedback` | log a meal |

Invalid ids return 400, unknown ids return 404.

## Database

The data is synthetic and intended only for this assignment. The app adds one table,
`onboarding_swipes`, on startup via `backend/src/db/migrations.sql`. Quiz answers are kept out of the
`feedback` table so they never distort community averages.

Reset the database:

```bash
rm menusnap.db
sqlite3 menusnap.db < schema.sql
sqlite3 menusnap.db < seed.sql
```

Point the API at a different file with `MENUSNAP_DB=/path/to/other.db npm run dev:backend`.
