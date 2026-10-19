// Pieces the owner page uses in both the setup and the dashboard: the kind of business, the mascot and the billboard.
// Each shows a value and reports a change; whoever uses it decides where the change goes (this device, or the shop row).
import type { CSSProperties, ReactNode } from 'react';
// The mascots' own greeting, personality and boundaries, as their agents have them (one source, the talk prompts).
import { MASCOTS as AGENTS } from '../../web/talk/prompts.mjs';
import Ad from './Ad';
import { MASCOTS, type Mascot } from './mascots';
import { portraitOf, SECTIONS, sectionOf, type Shop } from './shops';
import { Podium } from './ui';

export const ART = ['chai', 'misal', 'juice', 'bread', 'vadapav', 'pharmacy', 'phone', 'kurta', 'basket'];
/** The billboard's colours: the section's own first, then the mascots' colours and ink. */
export const COLOURS: [string, string][] = [['Your section’s colour', ''], ['Tomato', '#E5533D'], ['Saffron', '#E8A317'], ['Orange', '#F28C28'],
  ['Rose', '#E35D9A'], ['Plum', '#7B4BA8'], ['Blue', '#3D5AFE'], ['Sky', '#1AA3C2'], ['Teal', '#14897C'], ['Leaf', '#2E8B57'],
  ['Cocoa', '#8C5A3C'], ['Navy', '#23395B'], ['Ink', '#0E1726']];

export const agentOf = (id: string) => AGENTS[id as keyof typeof AGENTS];
export const shortName = (mascot: Mascot) => mascot.name.split(' ').pop()!;
/** The section's own mascot: the one suggested first. */
export const mascotFor = (section: string) => MASCOTS.find((mascot) => mascot.section === section)?.id ?? 'juno';

/** The 12 kinds of business, each with its colour and sign. */
export function KindPicker({ value, onPick }: { value: string; onPick: (section: string) => void }) {
  return (
    <div className="wiz-sections">
      {MASCOTS.map(({ section: id }) => (
        <button key={id} type="button" aria-pressed={value === id} style={{ '--c': SECTIONS[id].color } as CSSProperties} onClick={() => onPick(id)}>
          <span className="glyph">{SECTIONS[id].icon}</span>{SECTIONS[id].label}
        </button>
      ))}
    </div>
  );
}

/** The mascot on its podium (waving, then bobbing), its name, personality and greeting. */
export function MascotHero({ mascot, children }: { mascot: Mascot; children?: ReactNode }) {
  const color = SECTIONS[mascot.section]?.color ?? '#5BE38F';
  const agent = agentOf(mascot.id);
  return (
    <div className="wiz-hero" style={{ '--c': color } as CSSProperties}>
      <Podium key={mascot.id} mascot={mascot} color={color} height={168} className="wiz-podium" />
      <div>
        <b className="wiz-mascot-name">{mascot.name}</b>
        <p className="wiz-personality">{agent.personality}</p>
        <q className="wiz-bubble">{agent.greeting}</q>
        {children}
      </div>
    </div>
  );
}

/** The 12 mascots, the section's own first ("Suggested"). */
export function MascotPicker({ section, value, onPick }: { section: string; value: string; onPick: (id: string) => void }) {
  const ordered = [...MASCOTS.filter((m) => m.section === section), ...MASCOTS.filter((m) => m.section !== section)];
  return (
    <div className="wiz-cast" role="group" aria-label="Pick your mascot">
      {ordered.map((m) => (
        <button key={m.id} type="button" aria-pressed={m.id === value} style={{ '--c': SECTIONS[m.section]?.color } as CSSProperties} onClick={() => onPick(m.id)}>
          <img src={portraitOf(m)} alt="" width={56} height={56} />
          <span>{shortName(m)}</span>
          {m.section === section && <em>Suggested</em>}
        </button>
      ))}
    </div>
  );
}

type AdFields = Pick<Shop, 'ad_headline' | 'ad_sub' | 'ad_color' | 'ad_art'>;

/** The billboard ad: a live preview, its headline and small line, its colour and its picture. */
export function BillboardFields({ shop, onChange }: {
  shop: Pick<Shop, 'name' | 'section' | 'friend' | 'status' | 'status_note' | 'ad_image_url'> & AdFields;
  onChange: (patch: Partial<AdFields>) => void;
}) {
  return (
    <>
      <div className="wiz-ad-preview"><Ad shop={shop} height={170} width="100%" radius={16} /></div>
      <label className="wiz-field">
        <span>Headline <em>{shop.ad_headline.length}/24</em></span>
        <input name="ad_headline" value={shop.ad_headline} maxLength={24} placeholder="Chai like home." onChange={(e) => onChange({ ad_headline: e.target.value })} />
      </label>
      <label className="wiz-field">
        <span>Small line <em>{shop.ad_sub.length}/40</em></span>
        <input name="ad_sub" value={shop.ad_sub} maxLength={40} placeholder={shop.name || 'Your business name'} onChange={(e) => onChange({ ad_sub: e.target.value })} />
      </label>
      <div className="wiz-field">
        <span>Colour</span>
        <div className="owner-colors" role="group" aria-label="Colour">
          {COLOURS.map(([name, hex]) => (
            <button key={name} type="button" aria-pressed={shop.ad_color === hex} aria-label={name} title={name}
              style={{ background: hex || sectionOf(shop).color }} onClick={() => onChange({ ad_color: hex })} />
          ))}
        </div>
      </div>
      <div className="wiz-field">
        <span>Picture</span>
        <div className="owner-art" role="group" aria-label="Picture">
          <button type="button" aria-pressed={shop.ad_art === ''} onClick={() => onChange({ ad_art: '' })} aria-label="No picture: the section's sign">{sectionOf(shop).icon}</button>
          {ART.map((art) => (
            <button key={art} type="button" aria-pressed={shop.ad_art === art} onClick={() => onChange({ ad_art: art })} aria-label={art}>
              <img src={`/ads/art/${art}.svg`} alt="" />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
