// The talk functions' shop loader (supabase/functions/talk/shop.mjs) gives the mascot prompts a shop they accept.
// Run: node --test site/scripts/shop-loader.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadShop } from '../../supabase/functions/talk/shop.mjs';
import { mascotOf, mascotPrompt, shopData } from '../../supabase/functions/talk/prompts.mjs';

// Stands in for supabase-js: answers the shops query with one row and remembers what was asked.
const fakeDb = (row, asked = {}) => ({
  from: (table) => ({ select: (columns) => ({ eq: (column, value) => ({
    maybeSingle: async () => (Object.assign(asked, { table, columns, column, value }), { data: row, error: null }),
  }) }) }),
});

const row = {
  slug: 'sarasbaug-misal-house', name: 'Sarasbaug Misal House', section: 'restaurant', friend: 'rosa', story: '',
  area: 'Sarasbaug, Swargate', special: 'Misal pav with an extra pav, ₹90', status: 'busy', status_note: 'About a 10 min wait',
  offers: ['Saath walkers get a free papad', ' ', 'x'.repeat(201)],
  menu_items: [
    { name: 'Kokum sharbat', price: 30, app_price: 59, available: true, note: '', sort: 3 },
    { name: 'Parking', price: null, app_price: null, available: true, note: '30 rupees an hour', sort: 4 },
    { name: 'Misal pav', price: 80, app_price: 139, available: true, sort: 1 },
    { name: ' ', price: 10, app_price: null, available: true, sort: 2 },
    { name: 'Sabudana vada', price: 50, app_price: null, available: false, sort: 2 },
  ],
};

test('a shop row becomes what the mascot prompts take, its live facts in the SHOP DATA block', async () => {
  const asked = {};
  const shop = await loadShop(fakeDb(row, asked), 'sarasbaug-misal-house');
  assert.deepEqual([asked.table, asked.column, asked.value], ['shops', 'slug', 'sarasbaug-misal-house']);
  assert.deepEqual(shop.menu.map((item) => item.name), ['Misal pav', 'Sabudana vada', 'Kokum sharbat', 'Parking']);
  assert.deepEqual(shop.offers, ['Saath walkers get a free papad']);
  assert.equal(mascotOf(shop).name, 'Chef Rosa');
  assert.match(mascotPrompt(shop), /mascot of Sarasbaug Misal House/);
  const live = shopData(shop);
  assert.match(live, /Status: busy \(About a 10 min wait\)/);
  assert.match(live, /Misal pav: 80 rupees \(about 139 rupees on delivery apps\)/);
  assert.match(live, /Sabudana vada: sold out/);
  assert.match(live, /Today's special: Misal pav with an extra pav, ₹90/);
  assert.match(live, /- Saath walkers get a free papad/);
  assert.match(live, /- Parking \(30 rupees an hour\)/);
  assert.match(mascotPrompt(shop), /Area: Sarasbaug, Swargate/);
});

test("what the business does opens the story the mascot reads", async () => {
  const about = 'Fresh juices and smoothies, pressed while you watch.';
  const shop = await loadShop(fakeDb({ ...row, about, story: 'Two cousins started with a cart.' }), 'sarasbaug-misal-house');
  assert.match(mascotPrompt(shop), /The shop's story: Fresh juices and smoothies, pressed while you watch\. Two cousins started with a cart\./);
  const onlyAbout = await loadShop(fakeDb({ ...row, about }), 'sarasbaug-misal-house');
  assert.match(mascotPrompt(onlyAbout), /The shop's story: Fresh juices and smoothies, pressed while you watch\.$/m);
  // A row from before the column existed still loads.
  assert.match(mascotPrompt(await loadShop(fakeDb(row), 'sarasbaug-misal-house')), /The shop's story: not given/);
});

test('a bad or unknown slug loads nothing', async () => {
  assert.equal(await loadShop(fakeDb(row), 'Not A Slug!'), null);
  assert.equal(await loadShop(fakeDb(null), 'no-such-shop'), null);
});
