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
  special: 'Misal pav with an extra pav, ₹90', status: 'busy', status_note: 'About a 10 min wait',
  menu_items: [
    { name: 'Kokum sharbat', price: 30, app_price: 59, available: true, sort: 3 },
    { name: 'Misal pav', price: 80, app_price: 139, available: true, sort: 1 },
    { name: ' ', price: 10, app_price: null, available: true, sort: 2 },
    { name: 'Sabudana vada', price: 50, app_price: null, available: false, sort: 2 },
  ],
};

test('a shop row becomes what the mascot prompts take, its live facts in the SHOP DATA block', async () => {
  const asked = {};
  const shop = await loadShop(fakeDb(row, asked), 'sarasbaug-misal-house');
  assert.deepEqual([asked.table, asked.column, asked.value], ['shops', 'slug', 'sarasbaug-misal-house']);
  assert.deepEqual(shop.menu.map((item) => item.name), ['Misal pav', 'Sabudana vada', 'Kokum sharbat']);
  assert.equal(mascotOf(shop).name, 'Chef Rosa');
  assert.match(mascotPrompt(shop), /mascot of Sarasbaug Misal House/);
  const live = shopData(shop);
  assert.match(live, /Status: busy \(About a 10 min wait\)/);
  assert.match(live, /Misal pav: 80 rupees \(about 139 rupees on delivery apps\)/);
  assert.match(live, /Sabudana vada: sold out/);
  assert.match(live, /Today's special: Misal pav with an extra pav, ₹90/);
});

test('a bad or unknown slug loads nothing', async () => {
  assert.equal(await loadShop(fakeDb(row), 'Not A Slug!'), null);
  assert.equal(await loadShop(fakeDb(null), 'no-such-shop'), null);
});
