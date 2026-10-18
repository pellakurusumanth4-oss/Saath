import type { LatLng } from './geo';

/** The friends with an approved 2D anime rig (src/rigs.ts) and portrait (src/faces.ts). */
export type Character = 'doraemon' | 'nobita' | 'shinchan' | 'goku' | 'michael' | 'dwight' | 'holt';

/** A friend at one exact real spot (lat/lng). In the app, src/placement.ts picks it and moves it every hour. */
export type Friend = LatLng & {
  id: string;
  name: string;
  character: Character;
  /** Their main colour from the official art, for the ring round their map marker. */
  color: string;
  /** Height in metres, used to size them in the camera view. */
  height: number;
  /** Where they stand, in words: a landmark's name on the website; in the app, which of your places they're near. */
  place: string;
  /** Rumour shown before you've met them. */
  hint: string;
};

/** A friend plus where they are relative to you. Distance is Infinity until GPS has a fix. */
export type LiveFriend = Friend & { distance: number; bearing: number; met: boolean };

// The website (site/) shows the four at these fixed spots; the app places everyone itself (HOME_CAST and OFFICE_CAST
// below, src/placement.ts). Spots come from OpenStreetMap (© OpenStreetMap contributors): open, public ground right
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

/** Who a friend is, without where: src/placement.ts stands them, and moves them every hour. */
export type Cast = Omit<Friend, 'lat' | 'lng' | 'place'>;

/** One of the four as FRIENDS draws them, without their landmark, with a hint that fits anywhere. */
function look(id: Character, hint: string): Cast {
  const { lat, lng, place, ...who } = FRIENDS.find((f) => f.id === id)!;
  return { ...who, hint };
}

/** Round your home, nearest first. The first stands a few steps from you instead, wherever you are. */
export const HOME_CAST: Cast[] = [
  look('nobita', 'Someone sleepy was seen napping a few steps away'),
  look('doraemon', 'Someone round and blue was seen looking for dorayaki'),
  look('shinchan', 'Someone cheeky was seen dancing about'),
  look('goku', 'Someone in orange was seen training hard'),
];

/** Round your office, nearest first. */
export const OFFICE_CAST: Cast[] = [
  { id: 'michael', name: 'Michael', character: 'michael', color: '#3F3A63', height: 1.75, hint: 'Someone with a big mug was practising a welcome speech' },
  { id: 'dwight', name: 'Dwight', character: 'dwight', color: '#C8962E', height: 1.87, hint: 'Someone in glasses was seen guarding a beet' },
  { id: 'holt', name: 'Captain Holt', character: 'holt', color: '#262A3E', height: 1.83, hint: 'Someone very punctual was seen checking the time' },
];

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
