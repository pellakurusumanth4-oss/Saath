// J3b/J3c: walking, turn by turn in the browser. It follows the GPS, snaps it to the route, turns the walked part grey,
// keeps the screen on, buzzes (or chimes) 60 m out, reroutes when the walker leaves the route, and calls the arrival.
import { useEffect, useRef, useState } from 'react';
import { bearingDeg, distanceM, type LatLng } from '../../src/geo';
import { distanceText, ICON, SAY, walkingRoute, type Route } from './route';
import { hostOf, orderOf, portraitOf, type ShopWithMenu } from './shops';
import { keepAwake, nudge, snap, split } from './walking';
import { Icon, SaveChip } from './ui';

export type WalkView = { me: LatLng; heading: number | null; route: { done: LatLng[]; left: LatLng[] } };

export default function WalkHud({ shop, start, onView, onArrive, onStop }: {
  shop: ShopWithMenu; start: Route; onView: (view: WalkView) => void; onArrive: () => void; onStop: () => void;
}) {
  const mascot = hostOf(shop);
  const first = mascot.name.split(' ').pop()!;
  const order = orderOf(shop, shop.menu);
  const [route, setRoute] = useState(start);
  const [along, setAlong] = useState<{ done: number; total: number; toShop: number } | null>(null);
  const [lost, setLost] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [awake, setAwake] = useState(false);
  const [almost, setAlmost] = useState(false);
  const [buzzed, setBuzzed] = useState<'buzz' | 'chime' | null>(null);
  const [hint, setHint] = useState(true);
  const live = useRef({ route: start, prev: null as LatLng | null, heading: null as number | null, off: 0, rerouted: 0, near: 0, almost: false });
  const handlers = useRef({ onView, onArrive });
  handlers.current = { onView, onArrive };
  const banner = useRef<HTMLDivElement>(null);
  useEffect(() => banner.current?.focus(), []); // the walk opens on its directions, not at the top of the page

  // The screen stays on while walking (Chrome; Safari 16.4+), and again whenever the tab comes back.
  useEffect(() => {
    const wake = () => { if (document.visibilityState === 'visible') void keepAwake(true).then(setAwake); };
    wake();
    document.addEventListener('visibilitychange', wake);
    const hide = window.setTimeout(() => setHint(false), 10000);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.clearTimeout(hide);
      void keepAwake(false);
    };
  }, []);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setLost(true);
      return;
    }
    const id = navigator.geolocation.watchPosition((position) => {
      const fix = { lat: position.coords.latitude, lng: position.coords.longitude };
      const s = live.current;
      const at = snap(s.route.line, fix);
      // A fix over 1 km from this walk (a spot picked by hand, the GPS somewhere else): don't follow, buzz or reroute.
      if (at.off > 1000) {
        setLost(true);
        return;
      }
      setLost(false);
      if (!s.prev) s.prev = fix;
      else if (distanceM(s.prev, fix) >= 4) {
        s.heading = bearingDeg(s.prev, fix);
        s.prev = fix;
      }
      handlers.current.onView({ me: at.off < 30 ? at.at : fix, heading: s.heading, route: split(s.route.line, at.along, at.at) });
      const toShop = distanceM(fix, shop);
      setAlong({ done: at.along, total: at.total, toShop });
      // Arrived: two fixes in a row within 25 m of the door.
      s.near = toShop <= 25 ? s.near + 1 : 0;
      if (s.near >= 2) {
        handlers.current.onArrive();
        return;
      }
      if (!s.almost && (s.route.straight ? toShop : at.total - at.along) <= 60) {
        s.almost = true;
        setAlmost(true);
        setBuzzed(nudge());
        window.setTimeout(() => setBuzzed(null), 4000);
      }
      // Three fixes in a row over 40 m off the line: a new route from here, at most every 20 s.
      s.off = !s.route.straight && at.off > 40 ? s.off + 1 : 0;
      if (s.off >= 3 && Date.now() - s.rerouted > 20000) {
        s.off = 0;
        s.rerouted = Date.now();
        setRerouting(true);
        void walkingRoute(fix, shop, shop.name).then((next) => {
          s.route = next;
          setRoute(next);
          setRerouting(false);
        });
      }
    }, () => setLost(true), { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });
    return () => navigator.geolocation.clearWatch(id);
    // One watch per walk: the shop is fixed and the callbacks are read through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = along?.done ?? 0;
  const left = along ? (route.straight ? along.toShop : Math.max(0, along.total - along.done)) : route.metres;
  const seconds = route.metres > 0 ? left * (route.seconds / route.metres) : left / 1.25;
  const next = route.steps.find((step) => step.start > done + 5 && step.turn !== 'straight');
  const toNext = next ? Math.max(0, next.start - done) : left;
  const arriving = new Date(Date.now() + seconds * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  let icon = <Icon name={next ? ICON[next.turn] : 'north'} size={30} color="#fff" stroke={2.6} />;
  let big: string;
  let small: string;
  if (lost) {
    [big, small] = ['Can’t see your location', 'Tap “I’m here” when you arrive.'];
  } else if (almost) {
    icon = <img src={portraitOf(mascot)} alt="" />;
    [big, small] = ['Almost there', `${first} is waving at the door · ${distanceText(left)}`];
  } else if (route.straight || !next) {
    [big, small] = [shop.name, `${distanceText(left)} · follow the green line`];
  } else if (next.turn === 'arrive') {
    [big, small] = [`${shop.name} in ${distanceText(toNext)}`, next.text.replace(`${shop.name} is `, '')];
  } else {
    const street = next.text.slice(SAY[next.turn].length).trim();
    big = toNext < 15 ? `${SAY[next.turn]} now` : `${SAY[next.turn]} in ${distanceText(toNext)}`;
    small = street ? `${street}, then ${shop.name}` : `then ${shop.name}`;
  }
  if (rerouting) small = 'Rerouting…';
  // Read out only when the next turn or the walk's state changes, not with every 10 m of the banner's distances.
  const said = lost || almost || route.straight || !next ? big : next.text;

  return (
    <>
      <div ref={banner} tabIndex={-1} className={`walk-banner${almost && !lost ? ' is-almost' : ''}`}>
        <span className="walk-icon">{icon}</span>
        <div><b>{big}</b><span>{small}</span></div>
      </div>
      <p className="sr-only" role="status">{said}</p>
      {buzzed ? (
        <div className="walk-pill is-buzz"><span className="walk-buzz"><i /><i /><i /></span>{buzzed === 'buzz' ? 'bzz · bzz' : 'ding'}</div>
      ) : hint && <div className="walk-pill glass"><Icon name="info" size={14} />Keep this tab open while you walk</div>}
      <section className="walk-foot glass" aria-label="Walking">
        <div className="walk-foot-top">
          <div className="walk-left">
            <b>{lost ? '–' : `${Math.max(1, Math.round(seconds / 60))} min`}</b>
            <span>{distanceText(left)} left · arriving {arriving}</span>
          </div>
          {order && <SaveChip amount={order.saving} />}
          <button type="button" className="icon-btn round walk-stop" onClick={onStop} aria-label="Stop walking"><Icon name="close" size={20} stroke={2.4} /></button>
        </div>
        <div className="walk-foot-row">
          {awake && <span className="walk-chip"><Icon name="sun" size={14} />Screen stays on</span>}
          <span className="walk-chip"><Icon name="vibrate" size={14} />{'vibrate' in navigator ? 'Buzz near the shop' : 'Chime near the shop'}</span>
          <button type="button" className="walk-here" onClick={() => handlers.current.onArrive()}>I’m here</button>
        </div>
      </section>
    </>
  );
}
