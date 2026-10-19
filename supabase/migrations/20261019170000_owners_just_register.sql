/*
  Owners just register (19 Oct 2026, the user: "just for registering their business and get agent and billboard and some
  details about their timings"): the setup asks no prices, so
  1. shops.hours: the business's timings in the owner's words ("Mon–Sat, 8 am – 9 pm"); the mascot reads them.
  2. Publishing no longer needs a menu item. The trigger goes; its function stays (as a no-op) because
     20261019150000_owner_onboarding's done guard looks for it.
  3. Shops made by the shared demo owner (20261019170500) are demo shops, with the DEMO badge, whoever made them.
*/

ALTER TABLE shops ADD COLUMN IF NOT EXISTS hours text NOT NULL DEFAULT '' CHECK (char_length(hours) <= 120);

DROP TRIGGER IF EXISTS shops_publish_check ON shops;
CREATE OR REPLACE FUNCTION shops_publish_check() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION shops_demo_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.owner = '5aa7de00-0000-4000-8000-0000000000d1' THEN NEW.demo := true; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS shops_demo_owner ON shops;
CREATE TRIGGER shops_demo_owner BEFORE INSERT OR UPDATE OF owner ON shops FOR EACH ROW EXECUTE FUNCTION shops_demo_owner();
