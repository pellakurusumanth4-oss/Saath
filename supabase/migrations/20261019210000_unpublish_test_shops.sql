/*
  Take the two test shops off the map (19 Oct 2026, the user: "unpublish both test shops, Momos and mamas spaaaa").
  The site review found them live among the demo shops: "Momos" (made from an email owner account while trying the
  owner pages) and "mamas spaaaa" (made with the shared demo account). They are unpublished, not deleted: the rows, the
  menu and the owners stay, and visitors no longer see them (the site and the shop links show published shops only).
  Each row is matched by id, slug and owner, so nothing else can change. A copy of both rows was saved first.
*/

UPDATE shops SET published = false
WHERE (id = '559a36f9-46f2-4d1d-bded-3a5ebe5d79dc' AND slug = 'momos' AND owner = 'ff1fa6ba-3a8d-44a3-bd5f-9205dcf52027')
   OR (id = '4dea2ead-eb04-4599-a900-a14efdf7d53f' AND slug = 'mamas-spaaaa' AND owner = '5aa7de00-0000-4000-8000-0000000000d1');
