// Where the phone points, and when you take a step: pure maths, no React and no sensors.
// sensors.ts feeds it live readings; it also runs in plain Node for testing.
//
// Frames: the phone's axes are Android's (x to the right, y up the screen, z out of the screen,
// so the back camera looks along −z). The world is east, north, up. `q` turns phone vectors
// into world vectors.

type Vec = [number, number, number];
type Quat = [number, number, number, number]; // w, x, y, z
type Mat = [Vec, Vec, Vec]; // rows

const DEG = Math.PI / 180;
/** Earth's magnetic field in Pune (WMM): about 42 µT, dipping 25.5° below horizontal, 0.6° west of true north. */
const FIELD_UT = 42;
const DIP_DEG = 25.5;
const DECLINATION_DEG = -0.6;

const ZERO: Vec = [0, 0, 0];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (v: Vec) => Math.hypot(v[0], v[1], v[2]);
const scale = (v: Vec, k: number): Vec => [v[0] * k, v[1] * k, v[2] * k];
const wrap = (rad: number) => Math.atan2(Math.sin(rad), Math.cos(rad));
/** Compass bearing of a world vector's horizontal part, degrees clockwise from north. */
const bearing = (v: Vec) => (Math.atan2(v[0], v[1]) / DEG + 360) % 360;

function multiply(a: Quat, b: Quat): Quat {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

function normalize(q: Quat): Quat {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** The rotation by |v| radians about the axis v. */
function rotation(v: Vec): Quat {
  const angle = length(v);
  if (angle < 1e-9) return normalize([1, v[0] / 2, v[1] / 2, v[2] / 2]);
  const s = Math.sin(angle / 2) / angle;
  return [Math.cos(angle / 2), v[0] * s, v[1] * s, v[2] * s];
}

function toMatrix(q: Quat): Mat {
  const [w, x, y, z] = q;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ];
}

function fromMatrix(m: Mat): Quat {
  const [[m00, m01, m02], [m10, m11, m12], [m20, m21, m22]] = m;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return normalize([s / 4, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s]);
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return normalize([(m21 - m12) / s, s / 4, (m01 + m10) / s, (m02 + m20) / s]);
  }
  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return normalize([(m02 - m20) / s, (m01 + m10) / s, s / 4, (m12 + m21) / s]);
  }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return normalize([(m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, s / 4]);
}

const apply = (m: Mat, v: Vec): Vec => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
/** A field this far from Earth's is being bent by something nearby, so its direction can't be trusted. */
const bent = (field: number, dip: number) => Math.abs(field - FIELD_UT) > 12 || Math.abs(dip - DIP_DEG) > 18;

/**
 * Orientation from gravity and the magnetic field alone: jittery, but it never drifts.
 * Android's accelerometer reads +1 g along the axis pointing up, so it gives "up";
 * field × up = east; up × east = north.
 */
function absolute(acc: Vec, mag: Vec): Quat | null {
  const g = length(acc);
  if (g < 0.1) return null;
  const up = scale(acc, 1 / g);
  const eastRaw = cross(mag, up);
  const e = length(eastRaw);
  if (e < 1) return null; // no usable field (µT)
  const east = scale(eastRaw, 1 / e);
  const north = cross(up, east);
  // That gives magnetic north; turn the world about the vertical so y is true north.
  return multiply(rotation([0, 0, -DECLINATION_DEG * DEG]), fromMatrix([east, north, up]));
}

export type Orientation = {
  /** Compass direction the back camera faces, degrees clockwise from true north. */
  heading: number;
  /** Camera tilt above (+) or below (−) the horizon, degrees. */
  elevation: number;
  /** Clockwise sideways tilt of the phone, degrees. */
  roll: number;
  /** The way you face: the phone's top edge when it lies flat, the camera when it's upright. */
  facing: number;
  /** False while something magnetic nearby (metal, cars, speakers) bends the compass. */
  compassOk: boolean;
  /** Field strength (µT) and its dip below horizontal (°), for the debug view. */
  field: number;
  dip: number;
};

