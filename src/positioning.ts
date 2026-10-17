import type { LatLng } from './geo';

const M_PER_DEG_LAT = 111320;
const DEG = Math.PI / 180;
/** An average walking stride. GPS corrects it over time for longer or shorter legs. */
const STRIDE_M = 0.7;
/** How far off one step can be, in stride length and direction (variance, m²). */
const STEP_VARIANCE = 0.3 ** 2;
/** Movement the step counter can miss, per second (variance, m²/s). */
const DRIFT_PER_S = 0.08;
/** Phones report GPS accuracy as the radius holding the true spot 68% of the time: about 1.5 σ. */
const RADIUS_PER_SIGMA = 1.5;
/** Beyond this, a GPS fix disagrees with us more than both errors explain (χ², 2 axes, 99.9%). */
const GATE = 13.8;
/** GPS says you're moving at least this fast (m/s, a slow walk) but no step was counted lately. */
const MOVING_M_S = 0.8;
const NO_STEPS_MS = 2000;

export type GpsReading = { lat: number; lng: number; accuracy: number | null; speed: number | null };

/**
 * Smooths GPS with your steps: a small Kalman filter on metres east and north of where you
 * started. Standing still, GPS jitter averages out instead of moving you; walking, each step
 * moves you straight away and GPS keeps the steps honest. Times are in milliseconds.
 */
export class PositionFilter {
  private origin: LatLng | null = null;
  private east = 0;
  private north = 0;
  private variance = 0;
  private time = 0;
  private lastGps = 0;
  private lastStep = -Infinity;
  private rejected = 0;

  gps(r: GpsReading, now: number) {
    const sigma = Math.max(r.accuracy ?? 25, 2.5) / RADIUS_PER_SIGMA;
    const noise = sigma * sigma;
    if (!this.origin) {
      this.origin = { lat: r.lat, lng: r.lng };
      this.east = this.north = 0;
      this.variance = noise;
      this.time = this.lastGps = now;
      return;
    }
    this.advance(now);
    // Moving with no steps counted (a bus, an auto, or steps the counter missed): let GPS lead.
    const speed = r.speed ?? 0;
    if (speed > MOVING_M_S && now - this.lastStep > NO_STEPS_MS) this.variance += (speed * (now - this.lastGps)) ** 2 / 1e6;
    this.lastGps = now;

    const [e, n] = this.toLocal(r);
    const de = e - this.east;
    const dn = n - this.north;
    const total = this.variance + noise;
    if ((de * de + dn * dn) / total > GATE) {
      // One wild fix is ignored. Three in a row mean we're the ones who are wrong: start over from GPS.
      if (++this.rejected < 3) return;
      this.east = e;
      this.north = n;
      this.variance = noise;
      this.rejected = 0;
      return;
    }
    this.rejected = 0;
    const gain = this.variance / total;
    this.east += gain * de;
    this.north += gain * dn;
    this.variance *= 1 - gain;
    if (Math.hypot(this.east, this.north) > 2000) this.rebase();
  }

  /** One step in the direction you face (degrees). False until GPS has given a first fix. */
  step(facing: number, now: number): boolean {
    if (!this.origin) return false;
    this.advance(now);
    this.east += STRIDE_M * Math.sin(facing * DEG);
    this.north += STRIDE_M * Math.cos(facing * DEG);
    this.variance += STEP_VARIANCE;
    this.lastStep = now;
    return true;
  }

  position(): LatLng | null {
    const o = this.origin;
    if (!o) return null;
    return {
      lat: o.lat + this.north / M_PER_DEG_LAT,
      lng: o.lng + this.east / (M_PER_DEG_LAT * Math.cos(o.lat * DEG)),
    };
  }

  /** The filter's own 68% radius (m). It trusts GPS errors to be random, so it's optimistic indoors. */
  uncertainty(): number {
    return RADIUS_PER_SIGMA * Math.sqrt(this.variance);
  }

  private advance(now: number) {
    this.variance += (DRIFT_PER_S * Math.max(0, now - this.time)) / 1000;
    this.time = Math.max(this.time, now);
  }

  private toLocal(p: LatLng): [number, number] {
    const o = this.origin!;
    return [(p.lng - o.lng) * M_PER_DEG_LAT * Math.cos(o.lat * DEG), (p.lat - o.lat) * M_PER_DEG_LAT];
  }

  /** Flat east/north maths drifts far from the origin, so move the origin to where we are. */
  private rebase() {
    this.origin = this.position();
    this.east = this.north = 0;
  }
}
