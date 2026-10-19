// A walking route from OpenStreetMap's public foot router, or a straight line when it can't answer.
import { distanceM, type LatLng } from '../../src/geo';

export type Turn = 'straight' | 'left' | 'right' | 'slightLeft' | 'slightRight' | 'uturn' | 'arrive';
export type Step = { turn: Turn; text: string; metres: number; start: number };
export type Route = { line: LatLng[]; metres: number; seconds: number; steps: Step[]; straight: boolean };

const TURNS: Record<string, Turn> = { left: 'left', 'sharp left': 'left', right: 'right', 'sharp right': 'right', 'slight left': 'slightLeft', 'slight right': 'slightRight', uturn: 'uturn' };
export const SAY: Record<Turn, string> = { straight: 'Continue', left: 'Turn left', right: 'Turn right', slightLeft: 'Bear left', slightRight: 'Bear right', uturn: 'Turn around', arrive: '' };
/** The icon for each turn (ui.tsx). */
export const ICON: Record<Turn, string> = { straight: 'north', left: 'turnLeft', right: 'turnRight', slightLeft: 'slightLeft', slightRight: 'slightRight', uturn: 'uturn', arrive: 'check' };
/** "150 m", "1.2 km". */
export const distanceText = (metres: number) => (metres < 995 ? `${Math.max(10, Math.round(metres / 10) * 10)} m` : `${(metres / 1000).toFixed(1)} km`);
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

type OsrmStep = { name: string; distance: number; maneuver: { type: string; modifier?: string; bearing_after: number } };

function stepOf(s: OsrmStep, shopName: string): Omit<Step, 'start'> {
  const on = s.name ? ` on ${s.name}` : '';
  if (s.maneuver.type === 'depart') return { turn: 'straight', text: `Head ${COMPASS[Math.round(s.maneuver.bearing_after / 45) % 8]}${on}`, metres: s.distance };
  if (s.maneuver.type === 'arrive') {
    const side = s.maneuver.modifier?.includes('left') ? 'on your left' : s.maneuver.modifier?.includes('right') ? 'on your right' : 'ahead';
    return { turn: 'arrive', text: `${shopName} is ${side}`, metres: 0 };
  }
  const turn = TURNS[s.maneuver.modifier ?? ''] ?? 'straight';
  return { turn, text: `${SAY[turn]}${turn === 'straight' ? on : s.name ? ` onto ${s.name}` : ''}`, metres: s.distance };
}

export async function walkingRoute(from: LatLng, to: LatLng, shopName: string): Promise<Route> {
  try {
    const url = `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
    const data = await (await fetch(url, { signal: AbortSignal.timeout(6000) })).json();
    const route = data.routes?.[0];
    if (data.code !== 'Ok' || !route) throw new Error('no route');
    let start = 0;
    const steps = (route.legs[0].steps as OsrmStep[]).map((s) => {
      const step = { ...stepOf(s, shopName), start };
      start += s.distance;
      return step;
    }).filter((s) => s.metres > 0 || s.turn === 'arrive');
    const line = (route.geometry.coordinates as [number, number][]).map(([lng, lat]) => ({ lat, lng }));
    return { line, metres: route.distance, seconds: route.duration, steps, straight: false };
  } catch {
    const metres = distanceM(from, to);
    return { line: [from, to], metres, seconds: metres / 1.25, steps: [], straight: true };
  }
}
