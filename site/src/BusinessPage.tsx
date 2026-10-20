// For local businesses (#/business): your mascot, your billboard, your walk-ins. On a desktop the live 3D city shows
// through on the right.
import { useEffect, useRef } from 'react';
import type { ShopWithMenu } from './shops';
import { Icon } from './ui';

export default function BusinessPage({ shops }: { shops: ShopWithMenu[] }) {
  const demo = shops.find((shop) => shop.slug === 'kettle-and-kulhad') ?? shops[0];
  const page = useRef<HTMLDivElement>(null);
  // Escape goes back to the map, unless a talk or sheet open over this page has made it inert (that one closes instead).
  // Capture, so this runs before that one's own Escape closes it and lifts the inert.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !page.current?.closest('[inert]')) window.location.hash = '#/';
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return (
    <div ref={page} className="page business" role="dialog" aria-label="For local businesses">
      <div className="business-left">
        <div className="business-top">
          <a className="brand-tile" href="/" aria-label="Footfall home"><Icon name="walk" size={22} color="#5BE38F" stroke={2.4} /></a>
          <b className="brand-word">footfall</b>
          <a href="#/">Explore the map →</a>
        </div>
        <p className="kicker">FOR LOCAL BUSINESSES</p>
        <h1 className="business-title">Your mascot. Your landmark. <span style={{ whiteSpace: 'nowrap' }}>Your walk-ins.</span></h1>
        <p className="business-lead">A new way to market your business: pick your mascot from Footfall’s cast, and your billboard goes up beside your business on the 3D map, with your own ad on it. Visitors find you on the map, and walk in.</p>
        <ul className="benefits">
          <li><Icon name="star" /><div><b>A mascot at your door</b>Your pin on the map; it greets visitors and tells them what you do and when you’re open.</div></li>
          <li><Icon name="map" /><div><b>A billboard beside your shop</b>Your ad, your colours; change it any time from your phone.</div></li>
          <li><Icon name="clock" /><div><b>Your hours and status, live</b>Open, busy or closed and your timings, updated the second you change them.</div></li>
        </ul>
        <div className="actions">
          <a className="btn-go" href="/owner/"><Icon name="walk" size={19} />Put my shop on the map</a>
          {demo && <a className="btn-ghost" href={`#/shop/${demo.slug}`}>See a demo shop</a>}
        </div>
      </div>
    </div>
  );
}
