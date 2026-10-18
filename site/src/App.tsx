import { useEffect, useState } from 'react';
import MapView from './MapView';
import MapBoundary from './MapBoundary';
import ShopsList from './ShopsList';
import ShopPage from './ShopPage';
import OwnerPage from './OwnerPage';
import { useMe } from './hooks';
import { useShops, walkMinutes, type Shop } from './shops';
import { distanceM } from '../../src/geo';
import type { LatLng } from '../../src/geo';

/** The page is in the hash (#/shop/<slug>, #/owner): the host serves only index.html, so paths would 404. */
const useHash = () => {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
};

export default function App() {
  const { me, locating, error, whereAmI, setMySpot } = useMe();
  const shops = useShops();
  const hash = useHash();
  const [focus, setFocus] = useState<{ spot: LatLng; key: string } | null>(null);
  const [settingSpot, setSettingSpot] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const shopSlug = /^#\/shop\/([a-z0-9-]{3,40})$/.exec(hash)?.[1] ?? null;
  const owner = hash === '#/owner';

  const focusOn = (spot: LatLng) =>
    setFocus({ spot, key: `${spot.lat},${spot.lng},${Date.now()}` });

  const pickShop = (shop: Shop) => {
    focusOn(shop);
    window.location.hash = `#/shop/${shop.slug}`;
  };

  const onWhereAmI = () => {
    setSettingSpot(false);
    whereAmI();
    if (me) focusOn(me);
  };

  const onSetSpot = (spot: LatLng) => {
    setMySpot(spot);
    setSettingSpot(false);
    focusOn(spot);
  };

  // When a fresh fix arrives, fly to it.
  const meKey = me ? `${me.lat},${me.lng}` : '';
  useEffect(() => {
    if (me) setFocus({ spot: me, key: `me:${meKey}:${Date.now()}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meKey]);

  const nearest = me
    ? shops.reduce<Shop | null>((best, shop) => (!best || distanceM(me, shop) < distanceM(me, best) ? shop : best), null)
    : null;

  return (
    <div className="app">
      <MapBoundary
        fallback={
          <div className="map-fallback">
            <p>The map needs WebGL, which is off in this preview.</p>
            <p>Use the list to open a shop, or open this page in a browser with WebGL on.</p>
          </div>
        }
      >
        <MapView
          me={me}
          shops={shops}
          focus={focus?.spot ?? null}
          focusKey={focus?.key ?? ''}
          settingSpot={settingSpot}
          onSetSpot={onSetSpot}
          onPickShop={pickShop}
        />
      </MapBoundary>

      <header className="topbar">
        <h1 className="logo">Saath</h1>
        <p className="tagline">Walk there, save money</p>
      </header>

      <div className="controls">
        <button className="btn btn-yellow" onClick={onWhereAmI} disabled={locating}>
          {locating ? 'Finding you…' : 'Where am I'}
        </button>
        <button
          className={`btn ${settingSpot ? 'btn-active' : 'btn-yellow'}`}
          onClick={() => setSettingSpot((value) => !value)}
        >
          {settingSpot ? 'Tap the map…' : 'Set my spot'}
        </button>
      </div>

      {error && <div className="notice" role="alert">{error}</div>}
      {me && !error && nearest && (
        <div className="notice notice-soft">{nearest.name} is closest: a {walkMinutes(me, nearest)} min walk</div>
      )}

      <ShopsList
        shops={shops}
        me={me}
        expanded={expanded}
        onPick={(shop) => focusOn(shop)}
        onToggle={() => setExpanded((value) => !value)}
      />

      {shopSlug && <ShopPage key={shopSlug} slug={shopSlug} me={me} />}
      {owner && <OwnerPage />}
    </div>
  );
}
