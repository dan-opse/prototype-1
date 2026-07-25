# MenuSnap v2

Dish-first, personalized restaurant discovery. Instead of picking a restaurant and then hunting for
something good on its menu, you open MenuSnap to a feed of individual dishes pulled from every
restaurant in the dataset, ranked by how the community rated them and how well they fit your taste.

Built against [PRD_v2.md](PRD_v2.md) and the supplied `menusnap.db`.

**This is a web app.** It runs in a browser via a local dev server. There is no native iOS/Android
build, and the PRD's swipe-card quiz is implemented as tap buttons rather than touch gestures. A
native app is a plausible future direction; it is out of scope here.

## Requirements

- Node.js 20 or newer (developed on Node 25)
- npm 10 or newer
- `sqlite3` on your PATH only if you want to reset the database

## Setup from a clean clone

```bash
npm install     # installs the backend and frontend workspaces
npm run dev     # API on http://localhost:4000, web app on http://localhost:5173
```

Open http://localhost:5173. The Vite dev server proxies `/api` to the backend, so there is nothing
else to configure.

Run the tests:

```bash
npm test        # 29 backend tests (Vitest + Supertest, in-memory database)
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

A walkthrough that touches every feature:

1. Pick Miguel in the top-right selector, then compare the **For You** and **Community** tabs. Same
   dishes, different order, and each For You card explains itself ("You go for tender and umami
   dishes").
2. Switch to Priya. The ranking shifts toward Mushroom Tacos, Vegetable Tempura, and Sashimi Combo.
3. Click **New diner**, create someone, and take the taste quiz. Ten yes/no answers are enough to
   personalize the feed before a single meal has been logged.
4. Open **Taste profile**. Quiz-derived guesses sit under "Still learning"; anything backed by a real
   logged meal moves to "Confident".
5. Use **Log a meal** (restaurant, then dish, then reaction and tags). Rankings and your profile both
   update immediately.

## How the ranking works

Community score, per the PRD, with every term normalized to 0-1 so the weights mean what they say:

```text
community_score = 0.45 * normalized_bayesian_average_reaction
                + 0.35 * reorder_rate
                + 0.20 * confidence_score

bayesian_average_reaction = (v / (v + m)) * R + (m / (v + m)) * C     # m = 7
confidence_score          = min(1, v / 10)
```

`R` is the dish average, `v` its review count, `C` the global average. The prior keeps one glowing
review from outranking a dish that is consistently good, and it gives dishes with no feedback at all
a defensible score so they still appear in the feed.

Personalized score:

```text
personalized_score = 0.70 * community_score + 0.30 * normalized(taste_match_score)

taste_match_score = structural_weight * structural_match + tag_weight * tag_match
tag_weight        = 0.15 + 0.35 * min(1, logged_meals / 8)      # 0.15 -> 0.50
```

Structural match compares the dish's cuisine, price band, spice level, and vegetarian flag against
the diner's preferences. Tag match compares the dish's community tags against the diner's tag
preferences, weighted by how often the community actually applies each tag to that dish. Early in a
diner's life structural signal carries most of the weight; tags take over as real history builds.

Price bands come from the dish's own `price_cents`, not the restaurant's `price_level`, because all
four seeded restaurants share `price_level = 2` and would otherwise carry no signal.

## How the taste profile works

Every signal — a quiz swipe or a logged meal — contributes a signed strength (-1 to +1) to the
dimensions the dish touches: its cuisine, price band, spice level, vegetarian flag, and its tags.
Each dimension's score is the weighted average of those contributions. What differs is how much each
source is allowed to say:

| Dimension | Quiz swipe | Logged meal |
| --- | --- | --- |
| Structural (cuisine, price, spice, vegetarian) | 1.0 | 1.0 |
| Descriptive tags (crispy, umami, fresh, …) | 0.9 | 1.0 |
| Evaluative tags (too salty, bland, great value, …) | 0.2, max 2 per swipe | 1.0 |

Structural traits are read straight off the dish, so a swipe is as good as a log. Descriptive tags
are community consensus about the food itself, so a swipe is nearly as good. Evaluative tags are
judged against a personal baseline, so a swipe barely counts — and because scores are weighted
averages, roughly two logged meals already outweigh a full ten-swipe quiz on any evaluative
dimension. That is the PRD's "quiz guess gradually displaced by real logs", with no separate decay
rule needed.

A dimension is labelled **confident** once at least one real logged meal contributed to it, and
**still learning** while it rests on quiz answers alone. The taste profile page splits on exactly
that line.

## Product decisions taken here

- **Wildcard tab: skipped.** The PRD leaves it undefined and does not require it for a first pass.
- **Minimum tags when logging: soft, not hard.** The UI nudges toward three and tells you what you
  gain, but a rushed diner can still submit with fewer. Blocking the submit would cost logs, and a
  log with one tag beats no log.
- **Contextual tags during logging.** The tag list is what the community already used on that dish,
  most common first, descriptive tags before evaluative ones. The PRD notes this anchors people
  toward a shared vocabulary; that tradeoff is accepted deliberately here.
- **No auth.** Diners are picked from a selector, matching the assignment's demo-user framing.
- **Location-agnostic**, per the PRD.

## Project layout

```
backend/                  Express + TypeScript API (better-sqlite3)
  src/db/                 connection and the additive migration
  src/services/ranking.ts community_score, bayesian average, dish and tag queries
  src/services/tasteProfile.ts  signal weighting, taste_match_score, reason strings
  src/services/feed.ts    For You / Community feed assembly
  src/services/onboarding.ts    quiz selection and swipe recording
  src/routes/             users, onboarding, feed, menu-items, restaurants, feedback
  tests/                  Vitest suites (ranking math, profile behaviour, API contract)
