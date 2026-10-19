/*
  Counter codes: no one can lock a shop's code for everyone (19 Oct 2026, the user's go-ahead). Wrong codes were capped
  at 20 per IP and 200 per shop over a rolling day, checked before the code, so 200 wrong tries from 10 IPs (or one
  faked x-forwarded-for) refused every customer's right code for 24 hours.

  Now only tries at today's code count (it changes at midnight, Asia/Kolkata), so any lockout ends with the day; and the
  shop-wide cap is 200 for someone who has already guessed wrong at that shop today but 2,000 for anyone's first try
  there. Locking out first tries now takes about 1,800 fresh IPs, and a day's code still allows at most 2,000 guesses of
  a million (0.2%; it was 200, 0.02%). The per-IP cap, 20 wrong tries a day across all shops, stays.

  Only verify_visit changes (the rest is as in 20261019120000_visits_reviews); its grants are kept. Idempotent.
*/

CREATE OR REPLACE FUNCTION verify_visit(p_slug text, p_code text) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s_id uuid;
  d date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  since timestamptz := d::timestamp AT TIME ZONE 'Asia/Kolkata';   -- today's midnight in Pune: when today's code began
  who text := caller_ip();
  v uuid;
BEGIN
  SELECT id INTO s_id FROM shops WHERE slug = p_slug;
  IF s_id IS NULL THEN RETURN json_build_object('ok', false, 'error', 'no-shop'); END IF;
  IF (SELECT count(*) FROM code_tries WHERE ip = who AND at >= since) >= 20
     -- (The CASE sits in brackets: PL/pgSQL would end the IF's condition at the CASE's own THEN.)
     OR (SELECT count(*) FROM code_tries WHERE shop_id = s_id AND at >= since)
        >= (CASE WHEN EXISTS (SELECT 1 FROM code_tries WHERE shop_id = s_id AND ip = who AND at >= since) THEN 200 ELSE 2000 END) THEN
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
