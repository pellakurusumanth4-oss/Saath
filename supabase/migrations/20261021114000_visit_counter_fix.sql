/*
  Fixes hit() from 20261021113000_visit_counter: its local names page/ref clashed with page_hits' columns in
  ON CONFLICT ("column reference page is ambiguous"), so every count failed with HTTP 400. Same behaviour, v_ names.
*/

CREATE OR REPLACE FUNCTION public.hit(p_page text, p_ref text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_page text := regexp_replace(coalesce(p_page, ''), 'index\.html$', '');
  v_ref text := lower(coalesce(p_ref, ''));
  v_here timestamp := now() AT TIME ZONE 'Asia/Kolkata';
BEGIN
  IF v_page <> 'talk' AND v_page !~ '/$' THEN v_page := v_page || '/'; END IF;
  IF v_page NOT IN ('/', '/visit/', '/owner/', '/ar/', 'talk') THEN RETURN; END IF;
  IF v_ref !~ '^[a-z0-9.-]{1,80}$' THEN v_ref := ''; END IF;
  INSERT INTO page_hits AS h (day, hour, page, referrer, hits)
  VALUES (v_here::date, extract(hour FROM v_here)::smallint, v_page, v_ref, 1)
  ON CONFLICT (day, hour, page, referrer) DO UPDATE SET hits = h.hits + 1;
END $$;
REVOKE ALL ON FUNCTION public.hit(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.hit(text, text) TO anon, authenticated;
