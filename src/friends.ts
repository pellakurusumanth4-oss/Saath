import type { LatLng } from './geo';

/** The friends with an approved 2D anime rig (src/rigs.ts) and portrait (src/faces.ts). */
export type Character = 'doraemon' | 'nobita' | 'shinchan' | 'goku' | 'michael' | 'dwight' | 'holt';

/** A friend stands still at one exact real spot (lat/lng) and never moves from it. */
export type Friend = LatLng & {
  id: string;
  name: string;
  character: Character;
  /** Their main colour from the official art, for the ring round their map marker. */
  color: string;
  /** Height in metres, used to size them in the camera view. */
  height: number;
  /** The real Pune place where they stand. */
  place: string;
  /** Rumour shown before you've met them. */
  hint: string;
  test?: boolean;
};

/** A friend plus where they are relative to you. Distance is Infinity until GPS has a fix. */
export type LiveFriend = Friend & { distance: number; bearing: number; met: boolean };

// Spots come from OpenStreetMap (© OpenStreetMap contributors): open, public ground right
// beside each landmark, so you can walk up to them.
// Tom and Jerry are left out until their rigs are built and approved.
export const FRIENDS: Friend[] = [
  {
    id: 'doraemon',
    name: 'Doraemon',
    character: 'doraemon',
    color: '#00A0E9',
    height: 1.29,
    place: 'Shaniwar Wada gate',
    hint: 'Someone round and blue was seen at the big gate',
    // 12 m out from Dilli Darwaza, the main gate.
    lat: 18.520245,
    lng: 73.855307,
  },
  {
    id: 'goku',
    name: 'Goku',
    character: 'goku',
    color: '#E96633',
    height: 1.75,
    place: 'Parvati Hill steps',
    hint: 'Someone in orange was training on the hill steps',
    // The open ground at the foot of the main Parvati Hill stairway (OSM way 212751762).
    lat: 18.49829,
    lng: 73.849545,
  },
  {
    id: 'shinchan',
    name: 'Shin-chan',
    character: 'shinchan',
    color: '#E3002C',
    height: 1.0,
    place: 'German Bakery, Koregaon Park',
    hint: 'Someone cheeky was dancing outside German Bakery',
    lat: 18.539623,
    lng: 73.887371,
  },
  {
    id: 'nobita',
    name: 'Nobita',
    character: 'nobita',
    color: '#FED23D',
    height: 1.4,
    place: 'Sarasbaug temple',
    hint: 'Someone sleepy was napping near the temple',
    // The garden just south-west of Talyatala Ganapati.
    lat: 18.50065,
    lng: 73.8529,
  },
];

// Friends with an approved rig but no public place yet: only test friends (long-press the map) can be them.
const UNPLACED: Omit<Friend, 'lat' | 'lng' | 'place' | 'hint'>[] = [
  { id: 'michael', name: 'Michael', character: 'michael', color: '#3F3A63', height: 1.75 },
  { id: 'dwight', name: 'Dwight', character: 'dwight', color: '#C8962E', height: 1.87 },
  { id: 'holt', name: 'Captain Holt', character: 'holt', color: '#262A3E', height: 1.83 },
];
const TESTABLE = [...UNPLACED, ...FRIENDS];   // the unplaced ones first: test friends are their only way in
const CHARACTERS: readonly string[] = TESTABLE.map((f) => f.character);

/** A friend you hide yourself by long-pressing the map, so you can test without crossing the city. */
export function makeTestFriend(at: LatLng, count: number): Friend {
  return asTestFriend(TESTABLE[count % TESTABLE.length].character, `test-${Date.now()}`, at);
}

function asTestFriend(character: Character, id: string, at: LatLng): Friend {
  const like = TESTABLE.find((f) => f.character === character) ?? FRIENDS[0];
  return { ...like, id, place: 'Your test spot', hint: 'The friend you hid for testing', lat: at.lat, lng: at.lng, test: true };
}

// Test friends saved before the rigs had a "look" instead; those that were Tom or Jerry become Goku.
const OLD_LOOKS: Record<string, Character> = { round: 'doraemon', kidRed: 'shinchan', kidYellow: 'nobita', mouse: 'goku', cat: 'goku' };

/** A saved test friend, brought up to date, or null if it isn't one. */
export function savedTestFriend(f: any): Friend | null {
  if (!f || typeof f.id !== 'string' || !f.id.startsWith('test-') || !Number.isFinite(f.lat) || !Number.isFinite(f.lng)) return null;
  const character: Character = CHARACTERS.includes(f.character) ? f.character : (OLD_LOOKS[f.look] ?? 'doraemon');
  return asTestFriend(character, f.id, f);
}

export type Level = 'far' | 'cold' | 'warm' | 'hot' | 'here';

export const LEVELS: Record<Level, { title: string; bars: number; buzz: string }> = {
  far: { title: 'Nobody nearby yet', bars: 0, buzz: 'Walk towards a "?" on the map.' },
  cold: { title: 'All quiet here', bars: 1, buzz: 'No buzzing yet. Keep walking.' },
  warm: { title: 'Getting warmer', bars: 3, buzz: 'Slow buzz. Follow the glowing path.' },
  hot: { title: 'Very close!', bars: 4, buzz: 'Fast buzz. Look around you!' },
  here: { title: "Someone's here!", bars: 5, buzz: 'Look around you!' },
};

/** Distance to closeness level. Once "here", stay there until 35 m so GPS jitter doesn't flicker it. */
export function levelFor(distance: number, previous: Level): Level {
  if (distance <= 20 || (previous === 'here' && distance <= 35)) return 'here';
  if (distance <= 60) return 'hot';
  if (distance <= 200) return 'warm';
  if (distance <= 600) return 'cold';
  return 'far';
}
