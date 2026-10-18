// Where friends stand (src/placement.ts): rings round a place, the 5 km bound, the same spots all hour, new spots the
// next hour, and the near friend 5 to 10 m from you. Made-up points only, never anyone's real places.
// Run: node --test src/placement.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { angleDiff, bearingDeg, distanceM } from './geo.ts';

// The app's files import each other without extensions, as Metro allows; node needs the .ts.
registerHooks({ resolve: (spec, ctx, next) => next(/^\.\.?\//.test(spec) && !/\.\w+$/.test(spec) ? spec + '.ts' : spec, ctx) });
const { NEAR_M, RINGS, destination, hourIndex, nearSpot, placeFriends, spotIn } = await import('./placement.ts');
const { HOME_CAST, OFFICE_CAST } = await import('./friends.ts');

const POINTS = {
  equator: { lat: 0.5, lng: 10 },
  mid: { lat: 45, lng: 7 },
  'high latitude': { lat: 69.5, lng: 19 },
  south: { lat: -33.5, lng: 151 },
  antimeridian: { lat: -17, lng: 179.999 },
};
const HOUR = hourIndex(Date.UTC(2026, 9, 18, 18));
// The website's fixed landmarks: no app friend's words may still point at one.
const LANDMARKS = /Pune|Wada|Sarasbaug|Parvati|Bakery|temple|gate|hill/i;

test('the hour turns exactly on the hour', () => {
  assert.equal(hourIndex(5 * 3_600_000), 5);
  assert.equal(hourIndex(5 * 3_600_000 - 1), 4);
  assert.equal(hourIndex(5 * 3_600_000 + 3_599_999), 5);
});

test('destination lands at that distance and bearing, as distanceM measures it, at any latitude', () => {
  for (const [name, from] of Object.entries(POINTS)) {
    for (const m of [5, 10, 500, 2000, 5000]) {
      for (const b of [0, 37, 90, 143, 180, 251, 359.5]) {
        const to = destination(from, m, b);
        assert.ok(Math.abs(distanceM(from, to) - m) < 1e-6, `${name}: ${m} m at ${b}° reads ${distanceM(from, to)} m`);
        assert.ok(Math.abs(angleDiff(bearingDeg(from, to), b)) < 1e-6, `${name}: bearing ${b}° reads ${bearingDeg(from, to)}°`);
        assert.ok(to.lng >= -180 && to.lng <= 180 && Math.abs(to.lat) <= 90, `${name}: ${to.lat}, ${to.lng}`);
      }
    }
  }
});

test('each ring holds its spots, all within 5 km, for hours on end', () => {
  for (const [name, at] of Object.entries(POINTS)) {
    for (const ring of RINGS) {
      for (let h = HOUR; h < HOUR + 200; h++) {
        const d = distanceM(at, spotIn(at, ring, `goku@${h}`));
        assert.ok(d >= ring[0] - 1e-6 && d <= ring[1] + 1e-6, `${name}: ${d} m is outside ${ring}`);
        assert.ok(d <= 5000 + 1e-6);
      }
    }
  }
});

test('the same key gives the same spot (a restart within the hour), the next hour a new one', () => {
  const at = POINTS.mid;
  for (const ring of RINGS) {
    for (let h = HOUR; h < HOUR + 200; h++) {
      assert.deepEqual(spotIn(at, ring, `doraemon@${h}`), spotIn({ ...at }, [...ring], `doraemon@${h}`));
      assert.notDeepEqual(spotIn(at, ring, `doraemon@${h}`), spotIn(at, ring, `doraemon@${h + 1}`));
    }
  }
});

test('spots spread out: every direction, distances across the whole ring, and no spiral', () => {
  const at = POINTS.equator, ring = RINGS[1];
  const quadrants = new Set(), ds = [], bs = [];
  for (let h = HOUR; h < HOUR + 400; h++) {
    const to = spotIn(at, ring, `shinchan@${h}`);
    quadrants.add(Math.floor(bearingDeg(at, to) / 90));
    ds.push(distanceM(at, to));
    bs.push(bearingDeg(at, to));
  }
  assert.equal(quadrants.size, 4);
  const mean = (xs) => xs.reduce((a, b) => a + b) / xs.length;
  assert.ok(Math.abs(mean(ds) - (ring[0] + ring[1]) / 2) < 0.1 * (ring[1] - ring[0]), `mean ${mean(ds)} m`);
  assert.ok(Math.min(...ds) < ring[0] + 150 && Math.max(...ds) > ring[1] - 150, `${Math.min(...ds)}..${Math.max(...ds)} m`);
  // Distance and direction must be separate draws, or near spots all lie one way and far ones another.
  const [md, mb] = [mean(ds), mean(bs)];
  const r = mean(ds.map((d, i) => (d - md) * (bs[i] - mb))) / Math.sqrt(mean(ds.map((d) => (d - md) ** 2)) * mean(bs.map((b) => (b - mb) ** 2)));
  assert.ok(Math.abs(r) < 0.2, `distance and bearing go together: r = ${r}`);
});

test('the near friend stands 5 to 10 m from you, anywhere', () => {
  assert.deepEqual([...NEAR_M], [5, 10]);
  for (const [name, you] of Object.entries(POINTS)) {
    for (let i = 0; i < 2000; i++) {
      const d = distanceM(you, nearSpot(you));
      assert.ok(d >= 5 - 1e-9 && d <= 10 + 1e-9, `${name}: ${d} m`);
    }
  }
});

test('each set of friends shows once its place is set, the near one once you have a good fix, none at a landmark', () => {
  const home = POINTS.mid, office = destination(POINTS.mid, 30_000, 90), near = nearSpot(POINTS.mid);
  const ids = (places, n) => placeFriends(places, n, HOUR).map((f) => f.id);
  assert.deepEqual(ids({}, null), []);
  assert.deepEqual(ids({}, near), ['nobita']);
  assert.deepEqual(ids({ home }, near), ['nobita', 'doraemon', 'shinchan', 'goku']);
  assert.deepEqual(ids({ office }, null), ['michael', 'dwight', 'holt']);
  assert.deepEqual(ids({ home, office }, near), ['nobita', 'doraemon', 'shinchan', 'goku', 'michael', 'dwight', 'holt']);
  for (const f of placeFriends({ home, office }, near, HOUR)) assert.doesNotMatch(f.place + ' ' + f.hint, LANDMARKS);
});

test('home friends stand in their rings round home and office friends round the office; on the hour they move, the near one stays', () => {
  for (const [name, home] of Object.entries(POINTS)) {
    const office = destination(home, 30_000, 200), near = nearSpot(home);
    const now = placeFriends({ home, office }, near, HOUR), later = placeFriends({ home, office }, near, HOUR + 1);
    assert.deepEqual(placeFriends({ home: { ...home }, office: { ...office } }, { ...near }, HOUR), now, `${name}: a restart within the hour`);
    assert.deepEqual(later.map((f) => f.id), now.map((f) => f.id), `${name}: the same ids every hour`);
    for (const [i, f] of now.entries()) {
      const spot = { lat: f.lat, lng: f.lng };
      if (f.id === HOME_CAST[0].id) {
        assert.deepEqual(spot, near);
        assert.deepEqual(later[i], f, `${name}: the near friend stays put`);
        assert.equal(f.place, 'a few steps from you');
        continue;
      }
      const k = HOME_CAST.findIndex((c) => c.id === f.id);
      const [at, ring, place] = k > 0 ? [home, RINGS[k - 1], 'around your home'] : [office, RINGS[OFFICE_CAST.findIndex((c) => c.id === f.id)], 'around your office'];
      const d = distanceM(at, f);
      assert.ok(d >= ring[0] - 1e-6 && d <= ring[1] + 1e-6 && d <= 5000 + 1e-6, `${name}: ${f.id} at ${d} m, ring ${ring}`);
      assert.equal(f.place, place);
      assert.notDeepEqual({ lat: later[i].lat, lng: later[i].lng }, spot, `${name}: ${f.id} moves on the hour`);
    }
  }
});

test('in the same hour, a friend stands at a different offset round a different home', () => {
  const [a, b] = [POINTS.mid, destination(POINTS.mid, 50_000, 45)];
  const offset = (home) => {
    const f = placeFriends({ home }, null, HOUR).find((x) => x.id === 'doraemon');
    return [Math.round(distanceM(home, f)), Math.round(bearingDeg(home, f))];
  };
  assert.notDeepEqual(offset(a), offset(b));
});
