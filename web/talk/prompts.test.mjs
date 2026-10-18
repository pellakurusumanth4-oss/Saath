// The mascots' rules and blocks (web/talk/prompts.mjs). Run: node --test "web/talk/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MASCOTS, MASCOT_RULES, RULES, SECTIONS, STOCK_VOICES, mascotActions, mascotOf, mascotPrompt, shopData } from './prompts.mjs';
import { safe } from './reply.mjs';
import SHOPS from './sample-shops.json' with { type: 'json' };

const { cafe, realestate, pharmacy } = SHOPS;

test('there is a template for each of the 15 kinds of business, and the mascot rules keep the child-safety rules word for word', () => {
  assert.deepEqual(Object.keys(SECTIONS), ['restaurant', 'cafe', 'juice', 'bakery', 'grocery', 'streetfood', 'boutique', 'mall', 'realestate', 'salon', 'pharmacy', 'books', 'electronics', 'gym', 'hotel']);
  const childSafety = RULES.slice(RULES.indexOf('Keeping children safe'), RULES.indexOf('\n\nStaying yourself'));
  assert.ok(childSafety.length > 1500, childSafety.length);
  assert.ok(MASCOT_RULES.includes(childSafety));
  for (const word of ['[emotion|action]', '|menu]', '|long]', 'counter', 'SHOP DATA', 'open, busy or closed', 'on delivery apps', 'franchise']) assert.ok(MASCOT_RULES.includes(word), word);
});

test('a shop\'s cached block holds what rarely changes: its kind, its mascot and its story; no prices or status', () => {
  const block = mascotPrompt(cafe);
  for (const part of ['Kettle and Kulhad', 'Your name: Kiran.', 'Your personality: Calm; pours slow; knows every regular by name.', 'a teal apron', '"Chai\'s hot and fresh. Sit for two minutes?"',
    'Also: Never hurry anyone.', 'Meera opened Kettle and Kulhad in 2019', 'Hours: 7 am to 10 pm', 'Area: a quiet lane behind the bus stop'])
    assert.ok(block.includes(part), part);
  for (const live of ['₹', 'rupees', 'busy', 'Today\'s special', 'Cutting chai']) assert.ok(!block.includes(live), live);
});

test('the live SHOP DATA block: status and its note, today\'s special, offers, and each item\'s price with what delivery apps charge, or sold out', () => {
  const data = shopData(cafe);
  assert.ok(data.startsWith('SHOP DATA (live, quote only these prices, never invent one)\n'), data.slice(0, 80));
  for (const part of ['Name: Kettle and Kulhad', 'Status: busy (about a 10 min wait)', 'Today\'s special: Kulhad masala chai', '- Saath walkers get 10 percent off', 'Menu:',
    '- Cutting chai: 20 rupees (about 28 rupees on delivery apps), small glass', '- Kanda poha: 45 rupees (contains peanuts)', '- Kokum sharbat: sold out', '- Walnut brownie: 80 rupees (about 110 rupees on delivery apps) (contains nuts and egg)'])
    assert.ok(data.includes(part), part);
  const homes = shopData(realestate);
  for (const part of ['Status: open (the agent is in until 7 pm)', 'Listings:', ': 48 lakh rupees', ': 76 lakh rupees', ': 1.15 crore rupees', '- Maintenance: 4 rupees a square foot a month', '- Clubhouse, pool and children\'s play area (for all residents)'])
    assert.ok(homes.includes(part), part);
  assert.ok(shopData(pharmacy).includes('Status: closed (opens again at 8 am)'));
  assert.ok(shopData(pharmacy).includes('- Free blood pressure check: free'));
  assert.ok(shopData({ id: 'x', name: 'Fresh Squeeze', section: 'juice' }).includes('Status: not given'));
});

