import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { FACES } from './faces';
import { LEVELS, type Level, type LiveFriend } from './friends';
import { angleDiff, formatDistance, type LatLng } from './geo';
import { MAP_HTML } from './mapHtml';
import { watchOrientation } from './sensors';
import { G, softShadow } from './theme';
import { WEAK_GPS_M, type Fix, type GpsStatus } from './useLocation';

const SOURCE = { html: MAP_HTML, baseUrl: 'https://localhost/' };

/** free: you move the map. follow: it keeps you centred. compass: it also turns with you. */
type MapMode = 'free' | 'follow' | 'compass';

type Props = {
  /** False while the camera covers the map, so it can stop following the compass. */
  active: boolean;
  fix: Fix | null;
  status: GpsStatus;
  friends: LiveFriend[];
  target: LiveFriend | null;
  tracking: boolean;
  /** The walking route (and the buzz) are on. */
  navigating: boolean;
  level: Level;
  testCount: number;
  toast: string | null;
  onRetryGps: () => void;
  onLongPress: (at: LatLng) => void;
  onSelect: (id: string) => void;
  onShowNearest: () => void;
  onClearTests: () => void;
  onStart: () => void;
  onEnd: () => void;
  onOpenCamera: () => void;
};

export function MapScreen(props: Props) {
  const { fix, friends, target } = props;
  // react-native-webview's class defaults P to undefined, which TS 6 turns into `never` props.
  const web = useRef<WebView<object>>(null);
  const [booted, setBooted] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mode, setMode] = useState<MapMode>('follow');
  const insets = useSafeAreaInsets();
  const top = insets.top + 12;
  const bottom = insets.bottom + 12;
  const [sheetHeight, setSheetHeight] = useState(0);

  const run = (js: string) => web.current?.injectJavaScript(`window.saath && ${js}; true;`);

  // The card covers the bottom of the map: keep you centred in the part you can see, and the map
  // attribution above the card.
  useEffect(() => {
    if (booted) run(`window.saath.setInsets(${Math.round(insets.top + 8)}, ${Math.round(sheetHeight + bottom + 8)})`);
  }, [booted, insets.top, sheetHeight, bottom]);

  useEffect(() => {
    if (booted && fix) run(`window.saath.setMe(${fix.lat}, ${fix.lng}, ${fix.accuracy ?? 0})`);
  }, [booted, fix]);

  // Distances change with every step, but the markers only when a friend is met or tracked.
  const markers = useMemo(
    () =>
      JSON.stringify(
        friends.map((f) => ({
          id: f.id,
          lat: f.lat,
          lng: f.lng,
          name: f.name,
          character: f.character,
          color: f.color,
          met: f.met,
          test: !!f.test,
          target: f.id === target?.id,
        })),
      ),
    [friends, target?.id],
  );
  useEffect(() => {
    if (booted) run(`window.saath.setFriends(${markers})`);
  }, [booted, markers]);

  // The route only shows once you start navigating.
  const line = props.navigating && target ? JSON.stringify({ lat: target.lat, lng: target.lng }) : 'null';
  useEffect(() => {
    if (booted) run(`window.saath.setTarget(${line})`);
  }, [booted, line]);

  // The cone shows which way you face. Send it when it turns by a degree or more; the map
  // animates in between.
  useEffect(() => {
    if (!booted || !props.active) return;
    let last: { facing: number; ok: boolean } | null = null;
    return watchOrientation(100, (o) => {
      if (last && last.ok === o.compassOk && Math.abs(angleDiff(o.facing, last.facing)) < 1) return;
      last = { facing: o.facing, ok: o.compassOk };
      run(`window.saath.setHeading(${o.facing.toFixed(1)}, ${o.compassOk})`);
    });
  }, [booted, props.active]);

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: any;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'boot') setBooted(true);
    else if (msg.type === 'longpress') props.onLongPress({ lat: msg.lat, lng: msg.lng });
    else if (msg.type === 'friend') props.onSelect(msg.id);
    else if (msg.type === 'mode') setMode(msg.mode);
    else if (msg.type === 'error') setMapError(msg.msg);
    else if (msg.type === 'log') console.log('[map]', msg.msg);
  };

  const focusTarget = () => {
    if (target && isFinite(target.distance)) run(`window.saath.focus(${target.lat}, ${target.lng})`);
  };
  // Starting brings the map back to you if you had dragged it away.
  const start = () => {
    if (mode === 'free') run('window.saath.recenter()');
    props.onStart();
  };

  return (
    <View style={styles.fill}>
      <WebView<object>
        ref={web}
        source={SOURCE}
        originWhitelist={['*']}
        onMessage={onMessage}
        setSupportMultipleWindows={false}
        style={styles.fill}
      />

      <View style={[styles.top, { top }]} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          <View style={styles.flex} pointerEvents="box-none">
            {mapError ? <Text style={styles.error}>{mapError}</Text> : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              mode === 'free' ? 'Follow me on the map' : mode === 'follow' ? 'Turn the map with me' : 'Point the map north'
            }
            onPress={() => run('window.saath.recenter()')}
            style={[styles.fab, softShadow]}
          >
            <LocateIcon mode={mode} />
          </Pressable>
        </View>
        {props.toast ? (
          <View style={styles.toast}>
            <Text style={styles.toastText}>{props.toast}</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.sheetWrap, { bottom }]} onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}>
        <Sheet {...props} onFocus={focusTarget} onStart={start} />
      </View>
    </View>
  );
}

