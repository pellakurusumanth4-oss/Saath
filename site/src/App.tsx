import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView from './MapView';
import MapBoundary from './MapBoundary';
import NearList from './NearList';
import ShopCard from './ShopCard';
import ShopPage from './ShopPage';
import BusinessPage from './BusinessPage';
import TalkPanel from './TalkPanel';
import SavedSheet from './SavedSheet';
import RoutePreview from './RoutePreview';
import WalkHud, { type WalkView } from './WalkHud';
import ArrivedSheet from './ArrivedSheet';
import CodeSheet from './CodeSheet';
import ReviewSheet from './ReviewSheet';
import { walkingRoute, type Route } from './route';
import { unlockSound } from './walking';
import LocationAsk from './LocationAsk';
import InstallSheet from './InstallSheet';
import { useInstall } from './install';
import { useDesktop, useMe } from './hooks';
import { figureOf, hostOf, orderOf, sectionOf, useShops, type ShopWithMenu } from './shops';
import { Icon } from './ui';
import { distanceM, type LatLng } from '../../src/geo';

/** The page is in the hash (#/shop/<slug>, #/owner, #/business): the host serves only files, so paths would 404. */
const useHash = () => {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
};

/** localStorage / sessionStorage that never throws (private browsing, blocked storage). */
const stored = (store: () => Storage, key: string) => { try { return store().getItem(key); } catch { return null; } };
const store = (store: () => Storage, key: string, value: string) => { try { store().setItem(key, value); } catch { /* not kept */ } };

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

/** J4/J5: walking to a shop: the route preview, then turn by turn. */
type Trip = { shopId: string; route: Route | null; walking: boolean; started: number };
/** J6–J8: at the door: arrived, the counter code, the review, the saving. */
type Door = { shopId: string; step: 'arrived' | 'code' | 'review' | 'saved'; metres: number | null; minutes: number | null; visit?: string; posted?: boolean };
/** The walk or door step kept for a reload or a discarded tab: which shop, which step, when the walk began. Never a location. */
type Kept = { shopId: string; step: 'route' | 'walking' | 'arrived' | 'code'; started: number };
const KEPT = 'saath:walk';
const kept = (): Kept | null => {
  try {
    const value = JSON.parse(stored(() => sessionStorage, KEPT) || 'null');
    return typeof value?.shopId === 'string' && ['route', 'walking', 'arrived', 'code'].includes(value.step) && typeof value.started === 'number' ? value : null;
  } catch { return null; }
};

/** The owner page is its own page now (/owner/): the old in-app link goes there. */
const OWNER_PAGE = '/owner/';
if (window.location.hash === '#/owner') window.location.replace(OWNER_PAGE);

