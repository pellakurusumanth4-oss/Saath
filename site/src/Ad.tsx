// A shop's own ad, as its billboard shows it (16:9): its colour (the owner's, else its section's), a picture, its headline and its mascot, tagged AD.
// Running (a small digital billboard), it turns through three frames under a masthead with the shop's name: that ad,
// its offer on paper and its mascot at the door. Its board units: the ad is a 160 x 90 grid, u = height / 90.
import { useEffect, useRef, type CSSProperties } from 'react';
import { runAd } from './adTicker';
import { dollars, figureOf, hostOf, portraitOf, sectionOf, type Shop } from './shops';

/** The colour times k, for the ad's gradient (k > 1 lighter, < 1 darker). */
const shade = (hex: string, k: number) =>
  `#${[1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k))).toString(16).padStart(2, '0')).join('')}`;

const INK = '#14172B', PAPER = '#FFF8EE';
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** The board's colours (WCAG): the text on the field (white or ink, whichever reads better), the field darkened only as
 * far as white text needs, the masthead, and the price dark enough to read on the paper. */
function palette(color: string) {
  let field = color;
  const on = contrast('#FFFFFF', color) >= contrast(INK, color) ? '#FFFFFF' : INK;
  if (on === '#FFFFFF') for (let k = 0.96; contrast('#FFFFFF', field) < 4.5 && k > 0.7; k -= 0.04) field = shade(color, k);
  let strip = shade(color, 0.62);
  for (let k = 0.56; contrast('#FFFFFF', strip) < 4.5 && k > 0.2; k -= 0.06) strip = shade(color, k);
  let price = shade(color, 0.72);
  for (let k = 0.66; contrast(price, PAPER) < 4.5 && k > 0.2; k -= 0.06) price = shade(color, k);
  return { field, on, strip, price };
}
// Text width (em) estimated per character for the two fonts at small sizes (errs 0-8 % wide in Chrome): no DOM
// measuring and no wait for the fonts, so each size is known on the first render.
const CW = (c: string) => /[il.,'’!|:;]/.test(c) ? 0.28 : c === ' ' ? 0.26 : /[ftrjI()\-]/.test(c) ? 0.38 : /[mwMW]/.test(c) ? 0.86 : /[A-Z]/.test(c) ? 0.66 : /[0-9$]/.test(c) ? 0.6 : 0.56;
const em = (text: string) => [...text].reduce((sum, c) => sum + CW(c), 0) * 1.08;
const lines = (text: string, w: number, size: number) => {
  const out: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (out.length && em(`${out[out.length - 1]} ${word}`) * size <= w) out[out.length - 1] += ` ${word}`;
    else out.push(word);
  }
  return out;
};
/** The biggest size, from big down to small in half units, at which text fits max lines w units wide. */
const fit = (text: string, w: number, max: number, big: number, small: number) => {
  for (let s = big; s > small; s -= 0.5) {
    const l = lines(text, w, s);
    if (l.length <= max && l.every((x) => em(x) * s <= w)) return s;
  }
  return small;
};
/** A text offer's size: three lines of it must still clear the frame's bottom edge. */
const textSize = (text: string) => { const s = fit(text, 142, 3, 16, 12.5); return lines(text, 142, s).length > 2 ? Math.min(s, 14.5) : s; };
// Each board picture's drawn box in its own 100-unit drawing (/ads/board/ is cropped to it), so the ad sizes it by what it shows.
const ART: Record<string, [number, number]> = { basket: [68.5, 66.5], bread: [68.5, 64.3], chai: [44.5, 81.3], juice: [53.5, 89.3], kurta: [64.5, 80.5],
  misal: [76.5, 68.3], pharmacy: [72.5, 72.5], phone: [74.4, 84.5], vadapav: [73, 64.8] };
// Each mascot figure's opaque box in its 400 x 832 picture: [left, top, right], so every head lands in the same place.
const FIG: Record<string, [number, number, number]> = { juno: [73, 234, 356], kai: [83, 189, 351], kiran: [0, 61, 351], lina: [61, 32, 387], max: [49, 178, 318],
  mika: [13, 98, 375], nia: [9, 30, 337], omar: [0, 69, 381], otto: [0, 70, 376], rosa: [9, 15, 341], sana: [9, 100, 344], sunny: [49, 55, 400] };
const ARROW = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 6h8M6.5 2.5 10 6l-3.5 3.5" /></svg>
);

type AdShop = Pick<Shop, 'name' | 'section' | 'friend' | 'status' | 'status_note' | 'ad_headline' | 'ad_sub' | 'ad_art' | 'ad_image_url' | 'ad_color'>
  & Partial<Pick<Shop, 'special' | 'offers' | 'hours'>>;

