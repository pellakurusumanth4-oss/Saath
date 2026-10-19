/*
  Business owners put their own shop on the map (19 Oct 2026): a short guided setup turns the owner's words into the
  shop's mascot agent, pin and billboard, and the shop goes live for visitors when the owner publishes it.

  1. shops.about: what the business does, in the owner's words (a line or two). The talk functions' shop loader gives
     it to the mascot with the story.
  2. shops.ad_color: the billboard ad's colour (#rrggbb); empty: the section's colour.
  3. shops.published: on the map for visitors. Every shop so far stays published; a new one starts as a draft.
  4. A shop goes live only with at least one menu item (its location is required already).

  Row-level security is unchanged: anyone reads; owners write only their own row. Idempotent.
*/

ALTER TABLE shops ADD COLUMN IF NOT EXISTS about text NOT NULL DEFAULT '' CHECK (char_length(about) <= 160);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS ad_color text NOT NULL DEFAULT '' CHECK (ad_color ~* '^(#[0-9a-f]{6})?$');
ALTER TABLE shops ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT true;
ALTER TABLE shops ALTER COLUMN published SET DEFAULT false;

CREATE OR REPLACE FUNCTION shops_publish_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.published AND (TG_OP = 'INSERT' OR NOT OLD.published)
     AND NOT EXISTS (SELECT 1 FROM menu_items WHERE shop_id = NEW.id) THEN
    RAISE EXCEPTION 'Add at least one thing to your menu before you publish' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS shops_publish_check ON shops;
CREATE TRIGGER shops_publish_check BEFORE INSERT OR UPDATE OF published ON shops
  FOR EACH ROW EXECUTE FUNCTION shops_publish_check();
