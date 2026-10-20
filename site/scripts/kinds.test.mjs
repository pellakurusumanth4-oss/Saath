// The kinds of business (site/src/kinds.ts): every section belongs to one, the food list is the same wherever it is
// kept (the mascot prompts, the AR page), and a business that isn't food says what its own section will show.
// Run: node --test site/scripts/kinds.test.mjs (Node runs the .ts file itself: it has no imports and only type syntax).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FOOD_SECTIONS, KINDS, isFood, kindOf, soonLine } from '../src/kinds.ts';
import { FOOD_SECTIONS as PROMPT_FOOD, SECTIONS } from '../../web/talk/prompts.mjs';

test('one food list: the site, the mascot prompts and the AR page agree', () => {
  assert.deepEqual([...FOOD_SECTIONS], [...PROMPT_FOOD]);
  const ar = fs.readFileSync(new URL('../../web/ar/index.html', import.meta.url), 'utf8');
  assert.deepEqual(JSON.parse(/const FOOD = (\[[^\]]*\]);/.exec(ar)[1].replaceAll("'", '"')), [...FOOD_SECTIONS]);
  const insights = fs.readFileSync(new URL('../src/insights.ts', import.meta.url), 'utf8');   // the owner's food-only cards
  assert.deepEqual(JSON.parse(/export const FOOD = new Set\((\[[^\]]*\])\)/.exec(insights)[1].replaceAll("'", '"')), [...FOOD_SECTIONS]);
});

test('every section is in exactly one kind; Nearby shows them all and only Nearby and Food are live', () => {
  for (const section of Object.keys(SECTIONS)) assert.equal(KINDS.filter((k) => k.sections?.includes(section)).length, 1, section);
  assert.deepEqual(KINDS.filter((k) => k.live).map((k) => k.id), ['nearby', 'food']);
  assert.equal(KINDS[0].sections, null);
  for (const k of KINDS.filter((k) => !k.live)) assert.ok(k.soon && k.teaser && k.visit && k.glyph, k.id);
});

test('a business that isn\'t food says its kind is coming soon; food says nothing there', () => {
  assert.equal(soonLine({ section: 'realestate' }), 'Real estate on Footfall: price lists of flats and site visits are coming soon.');
  assert.equal(soonLine({ section: 'boutique' }), 'Clothing on Footfall: new collections, sizes and offers are coming soon.');
  assert.equal(soonLine({ section: 'electronics' }), 'Electronics on Footfall: products, prices and repairs are coming soon.');
  assert.equal(soonLine({ section: 'pharmacy' }), 'Pharmacy on Footfall: medicines in stock and health checks are coming soon.');
  assert.equal(soonLine({ section: 'books' }), 'Shopping on Footfall: stores, offers and events are coming soon.');
  for (const section of FOOD_SECTIONS) {
    assert.equal(soonLine({ section }), '');
    assert.ok(isFood({ section }) && kindOf({ section }).id === 'food');
  }
  assert.ok(!isFood({ section: 'salon' }));
});
