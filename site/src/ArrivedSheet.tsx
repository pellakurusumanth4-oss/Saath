// J3d: arrived. The mascot stands at the door above the sheet: meet it in AR where the phone can (Android Chrome with
// ARCore, in a new tab so this sheet stays), talk to it on screen, see the menu, or get the verified visit.
// AR is the website's one way into /ar/ (the user's choice, 19 Oct); everyone else meets the mascot on screen.
import { useEffect, useRef, useState } from 'react';
import { hostOf, sectionOf, statusText, type ShopWithMenu } from './shops';
import { Icon, Podium } from './ui';

type XR = { isSessionSupported: (mode: 'immersive-ar') => Promise<boolean> };
// Asked once, as the page loads, so the door opens with the right buttons instead of growing a moment later.
const arCheck = (navigator as Navigator & { xr?: XR }).xr?.isSessionSupported('immersive-ar').catch(() => false);
let arOk = false;
void arCheck?.then((ok) => { arOk = ok; });

export default function ArrivedSheet({ shop, onTalk, onBought, onClose }: {
  shop: ShopWithMenu; onTalk: () => void; onBought: () => void; onClose: () => void;
}) {
  const mascot = hostOf(shop);
  const first = mascot.name.split(' ').pop()!;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => box.current?.focus(), []);
  const [ar, setAr] = useState(arOk);
  useEffect(() => {
    let live = true;
    void arCheck?.then((ok) => { if (live) setAr(ok); });
    return () => { live = false; };
  }, []);
  const arLink = `/ar/?${new URLSearchParams({ friend: mascot.id, shop: shop.slug, name: first, tall: String(mascot.tall) })}`;
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
        {ar && <a className="btn-go arrived-meet" href={arLink} target="_blank" rel="noopener"><Icon name="ar" size={20} />Meet {first}</a>}
        <div className="arrived-actions">
          <button type="button" className={ar ? 'btn-dark' : 'btn-go'} onClick={onTalk}><Icon name="mic" size={20} />Talk to {first}</button>
          <a className="btn-ghost" href={`#/shop/${shop.slug}`}><Icon name="list" size={19} />{shop.menu.length ? 'See the menu' : 'See the shop'}</a>
        </div>
        <button type="button" className="arrived-bought" onClick={onBought}>
          <span>Bought something? Get your verified visit and your saving.</span><b>I bought ›</b>
        </button>
      </section>
    </div>
  );
}
