// Demo shops come to you: a visitor with no shop within 5 km (a judge anywhere in the world) gets the demo shops placed
// on the streets around them. Only copies move (lat/lng, and the billboard with its shop); id, slug, menu, ad and story
// stay, so talk, AR, the counter code and reviews work as they are (talk and AR say the copy's street, not the area).
// Worked out in this browser and kept in memory only: no position is stored, and the only call is one to the public
// router the walks already use, with the made-up spots and two alternates for each (never the visitor's own position),
// for their street points and street names.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { DEG, distanceM, EARTH_RADIUS_M, type LatLng } from '../../src/geo';
import { orderOf, type Shop, type ShopWithMenu } from './shops';

/** A shop this close counts as near: real ones rank first, and a demo shop this close stays where it is. */
export const NEAR_M = 5000;
const GAP_M = 60;      // no two shops, nor a shop and the visitor, closer than this
const KEEP_M = 1000;   // past the farthest shop (700 m): walking to one never moves them
const FLAGSHIP: [number, number] = [60, 150];
const OTHERS: [number, number] = [200, 700];
const SNAP_SLACK_M = 40;   // a street point a little outside its band beats a spot no walker can reach
const ALT_M = 50;          // a spot's two alternates: this far either way round the circle, as far from the visitor
const PER_SPOT = 3;        // a spot and its two alternates, in that order, in the one router call
const M_LAT = EARTH_RADIUS_M * DEG;   // metres per degree on distanceM's own sphere, so its checks agree
const mLng = (lat: number) => M_LAT * Math.cos(lat * DEG);

/** The ~500 m square a spot is in: the same square gives the same layout after a reload or a small move. */
export const areaOf = (spot: LatLng) => `${Math.round(spot.lat * 200)},${Math.round(spot.lng * 200)}`;
/** The layout's seed: the area's, so it is the same everywhere in that square. */
export const seedOf = (spot: LatLng) => {
  const [lat, lng] = areaOf(spot).split(',').map(Number);
  return Math.imul(lat, 73856093) ^ Math.imul(lng, 19349663);
};

/** n spots around `me`, the same for the same seed: the first 60–150 m away, the rest 200–700 m, one per slice of
 * the circle (so in different directions), none within 60 m of another or of `me`. */
export function spotsAround(me: LatLng, n: number, seed: number): LatLng[] {
  let s = seed >>> 0;
  const rand = () => {   // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const at = (deg: number, m: number) => ({
    lat: me.lat + (m * Math.cos((deg * Math.PI) / 180)) / M_LAT,
    lng: me.lng + (m * Math.sin((deg * Math.PI) / 180)) / mLng(me.lat),
  });
  const turn = rand() * 360;
  const out: LatLng[] = [];
  for (let i = 0; i < n; i += 1) {
    const [near, far] = i === 0 ? FLAGSHIP : OTHERS;
    for (let tries = 0; ; tries += 1) {
      const deg = i === 0 ? rand() * 360 : turn + ((i - 1 + 0.15 + rand() * 0.7) * 360) / (n - 1);
      const spot = at(deg, near + rand() * (far - near));
      // shortcut: gives up after 40 tries (never seen with 16 shops); more retries if hundreds of demo shops ever exist.
      if (tries >= 40 || out.every((other) => distanceM(other, spot) >= GAP_M)) { out.push(spot); break; }
    }
  }
  return out;
}

/** Where a shop's copy stands, and the name of its street there ('' for an unnamed way or an unsnapped spot). */
export type Spot = LatLng & { street: string };

/** Each spot and its two alternates (PER_SPOT a spot, in order): ALT_M either way round the circle, as far from `me`,
 * so the same band. Where the spot's own street point is an unnamed service way at a building's edge, an alternate's
 * may be a named street. */