function Sheet(props: Props & { onFocus: () => void }) {
  const { status, fix, target, level, navigating } = props;

  if (status === 'denied' || status === 'off') {
    return (
      <View style={[styles.sheet, softShadow]}>
        <Text style={styles.title}>{status === 'denied' ? 'Saath needs your location' : 'Turn on location'}</Text>
        <Text style={styles.body}>
          {status === 'denied'
            ? 'It only uses it to tell you when a friend is close.'
            : 'Switch on Location in quick settings, then try again.'}
        </Text>
        <View style={styles.row}>
          {status === 'denied' ? <SmallButton label="Open settings" onPress={() => Linking.openSettings()} /> : null}
          <SmallButton label="Try again" onPress={props.onRetryGps} />
        </View>
      </View>
    );
  }

  if (!fix || !target) {
    return (
      <View style={[styles.sheet, softShadow]}>
        <Text style={styles.title}>Finding you…</Text>
        <Text style={styles.body}>Step outside or near a window for a better GPS signal.</Text>
      </View>
    );
  }

  const info = LEVELS[level];
  const here = level === 'here';
  const weak = fix.accuracy !== null && fix.accuracy > WEAK_GPS_M;
  const eyebrow = here ? 'ARRIVED' : navigating ? 'NAVIGATING' : props.tracking ? 'TRACKING' : 'NEAREST FRIEND';
  return (
    <View style={[styles.sheet, softShadow]}>
      <View style={styles.rowBetween}>
        <Text style={[styles.eyebrow, here && styles.eyebrowGold]}>
          {eyebrow}
          <Text style={[styles.gps, weak && styles.warn]}>
            {'  ·  '}GPS ±{Math.round(fix.accuracy ?? 0)} m{weak ? ' · weak' : ''}
          </Text>
        </Text>
        {navigating ? (
          <Pressable onPress={props.onEnd} style={styles.end} accessibilityRole="button" accessibilityLabel="End navigation">
            <Text style={styles.endText}>End</Text>
          </Pressable>
        ) : null}
      </View>
      {weak ? <Text style={styles.warn}>Weak GPS here, so directions can be off by that much. Step into the open.</Text> : null}
      <Pressable onPress={props.onFocus} style={styles.row} accessibilityHint="Shows them on the map">
        <View style={[styles.sticker, { borderColor: target.met ? target.color : G.gold }, !target.met && styles.stickerUnmet, here && styles.stickerGold]}>
          <Image source={{ uri: FACES[target.character][target.met ? 'met' : 'unmet'] }} style={[styles.face, !target.met && styles.faceUnmet]} />
          {target.met ? null : <Text style={styles.stickerText}>?</Text>}
        </View>
        <View style={styles.flex}>
          <Text style={styles.distance}>{formatDistance(target.distance)}</Text>
          <Text style={styles.place}>
            {target.met ? `${target.name} · ` : ''}
            {here ? 'at' : 'near'} {target.place}
          </Text>
        </View>
      </Pressable>
      {here ? null : <Text style={styles.hint}>“{target.hint}”</Text>}
      {navigating || here ? (
        <View style={[styles.row, styles.levelRow]}>
          <Bars on={info.bars} gold={here} />
          <View style={styles.flex}>
            <Text style={styles.levelTitle}>{info.title}</Text>
            <Text style={styles.levelBuzz}>{info.buzz}</Text>
          </View>
        </View>
      ) : null}
      {here ? (
        // Not a button: lifting the phone opens the camera. Tapping works too, for when it can't tell.
        <Pressable onPress={props.onOpenCamera} style={styles.holdHint} accessibilityLabel="Hold up your phone" accessibilityHint="Opens the camera">
          <RaiseIcon />
          <View style={styles.flex}>
            <Text style={styles.holdTitle}>Hold up your phone</Text>
            <Text style={styles.holdBody}>Raise it like a camera to see {target.met ? target.name : 'who it is'}.</Text>
          </View>
        </Pressable>
      ) : navigating ? null : (
        <>
          <Pressable onPress={props.onStart} style={[styles.cta, styles.ctaShadow]} accessibilityRole="button">
            <Svg width={20} height={20} viewBox="0 0 20 20">
              <Path d="M10 1.8l6.6 16.4L10 14.6l-6.6 3.6z" fill="#FFFFFF" />
            </Svg>
            <Text style={styles.ctaText}>Start navigation</Text>
          </Pressable>
          <View style={styles.rowBetween}>
            {props.testCount === 0 ? (
              <Text style={styles.tip}>Tap a friend to go to someone else. Long-press the map to hide a test friend.</Text>
            ) : (
              <Text style={styles.link} onPress={props.onClearTests}>
                Remove test friends ({props.testCount})
              </Text>
            )}
            {props.tracking ? (
              <Text style={styles.link} onPress={props.onShowNearest}>
                Nearest
              </Text>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

/** Five rising bars, as many lit as you are close. */
function Bars({ on, gold }: { on: number; gold: boolean }) {
  return (
    <View style={styles.bars}>
      {[8, 11, 14, 18, 22].map((h, i) => (
        <View key={i} style={[styles.bar, { height: h }, i < on ? (gold ? styles.barGold : styles.barOn) : styles.barOff]} />
      ))}
    </View>
  );
}

/** A phone lying flat and the same phone held up, with the arc it travels. */
function RaiseIcon() {
  return (
    <Svg width={44} height={44} viewBox="0 0 44 44">
      <Rect x={5} y={31} width={20} height={7} rx={2.5} fill="none" stroke={G.gold} strokeOpacity={0.45} strokeWidth={2} />
      <Path d="M29 33 A16 16 0 0 0 23 15" fill="none" stroke={G.gold} strokeWidth={2} strokeLinecap="round" strokeDasharray="2.5 3.5" />
      <Path d="M20.5 17.2l2.6-2.4 0.6 3.5" fill="none" stroke={G.gold} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x={27} y={4} width={12} height={22} rx={3} fill="#FFF6E2" stroke={G.goldText} strokeWidth={2} />
      <Circle cx={33} cy={8.4} r={1.3} fill={G.goldText} />
    </Svg>
  );
}

function LocateIcon({ mode }: { mode: MapMode }) {
  if (mode === 'compass') {
    // The map turns with you.
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path d="M12 2.5l7 18-7-4-7 4z" fill={G.azure} />
      </Svg>
    );
  }
  const color = mode === 'follow' ? G.azure : G.text;
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
      <Circle cx={12} cy={12} r={6} />
      <Circle cx={12} cy={12} r={mode === 'follow' ? 3 : 1.6} fill={color} />
      <Path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </Svg>
  );
}

function SmallButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.smallBtn} accessibilityRole="button">
      <Text style={styles.smallBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  top: { position: 'absolute', left: 12, right: 12, gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  fab: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: G.glass,
    borderWidth: 1,
    borderColor: G.edge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetWrap: { position: 'absolute', left: 12, right: 12 },
  sheet: {
    backgroundColor: G.glass,
    borderWidth: 1,
    borderColor: G.edge,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 10,
  },
  title: { fontSize: 18, fontWeight: '700', color: G.text },
  body: { fontSize: 14, lineHeight: 20, color: G.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: G.azure },
  eyebrowGold: { color: G.gold },
  gps: { fontSize: 12, fontWeight: '500', letterSpacing: 0, color: G.muted },
  warn: { fontSize: 12, fontWeight: '700', color: '#B54708' },
  end: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 15, backgroundColor: 'rgba(29,36,51,0.07)' },
  endText: { fontSize: 13, fontWeight: '600', color: G.text },
  // Their round profile, like their map marker; unmet, a silhouette with a "?".
  sticker: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 3,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    boxShadow: '0 4px 12px rgba(43,89,255,0.25)',
  },
  stickerUnmet: { backgroundColor: '#433D5E' },
  stickerGold: { boxShadow: '0 4px 12px rgba(240,162,46,0.35)' },
  face: { position: 'absolute', left: 1, top: 1, width: 42, height: 42, borderRadius: 21 },
  faceUnmet: { opacity: 0.55 },
  stickerText: { fontSize: 22, fontWeight: '900', color: G.gold },
  distance: { fontSize: 28, fontWeight: '600', color: G.text },
  place: { fontSize: 13, color: G.muted, marginTop: 2 },
  hint: { fontSize: 13, lineHeight: 18, fontStyle: 'italic', color: G.muted },
  levelRow: { paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(29,36,51,0.08)' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 22 },
  bar: { width: 6, borderRadius: 3 },
  barOn: { backgroundColor: G.azure },
  barGold: { backgroundColor: G.goldBar },
  barOff: { backgroundColor: 'rgba(29,36,51,0.12)' },
  levelTitle: { fontSize: 14, fontWeight: '600', color: G.text },
  levelBuzz: { fontSize: 12.5, color: G.muted, marginTop: 2 },
  holdHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(249,188,77,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(249,188,77,0.5)',
  },
  holdTitle: { fontSize: 16, fontWeight: '600', color: G.goldText },
  holdBody: { fontSize: 13, color: '#6B5A3E', marginTop: 2 },
  cta: {
    height: 50,
    borderRadius: 25,
    backgroundColor: G.azure,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 4,
  },
  ctaShadow: { boxShadow: '0 10px 24px rgba(47,141,246,0.35)' },
  ctaText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  tip: { flex: 1, fontSize: 12, color: G.muted },
  link: { fontSize: 13, fontWeight: '700', color: G.azure },
  smallBtn: {
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 20,
    backgroundColor: G.azure,
    justifyContent: 'center',
  },
  smallBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  error: {
    alignSelf: 'flex-start',
    backgroundColor: '#B3261E',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    overflow: 'hidden',
  },
  toast: { alignSelf: 'center', backgroundColor: G.text, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
});
