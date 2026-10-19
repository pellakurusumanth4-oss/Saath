/*
# Saath shops: live menus, daily counter codes, verified visits, reviews and photos

"Walk there, save money": each shop has a friend at its door, a live menu with in-store prices
(and, optionally, the shop's own delivery-app price), today's special, and reviews and photos
that only verified visitors can post, with the counter code the shop shows today.

1. Tables
- `shops`: slug, name, section (picks the map pin), friend (the host character / mascot id), lat/lng, story, today's special, live status
  (open | busy | closed) + a short note, owner (auth user). `claimable`
  marks the made-up demo shops, which the first signed-in owner can claim once.
- `menu_items`: shop, name, in-store price (INR), optional own-app price, available,
  updated_at (set by a trigger on every change, shown as "updated N min ago").
- `shop_codes`: one 6-digit code per shop per day (Asia/Kolkata), readable only by its owner.
- `visits`: a visitor who entered today's code (written only by the `shop` Edge Function).
- `reviews`: rating 1-5, text, owner reply. Never deletable by the owner.
- `photos`: a path in the public `shop-photos` bucket.
2. Security (RLS on every table)
- Public read: shops, menu_items, reviews and photos (unless reported 3 times).
- Owners write only their own shop and its menu (owner = auth.uid()).
- shop_codes: only the shop's owner reads; codes are made by owner_today_code().
- visits, reviews and photos: no client writes at all. The `shop` Edge Function checks today's
  code and inserts with the service role. Owners reply through reply_to_review().
3. Realtime: menu_items, reviews, photos and shops are published (menu_items with full rows,
  so deletions reach the shop page too).
*/

CREATE TABLE IF NOT EXISTS shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9-]{3,40}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  -- the business section: picks the map pin
  section text NOT NULL DEFAULT 'restaurant' CHECK (section IN ('restaurant', 'cafe', 'juice', 'bakery',
    'grocery', 'streetfood', 'boutique', 'mall', 'realestate', 'salon', 'pharmacy', 'bookstore', 'electronics',
    'gym', 'hotel')),
  -- the host at the door: a character / mascot id (its AR rig is /ar/rigs/<friend>.html)
  friend text NOT NULL DEFAULT 'juno' CHECK (friend ~ '^[a-z0-9-]{2,30}$'),
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  story text NOT NULL DEFAULT '' CHECK (char_length(story) <= 400),
  special text NOT NULL DEFAULT '' CHECK (char_length(special) <= 140),
  -- live status the owner sets; the host answers "are you open / busy?" from it
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'busy', 'closed')),
  status_note text NOT NULL DEFAULT '' CHECK (char_length(status_note) <= 80),
  owner uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  claimable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  price numeric(8,2) NOT NULL CHECK (price >= 0),
  app_price numeric(8,2) CHECK (app_price >= 0),
  available boolean NOT NULL DEFAULT true,
  sort int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS menu_items_shop_idx ON menu_items (shop_id, sort);

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS menu_items_touch ON menu_items;
CREATE TRIGGER menu_items_touch BEFORE UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS shop_codes (
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  day date NOT NULL,
  code text NOT NULL CHECK (code ~ '^[0-9]{6}$'),
  PRIMARY KEY (shop_id, day)
);

CREATE TABLE IF NOT EXISTS visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  ip text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visits_shop_idx ON visits (shop_id, created_at);

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  visit_id uuid UNIQUE REFERENCES visits(id) ON DELETE SET NULL,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 500),
  owner_reply text CHECK (char_length(owner_reply) <= 500),
  replied_at timestamptz,
  reported int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reviews_shop_idx ON reviews (shop_id, created_at DESC);

CREATE TABLE IF NOT EXISTS photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  visit_id uuid UNIQUE REFERENCES visits(id) ON DELETE SET NULL,
  path text NOT NULL,
  reported int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS photos_shop_idx ON photos (shop_id, created_at DESC);

ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shops are public" ON shops;
CREATE POLICY "Shops are public" ON shops FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Owners add their own shop" ON shops;
CREATE POLICY "Owners add their own shop" ON shops FOR INSERT TO authenticated
  WITH CHECK (owner = auth.uid() AND claimable = false);
DROP POLICY IF EXISTS "Owners edit their own shop" ON shops;
CREATE POLICY "Owners edit their own shop" ON shops FOR UPDATE TO authenticated
  USING (owner = auth.uid()) WITH CHECK (owner = auth.uid() AND claimable = false);

DROP POLICY IF EXISTS "Menus are public" ON menu_items;
CREATE POLICY "Menus are public" ON menu_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Owners add to their menu" ON menu_items;
CREATE POLICY "Owners add to their menu" ON menu_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM shops s WHERE s.id = shop_id AND s.owner = auth.uid()));
DROP POLICY IF EXISTS "Owners edit their menu" ON menu_items;
CREATE POLICY "Owners edit their menu" ON menu_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM shops s WHERE s.id = shop_id AND s.owner = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM shops s WHERE s.id = shop_id AND s.owner = auth.uid()));
DROP POLICY IF EXISTS "Owners remove from their menu" ON menu_items;
CREATE POLICY "Owners remove from their menu" ON menu_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM shops s WHERE s.id = shop_id AND s.owner = auth.uid()));

DROP POLICY IF EXISTS "Owners read their codes" ON shop_codes;
CREATE POLICY "Owners read their codes" ON shop_codes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM shops s WHERE s.id = shop_id AND s.owner = auth.uid()));

