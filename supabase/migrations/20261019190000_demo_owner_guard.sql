/*
  Guards for the shared demo owner (19 Oct 2026, from the review of the separate owner page). Its password is public on
  purpose, so:
  1. Nobody can change its password or email: one console call would otherwise lock every judge out of the one-tap
     "Log in with the demo account".
  2. Its shops stay demo shops on any update (the trigger fired only on inserts and owner changes, so a PATCH of
     demo=false could hide the badge).
  3. claim_demo_shop is no longer callable by signed-in users: nothing on the site uses it now, and anyone could sign up
     through the API and take a seeded demo shop with it.
*/

CREATE OR REPLACE FUNCTION public.keep_demo_owner_login() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.id = '5aa7de00-0000-4000-8000-0000000000d1' THEN
    NEW.encrypted_password := OLD.encrypted_password;
    NEW.email := OLD.email;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS keep_demo_owner_login ON auth.users;
CREATE TRIGGER keep_demo_owner_login BEFORE UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.keep_demo_owner_login();

DROP TRIGGER IF EXISTS shops_demo_owner ON shops;
CREATE TRIGGER shops_demo_owner BEFORE INSERT OR UPDATE ON shops FOR EACH ROW EXECUTE FUNCTION shops_demo_owner();

REVOKE EXECUTE ON FUNCTION claim_demo_shop(text) FROM authenticated;
