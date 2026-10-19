// A shop's own ad, as its billboard shows it (16:9): its colour (the owner's, else its section's), a picture, its headline and its mascot, tagged AD.
// Running (a small digital billboard), it turns through three frames: that ad, its offer and its mascot.
import { useEffect, useRef, type CSSProperties } from 'react';
import { runAd } from './adTicker';
import { dollars, hostOf, portraitOf, sectionOf, type Shop } from './shops';

/** The colour times k, for the ad's gradient (k > 1 lighter, < 1 darker). */
const shade = (hex: string, k: number) =>
  `#${[1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k))).toString(16).padStart(2, '0')).join('')}`;

type AdShop = Pick<Shop, 'name' | 'section' | 'friend' | 'status' | 'status_note' | 'ad_headline' | 'ad_sub' | 'ad_art' | 'ad_image_url' | 'ad_color'>
  & Partial<Pick<Shop, 'special' | 'offers' | 'hours'>>;

/** The running ad's middle frame: the walk-in saving, else today's special, else the first offer, else the hours or
 * the status note; null (no such frame) when the shop gives none of them. */
function offerOf(shop: AdShop, saving: number): { kick?: string; big: string; small?: string } | null {
  if (saving > 0) return { big: `Save ${dollars(saving)}`, small: 'when you walk in' };
  if (shop.special) return { kick: 'Today', big: shop.special };
  if (shop.offers?.[0]) return { big: shop.offers[0] };
  if (shop.hours) return { kick: 'Open', big: shop.hours };
  if (shop.status_note) return { kick: { open: 'Open', busy: 'Busy', closed: 'Closed' }[shop.status], big: shop.status_note };
  return null;
}

/** height in px; width in px or a CSS length. off: the shop is closed, so its lights are off. running: it turns through
 * its frames (a closed shop's never does); saving: the walk-in saving its offer frame shows. */
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
  const picture: CSSProperties | null = shop.ad_image_url
    ? { backgroundImage: `url(${JSON.stringify(shop.ad_image_url)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : null;
  if (picture && !run) {
    return <div className={`ad ${className}`} style={{ ...box, ...picture }} role="img" aria-label={`${shop.name}'s ad`}>{adTag}</div>;
  }
  const color = shop.ad_color || sectionOf(shop).color;
  const mascot = hostOf(shop);
  const glow = <div className="ad-glow" style={{ right: -18 * s, top: -24 * s, width: 150 * s, height: 150 * s }} />;
  const own = !picture && (
    <>
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
    </>
  );
  const props = {
    style: { ...box, background: `linear-gradient(135deg, ${shade(color, 1.12)} 0%, ${color} 45%, ${shade(color, 0.62)} 100%)` },
    role: 'img', 'aria-label': picture ? `${shop.name}'s ad` : `${shop.name}'s ad: ${shop.ad_headline || shop.name}`,
  };
  if (!run) return <div className={`ad ${className}`} {...props}>{glow}{own}{adTag}</div>;
  // The label stays the same while the frames turn, so a screen reader isn't told again every 3.5 s.
  return (
    <div ref={self} className={`ad ad-run ${className}`} {...props} data-n={frames}>
      {glow}
      <div className="ad-f" data-f="0" style={picture ?? undefined}>{own}</div>
      {say && (
        <div className="ad-f ad-say" data-f="1" style={{ padding: `${12 * s}px ${30 * s}px ${12 * s}px ${16 * s}px`, gap: 4 * s }}>
          {say.kick && <em style={{ fontSize: Math.max(8, Math.round(10 * s)), padding: `${2 * s}px ${6 * s}px`, borderRadius: 4 * s }}>{say.kick}</em>}
          <b style={{ fontSize: Math.round((say.big.length <= 14 ? 32 : say.big.length <= 30 ? 23 : 18) * s) }}>{say.big}</b>
          {say.small && <span style={{ fontSize: Math.max(9, Math.round(14 * s)) }}>{say.small}</span>}
        </div>
      )}
      <div className="ad-f ad-meet" data-f={frames - 1} style={{ padding: `0 ${36 * s}px 0 ${14 * s}px`, gap: 12 * s }}>
        <img src={portraitOf(mascot)} alt="" style={{ width: 96 * s, height: 96 * s, borderWidth: Math.max(2, 3 * s) }} />
        <div>
          <b style={{ fontSize: Math.round(24 * s) }}>Meet {mascot.name.split(' ').pop()}</b>
          <span style={{ fontSize: Math.max(9, Math.round(14 * s)) }}>at the door</span>
          <small style={{ fontSize: Math.max(8, Math.round(11 * s)), marginTop: 4 * s }}>{shop.name}</small>
        </div>
      </div>
      {adTag}
    </div>
  );
}
