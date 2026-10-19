import { useCallback, useEffect, useMemo, useState } from 'react';
import MapView from './MapView';
import MapBoundary from './MapBoundary';
import NearList from './NearList';
import ShopCard from './ShopCard';
import ShopPage from './ShopPage';
import OwnerPage from './OwnerPage';
import BusinessPage from './BusinessPage';
import TalkPanel from './TalkPanel';
import SavedSheet from './SavedSheet';
import { useMe } from './hooks';
import { orderOf, sectionOf, useShops, type ShopWithMenu } from './shops';
import { Icon } from './ui';
import { distanceM, type LatLng } from '../../src/geo';

/** The page is in the hash (#/shop/<slug>, #/owner, #/business): the host serves only index.html, so paths would 404. */
const useHash = () => {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
};

const useDesktop = () => {
  const query = '(min-width: 1024px)';
  const [desktop, setDesktop] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setDesktop(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, []);
  return desktop;
};

/** The category chips: which sections each one shows. */
const CATEGORIES: { label: string; sections: string[]; glyph?: string }[] = [
  { label: 'All', sections: [] },
  { label: 'Food', sections: ['restaurant', 'streetfood'], glyph: 'restaurant' },
  { label: 'Café', sections: ['cafe'], glyph: 'cafe' },
  { label: 'Juice', sections: ['juice'], glyph: 'juice' },
  { label: 'Bakery', sections: ['bakery'], glyph: 'bakery' },
  { label: 'Grocery', sections: ['grocery'], glyph: 'grocery' },
  { label: 'Pharmacy', sections: ['pharmacy'], glyph: 'pharmacy' },
  { label: 'Shopping', sections: ['boutique', 'mall', 'electronics', 'books'], glyph: 'boutique' },
  { label: 'Services', sections: ['salon', 'realestate', 'gym', 'hotel'], glyph: 'salon' },
];

type Walk = { shopId: string; from: LatLng | null; started: number };