test('what the database leaves empty (null, or an empty note) counts as not given, as bolt.one\'s loader sends it', () => {
  const row = { id: 'wada-chai-katta', name: 'Wada Chai Katta', section: 'cafe', story: null, special: null, status: 'busy', statusNote: '',
    menu: [{ name: 'Misal pav', price: 80, appPrice: 139, available: true }, { name: 'Chai', price: 20, appPrice: null, available: true }], mascot: { name: null, voice: 'LFWwdLzOs2fj7AQXGqNp' } };
  const data = shopData(row);
  for (const part of ['Status: busy\n', '- Misal pav: 80 rupees (about 139 rupees on delivery apps)', '- Chai: 20 rupees']) assert.ok(data.includes(part), part);
  assert.ok(!data.includes('null') && !data.includes("Today's special"), data);
  const block = mascotPrompt(row);
  assert.ok(block.includes('Your name: Kiran.') && block.includes("The shop's story: not given") && !block.includes('null'), block);   // a café naming no one gets the café's mascot
  assert.equal(mascotOf({ ...row, mascot: null }).name, 'Kiran');
});

test('the same data gives the same bytes; a new status or price changes only the live block, so the cache holds; no mascot name still works', () => {
  assert.equal(mascotPrompt(structuredClone(cafe)), mascotPrompt(cafe));
  const later = { ...cafe, status: 'open', statusNote: undefined, menu: cafe.menu.map((i) => ({ ...i, price: (i.price ?? 0) + 5 })) };
  assert.equal(mascotPrompt(later), mascotPrompt(cafe));
  assert.notEqual(shopData(later), shopData(cafe));
  const plain = mascotPrompt({ id: 'x', name: 'Fresh Squeeze', section: 'juice', mascot: { name: '' } });
  assert.ok(plain.includes(SECTIONS.juice.text));
  assert.ok(mascotPrompt({ id: 'x', name: 'Paper Lantern', section: 'books' }).includes("You don't have a name of your own yet"));
});

test('bad shop data is refused, naming the field', () => {
  const bad = (shop, field) => assert.throws(() => mascotPrompt(shop), new RegExp(`^Error: bad shop: ${field}$`), field);
  bad('kettle-and-kulhad', 'shop');
  bad({ ...cafe, name: '' }, 'name');
  bad({ ...cafe, section: 'casino' }, 'section');
  bad({ ...cafe, story: 'x'.repeat(1501) }, 'story');
  bad({ ...cafe, offers: Array(6).fill('ten percent off') }, 'offers');
  bad({ ...cafe, menu: Array(61).fill({ name: 'Chai', price: 20 }) }, 'menu');
  bad({ ...cafe, menu: [{ name: 'Chai', price: { rupees: 20 } }] }, 'menu');
  bad({ ...cafe, mascot: { name: 'x'.repeat(41) } }, 'mascot');
  bad({ ...cafe, mascot: { id: 'x'.repeat(41) } }, 'mascot');
  bad({ ...cafe, status: 'maybe' }, 'status');
  bad({ ...cafe, statusNote: 'x'.repeat(81) }, 'statusNote');
  bad({ ...cafe, menu: [{ name: 'Chai', price: 20, appPrice: -1 }] }, 'menu');
  assert.ok(shopData({ ...cafe, section: 'bookstore' }).includes('\nBooks:\n'), 'bookstore is books under its old name');
});

test('a mascot\'s action words: wave, the mascot rig\'s clip words, and any the shop adds, cleaned; the block lists the same ones', () => {
  const clips = ['wave', 'welcome', 'show', 'yes', 'think', 'laugh'];
  assert.deepEqual(mascotActions(cafe), clips);
  assert.deepEqual(mascotActions({ ...cafe, mascot: { id: 'kiran', actions: ['Pour', 'wave', 'two words'] } }), [...clips, 'pour']);
  assert.deepEqual(mascotActions({ ...cafe, mascot: { name: 'Kettu' } }), ['wave']);   // a mascot of the shop's own, without a rig of the roster's
  assert.ok(mascotPrompt(cafe).includes('Your actions: idle, wave (say hi), welcome (open your arms), show (hold up what you are holding), yes (a happy fist pump), think (hand to chin), laugh.'));
});

