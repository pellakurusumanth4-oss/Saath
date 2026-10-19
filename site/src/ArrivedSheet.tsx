// J3d: arrived. The mascot stands at the door above the sheet: talk to it, see the menu, or get the verified visit.
// The website has no AR (the user's rule): the door is the on-screen mascot and voice talk.
import { useEffect, useRef } from 'react';
import { hostOf, sectionOf, statusText, type ShopWithMenu } from './shops';
import { Icon, Podium } from './ui';

export default function ArrivedSheet({ shop, onTalk, onBought, onClose }: {
  shop: ShopWithMenu; onTalk: () => void; onBought: () => void; onClose: () => void;
}) {
  const mascot = hostOf(shop);
  const first = mascot.name.split(' ').pop()!;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => box.current?.focus(), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="arrived" ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`You’re at ${shop.name}`}>
      <Podium mascot={mascot} color={sectionOf(shop).color} height={210} className="arrived-podium" />
      <section className="arrived-sheet">
        <button type="button" className="icon-btn arrived-close" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        <p className="arrived-kicker">YOU’RE HERE</p>
        <h2 className="arrived-title">{first} is at the door</h2>
        <p className="arrived-sub">{shop.name} · {statusText(shop)}</p>
        <div className="arrived-actions">
          <button type="button" className="btn-go" onClick={onTalk}><Icon name="mic" size={20} />Talk to {first}</button>
          <a className="btn-ghost" href={`#/shop/${shop.slug}`}><Icon name="list" size={19} />See the menu</a>
        </div>
        <button type="button" className="arrived-bought" onClick={onBought}>
          <span>Bought something? Get your verified visit and your saving.</span><b>I bought ›</b>
        </button>
      </section>
    </div>
  );
}
