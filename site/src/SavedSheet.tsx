// "You saved $X by walking": shown after a verified visit (the counter code), with the review if one was posted.
// A shop with no usual order (or a sold-out item in it) still gets the verified visit, without a saving.
import { useEffect, useRef } from 'react';
import Ad from './Ad';
import { useCountUp } from './Compare';
import { hostOf, portraitOf, dollars, sectionOf, type Order, type ShopWithMenu } from './shops';
import { Icon } from './ui';
import { useInert } from './useInert';

/** The walker's own calendar day as YYYY-MM-DD (not UTC's, which files a walk after midnight under the day before). */
const dayOf = (time = Date.now()) => new Date(time).toLocaleDateString('en-CA');
const MONTH_KEY = () => `saath:saved:${dayOf().slice(0, 7)}`;

type Walked = { day: string; saved: number; visit: string };

/** This month's savings and walks on this phone, counting each verified visit once (reopening adds nothing). */
function addToMonth(amount: number, visit: string): { total: number; walks: Walked[] } {
  const day = dayOf();
  try {
    const walks = JSON.parse(localStorage.getItem('saath:walks') ?? '[]') as Walked[];
    let total = Number(localStorage.getItem(MONTH_KEY())) || 0;
    if (!walks.some((w) => w.visit === visit)) {
      walks.unshift({ day, saved: amount, visit });
      total += amount;
      localStorage.setItem('saath:walks', JSON.stringify(walks.slice(0, 120)));
      localStorage.setItem(MONTH_KEY(), String(total));
    }
    return { total, walks };
  } catch {
    return { total: amount, walks: [{ day, saved: amount, visit }] }; // private browsing: just this walk
  }
}

/** The last 14 days, oldest first: whether a walk saved something that day. */
const fortnight = (walks: Walked[]) => Array.from({ length: 14 }, (_, i) => {
  const day = dayOf(Date.now() - (13 - i) * 86400000);
  return walks.filter((w) => w.day === day).reduce((sum, w) => sum + w.saved, 0);
});

export default function SavedSheet({ shop, order, metres, minutes, visit, posted, onClose }: {
  shop: ShopWithMenu; order: Order | null; metres: number | null; minutes: number | null; visit: string; posted: boolean; onClose: () => void;
}) {
  const month = useRef<{ total: number; walks: Walked[] } | null>(null);
  const saving = order?.saving ?? 0;
  month.current ??= addToMonth(saving, visit);
  const thisMonth = month.current.walks.filter((w) => w.day.slice(0, 7) === dayOf().slice(0, 7)).length;
  const days = fortnight(month.current.walks);
  const top = Math.max(1, ...days);
  const share = () => void navigator.share?.({ title: 'Saath', text: order ? `I saved ${dollars(saving)} by walking to ${shop.name}` : `I walked to ${shop.name}`, url: `${location.origin}/visit/#/shop/${shop.slug}` }).catch(() => {});
  const shown = useCountUp(saving, true);
  const mascot = hostOf(shop);
  const box = useRef<HTMLDivElement>(null);
  useInert(box);
  const nice = useRef<HTMLButtonElement>(null);
  useEffect(() => nice.current?.focus(), []); // after the review sheet's useInert cleanup lifts the inert from the page
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-back saved-back">
      <div ref={box} className="saved" role="dialog" aria-modal="true" aria-label={order ? `You saved ${dollars(saving)} by walking` : `You walked to ${shop.name}`}>
        <Ad shop={shop} height={150} width="100%" radius={18} />
        <img className="saved-face" src={portraitOf(mascot)} alt="" style={{ borderColor: sectionOf(shop).color }} />
        <p className="saved-verified"><Icon name="check" size={13} stroke={3} />{posted ? 'Verified visit · review posted' : 'Verified visit'}</p>
        <p className="saved-kicker">YOU WALKED TO {shop.name.toUpperCase()}</p>
        {order && (
          <>
            <p className="saved-amount">{dollars(shown)}</p>
            <p className="saved-line">saved by walking</p>
            <p className="saved-fine">on your usual order, against delivery apps (typical fees included)</p>
          </>
        )}
        {metres !== null && (
          <div className="chips center">
            <span className="chip"><Icon name="walk" size={14} />{minutes} min · {Math.round(metres)} m</span>
            <span className="chip"><Icon name="star" size={14} />≈{Math.round(metres / 0.75)} steps</span>
          </div>
        )}
        <div className="saved-month">
          <p><span>This month, on this phone</span><b>{dollars(month.current.total)}</b></p>
          <div className="saved-days" aria-hidden="true">{days.map((saved, i) => <i key={i} className={saved ? 'is-on' : ''} style={{ height: saved ? 8 + Math.round((16 * saved) / top) : 5 }} />)}</div>
          <span className="saved-walks">{thisMonth} {thisMonth === 1 ? 'walk' : 'walks'} this month</span>
        </div>
        <div className="actions">
          {'share' in navigator
            ? <button type="button" className="btn-ghost" onClick={share}><Icon name="share" size={18} />Share</button>
            : <a className="btn-ghost" href={`#/shop/${shop.slug}`} onClick={onClose}>See the menu</a>}
          <button type="button" ref={nice} className="btn-go" onClick={onClose}><Icon name="check" size={19} />Nice!</button>
        </div>
      </div>
    </div>
  );
}