export default function App() {
  const { me, locating, error, denied, whereAmI, setMySpot, clearError } = useMe();
  const { installed } = useInstall();
  const shops = useShops();
  const hash = useHash();
  const desktop = useDesktop();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ spot: LatLng; key: string } | null>(null);
  const [settingSpot, setSettingSpot] = useState(false);
  // J3: the kind location ask, "pick your spot", and the install sheet. The home page (/) is the welcome now.
  const [asking, setAsking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const spotDraft = useRef<LatLng | null>(null);
  const lastPicked = useRef<string | null>(null);
  const [talkingId, setTalkingId] = useState<string | null>(null);
  const [restored] = useState(kept);
  const [trip, setTrip] = useState<Trip | null>(() => (restored?.step === 'route' || restored?.step === 'walking'
    ? { shopId: restored.shopId, route: null, walking: restored.step === 'walking', started: restored.started } : null));
  const [walkView, setWalkView] = useState<WalkView | null>(null);
  const [door, setDoor] = useState<Door | null>(() => (restored?.step === 'arrived' || restored?.step === 'code'
    ? { shopId: restored.shopId, step: restored.step, metres: null, minutes: null } : null));
  useEffect(() => {
    const step = trip ? (trip.walking ? 'walking' : 'route') : door?.step === 'arrived' || door?.step === 'code' ? door.step : null;
    store(() => sessionStorage, KEPT, step ? JSON.stringify({ shopId: trip?.shopId ?? door?.shopId, step, started: trip?.started ?? 0 }) : '');
  }, [trip, door]);

  const shopSlug = /^#\/shop\/([a-z0-9-]{3,40})$/.exec(hash)?.[1] ?? null;
  const page = shopSlug ? 'shop' : hash === '#/business' ? 'business' : 'map';

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
  const selected = shown.find((shop) => shop.id === selectedId) ?? (desktop ? fallback : null);

  const focusOn = (spot: LatLng) => setFocus({ spot, key: `${spot.lat},${spot.lng},${Date.now()}` });
  const pick = useCallback((shop: ShopWithMenu) => {
    lastPicked.current = shop.id;
    setSelectedId(shop.id);
    setFocus({ spot: shop, key: `${shop.id}:${Date.now()}` });
  }, []);

  const onLocate = () => {
    setSettingSpot(false);
    whereAmI();
    if (me) focusOn(me);
  };
  const onSpotMove = useCallback((spot: LatLng) => { spotDraft.current = spot; }, []);
  const confirmSpot = () => {
    if (spotDraft.current) setMySpot(spotDraft.current);
    setSettingSpot(false);
  };

  // Ask for the location only when the browser would ask: no card when it's allowed, "pick your spot" when blocked.
  const startLocation = useCallback(async () => {
    store(() => sessionStorage, 'saath:asked', '1');
    let state: PermissionState = 'prompt';
    try { state = (await navigator.permissions.query({ name: 'geolocation' })).state; } catch { /* Safari: no answer, so ask */ }
    if (state === 'granted') whereAmI();
    else if (state === 'denied') setSettingSpot(true);
    else setAsking(true);
  }, [whereAmI]);
  // A walk restored after a reload needs a position before its route, as Walk does without one.
  useEffect(() => {
    if (trip && !me) void startLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!me && page === 'map' && !stored(() => sessionStorage, 'saath:asked')) void startLocation();
    // On arriving at the map (also from the owner's pages), once a session; after that the locate button asks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);
  // Blocked, or a walk waiting for a position that didn't come: pick the spot by hand (each failed try opens it again).
  // Only a new error opens it: dismissing the notice, or its timing out, must not.
  useEffect(() => {
    if (!me && error && (denied || trip)) setSettingSpot(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [denied, error]);
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(clearError, 8000);
    return () => window.clearTimeout(timer);
  }, [error, clearError]);
  useEffect(() => {
    if (!settingSpot) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setSettingSpot(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingSpot]);
  // A link to the old in-app owner page, followed inside this page, goes to the owner page too.
  useEffect(() => {
    if (hash === '#/owner') window.location.replace(OWNER_PAGE);
  }, [hash]);

  // Once the city is up, fetch each mascot's full figure in idle time, so a shop card's mascot shows at once.
  // Skipped on Data Saver and 2G; it's ~55 KB a mascot.
  const mascots = useMemo(() => [...new Map(shops.map((shop) => [hostOf(shop).id, hostOf(shop)])).values()], [shops]);
  const mascotKey = mascots.map((mascot) => mascot.id).sort().join();
  useEffect(() => {
    const net = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (!mascotKey || net?.saveData || /2g/.test(net?.effectiveType ?? '')) return;
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 1500));
    idle(() => { for (const mascot of mascots) new Image().src = figureOf(mascot); });
    // Once per set of mascots, not on every live menu change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mascotKey]);

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

  // J4: Walk opens the route preview; without a location yet, the location step comes first.
  const tripShop = trip ? shops.find((shop) => shop.id === trip.shopId) ?? null : null;
  const startTrip = (shop: ShopWithMenu) => {
    setDoor(null);
    setTrip({ shopId: shop.id, route: null, walking: false, started: 0 });
    if (!me) void startLocation();
  };
  useEffect(() => {
    if (!trip || trip.route || !tripShop || !me) return;
    let live = true;
    void walkingRoute(me, tripShop, tripShop.name).then((route) => {
      if (live) setTrip((t) => (t && t.shopId === tripShop.id ? { ...t, route } : t));
    });
    return () => { live = false; };
  }, [trip, tripShop, me]);
  const startWalking = () => {
    unlockSound(); // inside the tap, so the chime may play later on iPhone
    setTrip((t) => t && { ...t, walking: true, started: Date.now() });
  };
  const stopTrip = () => {
    if (walkView) setMySpot(walkView.me); // where the walk ended, not where it started
    setTrip(null);
    setWalkView(null);
  };
  // J6: at the door (two fixes within 25 m, or "I'm here"): the mascot comes out; the saving waits for the counter code.
  const arrive = () => {
    if (!trip || !tripShop) return;
    setDoor({ shopId: trip.shopId, step: 'arrived', metres: trip.route?.metres ?? null, minutes: Math.max(1, Math.round((Date.now() - trip.started) / 60000)) });
    setFocus({ spot: tripShop, key: `door:${tripShop.id}:${Date.now()}` });
    stopTrip();
  };
  const doorShop = door ? shops.find((shop) => shop.id === door.shopId) ?? null : null;
  // A shop that leaves the list (unpublished) ends its walk or door step, which would otherwise have no controls.
  // Not before the list loads: a step restored after a reload waits for its shop.
  const loaded = shops.length > 0;
  useEffect(() => {
    if (!loaded) return;
    if (trip && !tripShop) stopTrip();
    if (door && !doorShop) setDoor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripShop, doorShop, loaded]);
  const doorOrder = doorShop ? orderOf(doorShop, doorShop.menu) : null;
  const talking = talkingId ? shops.find((shop) => shop.id === talkingId) ?? null : null;
  const busy = !!tripShop || !!doorShop; // a walk or the door covers the shop card and the phone's search
  const cardOpen = !desktop && !!selected && !busy;
  // The phone card replaces the near list, so its opener row is gone while it's open: on close, focus that shop's row.
  useEffect(() => {
    if (!selectedId && lastPicked.current) document.querySelector<HTMLElement>(`.near-row[data-shop="${lastPicked.current}"]`)?.focus();
  }, [selectedId]);
  // The screen edges the city must stay clear of: the bars and sheet on a phone, the side panels on a desktop.
  const padding = desktop
    ? { top: trip?.walking ? 150 : 20, bottom: trip?.walking ? 190 : 20, left: page === 'business' ? 660 : 424, right: page === 'business' ? 20 : 440 }
    : settingSpot ? { top: 90, bottom: 190, left: 0, right: 0 }
    : trip?.walking ? { top: 150, bottom: 210, left: 0, right: 0 }
    : trip ? { top: 70, bottom: Math.round(window.innerHeight * 0.5), left: 0, right: 0 }
    : door ? { top: 80, bottom: Math.round(window.innerHeight * 0.42), left: 0, right: 0 }
    : { top: cardOpen ? 140 : 132, bottom: Math.round(window.innerHeight * (cardOpen ? 0.62 : 0.36)), left: 0, right: 0 };
  const chrome = !settingSpot && !busy && page === 'map'; // the phone's search, chips and near list

  return (
    <div className={`app ${desktop ? 'is-desktop' : 'is-phone'}`}>
      <h1 className="sr-only">Saath: local shops near you</h1>
      <MapBoundary fallback={<div className="map-fallback"><p>The 3D city needs WebGL, which is off in this browser.</p><p>The list still works: tap a shop.</p></div>}>
        <MapView me={walkView?.me ?? me} shops={shown} selected={selected?.id ?? null} spotlight={!!selectedId && shown.some((shop) => shop.id === selectedId)}
          focus={focus?.spot ?? null} focusKey={focus?.key ?? ''}
          settingSpot={settingSpot} onSpotMove={onSpotMove} onPick={settingSpot ? () => {} : pick} padding={padding}
          route={walkView?.route ?? (trip?.route ? { done: [], left: trip.route.line } : null)}
          fit={trip?.route && !trip.walking ? { points: trip.route.line, key: `${trip.shopId}:${trip.route.metres}` } : null}
          follow={!!trip?.walking} heading={walkView?.heading ?? null} />
      </MapBoundary>

      {desktop ? (
        <aside className="panel panel-left glass" aria-label="Saath">
          <div className="brand">
            <a className="brand-tile" href="/" aria-label="Saath home"><Icon name="walk" size={22} color="#5BE38F" stroke={2.4} /></a>
            <div><b>saath</b><span>Local shops near you</span></div>
            <a className="for-business" href="#/business">For businesses →</a>
          </div>
          <Search query={query} setQuery={setQuery} />
          <Chips category={category} setCategory={setCategory} />
          <NearList shops={shown} me={me} thumb={76} loading={!shops.length} onPick={pick} />
          <SpotTools locating={locating} settingSpot={settingSpot} onLocate={onLocate} onSetSpot={() => setSettingSpot((v) => !v)} />
        </aside>
      ) : (
        <>
          {!cardOpen && chrome && (
            <header className="top">
              <Search query={query} setQuery={setQuery} logo />
              <Chips category={category} setCategory={setCategory} />
            </header>
          )}
          {!cardOpen && chrome && (
            <>
              <SpotTools locating={locating} settingSpot={settingSpot} onLocate={onLocate} onSetSpot={() => setSettingSpot((v) => !v)} floating />
              <div className="sheet glass-sheet near-sheet">
                <div className="grabber" />
                <NearList shops={shown} me={me} loading={!shops.length} onPick={pick} />
                <div className="near-links" style={{ flexWrap: 'wrap' }}>
                  {!installed && <button type="button" onClick={() => setInstalling(true)}>Install app</button>}
                  <a className="for-business" href="#/business">For businesses →</a>
                  {/* The map's own credits sit under this sheet on a phone; the licences need them visible. */}
                  <a className="near-hint" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap · OpenMapTiles · OpenFreeMap</a>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {error && (
        <div className="notice" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, width: 'max-content' }}>
          <span>{error}</span>
          <button type="button" className="icon-btn" style={{ width: 28, height: 28, borderRadius: '50%', color: 'inherit' }} onClick={clearError} aria-label="Dismiss"><Icon name="close" size={14} stroke={2.6} /></button>
        </div>
      )}
      {settingSpot && (
        <>
          <div className="spot-hint glass" role="status"><Icon name="map" size={20} />Drag the map to where you are</div>
          <div className="spot-actions">
            <button type="button" className="btn-go" onClick={confirmSpot}><Icon name="check" size={19} />I’m here</button>
            <button type="button" className="btn-ghost" onClick={onLocate}><Icon name="locate" size={19} />Use my location instead</button>
          </div>
        </>
      )}
      {asking && <LocationAsk onAllow={() => { setAsking(false); whereAmI(); }} onPick={() => { setAsking(false); setSettingSpot(true); }} />}
      {installing && <InstallSheet onClose={() => setInstalling(false)} />}

      {/* A walk restored after a reload shows here (Back, "Finding the walking route…") until its route is in. */}
      {trip && tripShop && !(trip.walking && trip.route) && !settingSpot && !asking && (
        <RoutePreview shop={tripShop} route={trip.route} onBack={stopTrip} onStart={startWalking} />
      )}
      {trip?.walking && trip.route && tripShop && (
        <WalkHud key={trip.started} shop={tripShop} start={trip.route} onView={setWalkView} onArrive={arrive} onStop={stopTrip} />
      )}
      {door?.step === 'arrived' && doorShop && (
        <ArrivedSheet shop={doorShop} onTalk={() => setTalkingId(doorShop.id)} onBought={() => setDoor({ ...door, step: 'code' })} onClose={() => { if (!talkingId) setDoor(null); }} />
      )}

      {selected && page === 'map' && !busy && (
        <ShopCard key={selected.id} shop={selected} me={me} layout={desktop ? 'panel' : 'sheet'}
          onClose={() => setSelectedId(null)}
          onTalk={() => setTalkingId(selected.id)}
          onWalk={() => startTrip(selected)} />
      )}

      {page === 'shop' && shopSlug && (
        <ShopPage key={shopSlug} slug={shopSlug} me={me} onTalk={setTalkingId} onWalk={(id) => {
          const shop = shops.find((s) => s.id === id);
          if (shop) {
            pick(shop);
            startTrip(shop);
          }
          window.location.replace('#/');
        }} />
      )}
      {page === 'business' && <BusinessPage shops={shops} />}

      {talking && <TalkPanel shop={talking} onClose={() => setTalkingId(null)} />}
      {door?.step === 'code' && doorShop && (
        <CodeSheet shop={doorShop} onBack={() => setDoor({ ...door, step: 'arrived' })} onVerified={(visit) => setDoor({ ...door, step: 'review', visit })} />
      )}
      {door?.step === 'review' && doorShop && door.visit && (
        <ReviewSheet shop={doorShop} visit={door.visit} onDone={(posted) => setDoor({ ...door, step: 'saved', posted })} />
      )}
      {door?.step === 'saved' && doorShop && door.visit && (
        <SavedSheet shop={doorShop} order={doorOrder} metres={door.metres} minutes={door.minutes} visit={door.visit} posted={!!door.posted} onClose={() => setDoor(null)} />
      )}
    </div>
  );
}

function Search({ query, setQuery, logo = false }: { query: string; setQuery: (q: string) => void; logo?: boolean }) {
  return (
    <label className="search glass">
      {logo ? <a className="brand-tile small" href="/" aria-label="Saath home"><Icon name="walk" size={18} color="#5BE38F" stroke={2.4} /></a> : <Icon name="search" size={19} />}
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
