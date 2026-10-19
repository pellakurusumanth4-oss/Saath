/*
  Prices in US dollars (19 Oct 2026, the user's choice: "instead of rupees make it dollars"). Every amount becomes what it
  would cost in a US town: a twentieth of the rupee price, rounded to 25 cents under $100, to whole dollars under $10,000
  and to the nearest $1,000 above (never under 25 cents unless it was free). The demo shops' specials and notes that named
  rupees are rewritten to match (only where the owner hasn't changed them). app_fee becomes dollars with cents (0 to 20).
  The comment on menu_items.price marks it done, so setup-db never scales twice.
*/

CREATE FUNCTION pg_temp.usd(r numeric) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN r IS NULL THEN NULL
    WHEN r = 0 THEN 0
    WHEN r / 20 >= 10000 THEN round(r / 20 / 1000) * 1000
    WHEN r / 20 >= 100 THEN round(r / 20)
    ELSE greatest(0.25, round(r / 20 * 4) / 4)
  END
$$;

UPDATE menu_items SET price = pg_temp.usd(price), app_price = pg_temp.usd(app_price);

ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_app_fee_check;
ALTER TABLE shops ALTER COLUMN app_fee TYPE numeric(6,2);
UPDATE shops SET app_fee = pg_temp.usd(app_fee);
ALTER TABLE shops ALTER COLUMN app_fee SET DEFAULT 2.50;
ALTER TABLE shops ADD CONSTRAINT shops_app_fee_check CHECK (app_fee BETWEEN 0 AND 20);

UPDATE shops SET special = 'Cutting chai + bun maska for $2' WHERE slug = 'wada-chai-katta' AND special = 'Cutting chai + bun maska for ₹40';
UPDATE shops SET special = 'Maharashtrian thali, $11' WHERE slug = 'copper-ladle' AND special = 'Maharashtrian thali, 220 rupees';
UPDATE shops SET special = 'Misal pav with an extra pav, $4.50' WHERE slug = 'sarasbaug-misal-house' AND special = 'Misal pav with an extra pav, ₹90';
UPDATE shops SET special = 'Watermelon and mint cooler, $3' WHERE slug = 'green-glass' AND special = 'Watermelon and mint cooler, 60 rupees';
UPDATE shops SET special = 'Sugarcane juice with ginger and lemon, $1.50' WHERE slug = 'wada-gate-juice-bar' AND special = 'Sugarcane juice with ginger and lemon, ₹30';
UPDATE shops SET special = 'Warm cinnamon buns, $2.25 each' WHERE slug = 'morning-crust' AND special = 'Warm cinnamon buns, 45 rupees each';
UPDATE shops SET special = 'Cheese pav bhaji, $7' WHERE slug = 'hot-tawa-corner' AND special = 'Cheese pav bhaji, 140 rupees';
UPDATE shops SET special = 'Two vada pav + lassi for $3.75' WHERE slug = 'parvati-snack-stop' AND special = 'Two vada pav + lassi for ₹75';
UPDATE shops SET special = 'Fresh methi and palak bundles, $1 each' WHERE slug = 'corner-shelf' AND special = 'Fresh methi and palak bundles, 20 rupees each';
UPDATE shops SET special = 'Head massage and hair wash, $22.50' WHERE slug = 'still-water' AND special = 'Head massage and hair wash, 450 rupees';
UPDATE shops SET special = 'Kulhad masala chai with a warm bun maska, $3' WHERE slug = 'kettle-and-kulhad' AND special = 'Kulhad masala chai with a warm bun maska, 60 rupees';
UPDATE menu_items SET note = 'from $7.50' WHERE note = 'from 150 rupees';
UPDATE menu_items SET note = '$1.50 an hour' WHERE note = '30 rupees an hour';
UPDATE menu_items SET note = '$0.25 a square foot a month' WHERE note = '4 rupees a square foot a month';
UPDATE menu_items SET note = 'from $2.50' WHERE note = 'from 50 rupees';
UPDATE menu_items SET note = 'free on orders over $15' WHERE note = 'free on orders over 300 rupees';
UPDATE menu_items SET note = 'from $60' WHERE note = 'from 1,200 rupees';
UPDATE menu_items SET note = 'from $90' WHERE note = 'from 1,800 rupees';

COMMENT ON COLUMN menu_items.price IS 'US dollars';