export default function App() {
  const { me, locating, error, whereAmI, setMySpot } = useMe();
  const shops = useShops();
  const hash = useHash();
  const desktop = useDesktop();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ spot: LatLng; key: string } | null>(null);
  const [settingSpot, setSettingSpot] = useState(false);
  const [talkingId, setTalkingId] = useState<string | null>(null);
  const [walk, setWalk] = useState<Walk | null>(null);
  const [arrived, setArrived] = useState<{ shopId: string; metres: number | null; minutes: number | null } | null>(null);

  const shopSlug = /^#\/shop\/([a-z0-9-]{3,40})$/.exec(hash)?.[1] ?? null;
  const page = shopSlug ? 'shop' : hash === '#/owner' ? 'owner' : hash === '#/business' ? 'business' : 'map';

  const shown = useMemo(() => {
    const { sections } = CATEGORIES[category];
    const q = query.trim().toLowerCase();
    return shops.filter((shop) => (!sections.length || sections.includes(shop.section))
      && (!q || [shop.name, sectionOf(shop).label, shop.area, ...shop.menu.map((item) => item.name)].some((text) => text.toLowerCase().includes(q))));
  }, [shops, category, query]);

  // On a desktop one shop is always open in the right panel: the one picked, else the nearest open one with a saving.
  const fallback = useMemo(() => {
    const open = shown.filter((shop) => shop.status !== 'closed');
    const pool = open.length ? open : shown;
    return [...pool].sort((a, b) => (me ? distanceM(me, a) - distanceM(me, b) : (orderOf(b, b.menu)?.saving ?? 0) - (orderOf(a, a.menu)?.saving ?? 0)))[0] ?? null;
  }, [shown, me]);
  const selected = shops.find((shop) => shop.id === selectedId) ?? (desktop ? fallback : null);

  const focusOn = (spot: LatLng) => setFocus({ spot, key: `${spot.lat},${spot.lng},${Date.now()}` });
  const pick = useCallback((shop: ShopWithMenu) => {
    setSelectedId(shop.id);
    setFocus({ spot: shop, key: `${shop.id}:${Date.now()}` });
  }, []);

  const onLocate = () => {
    setSettingSpot(false);
    whereAmI();
    if (me) focusOn(me);
  };
  const onSetSpot = useCallback((spot: LatLng) => {
    setMySpot(spot);
    setSettingSpot(false);
  }, [setMySpot]);

  // Going to another page (a link, or the back button) ends a talk, which would otherwise cover that page.
  useEffect(() => setTalkingId(null), [hash]);

  // The page for businesses shows the city's billboards through on the right.
  useEffect(() => {
    if (page === 'business') setFocus({ spot: { lat: 18.5195, lng: 73.8452 }, key: `business:${Date.now()}` });
  }, [page]);

  // When a fresh fix arrives, fly to it.
  const meKey = me ? `${me.lat},${me.lng}` : '';
  useEffect(() => {
    if (me) setFocus({ spot: me, key: `me:${meKey}:${Date.now()}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meKey]);

  // Walking to a shop: arriving within 30 m (or tapping "I'm here") shows what walking saved.
  const walkShop = walk ? shops.find((shop) => shop.id === walk.shopId) ?? null : null;
  const arrive = useCallback(() => {
    if (!walk || !walkShop) return;
    const metres = walk.from ? distanceM(walk.from, walkShop) : null;
    setArrived({ shopId: walk.shopId, metres, minutes: metres === null ? null : Math.max(1, Math.round((Date.now() - walk.started) / 60000)) });
    setWalk(null);
  }, [walk, walkShop]);
  useEffect(() => {
    if (!walk || !walkShop || !('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition((position) => {
      if (distanceM({ lat: position.coords.latitude, lng: position.coords.longitude }, walkShop) <= 30) arrive();
    }, () => {}, { enableHighAccuracy: true, maximumAge: 5000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [walk, walkShop, arrive]);

  const arrivedShop = arrived ? shops.find((shop) => shop.id === arrived.shopId) ?? null : null;
  const arrivedOrder = arrivedShop ? orderOf(arrivedShop, arrivedShop.menu) : null;
  const talking = talkingId ? shops.find((shop) => shop.id === talkingId) ?? null : null;
  const cardOpen = !desktop && !!selected;
  // The screen edges the city must stay clear of: the bars and sheet on a phone, the side panels on a desktop.
  const padding = desktop
    ? { top: 20, bottom: 20, left: page === 'business' ? 660 : 424, right: page === 'business' ? 20 : 440 }
    : { top: cardOpen ? 140 : 132, bottom: Math.round(window.innerHeight * (cardOpen ? 0.62 : 0.36)), left: 0, right: 0 };

  return (
    <div className={`app ${desktop ? 'is-desktop' : 'is-phone'}`}>
      <MapBoundary fallback={<div className="map-fallback"><p>The 3D city needs WebGL, which is off in this browser.</p><p>The list still works: tap a shop.</p></div>}>
        <MapView me={me} shops={shown} selected={selected?.id ?? null} spotlight={!!selectedId && shown.some((shop) => shop.id === selectedId)} focus={focus?.spot ?? null} focusKey={focus?.key ?? ''}
          settingSpot={settingSpot} onSetSpot={onSetSpot} onPick={pick} padding={padding} />
      </MapBoundary>

      {desktop ? (
        <aside className="panel panel-left glass" aria-label="Saath">
          <div className="brand">
            <span className="brand-tile"><Icon name="walk" size={22} color="#5BE38F" stroke={2.4} /></span>
            <div><b>saath</b><span>Landmarks of Deccan, Pune</span></div>
            <a href="#/business">For businesses →</a>
          </div>
          <Search query={query} setQuery={setQuery} />
          <Chips category={category} setCategory={setCategory} />
          <NearList shops={shown} me={me} thumb={76} onPick={pick} />
          <SpotTools locating={locating} settingSpot={settingSpot} onLocate={onLocate} onSetSpot={() => setSettingSpot((v) => !v)} />
        </aside>
      ) : (
        <>
          {!cardOpen && (
            <header className="top">
              <Search query={query} setQuery={setQuery} logo />
              <Chips category={category} setCategory={setCategory} />
            </header>
          )}
          {!cardOpen && (
            <>
              <SpotTools locating={locating} settingSpot={settingSpot} onLocate={onLocate} onSetSpot={() => setSettingSpot((v) => !v)} floating />
              <div className="sheet glass-sheet near-sheet">
                <div className="grabber" />
                <NearList shops={shown} me={me} onPick={pick} />
                <a className="for-business" href="#/business">For businesses →</a>
              </div>
            </>
          )}
        </>
      )}

      {error && <div className="notice" role="alert">{error}</div>}
      {settingSpot && <div className="notice">Tap the map where you are</div>}

      {walk && walkShop && (
        <div className="walk-bar glass" role="status">
          <Icon name="walk" size={20} />
          <span>Walking to <b>{walkShop.name}</b></span>
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${walkShop.lat},${walkShop.lng}&travelmode=walking`} target="_blank" rel="noreferrer">Directions</a>
          <button type="button" className="btn-go small" onClick={arrive}>I’m here</button>
          <button type="button" className="icon-btn" onClick={() => setWalk(null)} aria-label="Stop walking"><Icon name="close" size={18} /></button>
        </div>
      )}

      {selected && page === 'map' && (
        <ShopCard key={selected.id} shop={selected} me={me} layout={desktop ? 'panel' : 'sheet'}
          onClose={() => setSelectedId(null)}
          onTalk={() => setTalkingId(selected.id)}
          onWalk={() => setWalk({ shopId: selected.id, from: me, started: Date.now() })} />
      )}

      {page === 'shop' && shopSlug && (
        <ShopPage key={shopSlug} slug={shopSlug} me={me} onTalk={setTalkingId} onWalk={(id) => {
          const shop = shops.find((s) => s.id === id);
          if (shop) pick(shop);
          setWalk({ shopId: id, from: me, started: Date.now() });
          window.location.hash = '#/';
        }} />
      )}
      {page === 'owner' && <OwnerPage />}
      {page === 'business' && <BusinessPage shops={shops} />}

      {talking && <TalkPanel shop={talking} onClose={() => setTalkingId(null)} />}
      {arrivedShop && arrivedOrder && arrived && (
        <SavedSheet shop={arrivedShop} order={arrivedOrder} metres={arrived.metres} minutes={arrived.minutes} onClose={() => setArrived(null)} />
      )}
    </div>
  );
}