frontend/                 React + Vite web app
  src/pages/              Home, Onboarding, DishDetail, LogMeal, TasteProfilePage
  src/components/         DishCard, UserSwitcher, states, formatting
  src/state/              selected-diner context
menusnap.db               supplied SQLite database (the app reads and writes this file)
schema.sql, seed.sql      supplied schema and deterministic seed data
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | liveness plus quiz length and soft tag target |
| GET | `/api/users` | diners for the selector |
| POST | `/api/users` | create a diner (`{ display_name }`) |
| GET | `/api/users/:id` | diner plus onboarding status |
| GET | `/api/users/:id/taste-profile` | full taste profile with confidence labels |
| GET | `/api/onboarding/quiz-items?userId=` | next quiz dishes, spread across restaurants |
| POST | `/api/onboarding/swipes` | record one answer (`{ userId, menuItemId, liked }`) |
| DELETE | `/api/onboarding/swipes?userId=` | clear a diner's quiz answers |
| GET | `/api/feed/community` | every dish ranked by community score |
| GET | `/api/feed/for-you?userId=` | ranked by personalized score, with reasons |
| GET | `/api/restaurants` | log flow, step 1 |
| GET | `/api/restaurants/:id/menu-items` | log flow, step 2 |
| GET | `/api/menu-items/:id` | dish detail, stats, tags, notes |
| GET | `/api/menu-items/:id/tags` | contextual tags for the log flow |
| POST | `/api/feedback` | log a meal |

Invalid ids return 400, unknown ids return 404, and dishes with no feedback are served normally
rather than treated as errors.

## Database

The data is synthetic and intended only for this assignment. The app adds one table,
`onboarding_swipes`, on startup via `backend/src/db/migrations.sql`. Quiz answers are kept out of the
`feedback` table on purpose so they never distort community averages.

Quick inspection:

```bash
sqlite3 menusnap.db
.tables
SELECT * FROM item_feedback_summary LIMIT 10;
```

Reset the database (the app recreates `onboarding_swipes` on its next start):

```bash
rm menusnap.db
sqlite3 menusnap.db < schema.sql
sqlite3 menusnap.db < seed.sql
```

Point the API at a different file with `MENUSNAP_DB=/path/to/other.db npm run dev:backend`.

## Known gaps

- The Wildcard tab is not implemented.
- Feeds recompute on every request. That is instant at 26 dishes and keeps "ranking changes after new
  feedback" trivially true, but a real dataset would need cached aggregates.
- Spice and price preferences match on exact buckets, so a diner who likes level 3 heat gets no
  credit for a level 2 dish. Neighbour smoothing would help once there is more data.
- Only the reaction term is smoothed toward the global average, as the PRD specifies. The reorder
  term is the raw rate, which reads as 0% for a dish nobody has reviewed, so cold items are pushed
  down by 35% of the score and jump sharply on their first review. Shrinking the reorder rate toward
  the global rate with the same prior would smooth that out.
- No auth, no sessions: the selected diner is stored in `localStorage`.
