// The usual order's saving: the shop's own app prices + typical app fees against walking in, and how it's worked out.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ago, orderOf, dollars, updatedAt, type MenuItem, type Order, type Shop } from './shops';
import { Icon, SaveChip } from './ui';
import { useInert } from './useInert';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Counts up from 0 to the number over 400 ms once `go` is set (just the number with reduced motion). */
export function useCountUp(target: number, go: boolean): number {
  // Starts at 0 even before `go`, so a card that is still rising doesn't flash the full number first.
  const [value, setValue] = useState(() => (reduced() ? target : 0));
  useEffect(() => {
    if (reduced()) {
      setValue(target);
      return;
    }
    if (!go) return;
    const start = performance.now();
    let frame = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 400);
      setValue(Math.round(target * (1 - (1 - k) ** 3) * 100) / 100);   // to the cent: $3.90 must not end as $4
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, go]);
  return value;
}

export default function Compare({ shop, menu, mode = 'card', walk = null, countUp = false }: {
  shop: Shop; menu: MenuItem[]; mode?: 'full' | 'card' | 'compact' | 'line'; walk?: string | null; countUp?: boolean;
}) {
  const order = orderOf(shop, menu);
  const [how, setHow] = useState(false);
  const shown = useCountUp(order?.saving ?? 0, countUp);
  if (!order) return null;
  const off = shop.status === 'closed';
  if (mode === 'line') return <div className="cmp-line"><s>{dollars(order.apps)} apps</s> → <b>{dollars(order.here)} here</b></div>;
  if (mode === 'compact') {
    return (
      <div className={`cmp-compact${off ? ' is-off' : ''}`}>
        <div className="cmp-compact-text">
          <div className="cmp-label">USUAL ORDER · {order.names.toUpperCase()}</div>
          <div className="cmp-compact-sum"><s>{dollars(order.apps)} on apps</s> → <b>{dollars(order.here)} here</b></div>
        </div>
        <SaveChip amount={order.saving} size="l" grey={off} />
      </div>
    );
  }
  return (
    <div className={`cmp cmp-${mode}${off ? ' is-off' : ''}`}>
      <div className="cmp-top">
        <span className="cmp-label">USUAL ORDER · {order.names.toUpperCase()}</span>
        <button type="button" className="cmp-how" onClick={() => setHow(true)}><Icon name="info" size={13} />How?</button>
      </div>
      <div className="cmp-main">
        <div className="cmp-apps"><span>Delivery apps</span><s>{dollars(order.apps)}</s></div>
        <Icon name="arrow" size={17} />
        <div className="cmp-here"><span>Walk in</span><b>{dollars(order.here)}</b></div>
        <span className="cmp-gap" />
        <div className="cmp-save"><span>you save</span><b>{dollars(shown)}</b></div>
      </div>
      <div className="cmp-fine">
        {dollars(order.itemsApps)} at the shop’s app prices + ~{dollars(order.fee)} typical app fees{walk ? ` · walk ${walk}` : ''}
      </div>
      {/* On body: the card's backdrop-filter would otherwise trap the fixed sheet inside the card. */}
      {how && createPortal(<HowSheet shop={shop} order={order} updated={updatedAt(menu)} onClose={() => setHow(false)} />, document.body)}
    </div>
  );
}

/** "How we work out your saving": app prices come from the shop, app fees are typical, walking costs nothing. */
export function HowSheet({ shop, order, updated, onClose }: { shop: Shop; order: Order; updated: string; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);
  useInert(box);
  useEffect(() => () => opener.current?.focus(), []); // after useInert's cleanup, so the opener is focusable again
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-back" onClick={onClose}>
      <div ref={box} className="sheet glass-sheet how" role="dialog" aria-modal="true" aria-label="How we work out your saving" onClick={(event) => event.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <h3>How we work out your saving</h3>
          <button type="button" autoFocus className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <ul className="how-points">
          <li><Icon name="tag" /><div><b>App prices come from the shop</b>{shop.name} enters what it charges on delivery apps for each item, next to its counter price.</div></li>
          <li><Icon name="receipt" /><div><b>App fees are typical, not exact</b>About $1.50 delivery + 50¢ platform + 50¢ packaging. Your app shows the real amount at checkout.</div></li>
          <li><Icon name="walk" /><div><b>Walking there costs nothing</b>You pay the counter price and skip the fees.</div></li>
        </ul>
        <div className="how-example">
          <span>{order.names}</span>
          <span>Apps {dollars(order.itemsApps)} + ~{dollars(order.fee)} fees = {dollars(order.apps)} · walk in {dollars(order.here)}</span>
          <b>You save {dollars(order.saving)}</b>
        </div>
        <p className="how-fine">Footfall isn’t linked to any delivery app.{updated ? ` Prices updated ${ago(updated, Date.now())} by the shop.` : ''}</p>
        <button type="button" className="btn-go wide" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
