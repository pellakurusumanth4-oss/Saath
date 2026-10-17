import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { Character } from './friends';
import { RIG_HTML } from './rigs';

/** Where to draw them: feet at (x, y) in this view's pixels, h px tall, turned rot degrees. */
export type RigAt = { x: number; y: number; h: number; rot: number };

type Props = {
  character: Character;
  /** Where the app projects them (far away, at their GPS spot); null hides them. */
  at: RigAt | null;
  /** Not met yet: a dark silhouette with a glowing "?", still breathing. */
  mystery: boolean;
};

/**
 * A friend's approved 2D anime rig, live, on a transparent page over the whole camera view.
 * Key it by friend: a new friend is a new page. (At their spot, Chrome's AR page takes over: web/ar.)
 */
export const FriendRig = memo(function FriendRig({ character, at, mystery }: Props) {
  // react-native-webview's class defaults P to undefined, which TS 6 turns into `never` props.
  const web = useRef<WebView<object>>(null);
  const source = useMemo(() => ({ html: RIG_HTML[character] }), [character]);
  const [ready, setReady] = useState(false);
  const [shown, setShown] = useState(false);
  const run = (js: string) => web.current?.injectJavaScript(`window.saath && ${js}; true;`);

  // Rounded, so sensor noise below a pixel doesn't send a message.
  const where = at ? `saath.place(${at.x.toFixed(1)}, ${at.y.toFixed(1)}, ${Math.round(at.h)}, ${at.rot.toFixed(1)})` : 'saath.hide()';
  useEffect(() => {
    if (ready) run(where);
  }, [ready, where]);
  useEffect(() => {
    if (ready) run(`saath.mystery(${mystery})`);
  }, [ready, mystery]);
  // Hidden until the page has its first state, so a met friend never flashes as a silhouette.
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => setShown(true), 150);
    return () => clearTimeout(timer);
  }, [ready]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      if (JSON.parse(e.nativeEvent.data).type === 'ready') setReady(true);
    } catch {
      // not one of the page's messages
    }
  };

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: shown ? 1 : 0 }]}>
      <WebView
        ref={web}
        source={source}
        onMessage={onMessage}
        originWhitelist={['*']}
        // Android otherwise lays the page out on a wide viewport and zooms it to fit, so the page's
        // pixels stop matching the view's.
        scalesPageToFit={false}
        style={styles.web}
        containerStyle={styles.web}
        scrollEnabled={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: 'transparent' },
});
