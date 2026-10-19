// "You saved ₹X by walking": shown when a visitor who tapped Walk arrives (within 30 m, or taps "I'm here").
import { useEffect, useRef } from 'react';
import Ad from './Ad';
import { useCountUp } from './Compare';
import { hostOf, portraitOf, rupees, sectionOf, type Order, type ShopWithMenu } from './shops';
import { Icon } from './ui';

const MONTH_KEY = () => `saath:saved:${new Date().toISOString().slice(0, 7)}`;

/** This month's savings on this phone, after adding `amount` once. */
function addToMonth(amount: number): number {
  try {
    const total = (Number(localStorage.getItem(MONTH_KEY())) || 0) + amount;
    localStorage.setItem(MONTH_KEY(), String(total));
    return total;
  } catch {
    return amount; // private browsing: just this walk
  }
}

export default function SavedSheet({ shop, order, metres, minutes, onClose }: {
  shop: ShopWithMenu; order: Order; metres: number | null; minutes: number | null; onClose: () => void;
}) {
  const month = useRef<number | null>(null);
  month.current ??= addToMonth(order.saving);
  const shown = useCountUp(order.saving, true);
  const mascot = hostOf(shop);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-back saved-back">
      <div className="saved" role="dialog" aria-modal="true" aria-label={`You saved ${rupees(order.saving)} by walking`}>
        <Ad shop={shop} height={150} width="100%" radius={18} />
        <img className="saved-face" src={portraitOf(mascot)} alt="" style={{ borderColor: sectionOf(shop).color }} />
        <p className="saved-kicker">YOU WALKED TO {shop.name.toUpperCase()}</p>
        <p className="saved-amount">{rupees(shown)}</p>
        <p className="saved-line">saved by walking</p>
        <p className="saved-fine">on your usual order, against delivery apps (typical fees included)</p>
        {metres !== null && (
          <div className="chips center">
            <span className="chip"><Icon name="walk" size={14} />{minutes} min · {Math.round(metres)} m</span>
            <span className="chip"><Icon name="star" size={14} />≈{Math.round(metres / 0.75)} steps</span>
          </div>
        )}
        <p className="saved-month">This month, on this phone <b>{rupees(month.current)} saved</b></p>
        <div className="actions">
          <a className="btn-ghost" href={`#/shop/${shop.slug}`} onClick={onClose}>See the menu</a>
          <button type="button" autoFocus className="btn-go" onClick={onClose}><Icon name="check" size={19} />Nice!</button>
        </div>
      </div>
    </div>
  );
}
