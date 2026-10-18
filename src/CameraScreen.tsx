import { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as IntentLauncher from 'expo-intent-launcher';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { FriendRig, type RigAt } from './FriendRig';
import { LEVELS, type Level, type LiveFriend } from './friends';
import type { Orientation } from './fusion';
import { DEG, angleDiff, formatDistance } from './geo';
import { stepCount, useOrientation } from './sensors';
import { C, hardShadow } from './theme';
import { WEAK_GPS_M, type Fix } from './useLocation';

/** Vertical field of view of the S24 main camera when its preview fills a portrait screen: the
 * phone's own lens calibration, 2·atan(2040 / 2770 px) (see notes/ar-stability.md). */
const VFOV_DEG = 72.7;
/** How high the camera is when you hold the phone up to look through it (for friends far away). */
const PHONE_HEIGHT_M = 1.4;
/** The AR camera page (web/ar), opened in Chrome at a friend's spot. shortcut: served from the laptop
 * (node web/serve.mjs + adb reverse tcp:8099 tcp:8099); host web/ on HTTPS to use it without the laptop. */
const AR_PAGE = 'http://localhost:8099/ar/';
/** Closer than this, GPS can't tell exactly where around you a friend stands, so they stop growing. */
const NEAREST_DRAW_M = 4;
/** Far-away friends are drawn at least this tall (px) so you can spot them. */
const MIN_FIGURE_PX = 56;

type Pt = { x: number; y: number };


/**
 * A pinhole camera for orientation `o`: where a point `delta`° clockwise of the camera's heading and
 * `altitude` radians above the horizon lands on screen, or null if it's behind you. Roll is left out:
 * callers turn what they draw by −roll about the middle of the view.
 */
function projector(o: Orientation, w: number, h: number) {
  const focal = h / 2 / Math.tan((VFOV_DEG / 2) * DEG);
  const tilt = o.elevation * DEG;
  return (delta: number, altitude: number): Pt | null => {
    const turn = delta * DEG;
    const level = Math.cos(altitude) * Math.cos(turn);
    const forward = level * Math.cos(tilt) + Math.sin(altitude) * Math.sin(tilt);
    if (forward < 0.05) return null;
    const right = Math.cos(altitude) * Math.sin(turn);
    const up = Math.sin(altitude) * Math.cos(tilt) - level * Math.sin(tilt);
    return { x: w / 2 + (focal * right) / forward, y: h / 2 - (focal * up) / forward };
  };
}

/** Turns a point (in the roll-free frame) by −roll about the middle of the view, as the screen shows it. */
function rolled(p: Pt, roll: number, w: number, h: number): Pt {
  const a = -roll * DEG, dx = p.x - w / 2, dy = p.y - h / 2;
  return { x: w / 2 + dx * Math.cos(a) - dy * Math.sin(a), y: h / 2 + dx * Math.sin(a) + dy * Math.cos(a) };
}

type Props = {
  target: LiveFriend | null;
  level: Level;
  fix: Fix | null;
  onBack: () => void;
};

/**
 * The live camera. Far away, the friend stands at their real, fixed spot (GPS and compass). Once
 * you've reached them, Chrome's AR takes over, like Pokémon GO's AR+: "Meet {name} in AR" opens
 * web/ar in Chrome, where ARCore finds your real floor and they come out on it; its "Back to Saath"
 * link brings you back here (App.tsx marks them met).
 */
export function CameraScreen({ target, level, fix, onBack }: Props) {
  const [permission, requestPermission] = useCameraPermissions({ request: true });
  const orientation = useOrientation(true, 33);
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [debug, setDebug] = useState(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const here = level === 'here' && target !== null;
  const w = box?.w ?? win.width;
  const h = box?.h ?? win.height;
  const distance = target?.distance ?? Infinity;
  // At their spot: Chrome's AR page (ARCore) puts them on your real floor. Chrome rather than the default
  // browser, since only Chrome has WebXR's AR mode; the page links back to <app>/--/ar-done (App.tsx).
  const launching = useRef(false);
  const openAr = async () => {
    if (!target || launching.current) return;   // a second tap while Chrome opens would be refused, then open Brave
    launching.current = true;
    const app = ((await Linking.getInitialURL()) ?? 'exp://127.0.0.1:8081').split('/--/')[0];
    const back = `${app}/--/ar-done?friend=${encodeURIComponent(target.id)}`;
    const url = `${AR_PAGE}?friend=${target.character}&name=${encodeURIComponent(target.name)}&tall=${target.height}&return=${encodeURIComponent(back)}`;
    try {
      // expo-intent-launcher only uses packageName together with className (Chrome's link handler). In a new task the
      // result comes back at once, so the launcher isn't left waiting (it refuses a second launch while it waits).
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: url,
        packageName: 'com.android.chrome',
        className: 'com.google.android.apps.chrome.IntentDispatcher',
        flags: 0x10000000, // Intent.FLAG_ACTIVITY_NEW_TASK
      });
    } catch (e: any) {
      // No Chrome: the default browser, where AR may not work. Not when the launcher was merely busy (Chrome is opening).
      if (e?.code !== 'E_ACTIVITY_ALREADY_STARTED') Linking.openURL(url);
    } finally {
      launching.current = false;
    }
  };

  // Far away: where they are on screen, from GPS and the compass.
  let delta = 0;
  let body: { feet: Pt; head: Pt } | null = null;
  if (target && orientation && !here && isFinite(distance)) {
    const project = projector(orientation, w, h);
    const d = Math.max(distance, NEAREST_DRAW_M);
    delta = angleDiff(target.bearing, orientation.heading);
    const feet = project(delta, Math.atan2(-PHONE_HEIGHT_M, d));
    const head = project(delta, Math.atan2(target.height - PHONE_HEIGHT_M, d));
    if (feet && head) body = { feet, head };
    // Far ones are drawn at least MIN_FIGURE_PX tall, centred on where they really are.
    if (body && body.feet.y - body.head.y < MIN_FIGURE_PX) {
      const mid = (body.feet.y + body.head.y) / 2, x = (body.feet.x + body.head.x) / 2;
      body = { feet: { x, y: mid + MIN_FIGURE_PX / 2 }, head: { x, y: mid - MIN_FIGURE_PX / 2 } };
    }
  }
  const tall = body ? body.feet.y - body.head.y : 0;
  const across = !!body && body.feet.x > -tall * 0.6 && body.feet.x < w + tall * 0.6;
  const above = !!body && body.feet.y < 0;
  const below = !!body && body.head.y > h;
  const roll = orientation?.roll ?? 0;
  let rigAt: RigAt | null = null;
  if (body && across && !above && !below) {
    const feet = rolled(body.feet, roll, w, h);
    rigAt = { x: feet.x, y: feet.y, h: tall, rot: -roll };
  }

  if (!permission) return <View style={styles.root} />;
  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.center]}>
        <View style={[styles.card, hardShadow(4)]}>
          <Text style={styles.cardTitle}>See friends in the real world</Text>
          <Text style={styles.cardBody}>Saath shows them through your camera. Nothing is recorded or uploaded.</Text>
          <Pressable
            onPress={permission.canAskAgain ? requestPermission : () => Linking.openSettings()}
            style={styles.primary}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{permission.canAskAgain ? 'Allow camera' : 'Open settings'}</Text>
          </Pressable>
          <Text style={styles.link} onPress={onBack}>
            Back to the map
          </Text>
        </View>
      </View>
    );
  }

  let turnHint: { text: string; side: 'left' | 'right' | 'up' | 'down' } | null = null;
  if (target && orientation && !here && isFinite(distance)) {
    if (!body || !across) {
      const side = delta >= 0 ? 'right' : 'left';
      turnHint = { side, text: `Turn ${side} · ${Math.round(Math.abs(delta))}°` };
    } else if (above) turnHint = { side: 'up', text: 'Tilt your phone up' };
    else if (below) turnHint = { side: 'down', text: 'Tilt your phone down' };
  }

  const info = LEVELS[level];
  const name = target?.name ?? 'your friend';
  let title: string;
  let line: string;
  let action: { label: string; onPress: () => void } | null = null;
  if (!fix || !target) {
    title = 'Finding you…';
    line = 'Waiting for GPS. Step outside for a better signal.';
  } else if (!orientation) {
    title = 'Finding north…';
    line = 'Move your phone in a slow figure 8.';
  } else if (here) {
    title = target.met ? `You met ${name}!` : `${name} is right here!`;
    line = `Chrome opens your camera, finds the floor, and ${name} comes out on it.`;
    action = { label: target.met ? `Meet ${name} again` : `Meet ${name} in AR`, onPress: openAr };
  } else {
    const turn = Math.abs(delta) < 15 ? 'straight ahead' : `${Math.round(Math.abs(delta))}° to your ${delta > 0 ? 'right' : 'left'}`;
    title = info.title;
    line = `${formatDistance(distance)} away, ${turn}`;
  }
  const accuracy = fix?.accuracy ?? null;
  const warning =
    here
      ? null // at their spot, GPS and the compass no longer matter
      : accuracy !== null && accuracy > WEAK_GPS_M
        ? `Weak GPS (±${Math.round(accuracy)} m): friends can look that far off. Try in the open.`
        : orientation && !orientation.compassOk
          ? 'Compass disturbed. Step away from metal or vehicles, then wave your phone in a figure 8.'
          : null;

  return (
    <View style={styles.root} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" />

      {target ? (
        // Stays loaded while you look away, so they carry on where they were.
        <FriendRig key={target.id} character={target.character} at={rigAt} mystery={!target.met} />
      ) : null}

      {target && rigAt && !here ? (
        <View pointerEvents="none" style={[styles.anchor, { left: rigAt.x, top: Math.min(h - 40, rigAt.y) }]}>
          <View style={styles.pillWrap}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>{formatDistance(distance)}</Text>
            </View>
          </View>
        </View>
      ) : null}

      {turnHint ? <TurnHint {...turnHint} /> : null}

      <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable onPress={onBack} style={[styles.back, hardShadow(3)]} accessibilityRole="button" accessibilityLabel="Back to map">
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 5l-7 7 7 7" />
          </Svg>
        </Pressable>
        {target ? (
          <View style={styles.chip}>
            <Text style={styles.chipText} numberOfLines={1}>
              {target.met || here ? target.name : `near ${target.place}`}
            </Text>
          </View>
        ) : null}
        <View style={styles.flex} />
        <Pressable onPress={() => setDebug((v) => !v)} style={styles.chip} accessibilityHint="Shows sensor numbers">
          <Text style={styles.chipText}>GPS ±{Math.round(fix?.accuracy ?? 0)} m</Text>
        </Pressable>
      </View>

      {debug ? (
        <View style={[styles.debug, { top: insets.top + 62 }]} pointerEvents="none">
          <Text style={styles.debugText}>
            {orientation
              ? `heading ${orientation.heading.toFixed(0)}°  elev ${orientation.elevation.toFixed(0)}°  roll ${orientation.roll.toFixed(0)}°  facing ${orientation.facing.toFixed(0)}°` +
                `\nfield ${orientation.field.toFixed(0)} µT  dip ${orientation.dip.toFixed(0)}°  compass ${orientation.compassOk ? 'ok' : 'disturbed'}  steps ${stepCount()}`
              : 'no compass yet'}
            {'\n'}
            {target
              ? `bearing ${target.bearing.toFixed(0)}°  delta ${delta.toFixed(0)}°  dist ${isFinite(distance) ? distance.toFixed(1) : '–'} m  gps ±${Math.round(accuracy ?? 0)} m`
              : 'no target'}
            {'\n'}
            {`level ${level}  vfov ${VFOV_DEG}°  ${Math.round(w)}×${Math.round(h)}`}
          </Text>
        </View>
      ) : null}

      <View style={[styles.panel, hardShadow(4), { bottom: insets.bottom + 16 }]}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.panelTitle}>{title}</Text>
            <Text style={styles.panelBody}>{line}</Text>
            {warning ? <Text style={styles.warn}>{warning}</Text> : null}
          </View>
          <View style={styles.bars}>
            {[0, 1, 2, 3, 4].map((i) => (
              <View key={i} style={[styles.bar, { height: 8 + i * 5 }, i < info.bars ? styles.barOn : styles.barOff]} />
            ))}
          </View>
        </View>
        {action ? (
          <Pressable onPress={action.onPress} style={[styles.primary, hardShadow(3)]} accessibilityRole="button">
            <Text style={styles.primaryText}>{action.label}</Text>
          </Pressable>
        ) : null}
        <Text style={styles.safety}>Look up from the screen when you cross a road.</Text>
      </View>
    </View>
  );
}

