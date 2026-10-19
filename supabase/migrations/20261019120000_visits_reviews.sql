/*
  Verified visits from the counter code, a review tied to each visit, and the owner's weekly visits (19 Oct 2026).

  - demo_today_code(slug): today's code for a demo shop nobody has claimed, so anyone can try the flow.
    Owned shops never reveal their code here; their owner reads it with owner_today_code() and shows it at the till.
  - verify_visit(slug, code): checks today's code, records one visit per person per shop per day and returns it.
    Wrong codes are counted per IP (20 a day) and per shop (200 a day), then it answers "too-many": the per-shop cap
    keeps a 6-digit code unguessable even when someone fakes their IP header.
    shortcut: the IP is the visitor's identity; move to signed-in visitors before charging shops per visit.
  - post_review(visit, rating, body): one review per verified visit, within two days; it can't be changed after.
  - owner_visits(shop, days): verified visits per day for the owner's own shop (last 7 days by default).
  Reviews and photos keep their existing public read policies; a review with a visit_id is a verified one.
*/

CREATE TABLE IF NOT EXISTS code_tries (
  ip text NOT NULL,
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now()
); -- shortcut: old rows stay; add a daily cleanup if this ever grows
CREATE INDEX IF NOT EXISTS code_tries_ip_idx ON code_tries (ip, at);
CREATE INDEX IF NOT EXISTS code_tries_shop_idx ON code_tries (shop_id, at);
ALTER TABLE code_tries ENABLE ROW LEVEL SECURITY; -- no policies: only the functions below read or write it

-- The caller's IP from PostgREST's request headers: Cloudflare's cf-connecting-ip, else the first x-forwarded-for entry
-- (the client can fake that one), else 'unknown'. The setting is '' on a reused connection, hence the nullif.
CREATE OR REPLACE FUNCTION caller_ip() RETURNS text
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(
    nullif(trim(h ->> 'cf-connecting-ip'), ''),
    nullif(trim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), ''),
    'unknown')
  FROM (SELECT nullif(current_setting('request.headers', true), '')::json AS h) r;
$$;

CREATE OR REPLACE FUNCTION demo_today_code(p_slug text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s_id uuid;
  d date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  c text;
BEGIN
  SELECT id INTO s_id FROM shops WHERE slug = p_slug AND demo AND owner IS NULL;
  IF s_id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO shop_codes (shop_id, day, code)
    VALUES (s_id, d, lpad(floor(random() * 1000000)::int::text, 6, '0'))
    ON CONFLICT (shop_id, day) DO NOTHING;
  SELECT code INTO c FROM shop_codes WHERE shop_id = s_id AND day = d;
  RETURN c;
END $$;

CREATE OR REPLACE FUNCTION verify_visit(p_slug text, p_code text) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s_id uuid;
  d date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  who text := caller_ip();
  v uuid;
BEGIN
  SELECT id INTO s_id FROM shops WHERE slug = p_slug;
  IF s_id IS NULL THEN RETURN json_build_object('ok', false, 'error', 'no-shop'); END IF;
  IF (SELECT count(*) FROM code_tries WHERE ip = who AND at > now() - interval '1 day') >= 20
     OR (SELECT count(*) FROM code_tries WHERE shop_id = s_id AND at > now() - interval '1 day') >= 200 THEN
    RETURN json_build_object('ok', false, 'error', 'too-many');
  END IF;
  IF coalesce(p_code, '') !~ '^[0-9]{6}$'
     OR NOT EXISTS (SELECT 1 FROM shop_codes WHERE shop_id = s_id AND day = d AND code = p_code) THEN
    INSERT INTO code_tries (ip, shop_id) VALUES (who, s_id);
    RETURN json_build_object('ok', false, 'error', 'wrong-code');
  END IF;
  -- One verified visit per person per shop per day: trying again returns the same visit.
  SELECT id INTO v FROM visits
    WHERE shop_id = s_id AND ip = who AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = d
    ORDER BY created_at LIMIT 1;
  IF v IS NULL THEN
    INSERT INTO visits (shop_id, ip) VALUES (s_id, who) RETURNING id INTO v;
  END IF;
  RETURN json_build_object('ok', true, 'visit', v);
END $$;

CREATE OR REPLACE FUNCTION post_review(p_visit uuid, p_rating int, p_body text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s_id uuid;
  r uuid;
BEGIN
  SELECT shop_id INTO s_id FROM visits WHERE id = p_visit AND created_at > now() - interval '2 days';
  IF s_id IS NULL THEN RAISE EXCEPTION 'visit not found'; END IF;
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'rating must be 1 to 5'; END IF;
  INSERT INTO reviews (shop_id, visit_id, rating, body)
    VALUES (s_id, p_visit, p_rating, left(coalesce(trim(p_body), ''), 500))
    ON CONFLICT (visit_id) DO NOTHING
    RETURNING id INTO r;
  IF r IS NULL THEN SELECT id INTO r FROM reviews WHERE visit_id = p_visit; END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION owner_visits(p_shop uuid, p_days int DEFAULT 7) RETURNS TABLE (day date, visits int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  n int := least(greatest(coalesce(p_days, 7), 1), 60);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM shops WHERE id = p_shop AND owner = auth.uid()) THEN
    RAISE EXCEPTION 'not your shop';
  END IF;
  RETURN QUERY
    SELECT g.d::date, count(v.id)::int
    FROM generate_series(today - (n - 1), today, interval '1 day') AS g(d)
    LEFT JOIN visits v ON v.shop_id = p_shop AND (v.created_at AT TIME ZONE 'Asia/Kolkata')::date = g.d::date
    GROUP BY g.d
    ORDER BY g.d;
END $$;

REVOKE EXECUTE ON FUNCTION caller_ip() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION demo_today_code(text), verify_visit(text, text), post_review(uuid, int, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION owner_visits(uuid, int) TO authenticated;
