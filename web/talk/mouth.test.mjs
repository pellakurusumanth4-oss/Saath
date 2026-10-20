// Run: node --test "web/talk/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEAD, TICK, closures, flap, loudness, mouthAt, vowels } from './mouth.mjs';

// Synthetic speech at 24 kHz: segments of [seconds, loudness 0-1] of a 200 Hz tone.
const tone = (segments) => {
  const out = [];
  for (const [secs, amp] of segments) for (let i = 0, n = Math.round(secs * 24000); i < n; i++) out.push(amp * Math.sin((2 * Math.PI * 200 * out.length) / 24000));
  return Float32Array.from(out);
};
// A sound as the page keeps it: the samples, its loudness scale and when its lips are shut.
const sound = (segments, timings = { chars: [], starts: [], ends: [] }) => { const pcm = tone(segments); return { pcm, ref: loudness(pcm), shut: closures(timings), vowels: vowels(timings) }; };
// A word's letters a tenth of a second each, from `at` s.
const spelt = (word, at = 0) => ({ chars: [...word], starts: [...word].map((_, i) => at + i * 0.1), ends: [...word].map((_, i) => at + i * 0.1 + 0.1) });
const changesPerSecond = (seq) => [...seq].filter((c, i) => i && c !== seq[i - 1]).length / (seq.length * TICK);

test('12 drawings a second, each drawn a little before its sound', () => {
  assert.equal(TICK, 1 / 12);
  assert.ok(LEAD > 0 && LEAD < TICK);
});

test('silence keeps the mouth closed', () => {
  assert.match(flap(sound([[1, 0]])), /^X+$/);
  assert.equal(flap({ pcm: new Float32Array(0), ref: 0, shut: [] }), 'X');
});

test('loud opens the mouth, medium half-opens it, quiet closes it', () => {
  const s = sound([[0.5, 0.5], [0.5, 0.18], [0.5, 0.04]]);
  assert.equal(mouthAt(s, 0.2), 'O');
  assert.equal(mouthAt(s, 0.7), 'M');
  assert.equal(mouthAt(s, 1.2), 'X');
});

test('each drawing shows the sound just ahead of it', () => {
  const s = sound([[0.3, 0], [0.4, 0.5]]);   // the voice starts at 0.3 s
  assert.equal(mouthAt(s, 0.3 - LEAD), 'O');
  assert.equal(mouthAt(s, 0.3 - LEAD - TICK), 'X');
});

test('m, b and p close the lips even while the voice is loud', () => {
  const s = sound([[1, 0.5]], { chars: ['a', 'm', 'a'], starts: [0, 0.4, 0.55], ends: [0.4, 0.55, 1] });
  assert.equal(mouthAt(s, 0.4 - LEAD), 'X');
  assert.equal(mouthAt(s, 0.7), 'O');
});

test('closures skip the b in "lamb" and the p in "ph"', () => {
  const at = (word) => closures({ chars: [...word], starts: [...word].map((_, i) => i * 0.1), ends: [...word].map((_, i) => i * 0.1 + 0.1) });
  assert.deepEqual(at('lamb ').length, 1);   // only the m
  assert.deepEqual(at('phone').length, 0);
  assert.deepEqual(at('Big map').length, 3);
});

// At 12 drawings a second a gap shorter than one drawing can't reliably show, so the dip lasts two (a word break).
test('a dip between two loud syllables closes the mouth', () => {
  const s = sound([[0.25, 0.5], [0.17, 0.2], [0.25, 0.5]]);
  assert.ok(flap(s).includes('OXO') || flap(s).includes('OXM') || flap(s).includes('MXO'), flap(s));
});

test('it ends closed, and syllables at 4-5 a second flap 4-9 times a second', () => {
  const syllables = [];
  for (let i = 0; i < 12; i++) syllables.push([0.14, 0.45 + 0.1 * (i % 3)], [0.08, 0.06]);
  const seq = flap(sound([[0.2, 0], ...syllables, [0.4, 0]]));
  assert.equal(seq.at(-1), 'X');
  assert.ok(changesPerSecond(seq) >= 4 && changesPerSecond(seq) <= 9, `${seq} ${changesPerSecond(seq).toFixed(1)}`);
});

test('a sentence that is all one loudness still opens (each sentence scales itself)', () => {
  assert.match(flap(sound([[0.6, 0.05]])), /O/);
});

test('an open mouth on o, oo or w is drawn round; on ee or i wide, only for a rig that has the wide mouth', () => {
  const s = sound([[1.2, 0.5]], spelt('a moo meet', 0.1));   // oo at 0.4-0.6 s, ee at 0.8-1.0 s
  assert.equal(mouthAt(s, 0.45 - LEAD), 'U');
  assert.equal(mouthAt(s, 0.85 - LEAD, true), 'E');
  assert.equal(mouthAt(s, 0.85 - LEAD), 'O');   // no wide drawing: plain open
  assert.equal(mouthAt(s, 0.3 - LEAD), 'X');   // the m of "moo" still shuts the lips
});

test('vowels read sounds, not single letters: the u of Juno is round, of but is not; a silent final e is not wide', () => {
  const kinds = (word) => vowels(spelt(word)).map((v) => v[2]).join('');
  assert.equal(kinds('juno'), 'UU');
  assert.equal(kinds('but'), '');
  assert.equal(kinds('make'), '');
  assert.equal(kinds('see'), 'E');
  assert.equal(kinds('you'), 'U');
});
