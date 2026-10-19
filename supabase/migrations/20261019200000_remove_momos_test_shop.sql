/*
  Remove the "momos" test shop (19 Oct 2026, the user: "remove the 'momos' test shop from the live site"). It was made with
  the shared demo owner account while trying the one-tap demo login. Only this one row, by its id and owner, goes; its
  menu, counter codes, visits, reviews, photos and code tries go with it (ON DELETE CASCADE). The demo account stays.
  A copy of the row was saved before the delete.
*/

DELETE FROM shops
WHERE id = '978f92c7-6d37-41bb-9a18-706c9c886e38'
  AND slug = 'momos-rst5u'
  AND owner = '5aa7de00-0000-4000-8000-0000000000d1';
