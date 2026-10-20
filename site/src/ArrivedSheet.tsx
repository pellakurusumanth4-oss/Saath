// J3d: arrived. The mascot stands at the door above the sheet: meet it in AR (an iPhone's AR Quick Look, or Android
// Chrome with ARCore in a new tab, so this sheet stays; anywhere else a QR hands it to a phone that can), talk to it on
// screen, see the menu, or get the verified visit.
import { useEffect, useRef } from 'react';
import MeetAr from './MeetAr';
import { hostOf, sectionOf, statusText, type ShopWithMenu } from './shops';
import { isFood } from './kinds';
import { Icon, Podium } from './ui';
import { useInert } from './useInert';

export default function ArrivedSheet({ shop, onTalk, onBought, onClose }: {
  shop: ShopWithMenu; onTalk: () => void; onBought: () => void; onClose: () => void;
}) {
  const mascot = hostOf(shop);
  const first = mascot.name.split(' ').pop()!;
  const box = useRef<HTMLDivElement>(null);
  useInert(box);
  useEffect(() => box.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    // Not while a page or sheet opened from here (the shop page) is over it: that one closes first.
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && !box.current?.closest('[inert]') && onClose();
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
        <MeetAr shop={shop} className="btn-go arrived-meet" onTalk={onTalk} />
        <div className="arrived-actions">
          <button type="button" className="btn-dark" onClick={onTalk}><Icon name="mic" size={20} />Talk to {first}</button>
          <a className="btn-ghost" href={`#/shop/${shop.slug}`}><Icon name="list" size={19} />{shop.menu.length ? 'See the menu' : 'See the shop'}</a>
        </div>
        <button type="button" className="arrived-bought" onClick={onBought}>
          <span>Bought something? Get your verified visit{isFood(shop) ? ' and your saving' : ''}.</span><b>I bought ›</b>
        </button>
      </section>
    </div>
  );
}
