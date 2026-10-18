// The anime lip flap, from the voice itself. The mouth for each drawing (12 a second) is the loudness of the next
// 83 ms of speech, taken a little ahead of it: loud opens it, medium half-opens it, quiet or a dip between syllables
// closes it, and so do m, b and p, from ElevenLabs' character timings (notes/talking-characters.md, section 5).
// On a real reply, mouths from the letters alone matched the voice's loudness in only 50-71% of drawings.
//   sound = { pcm: Float32Array at 24 kHz from the sentence's start, ref: loudness(pcm), shut: closures(timings) }
//   mouthAt(sound, t) -> 'X' closed | 'M' half | 'O' open, for the drawing shown from sentence time t (s)
export const TICK = 1 / 12, LEAD = 0.05;
export const MOUTH = { X: 'closed', M: 'half', O: 'open' };
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

// When the lips are shut, as [from, to] seconds: m, b and p (not the b of "lamb", not the p of "ph").
export function closures({ chars = [], starts = [], ends = [] }) {
  const at = (i) => (chars[i] || ' ').toLowerCase(), out = [];
  for (let i = 0; i < Math.min(chars.length, starts.length, ends.length); i++) {
    const c = at(i);
    if (!/[mbp]/.test(c) || (c === 'b' && at(i - 1) === 'm' && !/\p{L}/u.test(at(i + 1))) || (c === 'p' && at(i + 1) === 'h')) continue;
    out.push([starts[i], ends[i]]);
  }
  return out;
}

export function mouthAt({ pcm, ref, shut }, t) {
  const from = t + LEAD, to = from + TICK;
  if (shut.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(to, b) - Math.max(from, a)), 0) >= 0.25 * TICK) return 'X';
  const level = (s) => (ref ? rms(pcm, s, s + TICK) / ref : 0), now = level(from);
  if (now < QUIET || (now < DIP && now < DROP * level(from - TICK) && now < DROP * level(from + TICK))) return 'X';
  return now >= LOUD ? 'O' : 'M';
}

// The whole sentence, one letter per drawing, for tests and videos (the page asks mouthAt every frame).
export function flap(sound) {
  let out = '';
  for (let k = 0; k * TICK <= sound.pcm.length / RATE; k++) out += mouthAt(sound, k * TICK);
  return out || 'X';
}
