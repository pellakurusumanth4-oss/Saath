import type { Friend } from '../../src/friends';
import { currentActivity } from './activities';
import { useSaathRig } from './useSaathRig';
import { useEffect, useRef } from 'react';

export default function WatchPanel({ friend, firstOpen, onClose, waveKey }: { friend: Friend; firstOpen: boolean; onClose: () => void; waveKey?: number }) {
  const { frame, ready, timedOut, wave } = useSaathRig(friend.character, firstOpen ? 'arrive' : 'hi');

  // Wave once when the friend starts talking in the chat while this window is open.
  const waveFirst = useRef(true);
  useEffect(() => {
    if (waveFirst.current) {
      waveFirst.current = false;
      if (waveKey === undefined) return;
    }
    if (!ready) return;
    wave('hi');
  }, [waveKey, ready, wave]);

  return (
    <div className="watch" role="dialog" aria-label={`Watching ${friend.name}`}>
      <div className="watch-top">
        <button className="watch-close" onClick={onClose} aria-label={`Stop watching ${friend.name}`}>
          ✕
        </button>
      </div>
      <div className="watch-stage">
        <iframe
          ref={frame}
          className="watch-frame"
          src={`/rigs/${friend.character}.html`}
          title={`${friend.name} in the AR rig`}
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
