/*
  Twelve demo shops, one per approved mascot, from the persona session's web/talk/demo-shops.json (19 Oct 2026):
  every name, story, menu, price and status is made up; only the locations are real (public Pune roads, from
  OpenStreetMap). The site marks them "Demo shop" so nobody walks to one; each is claimable once, like the others.

  1. shops: area (where, in words), offers (the shop's own, up to 5) and demo; the earlier demo shops are demo too.
  2. menu_items: a note (the shop's words, like "contains nuts" or "from 150 rupees"); price may be empty (a mall's
     floors, "ask inside") and as big as a flat (12 digits).
  3. The twelve shops and their menus.

  Idempotent: safe to run again.
*/

ALTER TABLE shops ADD COLUMN IF NOT EXISTS area text NOT NULL DEFAULT '' CHECK (char_length(area) <= 120);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS offers text[] NOT NULL DEFAULT '{}' CHECK (cardinality(offers) <= 5);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS demo boolean NOT NULL DEFAULT false;
UPDATE shops SET demo = true
  WHERE slug IN ('wada-chai-katta', 'sarasbaug-misal-house', 'parvati-snack-stop', 'wada-gate-juice-bar');

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 120);
ALTER TABLE menu_items ALTER COLUMN price DROP NOT NULL;
ALTER TABLE menu_items ALTER COLUMN price TYPE numeric(12,2);
ALTER TABLE menu_items ALTER COLUMN app_price TYPE numeric(12,2);

