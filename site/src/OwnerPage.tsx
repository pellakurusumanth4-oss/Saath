import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import maplibregl from 'maplibre-gl';
import type { Session } from '@supabase/supabase-js';
import { MAP_STYLE } from '../../src/mapStyle';
import type { LatLng } from '../../src/geo';
import Ad from './Ad';
import Compare from './Compare';
import MapBoundary from './MapBoundary';
import { MASCOTS } from './mascots';
import { db, figureOf, hostOf, rupees, SECTIONS, SHOP_COLUMNS, type MenuItem, type Shop, type Status } from './shops';
import { Icon } from './ui';

const PUNE: LatLng = { lat: 18.5204, lng: 73.8567 };
const ART = ['chai', 'misal', 'juice', 'bread', 'vadapav', 'pharmacy', 'phone', 'kurta', 'basket'];

const sectionOptions = Object.entries(SECTIONS).map(([id, section]) => (
  <option key={id} value={id}>{section.icon} {section.label}</option>
));
const mascotOptions = MASCOTS.map((mascot) => <option key={mascot.id} value={mascot.id}>{mascot.name}</option>);

/** A slug for the shop's link from its name: lowercase letters, digits and dashes, 3 to 40 of them. */
const slugify = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 40).replace(/-+$/, '');

/** For shop owners (#/owner): sign in, then change the billboard, menu, prices, status and pin; visitors see it live. */
export default function OwnerPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    void db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = db.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <div className="page owner-page" role="dialog" aria-label="For shop owners">
      <div className="page-sheet">
        <div className="owner-row owner-top">
          <a className="back-link" href="#/">← Map</a>
          {session && <button type="button" className="owner-link-btn" onClick={() => void db.auth.signOut()}>Sign out</button>}
        </div>
        {session && <div className="owner-live"><i className="live-dot" />Live: visitors see every change within a second</div>}
        <h1 className="owner-title">Your shop on Saath</h1>
        {session === undefined ? (
          <p className="note">Loading…</p>
        ) : session ? (
          <OwnerShops userId={session.user.id} />
        ) : (
          <SignIn />
        )}
      </div>
    </div>
  );
}

function SignIn() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email')).trim();
    const password = String(form.get('password'));
    const create = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'create';
    setBusy(true);
    setMessage(null);
    const { data, error } = create
      ? await db.auth.signUp({ email, password })
      : await db.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
    else if (create && !data.session) setMessage('Check your email for the link, then sign in here.');
  };

  return (
    <form className="owner-form owner-section" onSubmit={(event) => void submit(event)}>
      <p className="owner-help">Sign in to change your billboard, menu, prices and how busy you are. Visitors see each change at once.</p>
      <label>
        Email
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        Password
        <input name="password" type="password" required minLength={8} autoComplete="current-password" />
      </label>
      <div className="actions">
        <button className="btn-dark" type="submit" value="signin" disabled={busy}>Sign in</button>
        <button className="btn-ghost" type="submit" value="create" disabled={busy}>Create account</button>
      </div>
      {message && <p className="owner-msg" role="alert">{message}</p>}
    </form>
  );
}

