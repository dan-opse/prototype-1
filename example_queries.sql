-- Restaurant-level item summary
SELECT *
FROM item_feedback_summary
WHERE restaurant_id = 1
ORDER BY average_reaction DESC;

-- Common tags for each item
SELECT
    mi.id AS menu_item_id,
    mi.name,
    ft.name AS tag,
    COUNT(*) AS uses
FROM menu_items mi
JOIN feedback f ON f.menu_item_id = mi.id
JOIN feedback_tag_links ftl ON ftl.feedback_id = f.id
JOIN feedback_tags ft ON ft.id = ftl.tag_id
WHERE mi.restaurant_id = 1
GROUP BY mi.id, ft.id
ORDER BY mi.id, uses DESC;

-- Basic user tag preferences
SELECT
    f.user_id,
    ft.name,
    ROUND(AVG(f.reaction), 2) AS average_reaction,
    COUNT(*) AS occurrences
FROM feedback f
JOIN feedback_tag_links ftl ON ftl.feedback_id = f.id
JOIN feedback_tags ft ON ft.id = ftl.tag_id
WHERE f.user_id = 1
GROUP BY f.user_id, ft.id
ORDER BY average_reaction DESC, occurrences DESC;

-- Items with no feedback
SELECT mi.*
FROM menu_items mi
LEFT JOIN feedback f ON f.menu_item_id = mi.id
WHERE f.id IS NULL;
