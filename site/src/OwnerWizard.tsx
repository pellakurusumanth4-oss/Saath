// The owner's guided setup (#/owner, for a new shop or a draft): the business in their words, its door on the map, its
// mascot, its billboard, its menu, then meeting the mascot and publishing. It runs as a sheet (a panel on a computer)
// over the live 3D city, so the owner watches their pin and billboard appear where visitors will see them. Each step
// saves as it goes: the business words stay on this device until the shop has a spot (a shop row needs one), then
// everything is saved to the shop, a draft that visitors don't see until it is published.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { LatLng } from '../../src/geo';
// The mascots' own greeting, personality and boundaries, as their agents have them (one source, the talk prompts).
import { MASCOTS as AGENTS } from '../../web/talk/prompts.mjs';
import { MASCOTS } from './mascots';
import { ShopEditor } from './OwnerPage';
import TalkPanel from './TalkPanel';
import { boardOf, db, hostOf, portraitOf, SECTIONS, SHOP_COLUMNS, type MenuItem, type Shop, type ShopWithMenu } from './shops';
import { Icon, Podium } from './ui';

/** What the map shows while the owner sets up: their shop, the centre pin while they place it, and how much of a
 * phone's height the sheet covers. */
export type Stage = {
  shop: ShopWithMenu | null;
  onSpot: ((spot: LatLng) => void) | null;
  sheet: number;
  spotlight: boolean;
  focus: { spot: LatLng; key: string } | null;
};

type Step = 'business' | 'place' | 'mascot' | 'billboard' | 'menu' | 'meet';
const STEPS: { id: Step; label: string; sheet: number }[] = [
  { id: 'business', label: 'Your business', sheet: 0.86 },
  { id: 'place', label: 'Where it is', sheet: 0.4 },
  { id: 'mascot', label: 'Your mascot', sheet: 0.74 },
  { id: 'billboard', label: 'Your billboard', sheet: 0.52 },
  { id: 'menu', label: 'Menu and prices', sheet: 0.86 },
  { id: 'meet', label: 'Meet your mascot', sheet: 0.74 },
];

type Words = { name: string; section: string; about: string; story: string; area: string };
const NEW = 'saath:owner-new';
const STEP = (id: string) => `saath:owner-step:${id}`;
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const keep = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* not kept */ }
};
const wordsOf = (shop: Shop | null): Words => {
  if (shop) return { name: shop.name, section: shop.section, about: shop.about, story: shop.story, area: shop.area };
  const blank = { name: '', section: '', about: '', story: '', area: '' };
  try { return { ...blank, ...JSON.parse(read(NEW) ?? '{}') }; } catch { return blank; }
};

/** A slug for the shop's link from its name: lowercase letters, digits and dashes, 3 to 40 of them. */
const slugify = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 40).replace(/-+$/, '');

