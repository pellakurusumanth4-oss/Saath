// J1c: why Saath wants the location, before the browser asks. "Not now" picks a spot on the map instead.
import { useEffect, useRef } from 'react';
import { Icon } from './ui';
import { useInert } from './useInert';

export default function LocationAsk({ onAllow, onPick }: { onAllow: () => void; onPick: () => void }) {
  const box = useRef<HTMLDivElement | null>(null);
  useInert(box);
  useEffect(() => box.current?.focus(), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onPick();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPick]);
  return (
    <div className="ask-back" role="dialog" aria-modal="true" aria-labelledby="ask-title">
      <div className="ask-card" tabIndex={-1} ref={box}>
        <span className="ask-icon"><Icon name="locate" size={28} color="#2563EB" stroke={2.2} /></span>
        <h2 id="ask-title" className="j-title">See what’s near you</h2>
        <p className="j-text">Saath uses your location to sort shops by walking time and draw your walking route. It is used only while Saath is open. Saath never saves it.</p>
        <div className="j-actions">
          <button type="button" className="btn-go" onClick={onAllow}><Icon name="locate" size={19} />Use my location</button>
          <button type="button" className="btn-ghost" onClick={onPick}>Not now, I’ll pick a spot</button>
        </div>
        <p className="j-note"><Icon name="info" size={15} />Your browser asks next. You can change it any time in its site settings.</p>
      </div>
    </div>
  );
}