/**
 * Fuses the gyroscope (smooth and instant, but drifts) with gravity and the compass (steady,
 * but jittery and slow) — a complementary filter. Times are in seconds.
 */
export class OrientationFilter {
  private q: Quat | null = null;
  private acc: Vec | null = null;
  private mag: Vec | null = null;
  private rateAt = -Infinity;
  private spinPeak = 0;
  private lastAt = 0;
  private startAt = 0;
  private field = FIELD_UT;
  private dip = DIP_DEG;
  private compassOk = true;
  private flipSince: number | null = null;
  private facing = 0;
  private snapshot: Orientation | null = null;

  /** Forget the old orientation, e.g. after the sensors were off for a while. */
  reset() {
    this.q = null;
    this.snapshot = null;
    this.rateAt = -Infinity;
  }

  /** Accelerometer in g. */
  accel(x: number, y: number, z: number, t: number) {
    this.acc = [x, y, z];
    // Phones without a gyroscope run on the accelerometer's clock instead.
    if (t - this.rateAt > 0.25) this.update(t, ZERO);
  }

  /** Magnetometer in µT. */
  magnet(x: number, y: number, z: number) {
    this.mag = [x, y, z];
  }

  /** Gyroscope in rad/s, counter-clockwise positive about each axis. */
  gyro(x: number, y: number, z: number, t: number) {
    const rate: Vec = [x, y, z];
    const dt = clamp(t - this.rateAt, 0, 0.1);
    this.spinPeak = Math.max(length(rate), this.spinPeak * Math.exp(-dt / 0.5));
    this.rateAt = t;
    this.update(t, rate);
  }

  get(): Orientation | null {
    return this.snapshot;
  }

  /** The accelerometer along true vertical, in g (about 1 at rest). Walking makes it bounce. */
  vertical(): number | null {
    return this.q && this.acc ? dot(toMatrix(this.q)[2], this.acc) : null;
  }

  /** The fastest the phone has turned in the last half second or so, rad/s. */
  spin(): number {
    return this.spinPeak;
  }

  private update(t: number, rate: Vec) {
    const acc = this.acc;
    const mag = this.mag;
    if (!acc || !mag) return;
    if (!this.q) {
      this.q = absolute(acc, mag);
      this.lastAt = this.startAt = t;
      if (this.q) this.publish();
      return;
    }
    const dt = clamp(t - this.lastAt, 0, 0.1);
    this.lastAt = t;
    if (dt === 0) return;
    const settling = t - this.startAt < 1.5;

    // 1. Turn by what the gyroscope felt, nudged so "up" agrees with gravity. The accelerometer
    //    only counts while it reads about 1 g, i.e. while the phone isn't being swung or jolted.
    const g = length(acc);
    const trust = clamp(1 - Math.abs(g - 1) / 0.2, 0, 1);
    const pull = (settling ? 10 : 2) * trust;
    const tilt = cross(scale(acc, 1 / g), toMatrix(this.q)[2]);
    const turn: Vec = [rate[0] + pull * tilt[0], rate[1] + pull * tilt[1], rate[2] + pull * tilt[2]];
    let q = normalize(multiply(this.q, rotation(scale(turn, dt))));

    // 2. Turn about the vertical until the field points at magnetic north. If something
    //    magnetic nearby is bending it, skip this: the gyroscope alone holds the heading.
    const world = apply(toMatrix(q), mag);
    const flat = Math.hypot(world[0], world[1]);
    const field = length(mag);
    const dip = Math.atan2(-world[2], flat) / DEG;
    const k = Math.min(1, dt / 0.4);
    this.field += (field - this.field) * k;
    this.dip += (dip - this.dip) * k;
    this.checkCompass(t);
    // A bent reading is skipped straight away, before the (deliberately slower) warning shows.
    if (flat > 1 && !bent(field, dip) && (this.compassOk || settling)) {
      const error = wrap(Math.atan2(world[0], world[1]) - DECLINATION_DEG * DEG);
      const tau = settling ? 0.15 : Math.abs(error) > 10 * DEG ? 0.6 : 2;
      q = normalize(multiply(rotation([0, 0, error * Math.min(1, dt / tau)]), q));
    }
    this.q = q;
    this.publish();
  }

