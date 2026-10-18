/*
  Saath's own mascots host the shops (the user approved them on 19 Oct 2026); the borrowed characters leave the data.

  1. The books section takes the id agreed with the talk engine, "books" (it was briefly "bookstore").
  2. Shops hosted by a borrowed character get their section's mascot (Juno where a section has none yet); new shops
     default to Juno.
  3. A made-up demo juice bar for Juno by the Shaniwar Wada gate, claimable once, with its menu.

  Idempotent: safe to run again.
*/

ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_section_check;
UPDATE shops SET section = 'books' WHERE section = 'bookstore';
ALTER TABLE shops ADD CONSTRAINT shops_section_check CHECK (section IN ('restaurant', 'cafe', 'juice', 'bakery',
  'grocery', 'streetfood', 'boutique', 'mall', 'realestate', 'salon', 'pharmacy', 'books', 'electronics',
  'gym', 'hotel'));

ALTER TABLE shops ALTER COLUMN friend SET DEFAULT 'juno';
UPDATE shops SET friend = CASE section
    WHEN 'restaurant' THEN 'rosa' WHEN 'cafe' THEN 'kiran' WHEN 'juice' THEN 'juno' WHEN 'bakery' THEN 'otto'
    WHEN 'streetfood' THEN 'sunny' WHEN 'grocery' THEN 'nia' WHEN 'boutique' THEN 'mika' WHEN 'mall' THEN 'max'
    WHEN 'realestate' THEN 'omar' WHEN 'salon' THEN 'lina' WHEN 'pharmacy' THEN 'sana' WHEN 'electronics' THEN 'kai'
    ELSE 'juno' END
  WHERE friend IN ('doraemon', 'nobita', 'shinchan', 'goku', 'michael', 'dwight', 'holt');

INSERT INTO shops (slug, name, section, friend, lat, lng, story, special, status, status_note, owner, claimable) VALUES
  ('wada-gate-juice-bar', 'Wada Gate Juice Bar', 'juice', 'juno', 18.520245, 73.855307,
   'A bright green juice cart by the Shaniwar Wada gate. Sugarcane pressed while you watch, and a new blend every morning.',
   'Sugarcane juice with ginger and lemon, ₹30', 'open', 'Sugarcane pressed fresh', NULL, true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO menu_items (shop_id, name, price, app_price, sort)
SELECT s.id, m.name, m.price, m.app_price, m.sort
FROM shops s JOIN (VALUES
  ('Sugarcane juice', 30, 59, 1),
  ('Mosambi juice', 50, 95, 2),
  ('Watermelon cooler', 40, 79, 3),
  ('Mango smoothie', 70, 129, 4),
  ('Green blend (apple, cucumber, mint)', 70, 135, 5),
  ('Banana shake', 50, 99, 6)
) AS m(name, price, app_price, sort) ON true
WHERE s.slug = 'wada-gate-juice-bar' AND NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.shop_id = s.id);
