import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import maplibregl from 'maplibre-gl';
import type { Session } from '@supabase/supabase-js';
import { MAP_STYLE } from '../../src/mapStyle';
import type { LatLng } from '../../src/geo';
import MapBoundary from './MapBoundary';
import { MASCOTS } from './mascots';
import { db, SECTIONS, SHOP_COLUMNS, type MenuItem, type Shop, type Status } from './shops';

const PUNE: LatLng = { lat: 18.5204, lng: 73.8567 };

const sectionOptions = Object.entries(SECTIONS).map(([id, section]) => (
  <option key={id} value={id}>{section.icon} {section.label}</option>
));
const mascotOptions = MASCOTS.map((mascot) => <option key={mascot.id} value={mascot.id}>{mascot.name}</option>);

/** A slug for the shop's link from its name: lowercase letters, digits and dashes, 3 to 40 of them. */
const slugify = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 40).replace(/-+$/, '');

/** For shop owners (#/owner): sign in, then change the menu, prices, special, status and pin; visitors see it live. */
export default function OwnerPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    void db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = db.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <div className="shop-page" role="dialog" aria-label="For shop owners">
      <div className="shop-sheet owner">
        <div className="owner-row owner-top">
          <a className="shop-back" href="#/">← Map</a>
          {session && <button className="owner-link-btn" onClick={() => void db.auth.signOut()}>Sign out</button>}
        </div>
        <h2 className="shop-name">Your shop on Saath</h2>
        {session === undefined ? (
          <p className="shop-note">Loading…</p>
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
    <form className="owner-form" onSubmit={(event) => void submit(event)}>
      <p>Sign in to change your menu, prices, today’s special and how busy you are. Visitors see each change at once.</p>
      <label>
        Email
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        Password
        <input name="password" type="password" required minLength={8} autoComplete="current-password" />
      </label>
      <div className="owner-row">
        <button className="btn" type="submit" value="signin" disabled={busy}>Sign in</button>
        <button className="btn btn-plain" type="submit" value="create" disabled={busy}>Create account</button>
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

  if (!mine) return <p className="shop-note">Loading your shops…</p>;
  const open = mine.find((shop) => shop.id === openId) ?? mine[0] ?? null;

  return (
    <>
      {error && <p className="owner-msg" role="alert">{error}</p>}
      {mine.length > 1 && (
        <div className="owner-tabs">
          {mine.map((shop) => (
            <button key={shop.id} className={`talk-chip ${shop.id === open?.id ? 'is-on' : ''}`} onClick={() => setOpenId(shop.id)}>
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
          <button className="btn btn-plain owner-add" onClick={() => setAdding(true)}>+ Add a shop</button>
        </>
      )}
      {demo.length > 0 && !adding && (
        <section className="owner-demo">
          <h3>Demo shops</h3>
          <p className="owner-help">Made-up shops to try Saath with: claim one to run it.</p>
          {demo.map((shop) => (
            <div key={shop.id} className="owner-row">
              <span>{shop.name}</span>
              <button className="btn btn-plain" onClick={() => void claim(shop.slug)}>Claim</button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

type Write = () => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/** One shop's settings and menu. Inputs keep what's typed; each change is saved 400 ms after the last keystroke. */
function ShopEditor({ shop }: { shop: Shop }) {
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [state, setState] = useState('');
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    void db.from('menu_items').select('*').eq('shop_id', shop.id).order('sort').then(({ data, error }) => {
      if (error) setState(`Couldn’t load the menu: ${error.message}`);
      else setMenu(data as MenuItem[]);
    });
  }, [shop.id]);

  // Pending saves still run if the editor closes, so the last change isn't lost.
  const save = (key: string, write: Write) => {
    window.clearTimeout(timers.current.get(key));
    setState('Saving…');
    timers.current.set(key, window.setTimeout(async () => {
      timers.current.delete(key);
      const { data, error } = await write();
      setState(error ? `Not saved: ${error.message}` : data?.length ? 'Saved ✓' : 'Not saved: this shop isn’t yours');
    }, 400));
  };
  const saveShop = (patch: Partial<Shop>) =>
    save(`shop.${Object.keys(patch).join()}`, () => db.from('shops').update(patch).eq('id', shop.id).select('id'));
  const saveItem = (id: string, patch: Partial<MenuItem>) =>
    save(`${id}.${Object.keys(patch).join()}`, () => db.from('menu_items').update(patch).eq('id', id).select('id'));

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get('name')).trim();
    const price = Number(form.get('price'));
    if (!name || !(price >= 0)) return;
    const { data, error } = await db
      .from('menu_items')
      .insert({ shop_id: shop.id, name, price, sort: (menu?.length ?? 0) + 1 })
      .select()
      .single();
    if (error) {
      setState(`Not saved: ${error.message}`);
      return;
    }
    setMenu((items) => [...(items ?? []), data as MenuItem]);
    formElement.reset();
    setState('Saved ✓');
  };

  const remove = async (item: MenuItem) => {
    if (!window.confirm(`Take ${item.name} off the menu?`)) return;
    const { error } = await db.from('menu_items').delete().eq('id', item.id);
    if (error) setState(`Not saved: ${error.message}`);
    else setMenu((items) => items?.filter((other) => other.id !== item.id) ?? null);
  };

  return (
    <div className="owner-editor">
      <div className="owner-row">
        <a className="btn btn-plain" href={`#/shop/${shop.slug}`} target="_blank" rel="noreferrer">Open my shop page ↗</a>
        <span className="owner-state" role="status">{state}</span>
      </div>

      <label>
        Shop name
        <input defaultValue={shop.name} minLength={2} maxLength={60} onChange={(event) => {
          const name = event.target.value.trim();
          if (name.length >= 2) saveShop({ name });
        }} />
      </label>
      <div className="owner-grid">
        <label>
          Right now
          <select defaultValue={shop.status} onChange={(event) => saveShop({ status: event.target.value as Status })}>
            <option value="open">Open</option>
            <option value="busy">Busy</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label>
          Note
          <input defaultValue={shop.status_note} maxLength={80} placeholder="About a 10 min wait"
            onChange={(event) => saveShop({ status_note: event.target.value.trim() })} />
        </label>
      </div>
      <label>
        Today’s special
        <input defaultValue={shop.special} maxLength={140} placeholder="Misal pav with an extra pav, ₹90"
          onChange={(event) => saveShop({ special: event.target.value.trim() })} />
      </label>
      <label>
        Your story
        <textarea defaultValue={shop.story} maxLength={400} rows={3}
          onChange={(event) => saveShop({ story: event.target.value.trim() })} />
      </label>
      <div className="owner-grid">
        <label>
          Section
          <select defaultValue={shop.section} onChange={(event) => saveShop({ section: event.target.value })}>{sectionOptions}</select>
        </label>
        <label>
          Mascot
          <select defaultValue={shop.friend} onChange={(event) => saveShop({ friend: event.target.value })}>{mascotOptions}</select>
        </label>
      </div>

      <h3>Menu</h3>
      <p className="owner-help">Your price, and what delivery apps charge for it if you know: visitors see the saving.</p>
      {menu === null ? (
        <p className="shop-note">Loading the menu…</p>
      ) : (
        <ul className="owner-menu">
          {menu.map((item) => (
            <li key={item.id}>
              <input className="owner-item-name" aria-label="Item name" defaultValue={item.name} maxLength={60}
                onChange={(event) => {
                  const name = event.target.value.trim();
                  if (name) saveItem(item.id, { name });
                }} />
              <label className="owner-money">
                ₹
                <input type="number" min={0} step="any" inputMode="decimal" aria-label={`${item.name}: your price`}
                  defaultValue={item.price}
                  onChange={(event) => {
                    const price = event.target.valueAsNumber;
                    if (price >= 0) saveItem(item.id, { price });
                  }} />
              </label>
              <label className="owner-money is-app">
                apps ₹
                <input type="number" min={0} step="any" inputMode="decimal" aria-label={`${item.name}: delivery app price`}
                  defaultValue={item.app_price ?? ''}
                  onChange={(event) => {
                    const blank = event.target.value.trim() === '';
                    const appPrice = event.target.valueAsNumber;
                    if (blank || appPrice >= 0) saveItem(item.id, { app_price: blank ? null : appPrice });
                  }} />
              </label>
              <label className="owner-check">
                <input type="checkbox" defaultChecked={item.available}
                  onChange={(event) => saveItem(item.id, { available: event.target.checked })} />
                On today
              </label>
              <button className="owner-remove" aria-label={`Remove ${item.name}`} onClick={() => void remove(item)}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <form className="owner-row owner-new-item" onSubmit={(event) => void add(event)}>
        <input name="name" required maxLength={60} placeholder="New item" aria-label="New item name" />
        <label className="owner-money">
          ₹
          <input name="price" type="number" required min={0} step="any" inputMode="decimal" aria-label="New item price" />
        </label>
        <button className="btn" type="submit">Add</button>
      </form>

      <h3>Your pin</h3>
      <p className="owner-help">Tap the map to move your shop’s pin.</p>
      <MapBoundary fallback={<p className="shop-note">The map needs WebGL, which is off in this browser.</p>}>
        <PickSpot spot={shop} onPick={(spot) => saveShop({ lat: spot.lat, lng: spot.lng })} />
      </MapBoundary>
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
    <form className="owner-form" onSubmit={(event) => void create(event)}>
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
      <MapBoundary fallback={<p className="shop-note">The map needs WebGL, which is off in this browser.</p>}>
        <PickSpot spot={null} onPick={setSpot} />
      </MapBoundary>
      <div className="owner-row">
        <button className="btn" type="submit" disabled={busy}>Put it on the map</button>
        <button className="btn btn-plain" type="button" onClick={() => onDone(null)}>Cancel</button>
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
