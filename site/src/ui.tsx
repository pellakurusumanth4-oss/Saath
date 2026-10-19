// City Day's small shared parts: icons, chips, the mascot on its podium and a menu row (the design session's kit).
import type { CSSProperties, ReactNode } from 'react';
import type { Mascot } from './mascots';
import { ago, figureOf, dollars, statusText, type MenuItem, type Shop } from './shops';

const PATHS: Record<string, ReactNode> = {
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  walk: <><path d="M8.5 3.5c-1.7 0-2.8 2-2.8 4.4 0 2.2 1 4.1 2.5 4.1s2.5-1.9 2.5-4.1c0-2.4-.6-4.4-2.2-4.4zM15.5 8.5c-1.6 0-2.2 2-2.2 4.4 0 2.2 1 4.1 2.5 4.1s2.5-1.9 2.5-4.1c0-2.4-1.1-4.4-2.8-4.4z" /><path d="M6.6 15.5l3.4.4M13.9 20l3.4-.4" /></>,
  hourglass: <path d="M7 3h10M7 21h10M8 3c0 5 8 6 8 9s-8 4-8 9M16 3c0 5-8 6-8 9s8 4 8 9" />,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  locate: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  back: <path d="M15 5l-7 7 7 7" />,
  sound: <path d="M4 10v4h4l5 4V6L8 10zM16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11" />,
  mute: <path d="M4 10v4h4l5 4V6L8 10zM17 9l5 6M22 9l-5 6" />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  star: <path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z" />,
  map: <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14" />,
  tag: <path d="M3 12V4h8l10 10-8 8zM7.5 7.5h.01" />,
  check: <path d="M5 12l5 5L20 7" />,
  receipt: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />,
  share: <path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  ar: <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.3 7L12 12l8.7-5M12 22V12" />,
  north: <path d="M5 12l7-7 7 7M12 19V5" />,
  turnLeft: <path d="M9 14L4 9l5-5M20 20v-7a4 4 0 0 0-4-4H4" />,
  turnRight: <path d="M15 14l5-5-5-5M4 20v-7a4 4 0 0 1 4-4h12" />,
  slightLeft: <path d="M17 17L7 7M7 17V7h10" />,
  slightRight: <path d="M7 17L17 7M7 7h10v10" />,
  uturn: <path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" /></>,
  vibrate: <><path d="M2 8l2 2-2 2 2 2-2 2M22 8l-2 2 2 2-2 2 2 2" /><rect x="8" y="5" width="8" height="14" rx="1" /></>,
};

export function Icon({ name, size = 20, color = 'currentColor', stroke = 2.2 }: { name: string; size?: number; color?: string; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="icon">
      {PATHS[name]}
    </svg>
  );
}

export function SaveChip({ amount, size = 'm', grey = false }: { amount: number; size?: 's' | 'm' | 'l'; grey?: boolean }) {
  return <span className={`save save-${size}${grey ? ' is-grey' : ''}`}>Save {dollars(amount)}</span>;
}

export function StatusChip({ shop }: { shop: Pick<Shop, 'status' | 'status_note'> }) {
  const icon = shop.status === 'busy' ? 'hourglass' : shop.status === 'closed' ? 'moon' : null;
  return (
    <span className={`chip chip-${shop.status}`}>
      {icon ? <Icon name={icon} size={13} stroke={2.6} /> : <i className="chip-dot" />}
      {statusText(shop)}
    </span>
  );
}

export function LiveChip({ updated, now, grey = false }: { updated: string; now: number; grey?: boolean }) {
  if (!updated) return null;
  return <span className={`chip chip-live${grey ? ' is-grey' : ''}`}><i className="live-dot" />Live menu · {ago(updated, now)}</span>;
}

/** The mascot standing on its podium in its colour; it appears only when a shop is opened, never on the map. */
export function Podium({ mascot, color, height = 150, grey = false, className = '', style }: {
  mascot: Mascot; color: string; height?: number; grey?: boolean; className?: string; style?: CSSProperties;
}) {
  const c = grey ? '#B9BDC8' : color;
  return (
    <div className={`podium ${className}`} style={{ width: height * 0.9, height: height + 14, ...style }} aria-hidden="true">
      <img className="podium-figure" src={figureOf(mascot, grey)} alt="" style={{ height, width: height * 0.5 }} />
      <svg className="podium-base" width={height * 0.9} height={height * 0.22} viewBox="0 0 132 32">
        <ellipse cx="66" cy="22" rx="64" ry="10" fill={c} fillOpacity=".3" />
        <path d="M10 12 v7 a56 10 0 0 0 112 0 v-7" fill={grey ? '#AEB3BF' : c} fillOpacity=".85" />
        <ellipse cx="66" cy="12" rx="56" ry="10" fill={grey ? '#D5D8E0' : c} />
        <ellipse cx="66" cy="10.5" rx="44" ry="6.5" fill="#fff" fillOpacity=".4" />
      </svg>
    </div>
  );
}

/** One menu row: name and note, the saving against apps, the walk-in price with the app price struck under it. */
export function MenuRow({ item, color, today = false, highlight = false, flash = false }: {
  item: MenuItem; color: string; today?: boolean; highlight?: boolean; flash?: boolean;
}) {
  const out = !item.available;
  const saving = item.price !== null && item.app_price !== null && item.app_price > item.price ? item.app_price - item.price : 0;
  return (
    <div className={`menu-row${highlight ? ' is-named' : ''}${out ? ' is-out' : ''}${flash ? ' is-flash' : ''}`}
      style={highlight ? ({ '--c': color } as CSSProperties) : undefined}>
      <div className="menu-row-name">
        {today && <span className="today" style={{ background: color }}>TODAY</span>}
        <b>{item.name}</b>
        {item.note && <span>{item.note}</span>}
      </div>
      {out ? <span className="sold-out">Sold out today</span> : saving > 0 && <span className="menu-row-save">−{dollars(saving)}</span>}
      <div className="menu-row-price">
        {item.price !== null && <b className={out ? 'is-struck' : ''}>{item.price === 0 ? 'Free' : dollars(item.price)}</b>}
        {!out && item.app_price !== null && item.price !== null && <s>{dollars(item.app_price)} apps</s>}
      </div>
    </div>
  );
}
