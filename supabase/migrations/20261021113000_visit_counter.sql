/*
  Footfall's own anonymous visit counter (21 Oct 2026, for watching judging traffic).

  page_hits keeps COUNTS ONLY: per page (or 'talk' for a mascot reply), per hour (Indian time), and the referring
  site's domain. No IP, no location, no user agent, no id: nothing about the visitor. Pages add 1 through hit();
  nobody can read or write the table directly (RLS on, no policies).

  daily_stats(p_days) is a public read-only summary per day (Indian time): page views per page, talk replies,
  referring domains, and from the existing tables the verified visits, reviews and new owner shops (counts only).
  Read it with GET /rest/v1/rpc/daily_stats?p_days=14 and the public anon key.
*/

CREATE TABLE IF NOT EXISTS page_hits (
  day date NOT NULL,
  hour smallint NOT NULL CHECK (hour BETWEEN 0 AND 23),
  page text NOT NULL,
  referrer text NOT NULL DEFAULT '',
  hits int NOT NULL DEFAULT 0,
  PRIMARY KEY (day, hour, page, referrer)
);
ALTER TABLE page_hits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.hit(p_page text, p_ref text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  page text := regexp_replace(coalesce(p_page, ''), 'index\.html$', '');
  ref text := lower(coalesce(p_ref, ''));
  here timestamp := now() AT TIME ZONE 'Asia/Kolkata';
BEGIN
  IF page <> 'talk' AND page !~ '/$' THEN page := page || '/'; END IF;
  IF page NOT IN ('/', '/visit/', '/owner/', '/ar/', 'talk') THEN RETURN; END IF;
  IF ref !~ '^[a-z0-9.-]{1,80}$' THEN ref := ''; END IF;
  INSERT INTO page_hits (day, hour, page, referrer, hits)
  VALUES (here::date, extract(hour FROM here)::smallint, page, ref, 1)
  ON CONFLICT (day, hour, page, referrer) DO UPDATE SET hits = page_hits.hits + 1;
END $$;
REVOKE ALL ON FUNCTION public.hit(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.hit(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.daily_stats(p_days int DEFAULT 14)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH days AS (
    SELECT d::date AS day
    FROM generate_series((now() AT TIME ZONE 'Asia/Kolkata')::date - (least(greatest(coalesce(p_days, 14), 1), 90) - 1),
                         (now() AT TIME ZONE 'Asia/Kolkata')::date, interval '1 day') AS d
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'day', days.day,
    'page_views', (SELECT coalesce(jsonb_object_agg(page, n), '{}'::jsonb)
                   FROM (SELECT page, sum(hits) AS n FROM page_hits WHERE day = days.day AND page <> 'talk' GROUP BY page) x),
    'talk_replies', (SELECT coalesce(sum(hits), 0) FROM page_hits WHERE day = days.day AND page = 'talk'),
    'referrers', (SELECT coalesce(jsonb_object_agg(referrer, n), '{}'::jsonb)
                  FROM (SELECT referrer, sum(hits) AS n FROM page_hits WHERE day = days.day AND referrer <> '' GROUP BY referrer) y),
    'verified_visits', (SELECT count(*) FROM visits WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date = days.day),
    'reviews', (SELECT count(*) FROM reviews WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date = days.day),
    'new_owner_shops', (SELECT count(*) FROM shops WHERE owner IS NOT NULL AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = days.day)
  ) ORDER BY days.day DESC), '[]'::jsonb)
  FROM days;
$$;
REVOKE ALL ON FUNCTION public.daily_stats(int) FROM public;
GRANT EXECUTE ON FUNCTION public.daily_stats(int) TO anon, authenticated;