function OwnerShops({ userId }: { userId: string }) {
  const [mine, setMine] = useState<Shop[] | null>(null);
  const [demo, setDemo] = useState<Shop[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [own, claimable] = await Promise.all([
      db.from('shops').select(SHOP_COLUMNS).eq('owner', userId).order('created_at'),
      db.from('shops').select(SHOP_COLUMNS).eq('claimable', true).order('name'),
    ]);
    setError(own.error?.message ?? claimable.error?.message ?? null);
    setMine((own.data as Shop[] | null) ?? []);
    setDemo((claimable.data as Shop[] | null) ?? []);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const claim = async (slug: string) => {
    const { error: claimError } = await db.rpc('claim_demo_shop', { p_slug: slug });
    await load();
    if (claimError) setError(claimError.message);
  };

  if (!mine) return <p className="note">Loading your shops…</p>;
  const open = mine.find((shop) => shop.id === openId) ?? mine[0] ?? null;

  return (
    <>
      {error && <p className="owner-msg" role="alert">{error}</p>}
      {mine.length > 1 && (
        <div className="owner-tabs">
          {mine.map((shop) => (
            <button key={shop.id} type="button" className={`owner-tab${shop.id === open?.id ? ' is-on' : ''}`} onClick={() => setOpenId(shop.id)}>
              {shop.name}
            </button>
          ))}
        </div>
      )}
      {adding ? (
        <NewShop
          onDone={(id) => {
            setAdding(false);
            if (id) setOpenId(id);
            void load();
          }}
        />
      ) : (
        <>
          {open && <ShopEditor key={open.id} shop={open} />}
          <button type="button" className="btn-ghost owner-add" onClick={() => setAdding(true)}><Icon name="plus" size={18} />Add a shop</button>
        </>
      )}
      {demo.length > 0 && !adding && (
        <section className="owner-section owner-demo">
          <h3>Demo shops</h3>
          <p className="owner-help">Made-up shops to try Saath with: claim one to run it.</p>
          {demo.map((shop) => (
            <div key={shop.id} className="owner-row">
              <span>{shop.name}</span>
              <button type="button" className="btn-ghost small" onClick={() => void claim(shop.slug)}>Claim</button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

type Write = () => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/** One shop's billboard, mascot, usual order, status and menu. Each change is saved 400 ms after the last keystroke. */
function ShopEditor({ shop }: { shop: Shop }) {
  const [draft, setDraft] = useState<Shop>(shop);
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [state, setState] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    void db.from('menu_items').select('*').eq('shop_id', shop.id).order('sort').then(({ data, error }) => {
      if (error) setState(`Couldn’t load the menu: ${error.message}`);
      else setMenu(data as MenuItem[]);
    });
  }, [shop.id]);
  useEffect(() => {
    if (!toast) return;
    const hide = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(hide);
  }, [toast]);
  useEffect(() => {
    if (!flash) return;
    const hide = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(hide);
  }, [flash]);

  // Pending saves still run if the editor closes, so the last change isn't lost.
  const save = (key: string, write: Write, saved?: () => void) => {
    window.clearTimeout(timers.current.get(key));
    setState('Saving…');
    timers.current.set(key, window.setTimeout(async () => {
      timers.current.delete(key);
      const { data, error } = await write();
      const ok = !error && !!data?.length;
      setState(error ? `Not saved: ${error.message}` : ok ? '✓ Saved · live' : 'Not saved: this shop isn’t yours');
      if (ok) saved?.();
    }, 400));
  };
  const saveShop = (patch: Partial<Shop>) => {
    setDraft((current) => ({ ...current, ...patch }));
    save(`shop.${Object.keys(patch).join()}`, () => db.from('shops').update(patch).eq('id', shop.id).select('id'));
  };
  const saveItem = (item: MenuItem, patch: Partial<MenuItem>, announce?: string) => {
    setMenu((items) => items?.map((other) => (other.id === item.id ? { ...other, ...patch } : other)) ?? null);
    save(`${item.id}.${Object.keys(patch).join()}`, () => db.from('menu_items').update(patch).eq('id', item.id).select('id'), () => {
      setFlash(item.id);
      if (announce) setToast(announce);
    });
  };

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get('name')).trim();
    const price = Number(form.get('price'));
    const appText = String(form.get('app')).trim();
    if (!name || !(price >= 0)) return;
    const { data, error } = await db
      .from('menu_items')
      .insert({ shop_id: shop.id, name, price, app_price: appText ? Number(appText) : null, sort: (menu?.length ?? 0) + 1 })
      .select()
      .single();
    if (error) {
      setState(`Not saved: ${error.message}`);
      return;
    }
    setMenu((items) => [...(items ?? []), data as MenuItem]);
    formElement.reset();
    setState('✓ Saved · live');
    setToast(`${name} is on your menu · live`);
  };

  const remove = async (item: MenuItem) => {
    if (!window.confirm(`Take ${item.name} off the menu?`)) return;
    const { error } = await db.from('menu_items').delete().eq('id', item.id);
    if (error) setState(`Not saved: ${error.message}`);
    else {
      setMenu((items) => items?.filter((other) => other.id !== item.id) ?? null);
      if (draft.usual_order.some((line) => line.item === item.id)) saveShop({ usual_order: draft.usual_order.filter((line) => line.item !== item.id) });
    }
  };

  const setOrder = (next: Shop['usual_order']) => saveShop({ usual_order: next.filter((line) => line.qty > 0).slice(0, 6) });
  const mascot = hostOf(draft);
  const named = (id: string) => menu?.find((item) => item.id === id)?.name ?? 'an item';
  const notInOrder = (menu ?? []).filter((item) => item.price !== null && !draft.usual_order.some((line) => line.item === item.id));

  return (
    <div className="owner-editor">
      <div className="owner-row">
        <b className="owner-shop-name">{draft.name}</b>
        <a className="btn-ghost small" href={`#/shop/${shop.slug}`} target="_blank" rel="noreferrer">Open my shop page ↗</a>
      </div>
      <p className="owner-state" role="status">{state}</p>

      <section className="owner-section">
        <h3>Right now</h3>
        <div className="seg big" role="group" aria-label="Right now">
          {(['open', 'busy', 'closed'] as Status[]).map((status) => (
            <button key={status} type="button" aria-pressed={draft.status === status} onClick={() => saveShop({ status })}>
              {status === 'open' ? 'Open' : status === 'busy' ? 'Busy' : 'Closed'}
            </button>
          ))}
        </div>
        <label>
          Note
          <input defaultValue={shop.status_note} maxLength={80} placeholder={draft.status === 'closed' ? 'opens at 10 am' : 'about a 10 min wait'}
            onChange={(event) => saveShop({ status_note: event.target.value.trim() })} />
        </label>
      </section>

      <section className="owner-section">
        <h3>Your billboard on the map</h3>
        <Ad shop={draft} height={170} width="100%" off={draft.status === 'closed'} radius={16} />
        <p className="owner-help">Make your ad here: it lights up your billboard beside your shop.</p>
        <label>
          Headline
          <input defaultValue={shop.ad_headline} maxLength={24} placeholder="Chai like home."
            onChange={(event) => saveShop({ ad_headline: event.target.value.trim() })} />
        </label>
        <label>
          Small line
          <input defaultValue={shop.ad_sub} maxLength={40} placeholder={shop.name}
            onChange={(event) => saveShop({ ad_sub: event.target.value.trim() })} />
        </label>
        <span className="owner-label">Picture</span>
        <div className="owner-art" role="group" aria-label="Picture">
          <button type="button" aria-pressed={draft.ad_art === ''} onClick={() => saveShop({ ad_art: '' })} aria-label="No picture: the section's sign">{SECTIONS[draft.section]?.icon ?? '🏪'}</button>
          {ART.map((art) => (
            <button key={art} type="button" aria-pressed={draft.ad_art === art} onClick={() => saveShop({ ad_art: art })} aria-label={art}>
              <img src={`/ads/art/${art}.svg`} alt="" />
            </button>
          ))}
        </div>
        <span className="owner-label">Show it</span>
        <div className="seg" role="group" aria-label="Schedule">
          {([['always', 'Always on'], ['week', 'This week'], ['today', 'Today only']] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={draft.ad_schedule === value} onClick={() => saveShop({ ad_schedule: value })}>{label}</button>
          ))}
        </div>
      </section>

      <section className="owner-section">
        <h3>Your mascot</h3>
        <div className="owner-mascot">
          <img src={figureOf(mascot)} alt="" width={70} height={140} />
          <div>
            <b>{mascot.name}</b>
            <p className="owner-help">Made for your shop by Saath. Talks about your menu in a warm voice; shows as your pin on the map.</p>
          </div>
        </div>
        <div className="owner-grid">
          <label>
            Mascot
            <select defaultValue={shop.friend} onChange={(event) => saveShop({ friend: event.target.value })}>{mascotOptions}</select>
          </label>
          <label>
            Section
            <select defaultValue={shop.section} onChange={(event) => saveShop({ section: event.target.value })}>{sectionOptions}</select>
          </label>
        </div>
      </section>

      <section className="owner-section">
        <h3>Usual order</h3>
        <p className="owner-help">What most people buy: visitors see what it costs here against delivery apps.</p>
        <div className="owner-order">
          {draft.usual_order.map((line) => (
            <span key={line.item}>
              {line.qty} × {named(line.item)}
              <button type="button" aria-label={`One less ${named(line.item)}`} onClick={() => setOrder(draft.usual_order.map((l) => (l.item === line.item ? { ...l, qty: l.qty - 1 } : l)))}><Icon name="minus" size={14} /></button>
              <button type="button" aria-label={`One more ${named(line.item)}`} onClick={() => setOrder(draft.usual_order.map((l) => (l.item === line.item ? { ...l, qty: Math.min(9, l.qty + 1) } : l)))}><Icon name="plus" size={14} /></button>
            </span>
          ))}
          {notInOrder.length > 0 && draft.usual_order.length < 6 && (
            <select value="" aria-label="Add to the usual order" onChange={(event) => event.target.value && setOrder([...draft.usual_order, { item: event.target.value, qty: 1 }])}>
              <option value="">+ Add</option>
              {notInOrder.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          )}
        </div>
        <label>
          Typical delivery-app fees, ₹
          <input type="number" min={0} max={200} defaultValue={shop.app_fee} onChange={(event) => {
            const fee = event.target.valueAsNumber;
            if (fee >= 0 && fee <= 200) saveShop({ app_fee: Math.round(fee) });
          }} />
        </label>
        {menu && <Compare shop={draft} menu={menu} mode="compact" />}
      </section>

      <section className="owner-section">
        <h3>Menu</h3>
        <p className="owner-help">Your walk-in price, and what delivery apps charge for it if you know: visitors see the saving.</p>
        {menu === null ? (
          <p className="note">Loading the menu…</p>
        ) : (
          <ul className="owner-menu">
            {menu.map((item) => (
              <li key={item.id} className={flash === item.id ? 'is-saved' : ''}>
                <input className="owner-item-name" aria-label="Item name" defaultValue={item.name} maxLength={60}
                  onChange={(event) => {
                    const name = event.target.value.trim();
                    if (name) saveItem(item, { name });
                  }} />
                <label className="owner-money">
                  Walk-in ₹
                  <input type="number" min={0} step="any" inputMode="decimal" aria-label={`${item.name}: walk-in price`}
                    defaultValue={item.price ?? ''}
                    onChange={(event) => {
                      const price = event.target.valueAsNumber;
                      if (price >= 0) saveItem(item, { price }, `${item.name} is now ${rupees(price)} · live on your billboard card`);
                    }} />
                </label>
                <label className="owner-money is-app">
                  On apps ₹
                  <input type="number" min={0} step="any" inputMode="decimal" aria-label={`${item.name}: delivery app price`}
                    defaultValue={item.app_price ?? ''}
                    onChange={(event) => {
                      const blank = event.target.value.trim() === '';
                      const appPrice = event.target.valueAsNumber;
                      if (blank || appPrice >= 0) saveItem(item, { app_price: blank ? null : appPrice });
                    }} />
                </label>
                <label className="owner-check">
                  <input type="checkbox" defaultChecked={item.available}
                    onChange={(event) => saveItem(item, { available: event.target.checked }, `${item.name} is ${event.target.checked ? 'back on' : 'sold out'} today · live`)} />
                  On today
                </label>
                <button type="button" className="owner-remove" aria-label={`Remove ${item.name}`} onClick={() => void remove(item)}><Icon name="close" size={16} /></button>
              </li>
            ))}
          </ul>
        )}
        <form className="owner-row owner-new-item" onSubmit={(event) => void add(event)}>
          <input name="name" required maxLength={60} placeholder="New item" aria-label="New item name" />
          <label className="owner-money">₹<input name="price" type="number" required min={0} step="any" inputMode="decimal" aria-label="New item walk-in price" /></label>
          <label className="owner-money is-app">apps ₹<input name="app" type="number" min={0} step="any" inputMode="decimal" aria-label="New item delivery app price" /></label>
          <button className="btn-go small" type="submit">Add</button>
        </form>
      </section>

      <section className="owner-section">
        <h3>Your shop</h3>
        <label>
          Shop name
          <input defaultValue={shop.name} minLength={2} maxLength={60} onChange={(event) => {
            const name = event.target.value.trim();
            if (name.length >= 2) saveShop({ name });
          }} />
        </label>
        <label>
          Today’s special
          <input defaultValue={shop.special} maxLength={140} placeholder="Misal pav with an extra pav, ₹90"
            onChange={(event) => saveShop({ special: event.target.value.trim() })} />
        </label>
        <label>
          Your story
          <textarea defaultValue={shop.story} maxLength={400} rows={3} onChange={(event) => saveShop({ story: event.target.value.trim() })} />
        </label>
        <span className="owner-label">Your pin: tap the map to move it</span>
        <MapBoundary fallback={<p className="note">The map needs WebGL, which is off in this browser.</p>}>
          <PickSpot spot={shop} onPick={(spot) => saveShop({ lat: spot.lat, lng: spot.lng })} />
        </MapBoundary>
      </section>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function NewShop({ onDone }: { onDone: (id: string | null) => void }) {
  const [spot, setSpot] = useState<LatLng | null>(null);
  const [section, setSection] = useState('restaurant');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!spot) {
      setError('Tap the map where your shop is.');
      return;
    }
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name')).trim();
    const base = slugify(name);
    const slug = base.length >= 3 ? base : `shop-${Math.random().toString(36).slice(2, 8)}`;
    setBusy(true);
    const { data, error: insertError } = await db
      .from('shops')
      .insert({ slug, name, section, friend: form.get('friend'), lat: spot.lat, lng: spot.lng })
      .select('id')
      .single();
    setBusy(false);
    if (insertError) {
      setError(insertError.code === '23505'
        ? 'A shop with that name is already on Saath: add your area, like “Chai Corner Kothrud”.'
        : insertError.message);
      return;
    }
    onDone((data as { id: string }).id);
  };

  return (
    <form className="owner-form owner-section" onSubmit={(event) => void create(event)}>
      <h3>Add your shop</h3>
      <label>
        Shop name
        <input name="name" required minLength={2} maxLength={60} />
      </label>
      <div className="owner-grid">
        <label>
          Section
          <select value={section} onChange={(event) => setSection(event.target.value)}>{sectionOptions}</select>
        </label>
        <label>
          Mascot
          {/* Re-mounted per section so it starts on that section's mascot. */}
          <select key={section} name="friend" defaultValue={MASCOTS.find((mascot) => mascot.section === section)?.id ?? 'juno'}>{mascotOptions}</select>
        </label>
      </div>
      <p className="owner-help">Tap the map where your shop is.</p>
      <MapBoundary fallback={<p className="note">The map needs WebGL, which is off in this browser.</p>}>
        <PickSpot spot={null} onPick={setSpot} />
      </MapBoundary>
      <div className="actions">
        <button className="btn-go" type="submit" disabled={busy}>Put it on the map</button>
        <button className="btn-ghost" type="button" onClick={() => onDone(null)}>Cancel</button>
      </div>
      {error && <p className="owner-msg" role="alert">{error}</p>}
    </form>
  );
}

/** A small map: tap to put the pin there. */
function PickSpot({ spot, onPick }: { spot: LatLng | null; onPick: (spot: LatLng) => void }) {
  const box = useRef<HTMLDivElement | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    if (!box.current) return;
    const start = spot ?? PUNE;
    const map = new maplibregl.Map({
      container: box.current,
      style: MAP_STYLE as maplibregl.StyleSpecification,
      center: [start.lng, start.lat],
      zoom: spot ? 15.5 : 12.4,
      attributionControl: { compact: true },
    });
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    const marker = new maplibregl.Marker({ color: '#E5484D' });
    if (spot) marker.setLngLat([spot.lng, spot.lat]).addTo(map);
    map.on('click', (event) => {
      marker.setLngLat(event.lngLat).addTo(map);
      pick.current({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    });
    return () => map.remove();
    // Made once; later taps move the marker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={box} className="owner-map" />;
}
