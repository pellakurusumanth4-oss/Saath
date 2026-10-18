import { useEffect, useState } from 'react';
import type { LatLng } from '../../src/geo';
import TalkPanel from './TalkPanel';
import { ago, AR_READY, bestSaving, TALK_READY, hostOf, portraitOf, rupees, sectionOf, STATUS_LABEL, useShop, walkMinutes } from './shops';

/** A shop's own page (#/shop/<slug>): live status, today's special and menu, the walk and the saving, and its mascot. */
export default function ShopPage({ slug, me }: { slug: string; me: LatLng | null }) {
  const { shop, menu, missing } = useShop(slug);
  const [now, setNow] = useState(() => Date.now());
  const [talking, setTalking] = useState(false);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(tick);
  }, []);

  if (!shop) {
    return (
      <div className="shop-page" role="dialog" aria-label="Shop">
        <div className="shop-sheet">
          <a className="shop-back" href="#/">← Map</a>
          <p className="shop-note">{missing ? 'There’s no shop at this link.' : 'Loading the shop…'}</p>
        </div>
      </div>
    );
  }

  const host = hostOf(shop);
  const section = sectionOf(shop);
  const saving = bestSaving(menu);
  const updated = menu.reduce((newest, item) => (item.updated_at > newest ? item.updated_at : newest), '');
  const walk = me ? walkMinutes(me, shop) : null;
  const ar = `/ar/?${new URLSearchParams({ shop: shop.slug, friend: host.id, name: host.name, tall: String(host.tall) })}`;

  return (
    <div className="shop-page" role="dialog" aria-label={shop.name}>
      <div className="shop-sheet" style={{ ['--section' as string]: section.color }}>
        <a className="shop-back" href="#/">← Map</a>

        <header className="shop-head">
          <img className="shop-host" src={portraitOf(host)} alt={`${host.name}, the mascot`} width={84} height={84} />
          <div>
            <p className="shop-section">{section.icon} {section.label}</p>
            <h2 className="shop-name">{shop.name}</h2>
            <p className={`shop-status is-${shop.status}`}>
              {STATUS_LABEL[shop.status]}
              {shop.status_note && <span> · {shop.status_note}</span>}
            </p>
          </div>
        </header>

        {(walk !== null || saving) && (
          <p className="shop-walk">
            {walk !== null && <strong>Walk {walk} min</strong>}
            {walk !== null && saving && ' · '}
            {saving && <strong>save {rupees(saving.saving)}</strong>}
            {saving && <span> on {saving.item.name} vs delivery apps</span>}
          </p>
        )}
        {walk === null && <p className="shop-hint">Tap “Where am I” on the map to see how far a walk it is.</p>}

        {shop.special && (
          <section className="shop-special">
            <h3>Today’s special</h3>
            <p>{shop.special}</p>
          </section>
        )}

        <div className="shop-actions">
          {TALK_READY && <button className="btn" onClick={() => setTalking(true)}>Talk to {host.name}</button>}
          {AR_READY.has(host.id) && <a className="btn btn-plain" href={ar}>Meet {host.name} in AR</a>}
        </div>
        {AR_READY.has(host.id) && <p className="shop-hint">AR works in Chrome on Android.</p>}

        <section className="shop-menu">
          <div className="shop-menu-head">
            <h3>Menu</h3>
            {updated && <span className="shop-updated">Updated {ago(updated, now)}</span>}
          </div>
          {menu.length === 0 && <p className="shop-note">The menu isn’t up yet.</p>}
          <ul>
            {menu.map((item) => (
              <li key={item.id} className={item.available ? '' : 'is-out'}>
                <span className="shop-item">{item.name}</span>
                {item.available ? (
                  <span className="shop-price">
                    {rupees(item.price)}
                    {item.app_price !== null && item.app_price > item.price && (
                      <s title="What delivery apps charge, says the shop">{rupees(item.app_price)} on apps</s>
                    )}
                  </span>
                ) : (
                  <span className="shop-price">Not today</span>
                )}
              </li>
            ))}
          </ul>
          <p className="shop-fine">Prices are the shop’s own; app prices are what the shop says delivery apps charge.</p>
        </section>

        {shop.story && <p className="shop-story">{shop.story}</p>}
      </div>

      {talking && <TalkPanel friend={host} shop={{ slug: shop.slug, name: shop.name }} onClose={() => setTalking(false)} />}
    </div>
  );
}
