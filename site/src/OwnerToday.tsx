// J10/J11: the owner's day. Today's counter code (and a full-screen view for the till), verified visits this week
// against last week, what walk-ins saved, what the shop would pay per verified visit (an example rate, labelled as
// one), and on a computer the dashboard's side menu.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { db, hostOf, portraitOf, dollars, sectionOf, type Shop } from './shops';
import { keepAwake } from './walking';
import { Icon } from './ui';

type Day = { day: string; visits: number };
const RATE = 0.25; // dollars per verified visit: an example, shown as one

/** Today's code and the last 14 days of verified visits (refreshed every 30 s while the page is in view). */
export function useOwnerDay(shopId: string) {
  const [code, setCode] = useState<string | null>(null);
  const [days, setDays] = useState<Day[] | null>(null);
  useEffect(() => {
    let live = true;
    // Visits are private to the owner, so there is no live feed to follow: poll. The code too, so a till left open
    // past midnight shows the new day's code (owner_today_code makes it on first ask).
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      void db.rpc('owner_today_code', { p_shop: shopId }).then(({ data }) => { if (live && typeof data === 'string') setCode(data); });
      void db.rpc('owner_visits', { p_shop: shopId, p_days: 14 }).then(({ data }) => { if (live && Array.isArray(data)) setDays(data as Day[]); });
    };
    load();
    const every = window.setInterval(load, 30000);
    return () => {
      live = false;
      window.clearInterval(every);
    };
  }, [shopId]);
  return { code, days };
}

const tint = (shop: Shop) => ({ '--c': sectionOf(shop).color }) as CSSProperties;

export function TodayCode({ shop, code, days }: { shop: Shop; code: string | null; days: Day[] | null }) {
  const [till, setTill] = useState(false);
  return (
    <section id="today" className="today-code" style={tint(shop)} aria-label="Today’s counter code">
      <small>TODAY’S CODE · {shop.name.toUpperCase()}</small>
      <div className="code-tiles" aria-label={code ? `Code ${code.split('').join(' ')}` : 'Loading the code'}>
        {(code ?? '······').split('').map((digit, i) => <span key={i}>{digit}</span>)}
      </div>
      <p>Customers type this in Saath after they pay. It changes at midnight.</p>
      <button type="button" disabled={!code} onClick={() => setTill(true)}>Show at the till</button>
      {till && code && <Till shop={shop} code={code} today={days?.[days.length - 1]?.visits ?? 0} onClose={() => setTill(false)} />}
    </section>
  );
}

export function TodayVisits({ days, saving }: { days: Day[] | null; saving: number }) {
  if (!days) return null;
  const week = days.slice(-7);
  const total = week.reduce((sum, d) => sum + d.visits, 0);
  const before = days.slice(0, -7).reduce((sum, d) => sum + d.visits, 0);
  const change = before ? Math.round(((total - before) / before) * 100) : null;
  const top = Math.max(1, ...week.map((d) => d.visits));
  return (
    <div id="visits" className="visits-wrap">
      <section className="owner-section visits-card" aria-label="Verified visits this week">
        <div className="visits-head"><h3>Verified visits</h3><span>this week</span></div>
        <div className="visits-total">
          <b>{total}</b>
          {change !== null && <span className={change >= 0 ? 'is-up' : ''}>{change >= 0 ? '▲' : '▼'} {Math.abs(change)}% on last week</span>}
        </div>
        <div className="visits-bars">
          {week.map((d, i) => (
            <div key={d.day}>
              <span>{d.visits}</span>
              <i className={i === week.length - 1 ? 'is-today' : ''} style={{ height: 6 + Math.round((104 * d.visits) / top) }} />
              <small>{new Date(`${d.day}T12:00:00`).toLocaleDateString([], { weekday: 'short' })}</small>
            </div>
          ))}
        </div>
      </section>
      <div className="owner-tiles">
        <div className="owner-tile is-save"><span>Walk-ins saved</span><b>{dollars(total * saving)}</b><small>vs delivery apps this week</small></div>
        <div className="owner-tile is-pay">
          <span>You pay only for verified visits <em>example rate</em></span>
          <b>{dollars(total * RATE)}</b>
          <small>{total} × {dollars(RATE)} this week. No visit, no charge. Your mascot and billboard are included.</small>
        </div>
      </div>
    </div>
  );
}

/** The code, big, for the till. The screen stays on while it shows; a tap or Escape closes it. */
function Till({ shop, code, today, onClose }: { shop: Shop; code: string; today: number; onClose: () => void }) {
  const close = useRef(onClose);
  close.current = onClose;
  // The browser drops the wake lock when the page is hidden: take it again on coming back.
  useEffect(() => {
    const wake = () => { if (document.visibilityState === 'visible') void keepAwake(true); };
    wake();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', wake);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', wake);
      void keepAwake(false);
    };
  }, []);
  return (
    <div className="till" style={tint(shop)} role="dialog" aria-modal="true" aria-label="Today’s code for the till" onClick={onClose}>
      <img src={portraitOf(hostOf(shop))} alt="" />
      <small>TODAY’S CODE · {shop.name.toUpperCase()}</small>
      <div className="code-tiles">{code.split('').map((digit, i) => <span key={i}>{digit}</span>)}</div>
      <p>Customers type this in Saath after they pay. It changes at midnight.</p>
      <div className="till-count"><div><b>{today}</b><span>verified {today === 1 ? 'visit' : 'visits'} today</span></div><em>Tap to close</em></div>
    </div>
  );
}

const LINKS = [['today', 'clock', 'Today'], ['menu', 'list', 'Menu & prices'], ['billboard', 'map', 'Billboard ad'], ['mascot', 'star', 'Mascot'], ['visits', 'check', 'Visits & reviews']] as const;

/** J11: the dashboard's side menu on a computer (hidden on phones). It scrolls to a section and marks the one picked. */
export function OwnerNav({ shop }: { shop: Shop }) {
  const [email, setEmail] = useState('');
  const [on, setOn] = useState('today');
  useEffect(() => {
    void db.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? ''));
  }, []);
  // The two columns put sections side by side, so "the one in view" is ambiguous: mark the one picked.
  const go = (id: string) => {
    setOn(id);
    document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  };
  return (
    <nav className="owner-nav" aria-label="Your shop">
      <div className="owner-nav-brand"><span className="brand-tile small"><Icon name="walk" size={18} color="#5BE38F" stroke={2.4} /></span><b>saath</b></div>
      {LINKS.map(([id, icon, label]) => (
        <button key={id} type="button" className={on === id ? 'is-on' : ''} aria-current={on === id ? 'true' : undefined} onClick={() => go(id)}>
          <Icon name={icon} size={18} />{label}
        </button>
      ))}
      <div className="owner-nav-shop">
        <img src={portraitOf(hostOf(shop))} alt="" />
        <div><b>{shop.name}</b><span>{email ? `${email} · owner` : 'owner'}</span></div>
      </div>
    </nav>
  );
}