/** The running ad's middle frame: the walk-in saving, else today's special, else the first offer, else the hours or
 * the status note; null (no such frame) when the shop gives none of them. */
function offerOf(shop: AdShop, saving: number): { kick?: string; big: string; price?: boolean } | null {
  if (saving > 0) return { kick: 'Save', big: dollars(saving), price: true };
  if (shop.special) return { kick: 'Today', big: shop.special };
  if (shop.offers?.[0]) return { big: shop.offers[0] };
  if (shop.hours) return { kick: 'Hours', big: shop.hours };
  if (shop.status_note) return { kick: { open: 'Open now', busy: 'Busy now', closed: 'Closed' }[shop.status], big: shop.status_note };
  return null;
}

/** height in px; width in px or a CSS length. off: the shop is closed, so its lights are off. running: the board's ad,
 * turning through its frames (a closed shop's board shows Lights off); saving: the walk-in saving its offer frame shows. */
export default function Ad({ shop, height, width = (height * 16) / 9, off = false, radius = 14, tag = true, className = '', running = false, saving = 0 }: {
  shop: AdShop; height: number; width?: number | string; off?: boolean; radius?: number; tag?: boolean; className?: string; running?: boolean; saving?: number;
}) {
  const s = height / 135;
  const box: CSSProperties = { width, height, borderRadius: radius };
  const run = running && !off;
  const say = run ? offerOf(shop, saving) : null;
  const frames = say ? 3 : 2;
  const self = useRef<HTMLDivElement>(null);
  // A changed ad starts again from its own frame, so the owner sees what they type.
  useEffect(() => (run && self.current ? runAd(self.current) : undefined),
    [run, frames, shop.ad_headline, shop.ad_sub, shop.ad_art, shop.ad_color, shop.ad_image_url, shop.friend]);
  const color = shop.ad_color || sectionOf(shop).color;
  const mascot = hostOf(shop);
  const picture: CSSProperties | null = shop.ad_image_url
    ? { backgroundImage: `url(${JSON.stringify(shop.ad_image_url)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : null;
  if (running) {
    const u = height / 90;
    const P = palette(color);
    const screen = { width, height, borderRadius: 1.5 * u, '--field': P.field, '--on': P.on, '--strip': P.strip, '--paper': PAPER, '--paper-ink': INK, '--price': P.price } as CSSProperties;
    const area = { top: 21 * u };   // under the masthead: the frames are 69 units tall
    const strip = (
      <div className="ad-strip" style={{ height: 21 * u, padding: `0 ${7 * u}px 0 ${9 * u}px`, gap: 5 * u }}>
        <b style={{ fontSize: fit(shop.name, 122, 1, 14, 11) * u }}>{shop.name}</b><i style={{ fontSize: 7.5 * u }}>AD</i>
      </div>
    );
    if (off) {
      return (
        <div className={`ad ad-board is-off ${className}`} style={screen} role="img" aria-label={`${shop.name}'s billboard, lights off`}>
          {strip}
          <div className="ad-off" style={{ ...area, gap: 3 * u }}>
            <b style={{ fontSize: 17 * u }}>Lights off</b>
            <span style={{ fontSize: 12.5 * u }}>{shop.status_note || 'closed now'}</span>
          </div>
        </div>
      );
    }
    const head = shop.ad_headline || shop.name;
    const hs = fit(head, 88, 2, 21, 14);
    const rows = Math.min(3, lines(head, 88, hs).length);
    const art = ART[shop.ad_art];
    const k = art ? 70 / Math.max(...art) : 0;   // the picture as big as a 70-unit square allows
    const name = mascot.name.split(' ').pop()!;
    const [x0, top, x1] = FIG[mascot.id] ?? [0, 0, 400];
    // The label stays the same while the frames turn, so a screen reader isn't told again every 3.5 s.
    return (
      <div ref={self} className={`ad ad-board ad-run ${className}`} style={screen} role="img" data-n={frames}
        aria-label={picture ? `${shop.name}'s ad` : `${shop.name}'s ad: ${head}`}>
        {strip}
        {/* 1. The hook (or the owner's own photo, full-bleed under the masthead); art and figure are anchored right, for wider ads. */}
        <div className="ad-f" data-f="0" style={{ ...area, ...picture }}>
          {!picture && (
            <>
              {art
                ? <img className="ad-pic" src={`/ads/board/${shop.ad_art}.svg`} alt="" style={{ width: art[0] * k * u, height: art[1] * k * u, right: (21 - (art[0] * k) / 2) * u, top: (35.5 - (art[1] * k) / 2) * u }} />
                : <span className="ad-ico" style={{ fontSize: 40 * u, right: 14 * u, top: 12 * u }}>{sectionOf(shop).icon}</span>}
              <b className="ad-hl" style={{ left: 9 * u, top: Math.max(6, (66 - rows * hs * 1.02) / 2) * u, width: 88 * u, fontSize: hs * u }}>{head}</b>
            </>
          )}
        </div>
        {/* 2. The offer, on paper. */}
        {say && (
          <div className="ad-f ad-say" data-f="1" style={area}>
            {say.kick && <em style={{ left: 9 * u, top: 6 * u, fontSize: 10 * u }}>{say.kick}</em>}
            {say.price
              ? <>
                <b style={{ left: 8 * u, top: 19 * u, fontSize: fit(say.big, 142, 1, 33, 22) * u }}>{say.big}</b>
                <span className="ad-when" style={{ left: 9 * u, top: 51.5 * u, fontSize: 14 * u }}>when you walk in</span>
              </>
              : <b className="is-text" style={{ left: 9 * u, top: 22 * u, width: 142 * u, fontSize: textSize(say.big) * u }}>{say.big}</b>}
            <span className="ad-cta" style={{ right: 7 * u, top: 3 * u, height: 17 * u, padding: `0 ${6 * u}px 0 ${8 * u}px`, gap: 3 * u, borderRadius: 8.5 * u, fontSize: 12 * u }}>Walk in{ARROW(11 * u)}</span>
          </div>
        )}
        {/* 3. The mascot, head and shoulders, cropped by the bottom edge (0.2 units a picture pixel, its head 5 units down). */}
        <div className="ad-f ad-meet" data-f={frames - 1} style={area}>
          <img className="ad-fig" src={figureOf(mascot)} alt="" loading="lazy" decoding="async"
            style={{ width: 80 * u, right: (38 - (400 - (x0 + x1) / 2) * 0.2) * u, top: (5 - top * 0.2) * u }} />
          <div style={{ left: 9 * u, top: 0, bottom: 0, justifyContent: 'center', gap: u }}>
            <span style={{ fontSize: 12.5 * u }}>Meet</span>
            <b style={{ fontSize: fit(name, 70, 1, 26, 18) * u }}>{name}</b>
            <span style={{ fontSize: 12.5 * u }}>at the door</span>
          </div>
        </div>
      </div>
    );
  }
  if (off) {
    return (
      <div className={`ad is-off ${className}`} style={box} role="img" aria-label={`${shop.name}'s billboard, lights off`}>
        <b style={{ fontSize: Math.round(height * 0.14) }}>Lights off</b>
        <span style={{ fontSize: Math.max(10, Math.round(height * 0.1)) }}>{shop.status_note || 'closed now'}</span>
      </div>
    );
  }
  const adTag = tag && (
    <span className="ad-tag" style={{ right: 8 * s, bottom: 8 * s, height: 15 * s, padding: `0 ${5 * s}px`, borderRadius: 4 * s, fontSize: Math.max(8, Math.round(9 * s)), lineHeight: `${15 * s}px` }}>AD</span>
  );
  if (picture) return <div className={`ad ${className}`} style={{ ...box, ...picture }} role="img" aria-label={`${shop.name}'s ad`}>{adTag}</div>;
  return (
    <div className={`ad ${className}`} style={{ ...box, background: `linear-gradient(135deg, ${shade(color, 1.12)} 0%, ${color} 45%, ${shade(color, 0.62)} 100%)` }}
      role="img" aria-label={`${shop.name}'s ad: ${shop.ad_headline || shop.name}`}>
      <div className="ad-glow" style={{ right: -18 * s, top: -24 * s, width: 150 * s, height: 150 * s }} />
      {shop.ad_art
        ? <img className="ad-art" src={`/ads/art/${shop.ad_art}.svg`} alt="" style={{ right: 8 * s, top: 14 * s, width: 104 * s, height: 104 * s }} />
        : <span className="ad-glyph" style={{ right: 22 * s, top: 22 * s, fontSize: 62 * s }}>{sectionOf(shop).icon}</span>}
      <div className="ad-head" style={{ left: 14 * s, top: 16 * s, fontSize: Math.round(23 * s), lineHeight: `${Math.round(25 * s)}px` }}>
        {shop.ad_headline || shop.name}
      </div>
      <div className="ad-foot" style={{ left: 14 * s, bottom: 12 * s, gap: 6 * s }}>
        <img src={portraitOf(mascot)} alt="" style={{ width: 26 * s, height: 26 * s, borderWidth: Math.max(1, 2 * s) }} />
        <span style={{ fontSize: Math.max(8, Math.round(11 * s)) }}>{shop.ad_sub || shop.name}</span>
      </div>
      {adTag}
    </div>
  );
}
