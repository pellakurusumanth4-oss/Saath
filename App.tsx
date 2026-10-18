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
import { FRIENDS, levelFor, makeTestFriend, savedTestFriend, type Friend, type Level, type LiveFriend } from './src/friends';
import { bearingDeg, distanceM, type LatLng } from './src/geo';
import { RaiseDetector } from './src/fusion';
import { watchOrientation } from './src/sensors';
import { C } from './src/theme';
import { useLocation } from './src/useLocation';

/** Beyond this, a friend you already met can greet you again next time you come close. */
const REARM_M = 60;
/** Test friends survive app restarts, so you can hide one and walk to it later. */
const TESTS_KEY = 'saath.testFriends.v1';
/** Who you've met survives app restarts too (Chrome's AR page can outlive the app, and a deep link cold-starts it). */
const MET_KEY = 'saath.met.v1';

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
  const { status, fix, retry } = useLocation();
  const [tests, setTests] = useState<Friend[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [screen, setScreen] = useState<'map' | 'camera'>('map');
  const [navigating, setNavigating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [metIds, setMetIds] = useState<ReadonlySet<string>>(() => new Set());
  const beep = useAudioPlayer(require('./assets/beep.wav'));
  const announced = useRef(new Set<string>());

  useEffect(() => {
    // Duck any music for the beep instead of stopping it.
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(TESTS_KEY)
      .then((raw) => {
        const saved = raw ? (JSON.parse(raw) as unknown[]).map(savedTestFriend).filter((f): f is Friend => f !== null) : [];
        if (saved.length) setTests((current) => (current.length ? current : saved));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(MET_KEY)
      .then((raw) => {
        const saved: unknown = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(saved) || !saved.length) return;
        setMetIds((ids) => {   // keep any met while this loaded (a cold-start deep link), and save the union
          const next = new Set([...saved.filter((x): x is string => typeof x === 'string'), ...ids]);
          AsyncStorage.setItem(MET_KEY, JSON.stringify([...next])).catch(() => {});
          return next;
        });
      })
      .catch(() => {});
  }, []);

  const saveTests = (next: Friend[]) => {
    setTests(next);
    AsyncStorage.setItem(TESTS_KEY, JSON.stringify(next)).catch(() => {});
  };

  // Friends never move, so only your own position changes their distance and direction.
  const friends = useMemo<LiveFriend[]>(
    () =>
      [...FRIENDS, ...tests].map((f) => ({
        ...f,
        distance: fix ? distanceM(fix, f) : Infinity,
        bearing: fix ? bearingDeg(fix, f) : 0,
        met: metIds.has(f.id),
      })),
    [tests, fix, metIds],
  );

  const nearest = fix ? friends.reduce((a, b) => (b.distance < a.distance ? b : a)) : null;
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

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

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
  const onMet = useCallback((id: string) => {
    setMetIds((ids) => {
      if (ids.has(id)) return ids;
      const next = new Set(ids).add(id);
      AsyncStorage.setItem(MET_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);
  // Back from the AR camera page in Chrome (web/ar): <app>/--/ar-done?friend=<id>, plus &met=1 once you met them.
  useEffect(() => {
    const done = (url: string | null) => {
      const id = url?.includes('/--/ar-done') ? url.match(/[?&]friend=([^&#]+)/)?.[1] : undefined;
      if (id && /[?&]met=1(&|#|$)/.test(url!)) try { onMet(decodeURIComponent(id)); } catch {}   // a malformed hand-made link
    };
    Linking.getInitialURL().then(done);   // the app was closed while you were in Chrome
    const sub = Linking.addEventListener('url', ({ url }) => done(url));
    return () => sub.remove();
  }, [onMet]);

  const onLongPress = (at: LatLng) => {
    const friend = makeTestFriend(at, tests.length);
    saveTests([...tests, friend]);
    setSelectedId(friend.id);
    setToast('Test friend hidden there. Walk to it!');
  };

  const onClearTests = () => {
    saveTests([]);
    if (selectedId?.startsWith('test-')) {
      setSelectedId(null);
      setNavigating(false);
    }
    setToast('Test friends removed');
  };

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
        testCount={tests.length}
        toast={toast}
        onRetryGps={retry}
        onLongPress={onLongPress}
        onSelect={setSelectedId}
        onShowNearest={() => setSelectedId(null)}
        onClearTests={onClearTests}
        onStart={onStart}
        onEnd={() => setNavigating(false)}
        onOpenCamera={openCamera}
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
