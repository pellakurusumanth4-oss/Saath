// The owner's dashboard (/owner/): their own shop only. How it is right now, today's counter code, what it does and
// when it's open, its mascot (and a talk with it) and its billboard. Each change is saved 400 ms after the last one and
// reaches visitors live. No prices: the mascot answers visitors from what the owner wrote.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArLink, ArQr, arLinkOf } from './ArQr';
import TalkPanel from './TalkPanel';
import { TodayCode, useOwnerDay } from './OwnerToday';
import { plainError } from './net';
import { BillboardFields, MascotHero, MascotPicker, shortName } from './ownerParts';
import { db, hostOf, sectionOf, type Shop, type Status } from './shops';
import { Icon } from './ui';

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
};

export default function OwnerDashboard({ shop: start, onSignOut }: { shop: Shop; onSignOut: () => void }) {
  const [shop, setShop] = useState(start);
  const [state, setState] = useState('');
  const [talking, setTalking] = useState(false);
  /** Not yet saved, the save in flight included: a field leaves only once the database has its value. */
  const pending = useRef<Partial<Shop>>({});
  const timer = useRef(0);
  /** Saves go one after another, so an older one can't land after a newer one. */
  const chain = useRef(Promise.resolve());
  const gone = useRef(false);
  /** Sign out was tapped with changes still unsaved: ask first. */
  const [leaving, setLeaving] = useState(false);
  const day = useOwnerDay(shop.id);
  useEffect(() => {
    gone.current = false;
    return () => {
      gone.current = true;
      window.clearTimeout(timer.current);
    };
  }, []);

  // A failed save stays pending and is tried again in 5 s; leaving (sign out) saves what's pending first.
  const send = async () => {
    const patch = { ...pending.current } as Record<string, unknown>;
    if (!Object.keys(patch).length) return;
    const { data, error } = await db.from('shops').update(patch).eq('id', shop.id).select('id');
    const ok = !error && !!data?.length;
    const left = pending.current as Record<string, unknown>;
    if (ok) for (const key in patch) if (left[key] === patch[key]) delete left[key];
    if (error && !gone.current) {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 5000);
    }
    setState(ok ? '✓ Saved · live' : error ? `Not saved. ${plainError(error)}` : 'Not saved: this shop isn’t yours');
  };
  const flush = () => (chain.current = chain.current.then(send));
  const save = (patch: Partial<Shop>) => {
    setShop((current) => ({ ...current, ...patch }));
    // The setup requires these, so an emptied one waits until it's long enough again.
    for (const key in patch) delete (pending.current as Record<string, unknown>)[key];   // a too-short value also drops an older one still queued
    if (patch.name !== undefined && patch.name.trim().length < 2) return setState('Not saved yet: add your business name.');
    if (patch.about !== undefined && patch.about.trim().length < 8) return setState('Not saved yet: say what you do in a few words.');
    if (patch.hours !== undefined && patch.hours.trim().length < 3) return setState('Not saved yet: add your timings.');
    for (const [key, value] of Object.entries(patch)) (pending.current as Record<string, unknown>)[key] = typeof value === 'string' ? value.trim() : value;
    setState('Saving…');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 400);
  };
  const leave = async () => {
    window.clearTimeout(timer.current);
    // A hung save holds sign out 3 s at most; anything still unsaved then is the owner's call.
    await Promise.race([flush(), new Promise((done) => window.setTimeout(done, 3000))]);
    if (Object.keys(pending.current).length) setLeaving(true);
    else onSignOut();
  };

  const mascot = hostOf(shop);
  const section = sectionOf(shop);
  return (
    <main className="owner-dash" style={{ '--c': section.color } as CSSProperties}>
      <header className="dash-head">
        <span className="brand-tile small"><Icon name="walk" size={18} color="#5BE38F" stroke={2.4} /></span>
        <b className="dash-brand">saath <span>for businesses</span></b>
        <button type="button" className="owner-link-btn dash-signout" onClick={() => void leave()}>Sign out</button>
      </header>
      {leaving && (
        <div className="owner-msg dash-leave" role="alert">
          <span>Not saved yet. Sign out anyway?</span>
          <button type="button" className="btn-ghost small" autoFocus onClick={() => setLeaving(false)}>Stay</button>
          <button type="button" className="btn-dark small" onClick={onSignOut}>Sign out</button>
        </div>
      )}
      <div className="dash-title">
        <small>{greeting()}</small>
        <h1>{shop.name.trim() || 'Your business'}</h1>
        <p>{section.icon} {section.label}{shop.area.trim() ? ` · ${shop.area.trim()}` : ''}{shop.demo && <em className="demo">DEMO</em>}</p>
        <a className="btn-ghost small dash-map" href={`/visit/#/shop/${shop.slug}`} target="_blank" rel="noopener">See it on the map ↗</a>
      </div>
      <div className="owner-live"><i className="live-dot" />Live: visitors see every change within a second</div>
      <p className="owner-state" role="status">{state}</p>

      <div className="dash-cols">
        <div className="dash-col">
          <section className="owner-section" aria-labelledby="dash-now">
            <h2 id="dash-now">Right now</h2>
            <div className="seg big" role="group" aria-label="Right now">
              {(['open', 'busy', 'closed'] as Status[]).map((status) => (
                <button key={status} type="button" aria-pressed={shop.status === status} onClick={() => save({ status })}>
                  {status === 'open' ? 'Open' : status === 'busy' ? 'Busy' : 'Closed'}
                </button>
              ))}
            </div>
            <label className="wiz-field">
              <span>Note</span>
              <input name="status_note" value={shop.status_note} maxLength={80} placeholder={shop.status === 'closed' ? 'opens at 10 am' : 'about a 10 min wait'}
                onChange={(e) => save({ status_note: e.target.value })} />
            </label>
          </section>

          <TodayCode shop={shop} code={day.code} days={day.days} failed={day.failed} />

          <section className="owner-section" aria-labelledby="dash-business">
            <h2 id="dash-business">Your business</h2>
            {/* Only the name changes: the shop's link (slug) stays, so shared links keep working. */}
            <label className="wiz-field">
              <span>Business name</span>
              <input name="name" value={shop.name} maxLength={60} placeholder="Chai Corner" autoComplete="organization" onChange={(e) => save({ name: e.target.value })} />
            </label>
            <label className="wiz-field">
              <span>Road or landmark <em>optional</em></span>
              <input name="area" value={shop.area} maxLength={120} placeholder="FC Road, Shivajinagar" onChange={(e) => save({ area: e.target.value })} />
            </label>
            <label className="wiz-field">
              <span>What you do <em>{shop.about.length}/160</em></span>
              <textarea name="about" value={shop.about} maxLength={160} rows={2} onChange={(e) => save({ about: e.target.value })} />
            </label>
            <label className="wiz-field">
              <span>Your timings</span>
              <input name="hours" value={shop.hours} maxLength={120} placeholder="Mon–Sat, 8 am – 9 pm" onChange={(e) => save({ hours: e.target.value })} />
            </label>
            <label className="wiz-field">
              <span>Your story <em>optional · {shop.story.length}/400</em></span>
              <textarea name="story" value={shop.story} maxLength={400} rows={3} onChange={(e) => save({ story: e.target.value })} />
            </label>
          </section>
        </div>

        <div className="dash-col">
          <section className="owner-section" aria-labelledby="dash-mascot">
            <h2 id="dash-mascot">Your mascot</h2>
            <MascotHero mascot={mascot}>
              <button type="button" className="btn-dark small dash-talk" onClick={() => setTalking(true)}><Icon name="mic" size={17} />Talk to {shortName(mascot)}</button>
            </MascotHero>
            <MascotPicker section={shop.section} value={mascot.id} onPick={(friend) => save({ friend })} />
          </section>

          {/* The brand at the door: a printed QR takes customers straight to the mascot in AR. */}
          <section className="owner-section" aria-labelledby="dash-ar">
            <h2 id="dash-ar">Your mascot in AR</h2>
            <p className="j-text dash-ar-text">Print this at your door, so customers can scan it and meet {shortName(mascot)} in AR.</p>
            <ArQr link={arLinkOf(shop)} />
            <ArLink link={arLinkOf(shop)} />
          </section>

          <section className="owner-section" aria-labelledby="dash-billboard">
            <h2 id="dash-billboard">Your billboard</h2>
            <BillboardFields shop={shop} onChange={save} />
          </section>
        </div>
      </div>

      {talking && <TalkPanel shop={{ ...shop, menu: [] }} greet="Hi! What is this place?" shopLink={false} onClose={() => setTalking(false)} />}
    </main>
  );
}
