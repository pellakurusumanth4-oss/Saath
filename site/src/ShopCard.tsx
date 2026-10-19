// The shop card: what opens when a pin or billboard is tapped. On a phone it rises from the bottom with the mascot
// springing onto its edge; on a desktop it is the right-hand panel.
import { useEffect, useState, type CSSProperties } from 'react';
import type { LatLng } from '../../src/geo';
import Ad from './Ad';
import Compare from './Compare';
import { AR_READY, hostOf, portraitOf, sectionOf, updatedAt, walkMinutes, walkText, type ShopWithMenu } from './shops';
import { Icon, LiveChip, MenuRow, Podium, StatusChip } from './ui';

export default function ShopCard({ shop, me, layout, onClose, onTalk, onWalk }: {
  shop: ShopWithMenu; me: LatLng | null; layout: 'sheet' | 'panel';
  onClose?: () => void; onTalk: () => void; onWalk: () => void;
}) {
  const mascot = hostOf(shop);
  const section = sectionOf(shop);
  const off = shop.status === 'closed';
  const [now, setNow] = useState(() => Date.now());
  const [landed, setLanded] = useState(false);

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

  const rows = shop.menu.filter((item) => item.price !== null).slice(0, layout === 'panel' ? 4 : 2);
  const walk = walkText(me, shop);
  const ar = `/ar/?${new URLSearchParams({ shop: shop.slug, friend: mascot.id, name: mascot.name, tall: String(mascot.tall) })}`;
  const actions = (
    <div className="actions">
      <button type="button" className="btn-dark" onClick={onTalk}><Icon name="mic" size={19} />Talk to {mascot.name.split(' ').pop()}</button>
      {AR_READY.has(mascot.id) && <a className="btn-ghost square" href={ar} aria-label={`Meet ${mascot.name} in AR`}><Icon name="ar" size={19} /></a>}
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
              <p>{mascot.name} is the shop’s own mascot · {section.label}{shop.demo && <em className="demo">DEMO</em>}</p>
            </div>
          </div>
          <div className="chips"><StatusChip shop={shop} /><LiveChip updated={updatedAt(shop.menu)} now={now} grey={off} /></div>
          <Compare shop={shop} menu={shop.menu} mode="card" walk={walk} countUp={landed} />
          {shop.special && <p className="today-line"><span className="today" style={{ background: section.color }}>TODAY</span>{shop.special}</p>}
          <div className="menu-rows">{rows.map((item) => <MenuRow key={item.id} item={item} color={section.color} />)}</div>
          <a className="see-menu" href={`#/shop/${shop.slug}`}>See the whole menu →</a>
        </div>
        {actions}
      </aside>
    );
  }

  return (
    <div className="card-layer" key={shop.id}>
      <button type="button" className="icon-btn glass close-card" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      {/* Outside the scrolling card, so its overflow doesn't clip the mascot standing on its top edge. */}
      <Podium mascot={mascot} color={section.color} grey={off} height={150} className="card-podium" />
      <section className="card glass-sheet" aria-label={shop.name}>
        <p className="card-section"><span className="glyph" style={{ background: off ? '#B9BDC8' : section.color }}>{section.icon}</span>{section.label.toUpperCase()}{shop.demo && <em className="demo">DEMO</em>}</p>
        <h2 className="card-name">{shop.name}</h2>
        <div className="chips"><StatusChip shop={shop} /><LiveChip updated={updatedAt(shop.menu)} now={now} grey={off} /></div>
        <Ad shop={shop} height={118} width="100%" off={off} radius={16} className="card-ad" />
        <Compare shop={shop} menu={shop.menu} mode="card" walk={walk} countUp={landed} />
        {shop.special && <p className="today-line"><span className="today" style={{ background: section.color }}>TODAY</span>{shop.special}</p>}
        <div className="menu-rows">{rows.map((item) => <MenuRow key={item.id} item={item} color={section.color} />)}</div>
        <a className="see-menu" href={`#/shop/${shop.slug}`}>See the whole menu →</a>
        {actions}
      </section>
    </div>
  );
}
