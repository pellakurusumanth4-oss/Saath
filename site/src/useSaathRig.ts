import { useEffect, useRef, useState } from 'react';
import type { Character } from '../../src/friends';

/** saath.mystery(off) → place(feet x, feet y, height px, rotation) → play(clip names). */
export type Saath = {
  mystery: (on: boolean) => void;
  place: (x: number, y: number, height: number, rot: number) => void;
  play: (clips: string[]) => void;
};

const FOOT_X = 150;
const FOOT_Y = 400;
const HEIGHT_PX = 360;
const GOKU_FOOT_Y = 420;
const GOKU_HEIGHT_PX = 300;
const POLL_MS = 100;
const POLL_MAX_MS = 5000;

/** Place + play a clip for a character, adjusting for Goku's taller rig. */
function placeAndPlay(saath: Saath, character: Character, clip: string, frame: HTMLIFrameElement | null) {
  // The numbers are tuned for a 300x450 frame; scale them to the frame's real size (e.g. small hangout tiles).
  const width = frame?.clientWidth || FOOT_X * 2;
  const k = (frame?.clientHeight || 450) / 450;
  saath.mystery(false);
  saath.place(
    width / 2,
    (character === 'goku' ? GOKU_FOOT_Y : FOOT_Y) * k,
    (character === 'goku' ? GOKU_HEIGHT_PX : HEIGHT_PX) * k,
    0,
  );
  saath.play([clip]);
}

/**
 * Manages one rig iframe: loads it, positions the character, and exposes
 * a `wave` function to trigger a clip. Returns the iframe ref to attach.
 */
export function useSaathRig(character: Character, initialClip: string) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const saathRef = useRef<Saath | null>(null);

  useEffect(() => {
    setReady(false);
    setTimedOut(false);

    let timer: number | undefined;
    const startedAt = Date.now();
    const poll = () => {
      const win = frame.current?.contentWindow as (Window & { saath?: Saath }) | null | undefined;
      const saath = win?.saath;
      if (saath) {
        saathRef.current = saath;
        placeAndPlay(saath, character, initialClip, frame.current);
        setReady(true);
        return;
      }
      if (Date.now() - startedAt > POLL_MAX_MS) {
        setTimedOut(true);
        return;
      }
      timer = window.setTimeout(poll, POLL_MS);
    };
    timer = window.setTimeout(poll, POLL_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character]);

  /** Trigger a clip on the rig if it's ready. */
  const wave = (clip: string) => {
    const saath = saathRef.current;
    if (saath) saath.play([clip]);
  };

  return { frame, ready, timedOut, wave };
}
