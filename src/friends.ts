import type { LatLng } from './geo';

/** The business mascots (one per shop section) with a built 2D rig (src/rigs.ts) and portrait (src/faces.ts). */
export type Character = 'rosa' | 'kiran' | 'juno' | 'otto' | 'sunny' | 'nia' | 'mika' | 'max' | 'omar' | 'lina' | 'sana' | 'kai';

/** A friend at one exact real spot (lat/lng). In the app, src/placement.ts picks it and moves it every hour. */
export type Friend = LatLng & {
  id: string;
  name: string;
  character: Character;
  /** Their shop section's colour, for the ring round their map marker. */
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
// beside each landmark, so you can walk up to them. No real shop's name: the mascots are made up.
export const FRIENDS: Friend[] = [
  {
    id: 'juno',
    name: 'Juno',
    character: 'juno',
    color: '#7CB82F',
    height: 1.4,
    place: 'Parvati Hill steps',
    hint: 'Someone was blending fresh juice at the foot of the hill steps',
    // The open ground at the foot of the main Parvati Hill stairway (OSM way 212751762).
    lat: 18.49829,
    lng: 73.849545,
  },
  {
    id: 'sunny',
    name: 'Sunny',
    character: 'sunny',
    color: '#E8A317',
    height: 1.72,
    place: 'Shaniwar Wada gate',
    hint: 'Something hot and crispy was frying by the big gate',
    // 12 m out from Dilli Darwaza, the main gate.
    lat: 18.520245,
    lng: 73.855307,
  },
  {
    id: 'kiran',
    name: 'Kiran',
    character: 'kiran',
    color: '#14897C',
    height: 1.72,
    place: 'Koregaon Park',
    hint: 'Someone was pouring hot chai in Koregaon Park',
    lat: 18.539623,
    lng: 73.887371,
  },
  {
    id: 'otto',
    name: 'Grandpa Otto',
    character: 'otto',
    color: '#8C5A3C',
    height: 1.72,
    place: 'Sarasbaug temple',
    hint: 'Someone was handing out warm sweets near the temple',
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
  look('juno', 'Someone was blending fresh juice a few steps away'),
  look('kiran', 'Someone was pouring hot chai nearby'),
  look('sunny', 'Something hot and crispy was frying nearby'),
  look('otto', 'Someone was taking fresh bread out of the oven nearby'),
];

/** Round your office, nearest first. */
export const OFFICE_CAST: Cast[] = [
  { id: 'rosa', name: 'Chef Rosa', character: 'rosa', color: '#E5533D', height: 1.72, hint: "Someone in a chef's hat was stirring today's special" },
  { id: 'kai', name: 'Kai', character: 'kai', color: '#3D5AFE', height: 1.4, hint: 'Someone was fixing a cracked phone screen' },
  { id: 'sana', name: 'Sana', character: 'sana', color: '#1AA3C2', height: 1.72, hint: 'Someone in a white coat was sorting the shelves' },
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
