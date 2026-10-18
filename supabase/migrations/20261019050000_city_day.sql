/*
  City Day (the website redesign the user picked, 19 Oct 2026): each shop's billboard ad, its usual order (what the
  saving is worked out on) and where its billboard stands.

  1. shops: ad_headline (up to 24: the design's own copy runs to 23), ad_sub, ad_art (one of the 9 pictures in
     site/public/ads/art, or none), ad_image_url (an uploaded ad), ad_schedule; usual_order ([{item: menu_items.id,
     qty}]); app_fee (typical delivery + platform + packaging, rupees); board_lat/board_lng (empty: beside the shop).
  2. The demo shops' ad copy from the design spec, and their usual order: the first two items with both prices, one
     each (Kettle and Kulhad: 2 cutting chai + 1 bun maska).
  3. Two demo shops sold nothing with an app price; they get made-up app prices so their saving shows.

  Row-level security is unchanged: anyone reads; owners write their own row. Idempotent.
*/

ALTER TABLE shops ADD COLUMN IF NOT EXISTS ad_headline text NOT NULL DEFAULT '' CHECK (char_length(ad_headline) <= 24);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS ad_sub text NOT NULL DEFAULT '' CHECK (char_length(ad_sub) <= 40);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS ad_art text NOT NULL DEFAULT ''
  CHECK (ad_art IN ('', 'chai', 'misal', 'juice', 'bread', 'vadapav', 'pharmacy', 'phone', 'kurta', 'basket'));
ALTER TABLE shops ADD COLUMN IF NOT EXISTS ad_image_url text NOT NULL DEFAULT '' CHECK (char_length(ad_image_url) <= 500);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS ad_schedule text NOT NULL DEFAULT 'always' CHECK (ad_schedule IN ('always', 'week', 'today'));
ALTER TABLE shops ADD COLUMN IF NOT EXISTS usual_order jsonb NOT NULL DEFAULT '[]'
  CHECK (jsonb_typeof(usual_order) = 'array' AND jsonb_array_length(usual_order) <= 6);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS app_fee integer NOT NULL DEFAULT 50 CHECK (app_fee BETWEEN 0 AND 200);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS board_lat double precision CHECK (board_lat BETWEEN -90 AND 90);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS board_lng double precision CHECK (board_lng BETWEEN -180 AND 180);

UPDATE shops s SET ad_headline = a.head, ad_sub = a.sub, ad_art = a.art
FROM (VALUES
  ('kettle-and-kulhad', 'Chai like home.', 'Kettle & Kulhad · since 2019', 'chai'),
  ('wada-chai-katta', 'Chai on the katta.', 'Wada Chai Katta', 'chai'),
  ('copper-ladle', 'Misal with real fire.', 'The Copper Ladle', 'misal'),
  ('sarasbaug-misal-house', 'Misal since morning.', 'Sarasbaug Misal House', 'misal'),
  ('green-glass', 'Blended this morning.', 'The Green Glass', 'juice'),
  ('wada-gate-juice-bar', 'Cold, fresh, fast.', 'Wada Gate Juice Bar', 'juice'),
  ('morning-crust', 'Warm at 4 PM.', 'Morning Crust Bakery', 'bread'),
  ('hot-tawa-corner', 'Hot off the tawa.', 'Hot Tawa Corner', 'vadapav'),
  ('parvati-snack-stop', 'Snacks by the hill.', 'Parvati Snack Stop', 'vadapav'),
  ('tulsi-leaf', 'Your corner pharmacist.', 'Tulsi Leaf Pharmacy', 'pharmacy'),
  ('circuit-corner', 'Cracked screen? 30 min.', 'Circuit Corner Mobiles', 'phone'),
  ('thread-and-bloom', 'The monsoon edit.', 'Thread & Bloom', 'kurta'),
  ('corner-shelf', 'Fresh every morning.', 'Corner Shelf Kirana', 'basket'),
  ('riverstone-arcade', 'Three floors of sale.', 'Riverstone Arcade', ''),
  ('still-water', 'Walk in, glow out.', 'Still Water Salon and Spa', ''),
  ('banyan-grove', 'Homes by the river.', 'Banyan Grove Residences', '')
) AS a(slug, head, sub, art)
WHERE s.slug = a.slug AND s.ad_headline = '';

UPDATE menu_items m SET app_price = v.app
FROM shops s, (VALUES
  ('circuit-corner', 'Tempered glass screen guard', 349),
  ('circuit-corner', 'Fast charger, 20 watts', 999),
  ('thread-and-bloom', 'Cotton kurta', 1399),
  ('thread-and-bloom', 'Linen shirt', 1849)
) AS v(slug, name, app)
WHERE m.shop_id = s.id AND s.slug = v.slug AND m.name = v.name AND m.app_price IS NULL;

UPDATE shops s SET usual_order = coalesce((
    SELECT jsonb_agg(jsonb_build_object('item', m.id, 'qty', 1) ORDER BY m.sort)
    FROM (SELECT id, sort FROM menu_items
          WHERE shop_id = s.id AND price IS NOT NULL AND app_price IS NOT NULL AND available
          ORDER BY sort LIMIT 2) m), '[]'::jsonb)
WHERE s.demo AND s.usual_order = '[]'::jsonb AND s.slug <> 'kettle-and-kulhad';

UPDATE shops s SET usual_order = jsonb_build_array(
    jsonb_build_object('item', (SELECT id FROM menu_items WHERE shop_id = s.id AND name = 'Cutting chai'), 'qty', 2),
    jsonb_build_object('item', (SELECT id FROM menu_items WHERE shop_id = s.id AND name = 'Bun maska'), 'qty', 1))
WHERE s.slug = 'kettle-and-kulhad' AND s.usual_order = '[]'::jsonb;