const agentOf = (id: string) => AGENTS[id as keyof typeof AGENTS];
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export default function OwnerWizard({ draft, onStage, onExit }: {
  /** The owner's unpublished shop to carry on with, or null for a new one. */
  draft: Shop | null;
  onStage: (stage: Stage | null) => void;
  /** Leave the setup (everything is saved): to the owner page, with the demo shops and the dashboard. */
  onExit: (id: string | null) => void;
}) {
  const [shop, setShop] = useState<Shop | null>(draft);
  const [words, setWords] = useState<Words>(() => wordsOf(draft));
  const [step, setStep] = useState<Step>(() => (draft ? (STEPS.find((s) => s.id === read(STEP(draft.id)))?.id ?? 'mascot') : 'business'));
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [talking, setTalking] = useState(false);
  const [live, setLive] = useState(false);
  const [focus, setFocus] = useState<Stage['focus']>(null);
  const spot = useRef<LatLng | null>(null);
  const pending = useRef<Partial<Shop>>({});
  const timer = useRef(0);
  const index = STEPS.findIndex((s) => s.id === step);

  // ---- saving ----
  const flush = async (id = shop?.id) => {
    window.clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = {};
    if (!id || !Object.keys(patch).length) return true;
    const { data, error: saveError } = await db.from('shops').update(patch).eq('id', id).select('id');
    const ok = !saveError && !!data?.length;
    if (!ok) pending.current = { ...patch, ...pending.current };   // kept for the next try, so a failed save isn't lost
    setSaved(ok ? '✓ Saved' : `Not saved: ${saveError?.message ?? 'this shop isn’t yours'}`);
    return ok;
  };
  const save = (patch: Partial<Shop>) => {
    if (!shop) return;
    setShop((current) => current && { ...current, ...patch });
    Object.assign(pending.current, patch);
    setSaved('Saving…');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(shop.id), 500);
  };
  const setWord = (field: keyof Words, value: string) => {
    const next = { ...words, [field]: value };
    setWords(next);
    if (!shop) keep(NEW, JSON.stringify(next));
    else if (field !== 'name' || value.trim().length >= 2) save({ [field]: value.trim() });
  };
  const loadMenu = async (id: string) => {
    const { data } = await db.from('menu_items').select('*').eq('shop_id', id).order('sort');
    const items = (data as MenuItem[] | null) ?? [];
    setMenu(items);
    return items;
  };

  // ---- the map: the shop's pin and billboard, the centre pin while placing, the camera on each step ----
  const onSpot = useCallback((at: LatLng) => { spot.current = at; }, []);
  const shopId = shop?.id;
  useEffect(() => {
    // The billboard step frames the billboard (it stands beside the pin and rises above it), the others the pin.
    if (shop) setFocus({ spot: step === 'billboard' ? boardOf(shop) : shop, key: `${step}:${shop.id}:${shop.lat},${shop.lng}` });
    // Each step frames the shop once; typing doesn't move the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, shopId]);
  const mapShop = useMemo(() => (shop ? { ...shop, menu: menu ?? [] } : null), [shop, menu]);
  useEffect(() => {
    onStage({ shop: mapShop, onSpot: step === 'place' ? onSpot : null, sheet: STEPS[index].sheet, spotlight: step === 'billboard', focus });
  }, [mapShop, step, index, focus, onSpot, onStage]);
  useEffect(() => () => onStage(null), [onStage]);
  useEffect(() => {
    if (shopId) keep(STEP(shopId), step);
    if (shopId && (step === 'meet' || step === 'menu')) void loadMenu(shopId);
  }, [shopId, step]);

  // Each step's heading takes focus, so keyboard and screen-reader owners start there (not on the next step's button).
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => head.current?.focus({ preventScroll: true }), [step, live]);

  const go = (next: Step) => {
    setError(null);
    setStep(next);
  };

  // ---- the steps' own actions ----
  const create = async (at: LatLng): Promise<Shop | null> => {
    const base = slugify(words.name) || 'shop';
    const friend = MASCOTS.find((mascot) => mascot.section === words.section)?.id ?? 'juno';
    // A taken link (another shop's name) gets a short ending; the name itself can repeat.
    for (const slug of [base, `${base.slice(0, 33)}-${Math.random().toString(36).slice(2, 7)}`]) {
      if (!/^[a-z0-9-]{3,40}$/.test(slug)) continue;
      const { data, error: insertError } = await db.from('shops')
        .insert({ slug, name: words.name.trim(), section: words.section, about: words.about.trim(), story: words.story.trim(), area: words.area.trim(), friend, lat: at.lat, lng: at.lng })
        .select(SHOP_COLUMNS).single();
      if (!insertError) return data as unknown as Shop;
      // The first try may have been saved with its answer lost (a weak signal): reuse that draft instead of making a second.
      if (insertError.code === '23505' && slug === base) {
        const { data: same } = await db.from('shops').select(SHOP_COLUMNS).eq('slug', base).eq('published', false).maybeSingle();
        const me = (await db.auth.getSession()).data.session?.user.id;
        if (same && (same as unknown as Shop).owner === me) return same as unknown as Shop;
      }
      if (insertError.code !== '23505') {
        setError(`Couldn’t save your shop: ${insertError.message}`);
        return null;
      }
    }
    setError('That name is taken: add your area to it, like “Chai Corner Kothrud”.');
    return null;
  };

  const place = async () => {
    const at = spot.current;
    if (!at) return setError('The map isn’t ready yet: wait a moment and tap again.');
    setBusy(true);
    setError(null);
    if (shop) {
      save({ lat: at.lat, lng: at.lng, area: words.area.trim() });
      const ok = await flush();
      setBusy(false);
      if (ok) go('mascot');
      return;
    }
    const made = await create(at);
    setBusy(false);
    if (!made) return;
    keep(NEW, null);
    setShop(made);
    go('mascot');
  };

  const locate = () => {
    if (!('geolocation' in navigator)) return setError('This browser can’t share your location: drag the map instead.');
    navigator.geolocation.getCurrentPosition(
      (p) => setFocus({ spot: { lat: p.coords.latitude, lng: p.coords.longitude }, key: `me:${Date.now()}` }),
      () => setError('Couldn’t get your location: drag the map to your door instead.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const toMeet = async () => {
    if (!shop) return;
    const items = await loadMenu(shop.id);
    if (!items.length) return setError('Add at least one thing you sell, with its price.');
    go('meet');
  };

  const publish = async () => {
    if (!shop) return;
    setBusy(true);
    setError(null);
    if (!(await flush())) {
      setBusy(false);
      return setError('Not saved: check your connection and try again.');
    }
    const { data, error: publishError } = await db.from('shops').update({ published: true }).eq('id', shop.id).select('id');
    setBusy(false);
    if (publishError || !data?.length) return setError(publishError?.message ?? 'Couldn’t publish: this shop isn’t yours.');
    keep(STEP(shop.id), null);
    setShop({ ...shop, published: true });
    setLive(true);
  };

  // ---- what each step shows ----
  const mascot = shop ? hostOf(shop) : null;
  const agent = mascot ? agentOf(mascot.id) : null;
  const section = SECTIONS[words.section];
  const ready = words.name.trim().length >= 2 && !!section && words.about.trim().length >= 8;
  const priced = (menu ?? []).filter((item) => item.price !== null);
  const saving = priced.filter((item) => item.app_price !== null && item.app_price > item.price!);

  let body: JSX.Element;
  let action: JSX.Element;
  if (live && shop && mascot) {
    body = (
      <div className="wiz-live">
        <Podium mascot={mascot} color={section?.color ?? '#5BE38F'} height={170} className="wiz-podium" />
        <h2 className="wiz-title">{shop.name} is on the map</h2>
        <p className="j-text">Visitors nearby see {mascot.name} at your door and your billboard beside it, right now. Change prices, your ad or how busy you are any time from your dashboard.</p>
      </div>
    );
    action = (
      <div className="wiz-actions">
        <button type="button" className="btn-go" onClick={() => onExit(shop.id)}><Icon name="check" size={19} />Open my dashboard</button>
        <a className="btn-ghost" href={`#/shop/${shop.slug}`}>See my shop page</a>
      </div>
    );
  } else if (step === 'business') {
    body = (
      <>
        <label className="wiz-field">
          <span>Business name</span>
          <input value={words.name} maxLength={60} placeholder="Chai Corner" autoComplete="organization" onChange={(e) => setWord('name', e.target.value)} />
        </label>
        <fieldset className="wiz-field">
          <legend>What kind of business?</legend>
          <div className="wiz-sections">
            {MASCOTS.map(({ section: id }) => (
              <button key={id} type="button" aria-pressed={words.section === id} style={{ '--c': SECTIONS[id].color } as CSSProperties}
                onClick={() => setWord('section', id)}>
                <span className="glyph">{SECTIONS[id].icon}</span>{SECTIONS[id].label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="wiz-field">
          <span>What you do, in a line or two <em>{words.about.length}/160</em></span>
          <textarea value={words.about} maxLength={160} rows={2} placeholder="Cutting chai and bun maska, made fresh all day, right by the bus stop."
            onChange={(e) => setWord('about', e.target.value)} />
          <small>Your mascot says this to visitors, in its own voice.</small>
        </label>
        <label className="wiz-field">
          <span>Your story <em>optional · {words.story.length}/400</em></span>
          <textarea value={words.story} maxLength={400} rows={3} placeholder="How it started, who runs it, what you’re proud of."
            onChange={(e) => setWord('story', e.target.value)} />
          <small>Told when a visitor asks “what’s the story here?”</small>
        </label>
        {!shop && <button type="button" className="wiz-link" onClick={() => onExit(null)}>Just trying Saath? Claim a demo shop instead ›</button>}
      </>
    );
    action = (
      <button type="button" className="btn-go" onClick={() => (ready ? go('place') : setError(words.name.trim().length < 2 ? 'Add your business name.' : !section ? 'Pick what kind of business it is.' : 'Say what you do in a few more words.'))}>
        Next: where it is<Icon name="arrow" size={19} />
      </button>
    );
  } else if (step === 'place') {
    body = (
      <>
        <p className="wiz-hint"><Icon name="map" size={18} />Drag the map until the pin sits on your door.</p>
        <label className="wiz-field">
          <span>Road or landmark <em>optional</em></span>
          <input value={words.area} maxLength={120} placeholder="FC Road, Shivajinagar" onChange={(e) => setWord('area', e.target.value)} />
        </label>
      </>
    );
    action = (
      <div className="wiz-actions">
        <button type="button" className="btn-go" disabled={busy} onClick={() => void place()}><Icon name="check" size={19} />{shop ? 'Move my shop here' : 'My shop is here'}</button>
        <button type="button" className="btn-ghost" onClick={locate}><Icon name="locate" size={19} />Use my location</button>
      </div>
    );
  } else if (step === 'mascot' && shop && mascot && agent) {
    const own = MASCOTS.filter((m) => m.section === shop.section);
    body = (
      <>
        <div className="wiz-hero" style={{ '--c': SECTIONS[mascot.section]?.color } as CSSProperties}>
          <Podium key={mascot.id} mascot={mascot} color={SECTIONS[mascot.section]?.color ?? '#5BE38F'} height={168} className="wiz-podium" />
          <div>
            <b className="wiz-mascot-name">{mascot.name}</b>
            <p className="wiz-personality">{agent.personality}</p>
            <q className="wiz-bubble">{agent.greeting}</q>
          </div>
        </div>
        <div className="wiz-cast" role="radiogroup" aria-label="Pick your mascot">
          {[...own, ...MASCOTS.filter((m) => m.section !== shop.section)].map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={m.id === mascot.id} style={{ '--c': SECTIONS[m.section]?.color } as CSSProperties}
              onClick={() => save({ friend: m.id })}>
              <img src={portraitOf(m)} alt="" width={56} height={56} />
              <span>{m.name.split(' ').pop()}</span>
              {m.section === shop.section && <em>Made for you</em>}
            </button>
          ))}
        </div>
      </>
    );
    action = <button type="button" className="btn-go" onClick={() => void flush().then((ok) => ok && go('billboard'))}>Next: your billboard<Icon name="arrow" size={19} /></button>;
  } else if (step === 'billboard' && shop) {
    body = <ShopEditor key={`${shop.id}:billboard`} shop={shop} only="billboard" onPatch={(patch) => setShop((s) => s && { ...s, ...patch })} />;
    action = <button type="button" className="btn-go" onClick={() => go('menu')}>Next: menu and prices<Icon name="arrow" size={19} /></button>;
  } else if (step === 'menu' && shop) {
    body = (
      <>
        <label className="wiz-field">
          <span>Today’s special <em>optional</em></span>
          <input defaultValue={shop.special} maxLength={140} placeholder="Mango shake with a scoop of ice cream" onChange={(e) => save({ special: e.target.value.trim() })} />
          <small>Your mascot tells visitors about it. Change it any day from your dashboard.</small>
        </label>
        <ShopEditor key={`${shop.id}:menu`} shop={shop} only="menu" onPatch={(patch) => setShop((s) => s && { ...s, ...patch })} />
      </>
    );
    action = <button type="button" className="btn-go" onClick={() => void toMeet()}>Next: meet your mascot<Icon name="arrow" size={19} /></button>;
  } else if (step === 'meet' && shop && mascot && agent) {
    const ticks: [boolean, string][] = [
      [true, `Pin and billboard at ${shop.area || 'your door'}`],
      [true, `${mascot.name} at your door`],
      [priced.length > 0, priced.length ? `${priced.length} thing${priced.length > 1 ? 's' : ''} on your menu` : 'Your menu: add at least one thing'],
    ];
    body = (
      <>
        <div className="wiz-hero" style={{ '--c': SECTIONS[mascot.section]?.color } as CSSProperties}>
          <Podium mascot={mascot} color={SECTIONS[mascot.section]?.color ?? '#5BE38F'} height={150} className="wiz-podium" />
          <div>
            <b className="wiz-mascot-name">{mascot.name} is ready</b>
            <p className="wiz-personality">Your shop’s own agent: it answers visitors from what you wrote, in its own voice.</p>
            <button type="button" className="btn-dark small" onClick={() => setTalking(true)}><Icon name="mic" size={17} />Talk to {mascot.name.split(' ').pop()}</button>
          </div>
        </div>
        <h3 className="wiz-sub">Your mascot will…</h3>
        <ul className="wiz-will">
          <li><b>Greet visitors</b> at {shop.name}’s door: “{agent.greeting}”</li>
          {shop.about && <li><b>Say what you do:</b> “{shop.about}”</li>}
          {shop.story && <li><b>Tell your story</b> when asked: “{clip(shop.story, 110)}”</li>}
          <li><b>Quote only your prices:</b> {priced.length} on your menu{saving.length ? `, with the saving against delivery apps on ${saving.length}` : ''}{shop.special ? `, and today’s special` : ''}.</li>
          <li><b>Say if you’re open,</b> busy or closed, the moment you change it.</li>
          <li><b>Never</b> invent a price, an offer or a discount, or name a delivery app. {agent.boundaries.replace(/SHOP DATA/g, 'your menu')}</li>
        </ul>
        <ul className="wiz-ticks" aria-label="Ready to publish">
          {ticks.map(([ok, text]) => <li key={text} className={ok ? 'is-ok' : ''}><Icon name={ok ? 'check' : 'close'} size={16} stroke={2.8} />{text}</li>)}
        </ul>
      </>
    );
    action = (
      <button type="button" className="btn-go" disabled={busy || !priced.length} onClick={() => void publish()}>
        <Icon name="walk" size={19} />Publish: put it on the map
      </button>
    );
  } else {
    body = <p className="note">Loading…</p>;
    action = <></>;
  }

  return (
    <>
      <section className={`wizard is-${live ? 'live' : step}`} style={{ '--sheet': STEPS[index].sheet } as CSSProperties} aria-label="Put your shop on the map">
        <header className="wiz-head">
          <button type="button" className="icon-btn" aria-label="Back" disabled={index === 0 || live}
            onClick={() => go(STEPS[index - 1].id)}><Icon name="back" /></button>
          <div className="wiz-step">
            <small>{live ? 'Published' : `Step ${index + 1} of ${STEPS.length}`}{saved && !live ? ` · ${saved}` : ''}</small>
            <h2 ref={head} tabIndex={-1}>{live ? 'You’re live' : STEPS[index].label}</h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Save and close" onClick={() => void flush().then((ok) => (ok ? onExit(shop?.id ?? null) : setError('Not saved: check your connection and try again.')))}><Icon name="close" /></button>
        </header>
        <ol className="wiz-progress" aria-hidden="true">
          {STEPS.map((s, i) => <li key={s.id} className={live || i < index ? 'is-done' : i === index ? 'is-on' : ''} />)}
        </ol>
        {/* Any edit clears the last complaint (like "add a menu" once items go in). */}
        {/* Keyed per step, so each step opens at its top (not where the last one was scrolled to). */}
        <div className="wiz-body" key={live ? 'live' : step} onInput={() => error && setError(null)}>{body}</div>
        <footer className="wiz-foot">
          {error && <p className="owner-msg" role="alert">{error}</p>}
          {action}
        </footer>
      </section>
      {talking && mapShop && (
        <TalkPanel shop={mapShop} greet="Hi! What is this place?" onClose={() => setTalking(false)} />
      )}
    </>
  );
}
