// J10: the owner's day: today's counter code, and a full-screen view of it for the till with today's verified visits.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { db, hostOf, portraitOf, sectionOf, type Shop } from './shops';
import { keepAwake } from './walking';

type Day = { day: string; visits: number };

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
