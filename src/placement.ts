import { HOME_CAST, OFFICE_CAST, type Cast, type Friend } from './friends';
import { DEG, EARTH_RADIUS_M, type LatLng } from './geo';

// Friends stand round the home and office you set, one in each ring, and move every hour. Their spots are worked
// out, never saved: the same place and hour always give the same spots, so a restart within the hour shows the same
// ones and on the hour they all move. Tests: node --test src/placement.test.mjs
// shortcut: plain random spots can land in water or on private ground; snap them to paths (OpenStreetMap) to fix.

/** Rings round your home or office, in metres: one friend in each, at a random distance and direction. */
export const RINGS = [[10, 500], [500, 2000], [2000, 5000]] as const;
/** The near friend stands this far from you instead, wherever you are, and stays there. */
export const NEAR_M = [5, 10] as const;

/** Which hour it is: friends move to new spots when it changes. */
export const hourIndex = (now = Date.now()) => Math.floor(now / 3600000);

/** The point `m` metres from `from`, `bearing` degrees clockwise from north, on the sphere distanceM measures. */
export function destination(from: LatLng, m: number, bearing: number): LatLng {
  const d = m / EARTH_RADIUS_M, b = bearing * DEG, lat1 = from.lat * DEG;
  const lat = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng = from.lng + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat)) / DEG;
  return { lat: lat / DEG, lng: ((lng + 540) % 360) - 180 };
}

/** A number in [0, 1) that only `key` decides: FNV-1a, then MurmurHash3's finaliser to spread it. */
function unit(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

/** A spot in the ring [inner, outer] metres round `at`. The same key always gives the same spot. */
export function spotIn(at: LatLng, [inner, outer]: readonly [number, number], key: string): LatLng {
  return destination(at, inner + unit(key + '/m') * (outer - inner), unit(key + '/b') * 360);
}

/** Where the near friend stands: a random spot 5 to 10 m from you. */
export const nearSpot = (you: LatLng): LatLng =>
  destination(you, NEAR_M[0] + Math.random() * (NEAR_M[1] - NEAR_M[0]), Math.random() * 360);

/** The home and office you set, kept on this phone only (App.tsx). */
export type Places = { home?: LatLng; office?: LatLng };

/**
 * Everyone, where they stand this hour: the first home friend at `near` (a nearSpot from your first good GPS reading),
 * the other home friends in RINGS round your home and the office friends round your office, once those are set.
 */
export function placeFriends({ home, office }: Places, near: LatLng | null, hour: number): Friend[] {
  // The place is in the key as well as the hour, so nobody can work out a home from a friend's spot and the time.
  const around = (at: LatLng | undefined, cast: Cast[], place: string): Friend[] =>
    at ? cast.map((f, i) => ({ ...f, place, ...spotIn(at, RINGS[i], `${f.id}@${hour}@${at.lat},${at.lng}`) })) : [];
  const [first, ...rest] = HOME_CAST;
  return [
    ...(near ? [{ ...first, place: 'a few steps from you', ...near }] : []),
    ...around(home, rest, 'around your home'),
    ...around(office, OFFICE_CAST, 'around your office'),
  ];
}
