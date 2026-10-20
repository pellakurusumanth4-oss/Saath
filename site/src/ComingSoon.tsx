// The kinds of business that aren't live yet (kinds.ts), as on Footfall's Base44 build. A visitor who taps one gets a
// sheet of tiles: what each kind's own section will show, what a verified visit will be there, and "Notify me". An
// owner of such a business gets a line in setup: it joins Nearby today and can wait for its own section. Both are a
// demo: a tap is kept on this device only, nothing is sent, and no one is asked who they are.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { KINDS, kindOf, type Kind } from './kinds';
import { sectionOf } from './shops';
import { Icon } from './ui';
import { useInert } from './useInert';

const KEY = 'saath:notify';
const tapped = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
  } catch {
    return new Set();
  }
};
/** The taps kept on this device (a second tap takes one back); nothing leaves the phone. */
const useTaps = () => {
  const [taps, setTaps] = useState(tapped);
  const toggle = (id: string) => {
    const next = new Set(taps);
    if (!next.delete(id)) next.add(id);
    setTaps(next);
    try { localStorage.setItem(KEY, JSON.stringify([...next])); } catch { /* not kept: the button resets next visit */ }
  };
  return [taps, toggle] as const;
};

const FOOD = KINDS.find((k) => k.id === 'food')!;

/** The visitor's sheet: the kind they tapped first, then the rest still to come. */
export default function ComingSoon({ kind, onClose }: { kind: Kind; onClose: () => void }) {
  const [taps, toggle] = useTaps();
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);
  useInert(box);
  useEffect(() => () => opener.current?.focus(), []); // after useInert's cleanup, so the opener is focusable again
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const tiles = [kind, ...KINDS.filter((k) => !k.live && k.id !== kind.id)];
  return createPortal(
    <div className="sheet-back" onClick={onClose}>
      <div ref={box} className="sheet glass-sheet soon-sheet" role="dialog" aria-modal="true" aria-labelledby="soon-title" onClick={(event) => event.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <h3 id="soon-title">Coming soon to Footfall</h3>
          <button type="button" autoFocus className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <p className="soon-live">Every business is on the map today, with its mascot and billboard. <b>Food</b> has its own section now: a verified visit there is {FOOD.visit}.</p>
        <ul className="soon-tiles">
          {tiles.map((k) => {
            const look = sectionOf({ section: k.glyph ?? '' });
            const on = taps.has(k.id);
            return (
              <li key={k.id} className={k.id === kind.id ? 'is-picked' : ''} style={{ '--c': look.color } as CSSProperties}>
                <span className="glyph" aria-hidden="true">{look.icon}</span>
                <div className="soon-text">
                  <b>{k.label}</b>
                  <p>{k.teaser}</p>
                  <small>Verified visit: {k.visit}</small>
                </div>
                <button type="button" className={`btn-ghost small${on ? ' is-done' : ''}`} aria-pressed={on} onClick={() => toggle(k.id)}>
                  {on ? <><Icon name="check" size={14} stroke={3} />Noted on this phone</> : <>Notify me<span className="sr-only"> when {k.label} opens</span></>}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="how-fine">Demo: “Notify me” is kept on this phone only. Footfall never asks who you are.</p>
        <button type="button" className="btn-go wide" onClick={onClose}>Got it</button>
      </div>
    </div>,
    document.body,
  );
}

/** Owner setup, under the kind picker, for a business that isn't food: it joins Nearby today. */
export function Waitlist({ section }: { section: string }) {
  const kind = kindOf({ section });
  const [taps, toggle] = useTaps();
  const id = `owner:${kind.id}`;
  const on = taps.has(id);
  return (
    <div className="soon-wait" style={{ '--c': sectionOf({ section }).color } as CSSProperties}>
      <p role="status">
        <b>Coming soon in your category:</b> {kind.teaser} A verified visit will be {kind.visit}. Until then your business joins
        Nearby today, with its mascot and billboard on the map, and visits are verified with your counter code.
      </p>
      <button type="button" className={`btn-ghost small${on ? ' is-done' : ''}`} aria-pressed={on} onClick={() => toggle(id)}>
        {on ? <><Icon name="check" size={14} stroke={3} />You’re on the {kind.label.toLowerCase()} waitlist (demo)</> : <><Icon name="plus" size={15} />Join the waitlist</>}
      </button>
    </div>
  );
}
