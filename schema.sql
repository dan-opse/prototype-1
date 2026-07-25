PRAGMA foreign_keys = ON;

CREATE TABLE restaurants (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    cuisine TEXT NOT NULL,
    address TEXT,
    price_level INTEGER NOT NULL CHECK (price_level BETWEEN 1 AND 4),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE menu_items (
    id INTEGER PRIMARY KEY,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    is_vegetarian INTEGER NOT NULL DEFAULT 0 CHECK (is_vegetarian IN (0,1)),
    spice_level INTEGER NOT NULL DEFAULT 0 CHECK (spice_level BETWEEN 0 AND 3),
    is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0,1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (restaurant_id, name)
);

CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE feedback_tags (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sentiment TEXT NOT NULL CHECK (sentiment IN ('positive', 'negative', 'neutral'))
);

CREATE TABLE feedback (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    reaction INTEGER NOT NULL CHECK (reaction BETWEEN 1 AND 5),
    would_order_again INTEGER NOT NULL CHECK (would_order_again IN (0,1)),
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE feedback_tag_links (
    feedback_id INTEGER NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES feedback_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (feedback_id, tag_id)
);

CREATE INDEX idx_menu_items_restaurant ON menu_items(restaurant_id);
CREATE INDEX idx_feedback_item ON feedback(menu_item_id);
CREATE INDEX idx_feedback_user ON feedback(user_id);
CREATE INDEX idx_feedback_created_at ON feedback(created_at);
CREATE INDEX idx_feedback_tag_links_tag ON feedback_tag_links(tag_id);

CREATE VIEW item_feedback_summary AS
SELECT
    mi.id AS menu_item_id,
    mi.restaurant_id,
    mi.name,
    mi.price_cents,
    COUNT(f.id) AS feedback_count,
    ROUND(AVG(f.reaction), 2) AS average_reaction,
    ROUND(100.0 * AVG(f.would_order_again), 1) AS reorder_percentage
FROM menu_items mi
LEFT JOIN feedback f ON f.menu_item_id = mi.id
GROUP BY mi.id;
