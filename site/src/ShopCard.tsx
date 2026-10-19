// The shop card: what opens when a pin or billboard is tapped. On a phone it rises from the bottom with the mascot
// springing onto its edge; on a desktop it is the right-hand panel.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { LatLng } from '../../src/geo';
import Ad from './Ad';
import Compare from './Compare';
import { hostOf, portraitOf, sectionOf, updatedAt, walkMinutes, walkText, type ShopWithMenu } from './shops';
import { Icon, LiveChip, MenuRow, Podium, StatusChip } from './ui';

export default function ShopCard({ shop, me, layout, onClose, onTalk, onWalk }: {
  shop: ShopWithMenu; me: LatLng | null; layout: 'sheet' | 'panel';
  onClose?: () => void; onTalk: () => void; onWalk: () => void;
}) {
  const mascot = hostOf(shop);
  const section = sectionOf(shop);
  const off = shop.status === 'closed';
  const badge = `color-mix(in srgb, ${section.color} 60%, #04121A)`; // white TODAY stays readable on light section colours
  const [now, setNow] = useState(() => Date.now());
  const [landed, setLanded] = useState(false);
  const layer = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLHeadingElement>(null);
  // On a phone the card opens on the shop's name (only the phone card sets this ref), so it is read first.
  useEffect(() => name.current?.focus(), []);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(tick);
  }, []);
  // The saving counts up once the card has landed (520 ms on a phone).
  useEffect(() => {
    setLanded(false);
    const wait = setTimeout(() => setLanded(true), layout === 'sheet' ? 520 : 150);
    return () => clearTimeout(wait);
  }, [shop.id, layout]);
  // Escape closes the phone card, unless a talk or sheet open over it has made it inert (that one closes instead).
  // Capture, so this runs before that one's own Escape closes it and lifts the inert.
  useEffect(() => {
    if (layout !== 'sheet' || !onClose) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !layer.current?.closest('[inert]')) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [layout, onClose]);

  const rows = shop.menu.filter((item) => item.price !== null).slice(0, layout === 'panel' ? 4 : 2);
  const walk = walkText(me, shop);
  const actions = (
    <div className="actions">
      <button type="button" className="btn-dark" onClick={onTalk}><Icon name="mic" size={19} />Talk to {mascot.name.split(' ').pop()}</button>
      {off
        ? <button type="button" className="btn-ghost" disabled><Icon name="walk" size={19} />{shop.status_note || 'Closed now'}</button>
        : <button type="button" className="btn-go" onClick={onWalk}><Icon name="walk" size={19} />Walk{me ? ` · ${walkMinutes(me, shop)} min` : ''}</button>}
    </div>
  );

  if (layout === 'panel') {
    return (
      <aside className="panel panel-right glass" aria-label={shop.name} key={shop.id}>
        <div className="panel-scroll">
          <Ad shop={shop} height={190} width="100%" off={off} radius={20} />
          <div className="card-who">
            <img src={portraitOf(mascot)} alt="" className={off ? 'is-grey' : ''} style={{ '--ring': off ? '#B9BDC8' : section.color } as CSSProperties} />
            <div>
              <h2 className="card-name">{shop.name}</h2>
              <p>{mascot.name} is the shop’s mascot · {section.label}{shop.demo && <em className="demo">DEMO</em>}</p>
            </div>
          </div>
          <div className="chips"><StatusChip shop={shop} /><LiveChip updated={updatedAt(shop.menu)} now={now} grey={off} /></div>
          <Compare shop={shop} menu={shop.menu} mode="card" walk={walk} countUp={landed} />
          {shop.special && <p className="today-line"><span className="today" style={{ background: badge }}>TODAY</span>{shop.special}</p>}
          <div className="menu-rows">{rows.map((item) => <MenuRow key={item.id} item={item} color={section.color} />)}</div>
          <a className="see-menu" href={`#/shop/${shop.slug}`}>{shop.menu.length ? `See the ${section.list.toLowerCase()} →` : 'See the shop →'}</a>
        </div>
        {actions}
      </aside>
    );
  }

  return (
    <div ref={layer} className="card-layer" key={shop.id}>
      <button type="button" className="icon-btn glass close-card" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      {/* Outside the scrolling card, so its overflow doesn't clip the mascot standing on its top edge. */}
      <Podium mascot={mascot} color={section.color} grey={off} height={150} className="card-podium" />
      <section className="card glass-sheet" aria-label={shop.name}>
        <p className="card-section"><span className="glyph" style={{ background: off ? '#B9BDC8' : section.color }}>{section.icon}</span>{section.label.toUpperCase()}{shop.demo && <em className="demo">DEMO</em>}</p>
        <h2 ref={name} tabIndex={-1} className="card-name">{shop.name}</h2>
        <div className="chips"><StatusChip shop={shop} /><LiveChip updated={updatedAt(shop.menu)} now={now} grey={off} /></div>
        <Ad shop={shop} height={118} width="100%" off={off} radius={16} className="card-ad" />
        <Compare shop={shop} menu={shop.menu} mode="card" walk={walk} countUp={landed} />
        {shop.special && <p className="today-line"><span className="today" style={{ background: badge }}>TODAY</span>{shop.special}</p>}
        <div className="menu-rows">{rows.map((item) => <MenuRow key={item.id} item={item} color={section.color} />)}</div>
        <a className="see-menu" href={`#/shop/${shop.slug}`}>{shop.menu.length ? `See the ${section.list.toLowerCase()} →` : 'See the shop →'}</a>
        {actions}
      </section>
    </div>
  );
}
