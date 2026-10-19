// A shop's own ad, as its billboard shows it (16:9): its colour, a picture, its headline and its mascot, tagged AD.
import type { CSSProperties } from 'react';
import { hostOf, portraitOf, sectionOf, type Shop } from './shops';

/** The colour times k, for the ad's gradient (k > 1 lighter, < 1 darker). */
const shade = (hex: string, k: number) =>
  `#${[1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k))).toString(16).padStart(2, '0')).join('')}`;

type AdShop = Pick<Shop, 'name' | 'section' | 'friend' | 'status' | 'status_note' | 'ad_headline' | 'ad_sub' | 'ad_art' | 'ad_image_url'>;

/** height in px; width in px or a CSS length. off: the shop is closed, so its lights are off. */
export default function Ad({ shop, height, width = (height * 16) / 9, off = false, radius = 14, tag = true, className = '' }: {
  shop: AdShop; height: number; width?: number | string; off?: boolean; radius?: number; tag?: boolean; className?: string;
}) {
  const s = height / 135;
  const box: CSSProperties = { width, height, borderRadius: radius };
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
  if (shop.ad_image_url) {
    return (
      <div className={`ad ${className}`} style={{ ...box, backgroundImage: `url(${JSON.stringify(shop.ad_image_url)})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        role="img" aria-label={`${shop.name}'s ad`}>
        {adTag}
      </div>
    );
  }
  const color = sectionOf(shop).color;
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
        <img src={portraitOf(hostOf(shop))} alt="" style={{ width: 26 * s, height: 26 * s, borderWidth: Math.max(1, 2 * s) }} />
        <span style={{ fontSize: Math.max(8, Math.round(11 * s)) }}>{shop.ad_sub || shop.name}</span>
      </div>
      {adTag}
    </div>
  );
}