export function candidatesOf(me: LatLng, raw: LatLng[]): LatLng[] {
  return raw.flatMap((spot) => {
    const north = (spot.lat - me.lat) * M_LAT, east = (spot.lng - me.lng) * mLng(me.lat);
    const turn = ALT_M / Math.hypot(north, east);
    return [spot, ...[turn, -turn].map((a) => ({
      lat: me.lat + (north * Math.cos(a) - east * Math.sin(a)) / M_LAT,
      lng: me.lng + (east * Math.cos(a) + north * Math.sin(a)) / mLng(me.lat),
    }))];
  });
}

/** Each spot moved onto the street point of one of its candidates (candidatesOf's order; null where the router can't
 * say) that keeps the rules above: the first on a named street, else the first at all, else the spot stays unsnapped. */
const BRIDGE = /br(?:ü|ue)cke|bridge|\bpont\b|\bpuente\b|\bponte\b|橋/i;

export function settle(me: LatLng, raw: LatLng[], snapped: (Spot | null)[], stay: LatLng[] = []): Spot[] {
  const out: Spot[] = [];
  raw.forEach((spot, i) => {
    const [near, far] = i === 0 ? FLAGSHIP : OTHERS;
    const fits = snapped.slice(i * PER_SPOT, (i + 1) * PER_SPOT).filter((point): point is Spot => {
      const away = point ? distanceM(me, point) : -1;
      return !!point && away >= Math.max(GAP_M, near - SNAP_SLACK_M) && away <= far + SNAP_SLACK_M
        && raw.every((other, j) => j === i || distanceM(other, point) >= GAP_M)
        && out.every((other) => distanceM(other, point) >= GAP_M) && stay.every((other) => distanceM(other, point) >= GAP_M);
    });
    // A door on a bridge looks odd: a named street that isn't one first.
    out.push(fits.find((point) => point.street && !BRIDGE.test(point.street)) ?? fits.find((point) => point.street) ?? fits[0] ?? { ...spot, street: '' });
  });
  return out;
}

/** Each spot's nearest street point and its street's name, null where the router can't say. One table call to the
 * router the walks use (its fair use is about a request a second, so not one call per shop), which snaps every spot
 * even where a pair can't be routed; sources=0 keeps it one row however many spots. The car profile, because its ways
 * are streets: the foot one also snaps to platforms and corridors indoors. */
async function streetPoints(spots: LatLng[]): Promise<(Spot | null)[]> {
  try {
    const path = spots.map((spot) => `${spot.lng},${spot.lat}`).join(';');
    const url = `https://routing.openstreetmap.de/routed-car/table/v1/driving/${path}?sources=0`;
    const data = await (await fetch(url, { signal: AbortSignal.timeout(8000) })).json();
    if (data.code !== 'Ok') throw new Error(data.code);
    return spots.map((_, i) => {
      const { location, name } = data.destinations?.[i] ?? {};
      const [lng, lat] = location ?? [];
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, street: typeof name === 'string' ? name.replace(/\s*[(（][^)）]*[)）]\s*$/, '').trim() : '' } : null;
    });
  } catch {
    return spots.map(() => null);
  }
}

type Placement = { ids: string; origin: LatLng; spots: Map<string, Spot>; snapped: boolean };
const memo = new Map<string, Placement>();   // by area and demo shops; in memory only, gone with the tab
let now: Placement | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const set = (next: Placement | null) => { if (next !== now) { now = next; listeners.forEach((fn) => fn()); } };

function place(me: LatLng, demo: ShopWithMenu[], ids: string, stay: LatLng[]) {
  const key = `${areaOf(me)}|${ids}`;
  const known = memo.get(key);
  if (known) return set(known);
  // The flagship (the biggest walk-in saving) goes nearest; the rest by slug, so a price change doesn't reshuffle them.
  const saving = (shop: ShopWithMenu) => orderOf(shop, shop.menu)?.saving ?? 0;
  const flagship = demo.reduce((best, shop) => (saving(shop) > saving(best) ? shop : best));
  const order = [flagship, ...demo.filter((shop) => shop !== flagship).sort((a, b) => a.slug.localeCompare(b.slug))];
  const raw = spotsAround(me, order.length, seedOf(me));
  const spots = (list: Spot[]) => new Map(order.map((shop, i) => [shop.id, list[i]]));
  const first: Placement = { ids, origin: me, spots: spots(raw.map((spot) => ({ ...spot, street: '' }))), snapped: false };
  memo.set(key, first);
  set(first);
  void streetPoints(candidatesOf(me, raw)).then((streets) => {
    const done = { ...first, spots: spots(settle(me, raw, streets, stay)), snapped: true };
    memo.set(key, done);
    if (now === first) set(done);
  });
}

