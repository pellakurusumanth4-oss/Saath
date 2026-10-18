import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, Vibration, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CameraScreen } from './src/CameraScreen';
import { MapScreen } from './src/MapScreen';
import { levelFor, type Level, type LiveFriend } from './src/friends';
import { bearingDeg, distanceM, type LatLng } from './src/geo';
import { hourIndex, nearSpot, placeFriends, type Places } from './src/placement';
import { RaiseDetector } from './src/fusion';
import { watchOrientation } from './src/sensors';
import { C } from './src/theme';
import { useLocation } from './src/useLocation';

/** Beyond this, a friend you already met can greet you again next time you come close. */
const REARM_M = 60;
/** Who you've met survives app restarts too (Chrome's AR page can outlive the app, and a deep link cold-starts it). */
const MET_KEY = 'saath.met.v1';
const saveMet = (ids: ReadonlySet<string>) => AsyncStorage.setItem(MET_KEY, JSON.stringify([...ids])).catch(() => {});
/** The home and office you set, as { home?, office? }: on this phone only, never sent anywhere. */
const PLACES_KEY = 'saath.places.v1';
/** A point, if it is one (the store and the map page can hold anything): just its lat and lng. */
const spot = (p: any): LatLng | undefined =>
  Number.isFinite(p?.lat) && Number.isFinite(p?.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 ? { lat: p.lat, lng: p.lng } : undefined;

/** How close the tracked friend is. Hysteresis only carries over while it's the same friend. */
function useLevel(target: LiveFriend | null): Level {
  const id = target?.id ?? null;
  const distance = target?.distance ?? Infinity;
  const [last, setLast] = useState<{ id: string | null; level: Level }>({ id: null, level: 'far' });
  const level = isFinite(distance) ? levelFor(distance, last.id === id ? last.level : 'far') : 'far';
  useEffect(() => {
    if (last.id !== id || last.level !== level) setLast({ id, level });
  }, [id, level, last]);
  return level;
}

export default function App() {
  useKeepAwake();
  const { status, fix, gps, retry } = useLocation();
  const [near, setNear] = useState<LatLng | null>(null);
  const [places, setPlaces] = useState<Places>({});
  const [hour, setHour] = useState(hourIndex);
  // Paths and roads the map found near friends' random spots (src/mapWalk.ts), by spot. Only in memory: the same
  // spots always give the same answers, so a restart just asks again.
  const [walk, setWalk] = useState<ReadonlyMap<string, LatLng[]>>(() => new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [screen, setScreen] = useState<'map' | 'camera'>('map');
  const [navigating, setNavigating] = useState(false);
  const [metIds, setMetIds] = useState<ReadonlySet<string>>(() => new Set());
  const beep = useAudioPlayer(require('./assets/beep.wav'));
  const announced = useRef(new Set<string>());

  useEffect(() => {
    // Duck any music for the beep instead of stopping it.
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
  }, []);

  // The near friend stands a few steps from your first good GPS reading, then stays put. Only in memory: each run places
  // him afresh. The reading, not the dot: the accuracy is the reading's, and after weak GPS the dot can lag far behind it.
  useEffect(() => {
    if (!near && gps && (gps.accuracy == null || gps.accuracy <= 30)) setNear(nearSpot(gps));
  }, [near, gps]);

  // Everyone else moves on the hour (src/placement.ts): look at the clock once a minute.
  useEffect(() => {
    const timer = setInterval(() => setHour(hourIndex()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    AsyncStorage.removeItem('saath.testFriends.v1').catch(() => {});   // the old long-press test friends and their spots: nothing reads them now
    AsyncStorage.getItem(PLACES_KEY)
      .then((raw) => {
        const saved = raw ? JSON.parse(raw) : null;
        setPlaces((p) => ({ home: spot(saved?.home), office: spot(saved?.office), ...p }));   // a place set while this loaded wins
      })
      .catch(() => {});
    AsyncStorage.getItem(MET_KEY)
      .then((raw) => {
        const saved: unknown = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(saved) || !saved.length) return;
        setMetIds((ids) => {   // keep any met while this loaded (a cold-start deep link), and save the union
          const next = new Set([...saved.filter((x): x is string => typeof x === 'string'), ...ids]);
          saveMet(next);
          return next;
        });
      })
      .catch(() => {});
  }, []);

  // Where everyone stands this hour, and the random spots the map still has to look round for somewhere to walk. In
  // between, only your own position changes their distance and direction.
  const [placed, look] = useMemo(() => {
    const look: LatLng[] = [];
    const placed = placeFriends(places, near, hour, (s) => {
      const found = walk.get(`${s.lat},${s.lng}`);
      if (!found) look.push(s);
      return found;
    });
    return [placed, look] as const;
  }, [places, near, hour, walk]);
  const friends = useMemo<LiveFriend[]>(
    () =>
      placed.map((f) => ({
        ...f,
        distance: fix ? distanceM(fix, f) : Infinity,
        bearing: fix ? bearingDeg(fix, f) : 0,
        met: metIds.has(f.id),
      })),
    [placed, fix, metIds],
  );

  const nearest = fix && friends.length ? friends.reduce((a, b) => (b.distance < a.distance ? b : a)) : null;
  const selected = friends.find((f) => f.id === selectedId) ?? null;
  const target = selected ?? nearest;
  const level = useLevel(target);

  // While navigating, buzz as you get close: slow when warm, fast when hot.
  useEffect(() => {
    if (!navigating || (level !== 'warm' && level !== 'hot')) return;
    const pattern = level === 'warm' ? [0, 120] : [0, 90, 110, 90];
    const buzz = () => Vibration.vibrate(pattern);
    buzz();
    const timer = setInterval(buzz, level === 'warm' ? 5000 : 1600);
    return () => {
      clearInterval(timer);
      Vibration.cancel();
    };
  }, [level, navigating]);

  // Arriving: a beep and a strong haptic, once per approach. The card then says to hold up the phone.
  useEffect(() => {
    if (level !== 'here' || !target || announced.current.has(target.id)) return;
    announced.current.add(target.id);
    beep
      .seekTo(0)
      .then(() => beep.play())
      .catch(() => {});
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [level, target?.id]);

  useEffect(() => {
    for (const f of friends) if (f.distance > REARM_M) announced.current.delete(f.id);
  }, [friends]);

  const openCamera = useCallback(() => setScreen('camera'), []);
  const raise = useRef(new RaiseDetector());
  const backToMap = useCallback(() => {
    raise.current.wait();
    setScreen('map');
  }, []);

  // Arrived: holding the phone up opens the camera, no button needed.
  useEffect(() => {
    if (screen !== 'map' || level !== 'here') return;
    return watchOrientation(100, (o) => {
      if (raise.current.push(o.elevation, Date.now() / 1000)) openCamera();
    });
  }, [screen, level, openCamera]);
  const setPlace = useCallback((which: keyof Places, at: LatLng | null) => {
    setPlaces((p) => {
      const next = { ...p, [which]: at ? { lat: at.lat, lng: at.lng } : undefined };
      AsyncStorage.setItem(PLACES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  // What the map found round each spot ([{spot, near}]), kept as plain points: the page can post anything.
  const onWalkable = useCallback((found: unknown) => {
    if (!Array.isArray(found)) return;
    setWalk((w) => {
      const next = new Map(w);
      for (const f of found) {
        const at = spot(f?.spot);
        if (at && Array.isArray(f.near)) next.set(`${at.lat},${at.lng}`, f.near.map(spot).filter((p: LatLng | undefined): p is LatLng => !!p));
      }
      return next;
    });
  }, []);
  const onMet = useCallback((id: string) => {
    setMetIds((ids) => {
      if (ids.has(id)) return ids;
      const next = new Set(ids).add(id);
      saveMet(next);
      return next;
    });
  }, []);
  // Back from the AR camera page in Chrome (web/ar): <app>/--/ar-done?friend=<id>, plus &met=1 once you met them.
  useEffect(() => {
    const done = (url: string | null) => {
      const id = url && /(\/--\/|:\/\/)ar-done(\?|$)/.test(url) ? url.match(/[?&]friend=([^&#]+)/)?.[1] : undefined;   // exp://…/--/ar-done (Expo Go) or saath://ar-done
      if (id && /[?&]met=1(&|#|$)/.test(url!)) try { onMet(decodeURIComponent(id)); } catch {}   // a malformed hand-made link
    };
    Linking.getInitialURL().then(done);   // the app was closed while you were in Chrome
    const sub = Linking.addEventListener('url', ({ url }) => done(url));
    return () => sub.remove();
  }, [onMet]);

  // Navigation sticks to this friend even if another one ends up nearer on the way.
  const onStart = () => {
    if (!target) return;
    setSelectedId(target.id);
    setNavigating(true);
  };

  return (
    <SafeAreaProvider style={styles.root}>
      {/* The map stays mounted under the camera so it doesn't reload every time you come back. */}
      <MapScreen
        active={screen === 'map'}
        fix={fix}
        status={status}
        friends={friends}
        target={target}
        tracking={!!selected && selected.id !== nearest?.id}
        navigating={navigating}
        level={level}
        onRetryGps={retry}
        onSelect={setSelectedId}
        onShowNearest={() => setSelectedId(null)}
        onStart={onStart}
        onEnd={() => setNavigating(false)}
        onOpenCamera={openCamera}
        places={places}
        onSetPlace={setPlace}
        look={look}
        onWalkable={onWalkable}
      />
      {screen === 'camera' ? (
        <View style={StyleSheet.absoluteFill}>
          <CameraScreen target={target} level={level} fix={fix} onBack={backToMap} />
        </View>
      ) : null}
      <StatusBar style={screen === 'camera' ? 'light' : 'dark'} />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
});
