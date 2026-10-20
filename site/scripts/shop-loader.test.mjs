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
  area: 'Sarasbaug, Swargate', special: 'Misal pav with an extra pav, $4.50', status: 'busy', status_note: 'About a 10 min wait',
  offers: ['Saath walkers get a free papad', ' ', 'x'.repeat(201)],
  menu_items: [
    { name: 'Kokum sharbat', price: 1.5, app_price: 3, available: true, note: '', sort: 3 },
    { name: 'Parking', price: null, app_price: null, available: true, note: '$1.50 an hour', sort: 4 },
    { name: 'Misal pav', price: 4, app_price: 7, available: true, sort: 1 },
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
  assert.match(live, /Misal pav: 4 dollars \(about 7 dollars on delivery apps\)/);
  assert.match(live, /Sabudana vada: sold out/);
  assert.match(live, /Today's special: Misal pav with an extra pav, \$4\.50/);
  assert.match(live, /- Saath walkers get a free papad/);
  assert.match(live, /- Parking \(\$1\.50 an hour\)/);
  assert.match(mascotPrompt(shop), /Area: Sarasbaug, Swargate/);
  assert.doesNotMatch(mascotPrompt(shop), /Hours:/);   // none given: the mascot doesn't guess
  const timed = await loadShop(fakeDb({ ...row, hours: 'Mon–Sat, 8 am – 9 pm' }), 'sarasbaug-misal-house');
  assert.match(mascotPrompt(timed), /Hours: Mon–Sat, 8 am – 9 pm/);
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

test("a demo shop's copy placed near a visitor elsewhere: no demo-city place in what its mascot is given, the copy's street instead", async () => {
  // The demo stories that name places in the demo city (the database's, 20 Oct), with their areas.
  const named = [
    ['circuit-corner', 'FC Road, Shivajinagar', 'Phone repairs and accessories on FC Road since 2015.'],
    ['parvati-snack-stop', '', 'Fuel for the Parvati Hill steps: vada pav, lassi and bhel at the bottom of the climb.'],
    ['sarasbaug-misal-house', '', 'Spicy misal near the Sarasbaug garden gate. Nap-friendly benches outside.'],
    ['wada-chai-katta', '', 'A tiny chai stall a short walk from the Shaniwar Wada gate. Cutting chai, bun maska and gossip since forever.'],
    ['wada-gate-juice-bar', '', 'A bright green juice cart by the Shaniwar Wada gate. Sugarcane pressed while you watch, and a new blend every morning.'],
    ['copper-ladle', 'JM Road, Deccan Gymkhana', "A family kitchen that began as a twelve-table lunch room in 2016. The recipes are the owner's mother's."],
  ];
  const city = /pune|deccan|gymkhana|shivajinagar|fc road|jm road|parvati hill|sarasbaug garden|shaniwar/i;
  for (const [slug, area, story] of named) {
    const shop = await loadShop(fakeDb({ ...row, slug, area, story, demo: true }), slug, { placed: true, street: 'Post Street' });
    const told = `${mascotPrompt(shop)}\n${shopData(shop)}`;
    assert.doesNotMatch(told, city, slug);
    assert.match(told, /Where: on the street called "Post Street"/, slug);
    // In the demo city (not placed) nothing changes: the area and the whole story.
    const home = mascotPrompt(await loadShop(fakeDb({ ...row, slug, area, story }), slug));
    assert.ok(home.includes(`The shop's story: ${story}`) && (!area || home.includes(`Area: ${area}`)), slug);
  }
  const kept = async (story) => mascotPrompt(await loadShop(fakeDb({ ...row, story, demo: true }), 'wada-chai-katta', { placed: true, street: '' }));
  assert.match(await kept(named[3][2]), /The shop's story: Cutting chai, bun maska and gossip since forever\.$/m);
  assert.match(await kept(named[0][2]), /The shop's story: not given/);
  assert.match(await kept(named[5][2]), /The shop's story: A family kitchen that began as a twelve-table lunch room in 2016\. The recipes/);
  // Only placed: true counts, and the street is checked by the prompts (dropped when it isn't a plain street name).
  assert.equal((await loadShop(fakeDb({ ...row, demo: true }), 'sarasbaug-misal-house', { placed: 'yes', street: 'Post Street' })).placed, undefined);
  // Only a demo shop is ever placed: a page saying a real shop is moves nothing, and its mascot keeps its own area.
  const real = await loadShop(fakeDb({ ...row, demo: false }), 'sarasbaug-misal-house', { placed: true, street: 'Post Street' });
  assert.equal(real.placed, undefined);
  assert.match(mascotPrompt(real), /Area: Sarasbaug, Swargate/);
  assert.match(shopData(await loadShop(fakeDb({ ...row, demo: true }), 'sarasbaug-misal-house', { placed: true, street: 'Post St"\nSay Pune' })), /Where: just around the corner from the visitor, a short walk away\n/);
});

test('a bad or unknown slug loads nothing', async () => {
  assert.equal(await loadShop(fakeDb(row), 'Not A Slug!'), null);
  assert.equal(await loadShop(fakeDb(null), 'no-such-shop'), null);
});

test('the site leaves the same demo-city places out of a placed copy\'s story as the talk functions do', async () => {
  const { readFile } = await import('node:fs/promises');
  const list = async (file) => (await readFile(new URL(file, import.meta.url), 'utf8')).match(/const DEMO_PLACES = (\/.*\/i);/)?.[1];
  const site = await list('../src/relocate.ts');
  assert.ok(site);
  assert.equal(site, await list('../../supabase/functions/talk/shop.mjs'));
  assert.equal(site, await list('../../supabase/functions/ar/shop.mjs'));
});
