// A shop's own page (#/shop/<slug>): its ad, its mascot, the saving, its billboard on the map, the whole live menu.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import maplibregl from 'maplibre-gl';
import { MAP_STYLE } from '../../src/mapStyle';
import type { LatLng } from '../../src/geo';
import Ad from './Ad';
import Compare from './Compare';
import MapBoundary from './MapBoundary';
import { boardOf, hostOf, sectionOf, updatedAt, useShop, walkMinutes, walkText, type Shop } from './shops';
import { Icon, LiveChip, MenuRow, Podium, StatusChip } from './ui';

export default function ShopPage({ slug, me, onTalk, onWalk }: {
  slug: string; me: LatLng | null; onTalk: (shopId: string) => void; onWalk: (shopId: string) => void;
}) {
  const { shop, menu, missing } = useShop(slug);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(tick);
  }, []);

  if (!shop) {
    return (
      <div className="page" role="dialog" aria-modal="true" aria-label="Shop">
        <div className="page-sheet"><a className="back-link" href="#/">← Map</a><p className="note">{missing ? 'There’s no shop at this link.' : 'Loading the shop…'}</p></div>
      </div>
    );
  }

  const mascot = hostOf(shop);
  const section = sectionOf(shop);
  const off = shop.status === 'closed';
  const share = () => {
    const url = window.location.href;
    if (navigator.share) void navigator.share({ title: shop.name, url }).catch(() => {});
    else void navigator.clipboard?.writeText(url);
  };

  return (
    <div className="page shop-page" role="dialog" aria-modal="true" aria-label={shop.name} style={{ '--c': section.color } as CSSProperties}>
      <div className="page-sheet">
        <div className="shop-hero">
          <Ad shop={shop} height={262} width="100%" off={off} radius={0} className="hero-ad" />
          <a className="icon-btn glass hero-back" href="#/" aria-label="Back to the map"><Icon name="back" /></a>
          <button type="button" autoFocus className="icon-btn glass hero-share" onClick={share} aria-label="Share"><Icon name="share" /></button>
        </div>
        <div className="shop-body">
          <Podium mascot={mascot} color={section.color} grey={off} height={150} className="shop-podium" />
          <p className="card-section">{section.label.toUpperCase()}{shop.demo && <> · <em className="demo">DEMO SHOP</em></>}</p>
          <h1 className="shop-title">{shop.name}</h1>
          {shop.area && <p className="shop-area">{shop.area}</p>}
          <div className="chips"><StatusChip shop={shop} /><LiveChip updated={updatedAt(menu)} now={now} grey={off} /></div>
          <Compare shop={shop} menu={menu} mode="full" walk={walkText(me, shop)} countUp />
          {shop.special && <p className="today-line"><span className="today" style={{ background: section.color }}>TODAY</span>{shop.special}</p>}
          {shop.offers.length > 0 && <ul className="offers">{shop.offers.map((offer) => <li key={offer}>{offer}</li>)}</ul>}

          <h2 className="block-title">Their billboard on the map</h2>
          <MapBoundary fallback={<Ad shop={shop} height={160} width="100%" off={off} />}>
            <BoardPreview shop={shop} off={off} />
          </MapBoundary>

          <h2 className="block-title">Menu</h2>
          <div className="menu-rows full">
            {menu.length === 0 && <p className="note">The menu isn’t up yet.</p>}
            {menu.map((item) => <MenuRow key={item.id} item={item} color={section.color} />)}
          </div>
          <p className="fine">Both prices are the shop’s own. App fees are typical, not exact.</p>
          {shop.story && <div className="story"><b>The story</b><p>{shop.story}</p></div>}
        </div>
        <div className="actions sticky">
          <button type="button" className="btn-dark" onClick={() => onTalk(shop.id)}><Icon name="mic" size={19} />Talk to {mascot.name.split(' ').pop()}</button>
          {off
            ? <button type="button" className="btn-ghost" disabled><Icon name="walk" size={19} />{shop.status_note || 'Closed now'}</button>
            : <button type="button" className="btn-go" onClick={() => onWalk(shop.id)}><Icon name="walk" size={19} />Walk{me ? ` · ${walkMinutes(me, shop)} min` : ''}</button>}
        </div>
      </div>
    </div>
  );
}

/** A small tilted look at the shop's billboard where it stands (not interactive). */
function BoardPreview({ shop, off }: { shop: Shop; off: boolean }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!box.current) return;
    const spot = boardOf(shop);
    const map = new maplibregl.Map({
      container: box.current, style: MAP_STYLE as maplibregl.StyleSpecification, center: [spot.lng, spot.lat],
      zoom: 16.9, pitch: 56, bearing: -17, interactive: false, attributionControl: false,
    });
    const element = document.createElement('div');
    const marker = new maplibregl.Marker({ element, anchor: 'bottom' }).setLngLat([spot.lng, spot.lat]).addTo(map);
    element.removeAttribute('aria-label');
    setSlot(element);
    return () => {
      marker.remove();
      map.remove();
    };
    // One preview per shop page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop.id]);
  return (
    <div className="board-preview">
      <div ref={box} className="board-preview-map" />
      {slot && createPortal(
        <div className={`board is-still${off ? ' is-off' : ''}`}>
          <span className="board-shadow" /><span className="board-pole" />
          <span className="board-panel"><span className="board-lamps"><i /><i /><i /></span><span className="board-frame"><Ad shop={shop} height={90} off={off} radius={2} /></span><span className="board-walk" /></span>
        </div>, slot)}
    </div>
  );
}
