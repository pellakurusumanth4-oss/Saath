/*
  The shared demo owner (19 Oct 2026, the user: "account creation don't need to provide, just for click login demo account"):
  one public account the owner page signs into with a single tap ("Log in with the demo account"). Its email and password
  are in the site's code on purpose; it owns only the shops made with it, and those are demo shops (20261019170000).
  Supabase Auth reads these rows: the token columns must be '' (not NULL) and the identity names its provider_id.
*/

DO $$
DECLARE
  uid constant uuid := '5aa7de00-0000-4000-8000-0000000000d1';
  mail constant text := 'demo.owner@saath.example';
  pw text;
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = uid) THEN RETURN; END IF;
  BEGIN
    pw := extensions.crypt('saath-demo-owner-2026', extensions.gen_salt('bf'));
  EXCEPTION WHEN undefined_function OR invalid_schema_name THEN
    pw := crypt('saath-demo-owner-2026', gen_salt('bf'));   -- pgcrypto in public on older projects
  END;
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  VALUES ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', mail, pw, now(),
    '{"provider":"email","providers":["email"]}', '{"name":"Saath demo owner"}', now(), now(), '', '', '', '');
  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', mail, 'email_verified', true), 'email', now(), now(), now());
END $$;
