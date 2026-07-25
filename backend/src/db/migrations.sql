-- Additive migrations on top of the supplied schema.sql.
-- The assignment schema has nowhere to record onboarding quiz answers, and they must stay out of
-- the feedback table so they never pollute community averages in item_feedback_summary.

CREATE TABLE IF NOT EXISTS onboarding_swipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    liked INTEGER NOT NULL CHECK (liked IN (0,1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, menu_item_id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_swipes_user ON onboarding_swipes(user_id);
