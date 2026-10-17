import { useEffect, useState } from 'react';
import { Accelerometer, Gyroscope, Magnetometer } from 'expo-sensors';
import { OrientationFilter, StepDetector, type Orientation } from './fusion';
import { angleDiff } from './geo';

// One set of motion-sensor listeners for the whole app, feeding one orientation filter and one
// step counter. They run while anything needs them (the map's facing cone, the camera, and
// position smoothing, which needs steps all the time).

const filter = new OrientationFilter();
const detector = new StepDetector();
const stepListeners = new Set<(facing: number) => void>();
let users = 0;
let steps = 0;
let subscriptions: { remove(): void }[] = [];

function retain(): () => void {
  if (users++ === 0) {
    filter.reset();
    Accelerometer.setUpdateInterval(20);
    Gyroscope.setUpdateInterval(20);
    Magnetometer.setUpdateInterval(40);
    subscriptions = [
      Gyroscope.addListener((r) => filter.gyro(r.x, r.y, r.z, r.timestamp)),
      Magnetometer.addListener((r) => filter.magnet(r.x, r.y, r.z)),
      Accelerometer.addListener((r) => {
        filter.accel(r.x, r.y, r.z, r.timestamp);
        const vertical = filter.vertical();
        const now = filter.get();
        if (vertical === null || !now || !detector.push(vertical, r.timestamp, filter.spin())) return;
        steps++;
        stepListeners.forEach((listener) => listener(now.facing));
      }),
    ];
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--users > 0) return;
    subscriptions.forEach((s) => s.remove());
    subscriptions = [];
  };
}

/** Calls back with the direction you face (degrees) on every step you take. */
export function onStep(listener: (facing: number) => void): () => void {
  stepListeners.add(listener);
  const release = retain();
  return () => {
    stepListeners.delete(listener);
    release();
  };
}

/** Steps counted since the app started, for the debug view. */
export function stepCount(): number {
  return steps;
}

/** Calls back with the latest orientation every `intervalMs`, without re-rendering anything. */
export function watchOrientation(intervalMs: number, listener: (o: Orientation) => void): () => void {
  const release = retain();
  const timer = setInterval(() => {
    const o = filter.get();
    if (o) listener(o);
  }, intervalMs);
  return () => {
    clearInterval(timer);
    release();
  };
}

const moved = (a: Orientation, b: Orientation) =>
  Math.abs(angleDiff(a.heading, b.heading)) > 0.2 ||
  Math.abs(a.elevation - b.elevation) > 0.2 ||
  Math.abs(a.roll - b.roll) > 0.3 ||
  Math.abs(angleDiff(a.facing, b.facing)) > 0.5 ||
  a.compassOk !== b.compassOk ||
  Math.abs(a.field - b.field) > 1 ||
  Math.abs(a.dip - b.dip) > 1;

/** Where the phone points, re-rendering at most every `intervalMs` and only when it moved. */
export function useOrientation(active: boolean, intervalMs = 33): Orientation | null {
  const [orientation, setOrientation] = useState<Orientation | null>(null);
  useEffect(() => {
    if (!active) return;
    return watchOrientation(intervalMs, (next) => setOrientation((prev) => (prev && !moved(prev, next) ? prev : next)));
  }, [active, intervalMs]);
  return orientation;
}
