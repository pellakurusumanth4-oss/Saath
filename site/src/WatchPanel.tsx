import { useEffect, useRef, useState } from 'react';
import type { Friend } from '../../src/friends';
import { currentActivity } from './activities';

/** saath.mystery(off) → place(feet x, feet y, height px, rotation) → play(clip names). */
type Saath = {
  mystery: (on: boolean) => void;
  place: (x: number, y: number, height: number, rot: number) => void;
  play: (clips: string[]) => void;
};

const FOOT_X = 150;
const FOOT_Y = 400;
const HEIGHT_PX = 360;
// Goku's hair reaches higher than the others, so he sits lower and smaller in the window.
const GOKU_FOOT_Y = 420;
const GOKU_HEIGHT_PX = 300;
const POLL_MS = 100;
const POLL_MAX_MS = 5000;

export default function WatchPanel({ friend, firstOpen, onClose, waveKey }: { friend: Friend; firstOpen: boolean; onClose: () => void; waveKey?: number }) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    setReady(false);
    setTimedOut(false);

    let timer: number | undefined;
    const startedAt = Date.now();
    const poll = () => {
      const win = frame.current?.contentWindow as (Window & { saath?: Saath }) | null | undefined;
      const saath = win?.saath;
      if (saath) {
        saath.mystery(false);
        saath.place(
          FOOT_X,
          friend.character === 'goku' ? GOKU_FOOT_Y : FOOT_Y,
          friend.character === 'goku' ? GOKU_HEIGHT_PX : HEIGHT_PX,
          0,
        );
        saath.play([firstOpen ? 'arrive' : 'hi']);
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
  }, [friend.id, firstOpen]);

  // Wave once when the friend starts talking in the chat while this window is open.
  const waveFirst = useRef(true);
  useEffect(() => {
    if (waveFirst.current) {
      waveFirst.current = false;
      if (waveKey === undefined) return;
    }
    if (!ready) return;
    const win = frame.current?.contentWindow as (Window & { saath?: Saath }) | null | undefined;
    win?.saath?.play(['hi']);
  }, [waveKey, ready]);

  return (
    <div className="watch" role="dialog" aria-label={`Watching ${friend.name}`}>
      <button className="watch-close" onClick={onClose} aria-label={`Stop watching ${friend.name}`}>
        ✕
      </button>
      <div className="watch-stage">
        <iframe
          ref={frame}
          className="watch-frame"
          src={`/rigs/${friend.character}.html`}
          title={`${friend.name} in the AR rig`}
          onLoad={() => setReady(false)}
        />
        {!ready && !timedOut && <div className="watch-loading">{friend.name} is coming…</div>}
        {timedOut && <div className="watch-loading">Couldn’t bring {friend.name} to the window.</div>}
      </div>
      <p className="watch-now">
        Right now: {friend.name.split(' ')[0]} is {currentActivity(friend.character)}
      </p>
    </div>
  );
}