/** Where things stand for this visitor: the demo shops placed around `me`, or left where they are. */
function decide(shops: ShopWithMenu[], me: LatLng | null) {
  if (!me || !shops.length) return;   // no location yet: the demo city as it is
  const near = (shop: Shop) => distanceM(me, shop) <= NEAR_M;
  // In the demo city (one of its seeded shops, which have no owner, is near): nothing moves. Anywhere else the far demo
  // shops come; real shops, and a demo-login shop a judge made where they are, stay put, so adding one keeps the rest.
  if (shops.some((shop) => shop.demo && !shop.owner && near(shop))) return set(null);
  const demo = shops.filter((shop) => shop.demo && !near(shop));
  const ids = demo.map((shop) => shop.id).sort().join(',');
  if (now && now.ids === ids && distanceM(me, now.origin) <= KEEP_M) return;
  if (!demo.length) return set(null);
  place(me, demo, ids, shops.filter((shop) => !demo.includes(shop) && distanceM(me, shop) <= KEEP_M));   // shops that stay put keep the gap too
}

// The demo city's places, as the talk functions leave them out of a placed copy's story (supabase/functions/talk/shop.mjs;
// site/scripts/shop-loader.test.mjs keeps the two lists the same), so its page doesn't name them either.
const DEMO_PLACES = /\b(?:pune|deccan|gymkhana|shivajinagar|erandwane|swargate|kothrud|koregaon|sarasbaug|shaniwar|parvati hill|(?:fc|jm|apte|prabhat|karve|law college) road)\b/i;
// No lookbehind: Safari before 16.4 can't run one, and this runs while the map draws.
const placeless = (story: string) => story.replace(/([.!?])\s+/g, '$1\n').split('\n').filter((sentence) => !DEMO_PLACES.test(sentence)).join(' ');

/** The shop where it stands for this visitor: a demo shop placed near them is a copy marked `placed`, with its `street`. */
export function relocated<T extends Shop>(shop: T): T {
  const spot = now?.spots.get(shop.id);
  if (!spot) return shop;
  // The billboard keeps its offset from the shop in metres (a degree of longitude is shorter away from the equator).
  const board = shop.board_lat !== null && shop.board_lng !== null
    ? { board_lat: spot.lat + shop.board_lat - shop.lat, board_lng: spot.lng + ((shop.board_lng - shop.lng) * mLng(shop.lat)) / mLng(spot.lat) }
    : {};
  return { ...shop, ...spot, ...board, story: placeless(shop.story ?? ''), about: placeless(shop.about ?? ''), placed: true };
}

/** For a page that loads its own copy of a shop (ShopPage): that shop where it stands for this visitor, kept current. */
export function useRelocated<T extends Shop>(shop: T | null): T | null {
  useSyncExternalStore(subscribe, () => now);
  return shop && relocated(shop);
}

/** The map's shops for this visitor. `placing`: the street points are still coming (a route waits for them);
 * `placed`: the demo shops stand around the visitor. */
export function useDemoNearMe(shops: ShopWithMenu[], me: LatLng | null) {
  const placement = useSyncExternalStore(subscribe, () => now);
  useEffect(() => decide(shops, me), [shops, me]);
  const here = useMemo(() => (placement ? shops.map((shop) => relocated(shop)) : shops), [shops, placement]);
  return { shops: here, placing: !!placement && !placement.snapped, placed: !!placement };
}
