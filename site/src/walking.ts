import type { LatLng } from '../../src/geo';
/** Where p is along the line: metres from the start, metres off the line, and the nearest point on it. */
export function snap(line: LatLng[], p: LatLng) {
  const kx = 111320 * Math.cos((p.lat * Math.PI) / 180), ky = 110540;
  let best = { along: 0, off: Infinity, at: line[0] };
  let run = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const ax = (a.lng - p.lng) * kx, ay = (a.lat - p.lat) * ky, dx = (b.lng - a.lng) * kx, dy = (b.lat - a.lat) * ky;
    const len2 = dx * dx + dy * dy, len = Math.sqrt(len2);
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const off = Math.hypot(ax + t * dx, ay + t * dy);
    if (off < best.off) best = { along: run + t * len, off, at: { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) } };
    run += len;
  }
  return { ...best, total: run };
}
/** The line cut at `at` (a point from snap): the part walked and the part left. */
export function split(line: LatLng[], along: number, at: LatLng) {
  const kx = 111320 * Math.cos((at.lat * Math.PI) / 180), ky = 110540;
  const done: LatLng[] = [line[0]];
  let run = 0, i = 1;
  for (; i < line.length; i++) {
    const len = Math.hypot((line[i].lng - line[i - 1].lng) * kx, (line[i].lat - line[i - 1].lat) * ky);
    if (run + len > along) break;
    run += len;
    done.push(line[i]);
  }
  return { done: [...done, at], left: [at, ...line.slice(i)] };
}
let lock: { release: () => Promise<void> } | null = null;
/** Keep the screen on while walking (Chrome; Safari 16.4+). Call again when the tab comes back. */
export async function keepAwake(on: boolean) {
  try {
    if (!on) { await lock?.release(); lock = null; return false; }
    lock = await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null;
    return !!lock;
  } catch { return false; }
}
let audio: AudioContext | null = null;
/** Call inside the "Start walking" tap, so the chime may play later on iPhone. */
export function unlockSound() {
  try { audio ??= new AudioContext(); void audio.resume(); } catch { audio = null; }
}
/** A buzz on Android, a soft two-note chime where phones can't buzz (iPhone); says which it did. */
export function nudge(): 'buzz' | 'chime' | null {
  if (navigator.vibrate?.([120, 80, 120])) return 'buzz';
  if (!audio) return null;
  [880, 1320].forEach((hz, i) => {
    const o = audio!.createOscillator(), g = audio!.createGain(), t = audio!.currentTime + i * 0.16;
    o.frequency.value = hz;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(audio!.destination);
    o.start(t);
    o.stop(t + 0.15);
  });
  return 'chime';
}
