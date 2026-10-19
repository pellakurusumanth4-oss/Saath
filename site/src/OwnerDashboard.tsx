// The owner's dashboard (/owner/): their own shop only. How it is right now, today's counter code, what it does and
// when it's open, its mascot (and a talk with it) and its billboard. Each change is saved 400 ms after the last one and
// reaches visitors live. No prices: the mascot answers visitors from what the owner wrote.
import { useRef, useState, type CSSProperties } from 'react';
import TalkPanel from './TalkPanel';
import { TodayCode, useOwnerDay } from './OwnerToday';
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
  const pending = useRef<Partial<Shop>>({});
  const timer = useRef(0);
  const day = useOwnerDay(shop.id);

  // A failed save is kept for the next try; leaving (sign out) saves what's pending first, so no change is lost.
  const flush = async () => {
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length) return;
    const { data, error } = await db.from('shops').update(patch).eq('id', shop.id).select('id');
    const ok = !error && !!data?.length;
    if (!ok) pending.current = { ...patch, ...pending.current };
    setState(ok ? '✓ Saved · live' : `Not saved: ${error?.message ?? 'this shop isn’t yours'}`);
  };
  const save = (patch: Partial<Shop>) => {
    setShop((current) => ({ ...current, ...patch }));
    for (const [key, value] of Object.entries(patch)) (pending.current as Record<string, unknown>)[key] = typeof value === 'string' ? value.trim() : value;
    setState('Saving…');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 400);
  };
  const leave = async (then: () => void) => {
    window.clearTimeout(timer.current);
    await flush();
    then();
  };

  const mascot = hostOf(shop);
  const section = sectionOf(shop);
  return (
    <main className="owner-dash" style={{ '--c': section.color } as CSSProperties}>
      <header className="dash-head">
        <span className="brand-tile small"><Icon name="walk" size={18} color="#5BE38F" stroke={2.4} /></span>
        <b className="dash-brand">saath <span>for businesses</span></b>
        <button type="button" className="owner-link-btn dash-signout" onClick={() => void leave(onSignOut)}>Sign out</button>
      </header>
      <div className="dash-title">
        <small>{greeting()}</small>
        <h1>{shop.name}</h1>
        <p>{section.icon} {section.label}{shop.area ? ` · ${shop.area}` : ''}{shop.demo && <em className="demo">DEMO</em>}</p>
        <a className="btn-ghost small dash-map" href={`/#/shop/${shop.slug}`} target="_blank" rel="noopener">See it on the map ↗</a>
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

          <TodayCode shop={shop} code={day.code} days={day.days} />

          <section className="owner-section" aria-labelledby="dash-business">
            <h2 id="dash-business">Your business</h2>
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

          <section className="owner-section" aria-labelledby="dash-billboard">
            <h2 id="dash-billboard">Your billboard</h2>
            <BillboardFields shop={shop} onChange={save} />
          </section>
        </div>
      </div>

      {talking && <TalkPanel shop={{ ...shop, menu: [] }} greet="Hi! What is this place?" onClose={() => setTalking(false)} />}
    </main>
  );
}
