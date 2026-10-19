// Every character id must match across the lists that name them: the server's gesture words and mascot agents, and
// the pages' lists (rigs, the app's type, the AR and talk pages), each of which must talk on the server. Since 19 Oct
// the characters are the 12 business mascots (web/talk/prompts.mjs MASCOTS).
// Run: node --test "web/talk/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MASCOTS } from './prompts.mjs';
import { ACTIONS } from './reply.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const ids = (o) => Object.keys(o).filter((k) => !k.startsWith('_')).sort();
const quoted = (s) => [...s.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
const lists = {
  rigs: [...read('../../scripts/build-rigs.mjs').matchAll(/^ {2}(\w+): \{ file:/gm)].map((m) => m[1]).sort(),
  app: quoted(read('../../src/friends.ts').match(/export type Character = ([^;]+);/)[1]),
  ar: quoted(read('../ar/index.html').match(/const FRIENDS = \[([^\]]+)\]/)[1]),
  talkPage: [...read('./index.html').match(/const NAMES = \{([^}]+)\}/)[1].matchAll(/(\w+): '/g)].map((m) => m[1]).sort(),
};

test('the server knows the same mascots in its gesture words and its agents', () => {
  assert.deepEqual(ids(ACTIONS), ids(MASCOTS));
});

test('the rigs, the app, the AR page and the talk page list the same mascots, and each talks on the server', () => {
  assert.ok(lists.rigs.length >= 4, lists.rigs);
  for (const [where, list] of Object.entries(lists)) assert.deepEqual(list, lists.rigs, `${where} lists ${list}, the rigs ${lists.rigs}`);
  for (const id of lists.rigs) assert.ok(Object.hasOwn(MASCOTS, id), `${id} has a rig but no mascot entry`);
});
