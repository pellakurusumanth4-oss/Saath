import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { PositionFilter, type GpsReading } from './positioning';
import { onStep } from './sensors';

export type Fix = {
  /** Where you are: GPS smoothed with your steps. */
  lat: number;
  lng: number;
  /** What the phone says GPS is accurate to right now (68% radius, metres). */
  accuracy: number | null;
};
export type GpsStatus = 'asking' | 'denied' | 'off' | 'waiting' | 'live';

/** GPS worse than this (68% radius, m) can put a friend on the wrong side of you. */
export const WEAK_GPS_M = 20;

/** Your real position: GPS about once a second, moved along by each step in between. */
export function useLocation() {
  const [status, setStatus] = useState<GpsStatus>('asking');
  const [fix, setFix] = useState<Fix | null>(null);
  // The latest raw reading, which its accuracy is about. After weak GPS the dot (fix) can lag far behind it.
  const [gps, setGps] = useState<GpsReading | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [filter] = useState(() => new PositionFilter());
  const accuracy = useRef<number | null>(null);

  const publish = useCallback(() => {
    const at = filter.position();
    if (at) setFix({ ...at, accuracy: accuracy.current });
  }, [filter]);

  useEffect(
    () =>
      onStep((facing) => {
        if (filter.step(facing, Date.now())) publish();
      }),
    [filter, publish],
  );

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let stopped = false;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (stopped) return;
      if (perm.status !== 'granted') {
        setStatus('denied');
        return;
      }
      setStatus('waiting');
      const s = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 1 },
        (loc) => {
          const { latitude, longitude, speed } = loc.coords;
          accuracy.current = loc.coords.accuracy;
          const reading = { lat: latitude, lng: longitude, accuracy: accuracy.current, speed };
          filter.gps(reading, Date.now());
          setGps(reading);
          publish();
          setStatus('live');
        },
      );
      if (stopped) s.remove();
      else sub = s;
    })().catch(() => {
      if (!stopped) setStatus('off');
    });
    return () => {
      stopped = true;
      sub?.remove();
    };
  }, [attempt, filter, publish]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { status, fix, gps, retry };
}