const ARROWS = { left: 'M15 5l-7 7 7 7', right: 'M9 5l7 7-7 7', up: 'M5 15l7-7 7 7', down: 'M5 9l7 7 7-7' };

/** The big arrow at the edge of the view that says which way to turn. */
function TurnHint({ text, side }: { text: string; side: 'left' | 'right' | 'up' | 'down' }) {
  const where =
    side === 'left' ? { left: 12, top: '40%' as const } : side === 'right' ? { right: 12, top: '40%' as const } : side === 'up' ? { top: '22%' as const } : { bottom: '32%' as const };
  const vertical = side === 'up' || side === 'down';
  return (
    <View pointerEvents="none" style={[styles.hintWrap, where, vertical && styles.hintCentered]}>
      <View style={[styles.hint, side === 'right' && styles.hintReverse]}>
        <View style={[styles.hintArrow, hardShadow(3)]}>
          <Svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d={ARROWS[side]} />
          </Svg>
        </View>
        <Text style={styles.hintText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 16 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  card: {
    alignSelf: 'stretch',
    backgroundColor: C.white,
    borderWidth: 2.5,
    borderColor: C.ink,
    borderRadius: 20,
    padding: 18,
    gap: 12,
  },
  cardTitle: { fontSize: 20, fontWeight: '900', color: C.ink },
  cardBody: { fontSize: 15, lineHeight: 21, color: C.mutedDark },
  primary: {
    height: 52,
    borderRadius: 16,
    backgroundColor: C.yellow,
    borderWidth: 2.5,
    borderColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { fontSize: 16, fontWeight: '900', color: C.ink },
  link: { alignSelf: 'center', fontSize: 14, fontWeight: '800', color: C.cobalt, textDecorationLine: 'underline', padding: 6 },
  anchor: { position: 'absolute', width: 0, height: 0 },
  pillWrap: { position: 'absolute', left: -60, top: 6, width: 120, alignItems: 'center' },
  pill: { backgroundColor: C.ink, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1.5, borderColor: C.yellow },
  pillText: { color: C.yellow, fontSize: 13, fontWeight: '900' },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.white,
    borderWidth: 2.5,
    borderColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexShrink: 1,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: C.white,
    borderWidth: 2,
    borderColor: C.ink,
    justifyContent: 'center',
  },
  chipText: { fontSize: 13, fontWeight: '800', color: C.ink },
  debug: { position: 'absolute', left: 16, right: 16, backgroundColor: 'rgba(17,19,24,0.82)', borderRadius: 12, padding: 10 },
  debugText: { color: '#9EF0B0', fontSize: 12, fontFamily: 'monospace', lineHeight: 18 },
  hintWrap: { position: 'absolute' },
  hintCentered: { left: 0, right: 0, alignItems: 'center' },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hintReverse: { flexDirection: 'row-reverse' },
  hintArrow: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: C.yellow,
    borderWidth: 2.5,
    borderColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintText: {
    color: C.white,
    fontSize: 15,
    fontWeight: '900',
    backgroundColor: C.ink,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  panel: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: C.white,
    borderWidth: 2.5,
    borderColor: C.ink,
    borderRadius: 20,
    padding: 14,
    gap: 8,
  },
  panelTitle: { fontSize: 18, fontWeight: '900', color: C.ink },
  panelBody: { fontSize: 14, color: C.mutedDark, marginTop: 2 },
  warn: { fontSize: 13, fontWeight: '700', color: '#B54708', marginTop: 4 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { width: 8, borderRadius: 3, borderWidth: 1.5 },
  barOn: { backgroundColor: C.yellow, borderColor: C.ink },
  barOff: { backgroundColor: C.white, borderColor: C.line },
  safety: { fontSize: 12, color: C.muted },
});