INSERT INTO shops (slug, name, section, friend, lat, lng, area, story, special, offers, status, status_note, owner, claimable, demo) VALUES
  ('copper-ladle', 'The Copper Ladle', 'restaurant', 'rosa', 18.521064, 73.846676, 'JM Road, Deccan Gymkhana', 'A family kitchen that began as a twelve-table lunch room in 2016. The recipes are the owner''s mother''s, and the thali changes every day.', 'Maharashtrian thali, 220 rupees', '{}'::text[], 'open', '', NULL, true, true),
  ('kettle-and-kulhad', 'Kettle and Kulhad', 'cafe', 'kiran', 18.519108, 73.843174, 'Apte Road, Deccan Gymkhana', 'Meera opened Kettle and Kulhad in 2019 with one kettle, a borrowed table and her grandmother''s masala recipe. The cardamom is still crushed by hand every morning. Office regulars come for the four o''clock chai break, and the back wall is covered in notes they have left over the years.', 'Kulhad masala chai with a warm bun maska, 60 rupees', ARRAY['Saath walkers get 10 percent off any chai before 11 am'], 'busy', 'about a 10 min wait', NULL, true, true),
  ('green-glass', 'The Green Glass', 'juice', 'juno', 18.519124, 73.845096, 'JM Road, Deccan Gymkhana', 'Two cousins started The Green Glass from a cart in 2021 and moved into this little shop a year later. The fruit comes from the morning market, and nothing is squeezed before you order.', 'Watermelon and mint cooler, 60 rupees', '{}'::text[], 'open', '', NULL, true, true),
  ('morning-crust', 'Morning Crust Bakery', 'bakery', 'otto', 18.521733, 73.844112, 'Apte Road, Deccan Gymkhana', 'One oven, the same family and the same corner since 1998. A new batch of bread comes out every morning at seven.', 'Warm cinnamon buns, 45 rupees each', '{}'::text[], 'open', 'fresh bread out at 7 am', NULL, true, true),
  ('hot-tawa-corner', 'Hot Tawa Corner', 'streetfood', 'sunny', 18.528924, 73.843303, 'FC Road, Shivajinagar', 'A tawa, a cart and a lot of butter. It started on this road in 2012 and moved under a roof in 2019.', 'Cheese pav bhaji, 140 rupees', '{}'::text[], 'busy', 'a short queue, about 5 minutes', NULL, true, true),
  ('corner-shelf', 'Corner Shelf Kirana', 'grocery', 'nia', 18.51309, 73.831593, 'Prabhat Road, Erandwane', 'A neighbourhood kirana run by the same family for three generations. If it is not on the shelf, they will tell you which day it comes in.', 'Fresh methi and palak bundles, 20 rupees each', '{}'::text[], 'open', '', NULL, true, true),
  ('thread-and-bloom', 'Thread and Bloom', 'boutique', 'mika', 18.529826, 73.843793, 'FC Road, Shivajinagar', 'Handloom kurtas and sarees from weavers the owner knows by name, with alterations done upstairs.', 'Hand-block printed cotton kurtas', '{}'::text[], 'open', '', NULL, true, true),
  ('riverstone-arcade', 'Riverstone Arcade', 'mall', 'max', 18.517237, 73.843446, 'JM Road, Deccan Gymkhana', 'A small arcade of eighteen shops on three floors, with a food court on the top floor.', 'Live music in the food court on weekend evenings', '{}'::text[], 'open', 'open till 10 pm', NULL, true, true),
  ('banyan-grove', 'Banyan Grove Residences, site office', 'realestate', 'omar', 18.517148, 73.829482, 'Law College Road, Erandwane', 'Banyan Grove is three towers built around a hundred-year-old banyan tree that the builder, Tulsi Developers, chose to keep. Work began in 2024. Tower A is ready to move into; the builder''s plan has Towers B and C finishing in 2027.', 'The sample flat in Tower A is open for walk-in visits today', ARRAY['A free covered parking slot with bookings made this month (the builder''s offer; the agent has the terms)'], 'open', 'the agent is in until 7 pm', NULL, true, true),
  ('still-water', 'Still Water Salon and Spa', 'salon', 'lina', 18.510627, 73.831902, 'Prabhat Road, Erandwane', 'Two stylists who trained together opened Still Water in 2020. The spa room is upstairs, and it is quiet on weekday mornings.', 'Head massage and hair wash, 450 rupees', '{}'::text[], 'busy', 'next free chair in about 20 minutes', NULL, true, true),
  ('tulsi-leaf', 'Tulsi Leaf Pharmacy', 'pharmacy', 'sana', 18.507934, 73.830073, 'Karve Road, Erandwane', 'A family pharmacy, open since 2008.', '', '{}'::text[], 'open', 'the pharmacist is in until 10 pm', NULL, true, true),
  ('circuit-corner', 'Circuit Corner Mobiles', 'electronics', 'kai', 18.530729, 73.844284, 'FC Road, Shivajinagar', 'Phone repairs and accessories on FC Road since 2015.', 'Tempered glass screen guard fitted free with any phone cover', '{}'::text[], 'closed', 'opens at 11 am', NULL, true, true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO menu_items (shop_id, name, price, app_price, available, note, sort)
SELECT s.id, m.name, m.price, m.app_price, m.available, m.note, m.sort
FROM shops s JOIN (VALUES
  ('copper-ladle', 'Maharashtrian thali', 220::numeric, 340::numeric, true, '', 1),
  ('copper-ladle', 'Misal pav', 90::numeric, 150::numeric, true, 'medium spicy', 2),
  ('copper-ladle', 'Paneer butter masala', 240::numeric, 360::numeric, true, '', 3),
  ('copper-ladle', 'Dal khichdi', 160::numeric, 250::numeric, true, '', 4),
  ('copper-ladle', 'Gulab jamun, two pieces', 70::numeric, 110::numeric, true, '', 5),
  ('copper-ladle', 'Masala chaas', 40::numeric, 70::numeric, true, '', 6),
  ('kettle-and-kulhad', 'Cutting chai', 20::numeric, 28::numeric, true, '', 1),
  ('kettle-and-kulhad', 'Kulhad masala chai', 35::numeric, 49::numeric, true, 'the house favourite', 2),
  ('kettle-and-kulhad', 'Ginger lemon tea', 30::numeric, NULL::numeric, true, 'no milk', 3),
  ('kettle-and-kulhad', 'Filter coffee', 40::numeric, NULL::numeric, true, '', 4),
  ('kettle-and-kulhad', 'Bun maska', 30::numeric, 42::numeric, true, '', 5),
  ('kettle-and-kulhad', 'Kanda poha', 45::numeric, NULL::numeric, true, 'contains peanuts', 6),
  ('kettle-and-kulhad', 'Walnut brownie', 80::numeric, 110::numeric, true, 'contains nuts and egg', 7),
  ('kettle-and-kulhad', 'Kokum sharbat', 40::numeric, NULL::numeric, false, '', 8),
  ('green-glass', 'Mango shake', 70::numeric, 110::numeric, true, '', 1),
  ('green-glass', 'Watermelon and mint cooler', 60::numeric, 95::numeric, true, '', 2),
  ('green-glass', 'Green apple and spinach juice', 80::numeric, NULL::numeric, true, '', 3),
  ('green-glass', 'Sugarcane juice', 30::numeric, NULL::numeric, false, '', 4),
  ('morning-crust', 'Pav, pack of six', 30::numeric, 45::numeric, true, '', 1),
  ('morning-crust', 'Whole wheat bread', 55::numeric, 80::numeric, true, '', 2),
  ('morning-crust', 'Cinnamon bun', 45::numeric, 70::numeric, true, '', 3),
  ('morning-crust', 'Chocolate walnut cake, a slice', 90::numeric, 140::numeric, true, 'contains nuts and egg', 4),
  ('morning-crust', 'Eggless fruit cake, a slice', 70::numeric, 110::numeric, true, 'eggless', 5),
  ('morning-crust', 'Butter biscuits, 250 grams', 180::numeric, 260::numeric, true, '', 6),
  ('hot-tawa-corner', 'Pav bhaji', 110::numeric, 180::numeric, true, '', 1),
  ('hot-tawa-corner', 'Cheese pav bhaji', 140::numeric, 220::numeric, true, '', 2),
  ('hot-tawa-corner', 'Vada pav', 25::numeric, 45::numeric, true, 'spicy green chutney', 3),
  ('hot-tawa-corner', 'Tawa pulao', 120::numeric, 190::numeric, true, '', 4),
  ('hot-tawa-corner', 'Masala soda', 40::numeric, 65::numeric, true, '', 5),
  ('hot-tawa-corner', 'Kulfi', 50::numeric, NULL::numeric, false, '', 6),
  ('corner-shelf', 'Toned milk, 1 litre', 56::numeric, 64::numeric, true, '', 1),
  ('corner-shelf', 'Basmati rice, 1 kilo', 140::numeric, 165::numeric, true, '', 2),
  ('corner-shelf', 'Toor dal, 1 kilo', 160::numeric, 185::numeric, true, '', 3),
  ('corner-shelf', 'Wheat atta, 5 kilos', 260::numeric, 295::numeric, true, '', 4),
  ('corner-shelf', 'Eggs, six', 48::numeric, 60::numeric, true, '', 5),
  ('corner-shelf', 'Methi bundle', 20::numeric, 35::numeric, true, '', 6),
  ('corner-shelf', 'Sugar, 1 kilo', 48::numeric, 55::numeric, true, '', 7),
  ('thread-and-bloom', 'Cotton kurta', 1200::numeric, NULL::numeric, true, '', 1),
  ('thread-and-bloom', 'Hand-block printed cotton kurta', 1450::numeric, NULL::numeric, true, '', 2),
  ('thread-and-bloom', 'Chanderi dupatta', 900::numeric, NULL::numeric, true, '', 3),
  ('thread-and-bloom', 'Handloom cotton saree', 3500::numeric, NULL::numeric, true, '', 4),
  ('thread-and-bloom', 'Linen shirt', 1600::numeric, NULL::numeric, true, '', 5),
  ('thread-and-bloom', 'Alterations', NULL::numeric, NULL::numeric, true, 'from 150 rupees', 6),
  ('riverstone-arcade', 'Food court', NULL::numeric, NULL::numeric, true, 'third floor', 1),
  ('riverstone-arcade', 'Books and stationery', NULL::numeric, NULL::numeric, true, 'first floor', 2),
  ('riverstone-arcade', 'Shoes and bags', NULL::numeric, NULL::numeric, true, 'ground floor', 3),
  ('riverstone-arcade', 'Play corner for children, with a grown-up', NULL::numeric, NULL::numeric, true, 'second floor', 4),
  ('riverstone-arcade', 'Parking', NULL::numeric, NULL::numeric, true, '30 rupees an hour', 5),
  ('banyan-grove', '1 BHK, 620 square feet carpet, Tower A, ready to move in', 4800000::numeric, NULL::numeric, true, '', 1),
  ('banyan-grove', '2 BHK, 950 square feet carpet, Tower A, ready to move in', 7600000::numeric, NULL::numeric, true, '', 2),
  ('banyan-grove', '2 BHK, 1010 square feet carpet, Tower B, under construction', 7900000::numeric, NULL::numeric, true, '', 3),
  ('banyan-grove', '3 BHK, 1350 square feet carpet, Tower C, under construction', 11500000::numeric, NULL::numeric, true, '', 4),
  ('banyan-grove', 'Clubhouse, pool and children''s play area', NULL::numeric, NULL::numeric, true, 'for all residents', 5),
  ('banyan-grove', 'Maintenance', NULL::numeric, NULL::numeric, true, '4 rupees a square foot a month', 6),
  ('still-water', 'Haircut', 400::numeric, NULL::numeric, true, '', 1),
  ('still-water', 'Hair spa', 900::numeric, NULL::numeric, true, '', 2),
  ('still-water', 'Head massage, 20 minutes', 350::numeric, NULL::numeric, true, '', 3),
  ('still-water', 'Manicure', 500::numeric, NULL::numeric, true, '', 4),
  ('still-water', 'Threading', NULL::numeric, NULL::numeric, true, 'from 50 rupees', 5),
  ('tulsi-leaf', 'Free blood pressure check', 0::numeric, NULL::numeric, true, '', 1),
  ('tulsi-leaf', 'Home delivery within two kilometres', NULL::numeric, NULL::numeric, true, 'free on orders over 300 rupees', 2),
  ('tulsi-leaf', 'Prescription medicines', NULL::numeric, NULL::numeric, true, 'with a doctor''s prescription', 3),
  ('tulsi-leaf', 'Baby care, first aid and diabetes care products', NULL::numeric, NULL::numeric, true, '', 4),
  ('circuit-corner', 'Tempered glass screen guard', 199::numeric, NULL::numeric, true, '', 1),
  ('circuit-corner', 'Phone cover', 299::numeric, NULL::numeric, true, '', 2),
  ('circuit-corner', 'Fast charger, 20 watts', 799::numeric, NULL::numeric, true, '', 3),
  ('circuit-corner', 'Wired earphones', 349::numeric, NULL::numeric, true, '', 4),
  ('circuit-corner', 'Screen replacement', NULL::numeric, NULL::numeric, true, 'from 1,800 rupees', 5),
  ('circuit-corner', 'Battery replacement', NULL::numeric, NULL::numeric, true, 'from 1,200 rupees', 6)
) AS m(slug, name, price, app_price, available, note, sort) ON m.slug = s.slug
WHERE NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.shop_id = s.id);
