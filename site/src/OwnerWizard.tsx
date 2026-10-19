// The owner's setup (/owner/): four short steps in the order the user asked for (19 Oct ~16:00): the business in their
// own words with its timings, its mascot, its billboard, and last where it is. Nothing reaches the database until the
// shop is placed: the answers stay on this device, then one insert puts the shop on the map, live. No prices are asked.
// It runs as a sheet (a panel on a computer) over the 3D city, which shows only this shop.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { LatLng } from '../../src/geo';
import TalkPanel from './TalkPanel';
import { BillboardFields, KindPicker, MascotHero, MascotPicker, agentOf, mascotFor, shortName } from './ownerParts';
import { boardOf, db, hostOf, SECTIONS, SHOP_COLUMNS, type Shop, type ShopWithMenu } from './shops';
import { Icon, Podium } from './ui';

/** What the map shows during the setup: the shop (a preview until it's placed), the centre pin while placing, the camera,
 * and how much of a phone's height the sheet covers. */
export type Stage = {
  shop: ShopWithMenu | null;
  onSpot: ((spot: LatLng) => void) | null;
  sheet: number;
  spotlight: boolean;
  focus: { spot: LatLng; key: string } | null;
};

type Step = 'business' | 'mascot' | 'billboard' | 'place';
/** The "you're live" screen: tall enough for its mascot, title and two buttons on a phone. */
const LIVE_SHEET = 0.8;
const STEPS: { id: Step; label: string; sheet: number }[] = [
  { id: 'business', label: 'Your business', sheet: 0.86 },
  { id: 'mascot', label: 'Your mascot', sheet: 0.74 },
  { id: 'billboard', label: 'Your billboard', sheet: 0.6 },
  { id: 'place', label: 'Where it is', sheet: 0.44 },
];

/** The answers so far, kept on this device; id is the shop's own, made here so a retried insert can't make a second. */
type Draft = Pick<Shop, 'name' | 'section' | 'about' | 'hours' | 'story' | 'area' | 'friend' | 'ad_headline' | 'ad_sub' | 'ad_color' | 'ad_art'>
  & { id: string; step: Step };
const NEW = 'saath:owner-new';
/** The shop this device registered: the demo account is shared, so "my shop" is the one made here. */
export const MINE = 'saath:owner-shop';
export const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
export const keep = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* not kept */ }
};
const blank = (): Draft => ({ id: crypto.randomUUID(), step: 'business', name: '', section: '', about: '', hours: '', story: '', area: '', friend: '',
  ad_headline: '', ad_sub: '', ad_color: '', ad_art: '' });
const readDraft = (): Draft => {
  try {
    const saved = JSON.parse(read(NEW) ?? 'null') as Partial<Draft> | null;
    return saved?.id ? { ...blank(), ...saved } : blank();
  } catch {
    return blank();
  }
};
/** Forget an unfinished setup (on sign-out). */
export const forgetDraft = () => keep(NEW, null);

/** Where the shop stands on the map until it's placed: the demo streets by JM Road, where the map opens. */
const PREVIEW: LatLng = { lat: 18.5194, lng: 73.8448 };
const asShop = (d: Draft, friend: string, at: LatLng): ShopWithMenu => ({
  ...at, id: d.id, slug: 'preview', name: d.name.trim() || 'Your business', section: d.section || 'restaurant', friend, area: d.area, story: d.story,
  special: '', offers: [], status: 'open', status_note: '', owner: null, claimable: false, demo: false, ad_headline: d.ad_headline, ad_sub: d.ad_sub,
  ad_art: d.ad_art, ad_image_url: '', ad_schedule: 'always', usual_order: [], app_fee: 0, board_lat: null, board_lng: null, about: d.about,
  ad_color: d.ad_color, published: false, hours: d.hours, menu: [],
});