DROP POLICY IF EXISTS "Reviews are public" ON reviews;
CREATE POLICY "Reviews are public" ON reviews FOR SELECT TO anon, authenticated USING (reported < 3);
DROP POLICY IF EXISTS "Photos are public" ON photos;
CREATE POLICY "Photos are public" ON photos FOR SELECT TO anon, authenticated USING (reported < 3);

-- Today's counter code for the owner's shop (made on first look each day).
CREATE OR REPLACE FUNCTION owner_today_code(p_shop uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  c text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM shops WHERE id = p_shop AND owner = auth.uid()) THEN
    RAISE EXCEPTION 'not your shop';
  END IF;
  INSERT INTO shop_codes (shop_id, day, code)
    VALUES (p_shop, d, lpad(floor(random() * 1000000)::int::text, 6, '0'))
    ON CONFLICT (shop_id, day) DO NOTHING;
  SELECT code INTO c FROM shop_codes WHERE shop_id = p_shop AND day = d;
  RETURN c;
END $$;

-- The owner answers a review; the review itself can't be changed or removed.
CREATE OR REPLACE FUNCTION reply_to_review(p_review uuid, p_reply text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF char_length(coalesce(p_reply, '')) > 500 THEN RAISE EXCEPTION 'reply too long'; END IF;
  UPDATE reviews r SET owner_reply = nullif(trim(p_reply), ''), replied_at = now()
    FROM shops s WHERE r.id = p_review AND s.id = r.shop_id AND s.owner = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'not your review to answer'; END IF;
END $$;

-- Anyone can report a review or photo; after three reports it is hidden.
CREATE OR REPLACE FUNCTION report_content(p_kind text, p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_kind = 'review' THEN UPDATE reviews SET reported = reported + 1 WHERE id = p_id;
  ELSIF p_kind = 'photo' THEN UPDATE photos SET reported = reported + 1 WHERE id = p_id;
  ELSE RAISE EXCEPTION 'unknown kind';
  END IF;
END $$;

-- The first signed-in owner takes over a made-up demo shop, once.
CREATE OR REPLACE FUNCTION claim_demo_shop(p_slug text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in first'; END IF;
  UPDATE shops SET owner = auth.uid(), claimable = false
    WHERE slug = p_slug AND claimable AND owner IS NULL RETURNING id INTO s;
  IF s IS NULL THEN RAISE EXCEPTION 'not claimable'; END IF;
  RETURN s;
END $$;

REVOKE ALL ON FUNCTION owner_today_code(uuid), reply_to_review(uuid, text), claim_demo_shop(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION owner_today_code(uuid), reply_to_review(uuid, text), claim_demo_shop(text) TO authenticated;
GRANT EXECUTE ON FUNCTION report_content(text, uuid) TO anon, authenticated;

ALTER TABLE menu_items REPLICA IDENTITY FULL;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['menu_items', 'reviews', 'photos', 'shops'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- Photos: public to read; only the shop Edge Function (service role) uploads.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('shop-photos', 'shop-photos', true, 2097152, ARRAY['image/jpeg'])
  ON CONFLICT (id) DO NOTHING;

-- Made-up demo shops at public places (no real business names), claimable once.
INSERT INTO shops (slug, name, section, friend, lat, lng, story, special, status, status_note, owner, claimable) VALUES
  ('wada-chai-katta', 'Wada Chai Katta', 'cafe', 'kiran', 18.51935, 73.85575,
   'A tiny chai stall a short walk from the Shaniwar Wada gate. Cutting chai, bun maska and gossip since forever.',
   'Cutting chai + bun maska for ₹40', 'open', 'Fresh bun maska just out', NULL, true),
  ('sarasbaug-misal-house', 'Sarasbaug Misal House', 'restaurant', 'rosa', 18.50105, 73.85345,
   'Spicy misal near the Sarasbaug garden gate. Nap-friendly benches outside.',
   'Misal pav with an extra pav, ₹90', 'busy', 'About a 10 min wait', NULL, true),
  ('parvati-snack-stop', 'Parvati Snack Stop', 'streetfood', 'sunny', 18.49850, 73.84985,
   'Fuel for the Parvati Hill steps: vada pav, lassi and bhel at the bottom of the climb.',
   'Two vada pav + lassi for ₹75', 'open', '', NULL, true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO menu_items (shop_id, name, price, app_price, sort)
SELECT s.id, m.name, m.price, m.app_price, m.sort
FROM shops s JOIN (VALUES
  ('wada-chai-katta', 'Cutting chai', 15, 35, 1),
  ('wada-chai-katta', 'Bun maska', 30, 55, 2),
  ('wada-chai-katta', 'Vada pav', 25, 49, 3),
  ('wada-chai-katta', 'Kanda poha', 40, 75, 4),
  ('sarasbaug-misal-house', 'Misal pav', 80, 139, 1),
  ('sarasbaug-misal-house', 'Sabudana vada', 50, 89, 2),
  ('sarasbaug-misal-house', 'Kokum sharbat', 30, 59, 3),
  ('parvati-snack-stop', 'Vada pav', 20, 45, 1),
  ('parvati-snack-stop', 'Sweet lassi', 40, 75, 2),
  ('parvati-snack-stop', 'Bhel', 35, 65, 3)
) AS m(slug, name, price, app_price, sort) ON m.slug = s.slug
WHERE NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.shop_id = s.id);
