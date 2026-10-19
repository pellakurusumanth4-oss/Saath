// For local businesses (#/business): your mascot, your billboard, your walk-ins. On a desktop the live 3D city shows
// through on the right.
import type { ShopWithMenu } from './shops';
import { Icon } from './ui';

export default function BusinessPage({ shops }: { shops: ShopWithMenu[] }) {
  const demo = shops.find((shop) => shop.slug === 'kettle-and-kulhad') ?? shops[0];
  return (
    <div className="page business" role="dialog" aria-label="For local businesses">
      <div className="business-left">
        <div className="business-top">
          <span className="brand-tile"><Icon name="walk" size={22} color="#5BE38F" stroke={2.4} /></span>
          <b className="brand-word">saath</b>
          <a href="#/">Explore the map →</a>
        </div>
        <p className="kicker">FOR LOCAL BUSINESSES</p>
        <h1 className="business-title">Your mascot. Your landmark. Your walk-ins.</h1>
        <p className="business-lead">We design a mascot that is only yours and raise your billboard beside your shop on the Saath map, with your own ad on it. People see your counter price next to delivery apps, and walk over.</p>
        <ul className="benefits">
          <li><Icon name="star" /><div><b>A mascot made for you</b>Your pin on the map; it greets visitors and talks about your menu.</div></li>
          <li><Icon name="map" /><div><b>A billboard beside your shop</b>Your ad, your colours; change it any time from your phone.</div></li>
          <li><Icon name="tag" /><div><b>Your prices, live</b>Walk-in vs delivery-app prices, updated the second you change them.</div></li>
        </ul>
        <div className="actions">
          <a className="btn-go" href="#/owner"><Icon name="walk" size={19} />Put my shop on the map</a>
          {demo && <a className="btn-ghost" href={`#/shop/${demo.slug}`}>See a demo shop</a>}
        </div>
      </div>
    </div>
  );
}