  private checkCompass(t: number) {
    const off = bent(this.field, this.dip);
    // Change only after it holds for a moment, so one odd reading doesn't flicker the warning.
    if (off === this.compassOk) {
      this.flipSince ??= t;
      if (t - this.flipSince > (off ? 0.6 : 1.5)) {
        this.compassOk = !off;
        this.flipSince = null;
      }
    } else {
      this.flipSince = null;
    }
  }

  private publish() {
    const m = toMatrix(this.q!);
    // The columns of m are the phone's axes in the world; the camera looks along −z.
    const camera: Vec = [-m[0][2], -m[1][2], -m[2][2]];
    // Top edge + camera: whichever of the two is level dominates, so it works flat or upright.
    const face: Vec = [m[0][1] + camera[0], m[1][1] + camera[1], 0];
    if (Math.hypot(face[0], face[1]) > 0.2) this.facing = bearing(face);
    const up = m[2]; // the world's up, seen from the phone
    this.snapshot = {
      heading: bearing(camera),
      elevation: Math.asin(clamp(camera[2], -1, 1)) / DEG,
      roll: Math.atan2(-up[0], up[1]) / DEG,
      facing: this.facing,
      compassOk: this.compassOk,
      field: this.field,
      dip: this.dip,
    };
  }
}

/** Counts steps from the bounce in vertical acceleration while you walk with the phone in hand. */
export class StepDetector {
  private fast = 0;
  private slow = 0;
  private at: number | null = null;
  private high = false;
  private lastBounce = -Infinity;

  /** Feed one reading: vertical acceleration (g), time (s), recent spin (rad/s). True = a step. */
  push(vertical: number, t: number, spin: number): boolean {
    if (this.at === null) {
      this.fast = this.slow = vertical;
      this.at = t;
      return false;
    }
    const dt = clamp(t - this.at, 0, 0.2);
    this.at = t;
    this.fast += (vertical - this.fast) * (1 - Math.exp(-dt / 0.06));
    this.slow += (vertical - this.slow) * (1 - Math.exp(-dt / 1.2));
    const bounce = this.fast - this.slow;
    if (this.high) {
      if (bounce < -0.06) this.high = false;
      return false;
    }
    if (bounce < 0.12) return false;
    this.high = true;
    // Waving the phone (like a figure 8 for the compass) bounces too, but it also spins fast.
    if (spin > 2.5) {
      this.lastBounce = -Infinity;
      return false;
    }
    const gap = t - this.lastBounce;
    this.lastBounce = t;
    // One bump (lifting the phone, a jolt) isn't walking: a step is a bounce in rhythm with the last.
    return gap > 0.25 && gap < 1.6;
  }
}

/**
 * Spots the phone being held up like a camera: its view within 25° of the horizon for half a
 * second. Each time it fires, and after wait(), the phone has to go down past 45° before it can
 * fire again, so coming back from the camera with the phone still up doesn't reopen it.
 */
export class RaiseDetector {
  private armed = true;
  private upSince: number | null = null;

  /** Feed the camera's elevation (degrees above the horizon) at time t (s). True = just raised. */
  push(elevation: number, t: number): boolean {
    if (elevation < -45) this.armed = true;
    if (!this.armed || elevation < -25) {
      this.upSince = null;
      return false;
    }
    if (this.upSince === null) this.upSince = t;
    if (t - this.upSince < 0.5) return false;
    this.wait();
    return true;
  }

  wait() {
    this.armed = false;
    this.upSince = null;
  }
}