function Search({ query, setQuery, logo = false }: { query: string; setQuery: (q: string) => void; logo?: boolean }) {
  return (
    <label className="search glass">
      {logo ? <span className="brand-tile small"><Icon name="walk" size={18} color="#5BE38F" stroke={2.4} /></span> : <Icon name="search" size={19} />}
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shops, food, services" aria-label="Search shops, food, services" />
    </label>
  );
}

function Chips({ category, setCategory }: { category: number; setCategory: (i: number) => void }) {
  return (
    <div className="cats" role="group" aria-label="Categories">
      {CATEGORIES.map((c, i) => (
        <button key={c.label} type="button" className={`cat${i === category ? ' is-on' : ' glass'}`} aria-pressed={i === category} onClick={() => setCategory(i)}>
          {c.glyph && <span className="glyph" style={{ background: sectionOf({ section: c.glyph }).color }}>{sectionOf({ section: c.glyph }).icon}</span>}
          {c.label}
        </button>
      ))}
    </div>
  );
}

function SpotTools({ locating, settingSpot, onLocate, onSetSpot, floating = false }: {
  locating: boolean; settingSpot: boolean; onLocate: () => void; onSetSpot: () => void; floating?: boolean;
}) {
  return (
    <div className={`spot-tools${floating ? ' floating' : ''}`}>
      <button type="button" className="icon-btn glass round" onClick={onLocate} aria-label={locating ? 'Finding you' : 'Where am I'} title="Where am I">
        <Icon name="locate" size={22} color="#2563EB" />
      </button>
      <button type="button" className={`spot-set glass${settingSpot ? ' is-on' : ''}`} onClick={onSetSpot}>{settingSpot ? 'Tap the map…' : 'Set my spot'}</button>
    </div>
  );
}
