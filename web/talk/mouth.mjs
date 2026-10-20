// The anime lip flap, from the voice itself. The mouth for each drawing (12 a second) is the loudness of the next
// 83 ms of speech, taken a little ahead of it: loud opens it, medium half-opens it, quiet or a dip between syllables
// closes it, and so do m, b and p, from ElevenLabs' character timings (notes/talking-characters.md, section 5). An open
// mouth on an o, oo, ou or w is drawn round, and on an ee, ea or i wide (where the rig has that drawing).
// On a real reply, mouths from the letters alone matched the voice's loudness in only 50-71% of drawings.
//   sound = { pcm: Float32Array at 24 kHz from the sentence's start, ref: loudness(pcm), shut: closures(timings), vowels: vowels(timings) }
//   mouthAt(sound, t, wide?) -> 'X' closed | 'M' half | 'O' open | 'U' round | 'E' wide, for the drawing shown from sentence time t (s)
export const TICK = 1 / 12, LEAD = 0.05;
export const MOUTH = { X: 'closed', M: 'half', O: 'open', U: 'round', E: 'wide' };
const RATE = 24000, QUIET = 0.2, LOUD = 0.6, DIP = 0.55, DROP = 0.8;   // a dip: under DIP and 20% quieter than both neighbours

const rms = (pcm, from, to) => {
  const a = Math.max(0, Math.round(from * RATE)), b = Math.min(pcm.length, Math.round(to * RATE));
  let sum = 0;
  for (let i = a; i < b; i++) sum += pcm[i] * pcm[i];
  return b > a ? Math.sqrt(sum / (b - a)) : 0;
};

// The sentence's "loud": the 90th percentile of its 20 ms loudness, so each voice and sentence scales itself.
export function loudness(pcm) {
  const frames = [];
  for (let t = 0; (t + 0.02) * RATE <= pcm.length; t += 0.02) frames.push(rms(pcm, t, t + 0.02));
  frames.sort((a, b) => a - b);
  return frames[Math.floor(frames.length * 0.9)] || 0;
}

const letters = ({ chars = [], starts = [], ends = [] }) => Array.from({ length: Math.min(chars.length, starts.length, ends.length) }, (_, i) => [(chars[i] || ' ').toLowerCase(), starts[i], ends[i]]);

// When the lips are shut, as [from, to] seconds: m, b and p (not the b of "lamb", not the p of "ph").
export function closures(timings) {
  const L = letters(timings), at = (i) => L[i]?.[0] ?? ' ', out = [];
  for (let i = 0; i < L.length; i++) {
    const c = at(i);
    if (!/[mbp]/.test(c) || (c === 'b' && at(i - 1) === 'm' && !/\p{L}/u.test(at(i + 1))) || (c === 'p' && at(i + 1) === 'h')) continue;
    out.push([L[i][1], L[i][2]]);
  }
  return out;
}

// Rounded and spread vowels from the letters, as [from, to, 'U' | 'E']: round for o, oo, ou, ow, oa, oy, oi, w and a u
// that sounds "oo"; wide for ee, ea, ie, ey, ay, ai, i, an e that is not a silent final one, and a y ending a word.
const ROUND = /^(oo|ou|ow|oa|oy|oi|o|w|u)$/, WIDE = /^(ee|ea|ie|ey|ay|ai|i|e)$/;
export function vowels(timings) {
  const L = letters(timings), out = [];
  const word = (k) => /\p{L}/u.test(L[k]?.[0] ?? ' '), vowel = (k) => /[aeiouy]/.test(L[k]?.[0] ?? ' ');
  for (let i = 0; i < L.length; i++) {
    const pair = L[i][0] + (L[i + 1]?.[0] ?? ''), two = /^(oo|ou|ow|oa|oy|oi|ee|ea|ie|ey|ay|ai)$/.test(pair), s = two ? pair : L[i][0];
    const end = two ? L[i + 1][2] : L[i][2];
    // a lone u is round at a word's end, before a vowel or in an open syllable (Juno, rupees), not in but, much, just;
    // nor the u of au, eu and qu
    if (s === 'u' && ((word(i - 1) && /[aeiq]/.test(L[i - 1][0])) || (word(i + 1) && !vowel(i + 1) && !(word(i + 2) && vowel(i + 2))))) { /* not round */ }
    else if (ROUND.test(s)) out.push([L[i][1], end, 'U']);
    else if (WIDE.test(s) && !(s === 'e' && !word(i + 1))) out.push([L[i][1], end, 'E']);   // not a silent final e
    else if (s === 'y' && word(i - 1) && !word(i + 1)) out.push([L[i][1], end, 'E']);
    if (two) i++;
  }
  return out;
}

export function mouthAt({ pcm, ref, shut, vowels: V = [] }, t, wide = false) {
  const from = t + LEAD, to = from + TICK;
  const over = ([a, b]) => Math.max(0, Math.min(to, b) - Math.max(from, a));
  if (shut.reduce((sum, x) => sum + over(x), 0) >= 0.25 * TICK) return 'X';
  const level = (s) => (ref ? rms(pcm, s, s + TICK) / ref : 0), now = level(from);
  if (now < QUIET || (now < DIP && now < DROP * level(from - TICK) && now < DROP * level(from + TICK))) return 'X';
  // the vowel that fills most of this drawing's sound gives the lips their shape
  let best = null, most = 0.35 * TICK;
  for (const v of V) { const o = over(v); if (o > most && (v[2] === 'U' || wide)) { most = o; best = v[2]; } }
  return best ?? (now >= LOUD ? 'O' : 'M');
}

// The whole sentence, one letter per drawing, for tests and videos (the page asks mouthAt every frame).
export function flap(sound, wide = false) {
  let out = '';
  for (let k = 0; k * TICK <= sound.pcm.length / RATE; k++) out += mouthAt(sound, k * TICK, wide);
  return out || 'X';
}