/** A slug for the shop's link from its name: lowercase letters, digits and dashes, 3 to 40 of them. */
const slugify = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 40).replace(/-+$/, '');
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export default function OwnerWizard({ onStage, onDone, onClose }: {
  onStage: (stage: Stage | null) => void;
  /** The shop is live: open its dashboard. */
  onDone: (shop: Shop) => void;
  /** Leave without registering: only when the owner already has a shop to go back to. */
  onClose?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(readDraft);
  const [made, setMade] = useState<Shop | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [talking, setTalking] = useState(false);
  const [focus, setFocus] = useState<Stage['focus']>(null);
  const spot = useRef<LatLng | null>(null);
  const step = draft.step;
  const index = STEPS.findIndex((s) => s.id === step);
  const friend = draft.friend || mascotFor(draft.section);

  // Every answer is kept on this device as it's typed, until the shop is on the map.
  useEffect(() => {
    if (!made) keep(NEW, JSON.stringify(draft));
  }, [draft, made]);
  const change = (patch: Partial<Draft>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const go = (next: Step) => change({ step: next });

  // ---- the map: a preview of the pin and billboard, the centre pin while placing, then the shop itself ----
  const onSpot = useCallback((at: LatLng) => { spot.current = at; }, []);
  // The map reports its centre at once, then flies ~0.9 s to the pin: a quick double tap would place the shop mid-flight.
  const placeOpened = useRef(0);
  useEffect(() => { if (step === 'place') placeOpened.current = Date.now(); }, [step]);
  const mapShop = useMemo(() => (made ? { ...made, menu: [] } : step === 'mascot' || step === 'billboard' ? asShop(draft, friend, PREVIEW) : null),
    [made, step, draft, friend]);
  useEffect(() => {
    // The billboard step frames the billboard (it stands beside the pin and rises above it), the others the pin.
    const at = made ?? (step === 'billboard' ? boardOf(asShop(draft, friend, PREVIEW)) : step === 'business' ? null : PREVIEW);
    if (at) setFocus({ spot: { lat: at.lat, lng: at.lng }, key: made ? `live:${made.id}` : step });
    // Each step frames once; typing doesn't move the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, made]);
  useEffect(() => {
    onStage({ shop: mapShop, onSpot: !made && step === 'place' ? onSpot : null, sheet: made ? LIVE_SHEET : STEPS[index].sheet, spotlight: !made && step === 'billboard', focus });
  }, [mapShop, made, step, index, focus, onSpot, onStage]);
  useEffect(() => () => onStage(null), [onStage]);

  // Each step's heading takes focus, so keyboard and screen-reader owners start there (not on the next step's button).
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => head.current?.focus({ preventScroll: true }), [step, made]);

  // ---- putting the shop on the map ----
  const create = async (at: LatLng): Promise<Shop | null> => {
    const base = slugify(draft.name) || 'shop';
    const row = { id: draft.id, name: draft.name.trim(), section: draft.section, about: draft.about.trim(), hours: draft.hours.trim(),
      story: draft.story.trim(), area: draft.area.trim(), friend, ad_headline: draft.ad_headline.trim(), ad_sub: draft.ad_sub.trim(),
      ad_color: draft.ad_color, ad_art: draft.ad_art, lat: at.lat, lng: at.lng, published: true };
    for (const slug of [base, `${base.slice(0, 33)}-${Math.random().toString(36).slice(2, 7)}`]) {
      if (!/^[a-z0-9-]{3,40}$/.test(slug)) continue;
      const { data, error: insertError } = await db.from('shops').insert({ ...row, slug }).select(SHOP_COLUMNS).single();
      if (!insertError) return data as unknown as Shop;
      if (insertError.code !== '23505') {
        setError(`Couldn’t put your shop on the map: ${insertError.message}`);
        return null;
      }
      // Its own id taken: an earlier tap went in and only its answer was lost (a weak signal). That shop is this one.
      const { data: earlier } = await db.from('shops').select(SHOP_COLUMNS).eq('id', draft.id).maybeSingle();
      if (earlier) return earlier as unknown as Shop;
      // Otherwise another shop has the name's link: try a short ending (names themselves can repeat).
    }
    setError('That name is taken: add your area to it, like “Chai Corner Kothrud”.');
    return null;
  };

  const place = async () => {
    const at = spot.current;
    if (!at || Date.now() - placeOpened.current < 1200) return setError('The map isn’t ready yet: wait a moment and tap again.');
    // Untouched, the pin is still on the map's opening view: every such shop would stack on the same spot.
    if (Math.abs(at.lat - PREVIEW.lat) < 1e-6 && Math.abs(at.lng - PREVIEW.lng) < 1e-6) return setError('Drag the map until the pin sits on your door, or tap “Use my location”.');
    setBusy(true);
    setError(null);
    const shop = await create(at);
    setBusy(false);
    if (!shop) return;
    keep(NEW, null);
    keep(MINE, shop.id);
    setMade(shop);
  };

  const locate = () => {
    if (!('geolocation' in navigator)) return setError('This browser can’t share your location: drag the map instead.');
    navigator.geolocation.getCurrentPosition(
      (p) => setFocus({ spot: { lat: p.coords.latitude, lng: p.coords.longitude }, key: `me:${Date.now()}` }),
      () => setError('Couldn’t get your location: drag the map to your door instead.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // ---- what each step shows ----
  const preview = asShop(draft, friend, PREVIEW);
  const mascot = hostOf(made ?? preview);
  const agent = agentOf(mascot.id);
  const missing = draft.name.trim().length < 2 ? 'Add your business name.' : !SECTIONS[draft.section] ? 'Pick what kind of business it is.'
    : draft.about.trim().length < 8 ? 'Say what you do in a few more words.' : draft.hours.trim().length < 3 ? 'Add your timings, like “Mon–Sat, 8 am – 9 pm”.' : null;

  let body: JSX.Element;
  let action: JSX.Element;
  if (made) {
    body = (
      <div className="wiz-live">
        <Podium mascot={mascot} color={SECTIONS[made.section]?.color ?? '#5BE38F'} height={140} className="wiz-podium" />
        <h2 className="wiz-title">{made.name} is on the map</h2>
        <p className="j-text">Visitors nearby now see {mascot.name} at your door and your billboard beside it. {shortName(mascot)} answers them from what you wrote, in its own voice.</p>
      </div>
    );
    action = (
      <div className="wiz-actions">
        <button type="button" className="btn-go" onClick={() => onDone(made)}><Icon name="check" size={19} />Open my dashboard</button>
        <button type="button" className="btn-dark wiz-talk" onClick={() => setTalking(true)}><Icon name="mic" size={18} />Talk to {shortName(mascot)}</button>
      </div>
    );
  } else if (step === 'business') {
    body = (
      <>
        <label className="wiz-field">
          <span>Business name</span>
          <input name="name" value={draft.name} maxLength={60} placeholder="Chai Corner" autoComplete="organization" onChange={(e) => change({ name: e.target.value })} />
        </label>
        <fieldset className="wiz-field">
          <legend>What kind of business?</legend>
          <KindPicker value={draft.section} onPick={(section) => change({ section })} />
        </fieldset>
        <label className="wiz-field">
          <span>What you do, in a line or two <em>{draft.about.length}/160</em></span>
          <textarea name="about" value={draft.about} maxLength={160} rows={2} placeholder="Cutting chai and bun maska, made fresh all day, right by the bus stop."
            onChange={(e) => change({ about: e.target.value })} />
          <small>Your mascot says this to visitors, in its own voice.</small>
        </label>
        <label className="wiz-field">
          <span>Your timings</span>
          <input name="hours" value={draft.hours} maxLength={120} placeholder="Mon–Sat, 8 am – 9 pm" onChange={(e) => change({ hours: e.target.value })} />
          <small>Your mascot answers “when are you open?” with these.</small>
        </label>
        <label className="wiz-field">
          <span>Your story <em>optional · {draft.story.length}/400</em></span>
          <textarea name="story" value={draft.story} maxLength={400} rows={3} placeholder="How it started, who runs it, what you’re proud of."
            onChange={(e) => change({ story: e.target.value })} />
          <small>Told when a visitor asks “what’s the story here?”</small>
        </label>
      </>
    );
    action = (
      <button type="button" className="btn-go" onClick={() => (missing ? setError(missing) : go('mascot'))}>
        Next: your mascot<Icon name="arrow" size={19} />
      </button>
    );
  } else if (step === 'mascot') {
    body = (
      <>
        <MascotHero mascot={mascot} />
        <MascotPicker section={draft.section} value={friend} onPick={(id) => change({ friend: id })} />
        <ul className="wiz-will" aria-label={`${shortName(mascot)} will`}>
          <li><b>Greet visitors</b> at {preview.name}’s door: “{agent.greeting}”</li>
          <li><b>Say what you do:</b> “{draft.about.trim()}”</li>
          <li><b>Tell your timings:</b> “{draft.hours.trim()}”</li>
          {draft.story.trim() && <li><b>Tell your story</b> when asked: “{clip(draft.story.trim(), 110)}”</li>}
          <li><b>Say if you’re open,</b> busy or closed, the moment you change it.</li>
          <li><b>Never make things up,</b> and never pretend to be a person: it’s your shop’s own AI mascot.</li>
        </ul>
      </>
    );
    action = <button type="button" className="btn-go" onClick={() => go('billboard')}>Next: your billboard<Icon name="arrow" size={19} /></button>;
  } else if (step === 'billboard') {
    body = (
      <>
        <p className="wiz-hint"><Icon name="map" size={18} />Your billboard stands beside your pin. Write your ad: it changes as you type.</p>
        <BillboardFields shop={preview} onChange={change} />
      </>
    );
    action = <button type="button" className="btn-go" onClick={() => go('place')}>Next: where it is<Icon name="arrow" size={19} /></button>;
  } else {
    body = (
      <>
        <p className="wiz-hint"><Icon name="map" size={18} />Drag the map until the pin sits on your door.</p>
        <label className="wiz-field">
          <span>Road or landmark <em>optional</em></span>
          <input name="area" value={draft.area} maxLength={120} placeholder="FC Road, Shivajinagar" onChange={(e) => change({ area: e.target.value })} />
        </label>
      </>
    );
    action = (
      <div className="wiz-actions">
        <button type="button" className="btn-go" disabled={busy} onClick={() => void place()}><Icon name="check" size={19} />My shop is here</button>
        <button type="button" className="btn-ghost" onClick={locate}><Icon name="locate" size={19} />Use my location</button>
      </div>
    );
  }

  return (
    <>
      <section className={`wizard is-${made ? 'live' : step}`} style={{ '--sheet': made ? LIVE_SHEET : STEPS[index].sheet } as CSSProperties} aria-label="Put your business on the map">
        <header className="wiz-head">
          <button type="button" className="icon-btn" aria-label="Back" disabled={index === 0 || !!made || busy} onClick={() => go(STEPS[index - 1].id)}><Icon name="back" /></button>
          <div className="wiz-step">
            <small>{made ? 'Live on the map' : `Step ${index + 1} of ${STEPS.length}`}</small>
            <h2 ref={head} tabIndex={-1}>{made ? 'You’re live' : STEPS[index].label}</h2>
          </div>
          {onClose && !made
            ? <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
            : <span className="wiz-head-gap" aria-hidden="true" />}
        </header>
        <ol className="wiz-progress" aria-hidden="true">
          {STEPS.map((s, i) => <li key={s.id} className={made || i < index ? 'is-done' : i === index ? 'is-on' : ''} />)}
        </ol>
        {/* Keyed per step, so each step opens at its top (not where the last one was scrolled to). */}
        <div className="wiz-body" key={made ? 'live' : step}>{body}</div>
        <footer className="wiz-foot">
          {error && <p className="owner-msg" role="alert">{error}</p>}
          {action}
        </footer>
      </section>
      {talking && made && <TalkPanel shop={{ ...made, menu: [] }} greet="Hi! What is this place?" shopLink={false} onClose={() => setTalking(false)} />}
    </>
  );
}
