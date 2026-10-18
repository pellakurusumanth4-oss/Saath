import { useMemo } from 'react';
import { distanceM, formatDistance, type LatLng } from '../../src/geo';
import { hostOf, portraitOf, sectionOf, STATUS_LABEL, walkMinutes, type Shop } from './shops';

/** The shops, closest first once we know where you are; a tap opens the shop's page. */
export default function ShopsList({ shops, me, expanded, onPick, onToggle }: {
  shops: Shop[];
  me: LatLng | null;
  expanded: boolean;
  onPick: (shop: Shop) => void;
  onToggle: () => void;
}) {
  const rows = useMemo(() => {
    const withDistance = shops.map((shop) => ({ shop, distance: me ? distanceM(me, shop) : null }));
    if (me) withDistance.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    return withDistance;
  }, [shops, me]);

  return (
    <aside className={`friends ${expanded ? 'is-expanded' : ''}`} aria-label="Shops">
      <header className="friends-head">
        <div>
          <h2>Shops near you</h2>
          <p className="friends-sub">{me ? 'Closest first: walk there, save money' : 'Say where you are to see the walk'}</p>
        </div>
        <button className="chevron" onClick={onToggle} aria-label={expanded ? 'Hide the list' : 'Show the list'}>
          {expanded ? '▾' : '▴'}
        </button>
      </header>

      <div className="friends-scroll">
        {rows.map(({ shop, distance }) => {
          const section = sectionOf(shop);
          return (
            <article key={shop.id} className="card" style={{ ['--friend-color' as string]: section.color }}>
              <a className="card-hit" href={`#/shop/${shop.slug}`} onClick={() => onPick(shop)}>
                <img className="card-face" src={portraitOf(hostOf(shop))} alt="" width={52} height={52} />
                <div className="card-text">
                  <h3>{shop.name}</h3>
                  <p>{section.icon} {section.label} · <span className={`shop-status is-${shop.status}`}>{STATUS_LABEL[shop.status]}</span></p>
                  {distance !== null && me && (
                    <p className="card-distance">{walkMinutes(me, shop)} min walk · {formatDistance(distance)}</p>
                  )}
                </div>
              </a>
            </article>
          );
        })}
        <a className="owner-link" href="#/owner">Own a shop? Put it on the map →</a>
      </div>
    </aside>
  );
}
