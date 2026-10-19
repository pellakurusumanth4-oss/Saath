/*
  Reviews and reports count once (19 Oct 2026, from the review of the website journey):
  - post_review: a second review for the same visit (the same person, shop and day) is refused with 'already-reviewed',
    instead of keeping the first one while the screen says "posted".
  - report_content: each IP reports a review or photo once, and an owner can't report its own shop's content, so neither
    one person nor the shop can hide a review alone; three different reporters still hide it.
*/

CREATE TABLE IF NOT EXISTS content_reports (
  kind text NOT NULL,
  id uuid NOT NULL,
  ip text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, id, ip)
);
ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY; -- no policies: only report_content writes it

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
  IF r IS NULL THEN RAISE EXCEPTION 'already-reviewed'; END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION report_content(p_kind text, p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s_id uuid;
BEGIN
  IF p_kind = 'review' THEN SELECT shop_id INTO s_id FROM reviews WHERE id = p_id;
  ELSIF p_kind = 'photo' THEN SELECT shop_id INTO s_id FROM photos WHERE id = p_id;
  ELSE RAISE EXCEPTION 'unknown kind';
  END IF;
  IF s_id IS NULL THEN RETURN; END IF;
  IF auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM shops WHERE id = s_id AND owner = auth.uid()) THEN RETURN; END IF;
  INSERT INTO content_reports (kind, id, ip) VALUES (p_kind, p_id, caller_ip()) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_kind = 'review' THEN UPDATE reviews SET reported = reported + 1 WHERE id = p_id;
  ELSE UPDATE photos SET reported = reported + 1 WHERE id = p_id;
  END IF;
END $$;
