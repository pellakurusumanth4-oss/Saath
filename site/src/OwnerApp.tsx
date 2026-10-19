// Saath for businesses (/owner/): its own page, apart from the visitors' map (the user, 19 Oct ~16:00: "create two
// webpages like owner and visitor"). Sign in (one tap on the shared demo account), register the business in four steps
// over the 3D city, then a dashboard of the owner's own shop. No visitor UI and no prices here.
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import MapBoundary from './MapBoundary';
import MapView, { type Padding } from './MapView';
import OwnerDashboard from './OwnerDashboard';
import OwnerWizard, { forgetDraft, MINE, read, type Stage } from './OwnerWizard';
import { useDesktop } from './hooks';
import { MASCOTS } from './mascots';
import { db, portraitOf, SHOP_COLUMNS, type Shop } from './shops';
import { Icon } from './ui';

/** The shared demo owner: public on purpose (its shops are demo shops), so anyone can try the owner page in one tap. */
const DEMO_EMAIL = 'demo.owner@saath.example';
const DEMO_PASSWORD = 'saath-demo-owner-2026';
const noop = () => {};

export default function OwnerApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  /** The owner's shop: undefined while it loads, null before they register one. */
  const [shop, setShop] = useState<Shop | null | undefined>(undefined);
  const [stage, setStage] = useState<Stage | null>(null);
  const desktop = useDesktop();

  useEffect(() => {
    void db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = db.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  // Their shop: the one this device registered (the demo account is shared, so other people's demo shops aren't
  // theirs), else, on an owner's own account, their newest; none yet: the setup.
  const userId = session?.user.id;
  const demo = session?.user.email === DEMO_EMAIL;
  useEffect(() => {
    setShop(undefined);
    if (!userId) return;
    let live = true;
    void (async () => {
      const id = read(MINE);
      let found = id ? ((await db.from('shops').select(SHOP_COLUMNS).eq('id', id).eq('owner', userId).maybeSingle()).data as Shop | null) : null;
      if (!found && !demo) {
        // Published only: a draft left by the old setup can't go live from here (the dashboard has no publish step).
        const { data } = await db.from('shops').select(SHOP_COLUMNS).eq('owner', userId).eq('published', true).order('created_at', { ascending: false }).limit(1);
        found = (data?.[0] as Shop | undefined) ?? null;
      }
      if (live) setShop(found);
    })();
    return () => { live = false; };
  }, [userId, demo]);

  const signOut = () => {
    forgetDraft();
    void db.auth.signOut({ scope: 'local' });   // the demo account is shared: sign out this device only
  };

  if (session === null) return <OwnerGate />;
  if (session === undefined || shop === undefined) return <main className="owner-gate"><p className="note">Loading…</p></main>;
  if (shop) return <OwnerDashboard key={shop.id} shop={shop} onSignOut={signOut} />;

  // The setup, over the city: the screen edges the map keeps clear of are the sheet (phone) or the panel (computer).
  const padding: Padding = desktop
    ? { top: stage?.spotlight ? 240 : 20, bottom: 20, left: 520, right: 20 }
    : { top: stage?.spotlight ? 150 : 16, bottom: Math.round(window.innerHeight * (stage?.sheet ?? 0.86)), left: 0, right: 0 };
  return (
    <div className="owner-app">
      <MapBoundary fallback={<div className="map-fallback"><p>The 3D city needs WebGL, which is off in this browser.</p></div>}>
        <MapView me={null} shops={stage?.shop ? [stage.shop] : []} selected={stage?.shop?.id ?? null} spotlight={!!stage?.spotlight}
          focus={stage?.focus?.spot ?? null} focusKey={stage?.focus?.key ?? ''} settingSpot={!!stage?.onSpot} onSpotMove={stage?.onSpot ?? noop}
          onPick={noop} padding={padding} />
      </MapBoundary>
      <OwnerWizard onStage={setStage} onDone={(made) => setShop(made)} />
    </div>
  );
}

/** Signing in: the demo account in one tap (the main way in), or an owner's own email and password. No new accounts. */
function OwnerGate() {
  const [busy, setBusy] = useState(false);
  // The email form folds away behind a link, so the demo login (the main way in) shows without scrolling on small phones.
  const [withEmail, setWithEmail] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const signIn = async (email: string, password: string) => {
    setBusy(true);
    setMessage(null);
    const { error } = await db.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void signIn(String(form.get('email')).trim(), String(form.get('password')));
  };
  return (
    <main className="owner-gate">
      <a className="owner-back" href="/">← Saath map</a>
      <section className="owner-gate-card owner-form owner-section owner-signin">
        <div className="signin-sky" aria-hidden="true">
          {MASCOTS.slice(0, 5).map((mascot, i) => <img key={mascot.id} src={portraitOf(mascot)} alt="" style={{ '--i': i } as CSSProperties} />)}
        </div>
        <p className="signin-kicker">FOR BUSINESSES</p>
        <h1 className="signin-title">Put your business on Saath</h1>
        <p className="owner-help">Four short steps: your business and its timings, your mascot, your billboard, and where you are. Then your mascot greets visitors at your door, in its own voice.</p>
        {withEmail ? (
          <>
            <form className="gate-form" onSubmit={submit}>
              <label>
                Email
                <input name="email" type="email" required autoComplete="email" autoFocus />
              </label>
              <label>
                Password
                <input name="password" type="password" required minLength={8} autoComplete="current-password" />
              </label>
              <button className="btn-ghost" type="submit" disabled={busy}>Sign in</button>
            </form>
            <p className="gate-or"><span>or</span></p>
          </>
        ) : (
          <button type="button" className="gate-email" onClick={() => setWithEmail(true)}>Have an owner account? Sign in with email ›</button>
        )}
        <button type="button" className="btn-go demo-login" disabled={busy} onClick={() => void signIn(DEMO_EMAIL, DEMO_PASSWORD)}>
          <Icon name="walk" size={19} />Log in with the demo account
        </button>
        <p className="gate-note">A shared demo account: anyone can try it, and the shops it makes are marked Demo.</p>
        {message && <p className="owner-msg" role="alert" ref={(el) => el?.scrollIntoView({ block: 'nearest' })}>{message}</p>}
      </section>
    </main>
  );
}
