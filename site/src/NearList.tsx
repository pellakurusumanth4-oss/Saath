// "Near you": the businesses with their ads, status and walk, and for food places the saving (every other kind shows
// its kind); by biggest saving (food with a saving first) or nearest. Closed ones sink.
import { useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { distanceM, type LatLng } from '../../src/geo';
import Ad from './Ad';
import Compare from './Compare';
import { hostOf, orderOf, portraitOf, sectionOf, walkText, type ShopWithMenu } from './shops';
import { NEAR_M } from './relocate';
import { SaveChip } from './ui';

const onNetwork = (changed: () => void) => {
  window.addEventListener('online', changed);
  window.addEventListener('offline', changed);
  return () => {
    window.removeEventListener('online', changed);
    window.removeEventListener('offline', changed);
  };
};

export default function NearList({ shops, me, thumb = 92, loading = false, onPick, title = 'Near you' }: {
  shops: ShopWithMenu[]; me: LatLng | null; thumb?: number; loading?: boolean; onPick: (shop: ShopWithMenu) => void; title?: string;
}) {
  const [sort, setSort] = useState<'saving' | 'near'>('saving');
  const rows = useMemo(() => {
    const ranked = shops.map((shop) => ({ shop, order: orderOf(shop, shop.menu), away: me ? distanceM(me, shop) : null }));
    const nearReal = (row: (typeof ranked)[number]) => !row.shop.demo && row.away !== null && row.away <= NEAR_M;
    ranked.sort((a, b) =>
      Number(nearReal(b)) - Number(nearReal(a))   // a real shop near the visitor always comes before the demo shops
      || Number(a.shop.status === 'closed') - Number(b.shop.status === 'closed')
      || (sort === 'near' && a.away !== null && b.away !== null ? a.away - b.away : (b.order?.saving ?? 0) - (a.order?.saving ?? 0))
      || a.shop.name.localeCompare(b.shop.name));
    return ranked;
  }, [shops, me, sort]);
  const online = useSyncExternalStore(onNetwork, () => navigator.onLine);
  const offline = loading && !online; // useShops keeps retrying; say why nothing comes instead of grey rows forever

  return (
    <section className="near" aria-label={title === 'Near you' ? 'Businesses near you' : title}>
      <div className="near-head">
        <h2>{title}</h2>
        <div className="seg" role="group" aria-label="Sort">
          <button type="button" aria-pressed={sort === 'saving'} onClick={() => setSort('saving')}>Biggest saving</button>
          <button type="button" aria-pressed={sort === 'near'} onClick={() => setSort('near')}>Nearest</button>
        </div>
      </div>
      {sort === 'near' && !me && <p className="near-hint">Tap the locate button to sort by the walk.</p>}
      <ul className="near-rows" aria-busy={loading && !offline}>
        {offline && <li className="near-hint">You’re offline. Shops appear when you’re back online.</li>}
        {/* While the shops load, grey rows hold their place so nothing below jumps. */}
        {loading && !offline && Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="near-skeleton" aria-hidden="true">
            <span className="sk-thumb" style={{ width: thumb, height: Math.round(thumb * 0.565) }} />
            <span className="sk-lines"><i /><i /><i /></span>
          </li>
        ))}
        {!loading && !rows.length && <li className="near-hint">Nothing matches. Try another word or kind of business.</li>}
        {rows.map(({ shop, order }) => {
          const state = shop.status;
          const ring = state === 'busy' ? '#F59E0B' : state === 'closed' ? '#B9BDC8' : sectionOf(shop).color;
          return (
            <li key={shop.id} className={state === 'closed' ? 'is-closed' : ''}>
              <button type="button" className="near-row" data-shop={shop.id} onClick={() => onPick(shop)}>
                <span className="near-thumb" aria-hidden="true">
                  <Ad shop={shop} height={Math.round(thumb * 0.565)} width={thumb} radius={10} tag={false} off={state === 'closed'} />
                  <img src={portraitOf(hostOf(shop))} alt="" width={28} height={28} loading="lazy" decoding="async" className={state === 'closed' ? 'is-grey' : ''} style={{ '--ring': ring } as CSSProperties} />
                </span>
                <span className="near-text">
                  <b>{shop.name}{shop.demo && <em className="demo">DEMO</em>}</b>
                  {shop.placed && <span className="placed-line">Demo shop · placed near you</span>}
                  <span className={`near-state is-${state}`}>
                    {state === 'busy' ? `Busy${shop.status_note ? ` · ${shop.status_note}` : ''}` : state === 'closed' ? (shop.status_note || 'Closed') : 'Open'}
                    {me && <span className="near-walk"> · {walkText(me, shop)}</span>}
                  </span>
                  {order ? <Compare shop={shop} menu={shop.menu} mode="line" /> : <span className="near-kind"><span aria-hidden="true">{sectionOf(shop).icon}</span> {sectionOf(shop).label}</span>}
                </span>
                {order && <SaveChip amount={order.saving} grey={state === 'closed'} />}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