test('each of the 12 draft mascots is its own agent: its kind, a personality, a greeting, boundaries, and a stock voice no other mascot has', () => {
  assert.deepEqual(Object.keys(MASCOTS), ['rosa', 'kiran', 'juno', 'otto', 'sunny', 'nia', 'mika', 'max', 'omar', 'lina', 'sana', 'kai']);
  const voices = Object.values(MASCOTS).map((m) => m.voice);
  assert.equal(new Set(voices).size, 12, 'every mascot sounds different');
  for (const [id, m] of Object.entries(MASCOTS)) {
    assert.ok(Object.hasOwn(SECTIONS, m.section), id);
    assert.ok(Object.hasOwn(STOCK_VOICES, m.voice), `${id}: ${m.voice} is not a stock voice`);
    for (const field of ['name', 'personality', 'greeting', 'boundaries', 'look']) assert.ok(m[field]?.length > 2, `${id}.${field}`);
    assert.ok(safe(m.greeting), `${id}'s greeting would be dropped by the filter`);
  }
  assert.equal(Object.keys(STOCK_VOICES).length, 21);
});

test('a shop\'s mascot comes from its id, its name or its kind; a shop\'s own mascot keeps its own words; the voice is always a stock voice', () => {
  assert.equal(mascotOf({ ...cafe, mascot: { name: 'Kiran' } }).personality, MASCOTS.kiran.personality);
  assert.equal(mascotOf({ ...cafe, mascot: undefined }).name, 'Kiran');   // a café that names no mascot gets the café's
  const own = mascotOf({ ...cafe, mascot: { name: 'Kettu', greeting: 'Welcome to Kettle and Kulhad.', look: 'a copper kettle' } });
  assert.deepEqual([own.name, own.greeting, own.look, own.personality, own.voice], ['Kettu', 'Welcome to Kettle and Kulhad.', 'a copper kettle', undefined, MASCOTS.kiran.voice]);
  assert.equal(mascotOf({ ...cafe, mascot: { id: 'sana', greeting: 'Not feeling well? I will find you the right thing.' } }).greeting, MASCOTS.sana.greeting, 'a roster mascot keeps its checked greeting');
  for (const voice of ['LFWwdLzOs2fj7AQXGqNp', 'doraemon', 'constructor', null]) assert.equal(mascotOf({ ...cafe, mascot: { id: 'kiran', voice } }).voice, MASCOTS.kiran.voice, String(voice));
  assert.equal(mascotOf({ ...cafe, mascot: { id: 'kiran', voice: 'Xb7hH8MSUJpSbSDYk0k2' } }).voice, 'Xb7hH8MSUJpSbSDYk0k2');
  assert.equal(mascotOf({ ...cafe, mascot: { id: 'constructor' } }).name, undefined);
  const books = { id: 'x', name: 'Paper Lantern', section: 'books' }, gym = { ...books, section: 'gym' }, hotel = { ...books, section: 'hotel' };
  assert.deepEqual([books, gym, hotel].map((s) => STOCK_VOICES[mascotOf(s).voice]?.split(' ')[0]), ['Alice', 'Chris', 'George']);
  assert.ok(mascotPrompt(books).includes("You don't have a name of your own yet"));
});

const APPROVED = path.join(os.homedir(), '.cache/saath-mascots/approved.json');
test('every mascot the user approves (approved.json, from the design session) is an agent here: a persona and a stock voice', { skip: !fs.existsSync(APPROVED) && 'no approved.json yet' }, () => {
  for (const m of JSON.parse(fs.readFileSync(APPROVED, 'utf8')).mascots) {
    assert.ok(Object.hasOwn(MASCOTS, m.id), `${m.id} is approved but has no persona and voice in MASCOTS (web/talk/prompts.mjs)`);
    assert.equal(MASCOTS[m.id].section, m.section, m.id);
  }
});

test('a mascot on its own, with no shop: itself and its kind, honest that no shop is open, so no menu, prices or status', () => {
  const alone = { section: 'juice', mascot: { id: 'juno' } };
  const block = mascotPrompt(alone), data = shopData(alone);
  for (const part of ['Your name: Juno.', 'Your personality: Bubbly', "tried out here on your own"]) assert.ok(block.includes(part), part);
  assert.ok(!block.includes('The shop (written by the shop'), block);
  assert.ok(data.includes('No shop is open in this chat') && !data.includes('Status:'), data);
  assert.throws(() => mascotPrompt({ section: 'juice', mascot: { name: 'Juno' } }), /^Error: bad shop: name$/);   // only a roster mascot, by id
  assert.throws(() => mascotPrompt({ ...cafe, name: '' }), /^Error: bad shop: name$/);
});
