// A shop's own page (#/shop/<slug>): its ad, its mascot, the saving, its billboard on the map, the whole live menu.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import maplibregl from 'maplibre-gl';
import { MAP_STYLE } from '../../src/mapStyle';
import type { LatLng } from '../../src/geo';
import Ad from './Ad';
import Compare from './Compare';
import MapBoundary from './MapBoundary';
import MeetAr from './MeetAr';
import Reviews from './Reviews';
import { boardOf, hostOf, orderOf, sectionOf, updatedAt, useShop, walkText, type Shop } from './shops';
import { Icon, LiveChip, MenuRow, Podium, StatusChip } from './ui';
import { useInert } from './useInert';

export default function ShopPage({ slug, me, onTalk, onWalk }: {
  slug: string; me: LatLng | null; onTalk: (shopId: string) => void; onWalk: (shopId: string) => void;
}) {
  const { shop, menu, missing } = useShop(slug);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false); // where there's no share sheet, the link is copied instead
  const page = useRef<HTMLDivElement>(null);
  useInert(page);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(tick);
  }, []);
  // Escape goes back to the map, unless a talk or sheet open over this page has made it inert (that one closes instead).
  // Capture, so this runs before that one's own Escape closes it and lifts the inert.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !page.current?.closest('[inert]')) window.location.hash = '#/';
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  if (!shop) {
    return (
      <div ref={page} className="page" role="dialog" aria-modal="true" aria-label="Shop">
        <div className="page-sheet"><a className="back-link" href="#/">← Map</a><p className="note">{missing ? 'There’s no shop at this link.' : 'Loading the shop…'}</p></div>
      </div>
    );
  }

  const mascot = hostOf(shop);
  const section = sectionOf(shop);
  const off = shop.status === 'closed';
  const saving = orderOf(shop, menu)?.saving ?? 0;
  const share = () => {
    const url = window.location.href;
    if (navigator.share) void navigator.share({ title: shop.name, url }).catch(() => {});
    else void navigator.clipboard?.writeText(url).then(() => setCopied(true), () => {});
  };

  return (
    <div ref={page} className="page shop-page" role="dialog" aria-modal="true" aria-label={shop.name} style={{ '--c': section.color } as CSSProperties}>
      <div className="page-sheet">
        <div className="shop-hero">
          <Ad shop={shop} height={262} width="100%" off={off} radius={0} className="hero-ad" />
          <a className="icon-btn glass hero-back" href="#/" aria-label="Back to the map"><Icon name="back" /></a>
          <button type="button" autoFocus className="icon-btn glass hero-share" onClick={share} aria-label={copied ? 'Link copied' : 'Share'} title={copied ? 'Link copied' : undefined}><Icon name={copied ? 'check' : 'share'} /></button>
        </div>
        <div className="shop-body">
          <Podium mascot={mascot} color={section.color} grey={off} height={150} className="shop-podium" />
          <p className="card-section">{section.label.toUpperCase()}{shop.demo && <> · <em className="demo">DEMO SHOP</em></>}</p>
          <h1 className="shop-title">{shop.name}</h1>
          {shop.area && <p className="shop-area">{shop.area}</p>}
          {shop.about && <p className="shop-area">{shop.about}</p>}
          {shop.hours && <p className="shop-area">Hours: {shop.hours}</p>}
          <div className="chips"><StatusChip shop={shop} /><LiveChip updated={updatedAt(menu)} now={now} grey={off} /></div>
          <Compare shop={shop} menu={menu} mode="full" walk={walkText(me, shop)} countUp />
          {shop.special && <p className="today-line"><span className="today" style={{ background: `color-mix(in srgb, ${section.color} 60%, #04121A)` }}>TODAY</span>{shop.special}</p>}
          {shop.offers.length > 0 && <ul className="offers">{shop.offers.map((offer) => <li key={offer}>{offer}</li>)}</ul>}

          <h2 className="block-title">Their billboard on the map</h2>
          <MapBoundary fallback={<span className={`board-cab board-screen${off ? ' is-off' : ''}`} style={{ '--ad-c': shop.ad_color || section.color } as CSSProperties}><Ad shop={shop} height={160} width="100%" off={off} running saving={saving} /></span>}>
            <BoardPreview shop={shop} off={off} saving={saving} />
          </MapBoundary>

          {/* Shops registered on the owner page have no menu (the user: owners give no prices): no empty menu block. */}
          {menu.length > 0 && (
            <>
              <h2 className="block-title">{section.list}</h2>
              <div className="menu-rows full">{menu.map((item) => <MenuRow key={item.id} item={item} color={section.color} />)}</div>
              {menu.some((item) => item.app_price !== null) && <p className="fine">Both prices are the shop’s own. App fees are typical, not exact.</p>}
            </>
          )}
          <Reviews shop={shop} />
          {shop.story && <div className="story"><b>The story</b><p>{shop.story}</p></div>}
        </div>
        <div className="actions sticky">
          <MeetAr shop={shop} className="btn-ghost ar-meet" onTalk={() => onTalk(shop.id)} />
          <button type="button" className="btn-dark" onClick={() => onTalk(shop.id)}><Icon name="mic" size={19} />Talk to {mascot.name.split(' ').pop()}</button>
          {off
            ? <button type="button" className="btn-ghost" disabled><Icon name="walk" size={19} />{shop.status_note || 'Closed now'}</button>
            : <button type="button" className="btn-go" onClick={() => onWalk(shop.id)}><Icon name="walk" size={19} />Walk</button>}
        </div>
      </div>
    </div>
  );
}

/** A small tilted look at the shop's billboard where it stands, its ad running (not interactive). */
function BoardPreview({ shop, off, saving }: { shop: Shop; off: boolean; saving: number }) {
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
    // Pushed down so the whole face fits the 210 px box and the pole runs out of its bottom.
    const marker = new maplibregl.Marker({ element, anchor: 'bottom', offset: [0, 150] }).setLngLat([spot.lng, spot.lat]).addTo(map);
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
        <div className={`board is-still${off ? ' is-off' : ''}`} style={{ '--ad-c': shop.ad_color || sectionOf(shop).color } as CSSProperties}>
          <span className="board-shadow" /><span className="board-pole" />
          <span className="board-panel"><span className="board-cab"><Ad shop={shop} height={90} off={off} running saving={saving} /></span><span className="board-walk" /></span>
        </div>, slot)}
    </div>
  );
}
