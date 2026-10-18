// Every friend id must match across the lists that name them (three friends were added on 18 Oct night, so a missed
// list is easy). The server's lists must be the same; the pages' lists (rigs, the app's type, the AR and talk pages)
// must be the same as each other, and each friend in them must talk on the server (he can talk before his rig is ready).
// Run: node --test "web/talk/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PERSONAS } from './prompts.mjs';
import { ACTIONS } from './reply.mjs';
import VOICES from './voices.json' with { type: 'json' };

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const ids = (o) => Object.keys(o).filter((k) => !k.startsWith('_')).sort();
const quoted = (s) => [...s.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
const lists = {
  rigs: [...read('../../scripts/build-rigs.mjs').matchAll(/^ {2}(\w+): \{ file:/gm)].map((m) => m[1]).sort(),
  app: quoted(read('../../src/friends.ts').match(/export type Character = ([^;]+);/)[1]),
  ar: quoted(read('../ar/index.html').match(/const FRIENDS = \[([^\]]+)\]/)[1]),
  talkPage: [...read('./index.html').match(/const NAMES = \{([^}]+)\}/)[1].matchAll(/(\w+): '/g)].map((m) => m[1]).sort(),
};

test('the server knows the same friends in its personas, actions and voices', () => {
  assert.deepEqual(ids(ACTIONS), ids(PERSONAS));
  assert.deepEqual(ids(VOICES), ids(PERSONAS));
});

test('the rigs, the app, the AR page and the talk page list the same friends, and each talks on the server', () => {
  assert.ok(lists.rigs.length >= 4, lists.rigs);
  for (const [where, list] of Object.entries(lists)) assert.deepEqual(list, lists.rigs, `${where} lists ${list}, the rigs ${lists.rigs}`);
  for (const id of lists.rigs) assert.ok(Object.hasOwn(PERSONAS, id), `${id} has a rig but no persona`);
});
