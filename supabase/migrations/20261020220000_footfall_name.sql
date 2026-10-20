/*
  The product's public name is Footfall now (20 Oct 2026, the user's rename; it was Saath). A read of the live demo rows'
  visible text (shops: name, area, about, story, special, status_note, offers, hours, ad_headline, ad_sub, usual_order;
  menu_items: name, note) found the old name in one place only: Kettle and Kulhad's offer "Saath walkers get 10 percent
  off any chai before 11 am". The word is replaced in the demo shops' offers only, keeping each offer's order; owners'
  own text is left as they wrote it. Running it again changes nothing.
*/

UPDATE shops
SET offers = ARRAY(SELECT replace(o, 'Saath', 'Footfall') FROM unnest(offers) WITH ORDINALITY AS t(o, n) ORDER BY n)
WHERE demo AND array_to_string(offers, ' ') LIKE '%Saath%';
