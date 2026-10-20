// The owner's Insights (/owner/#insights), as Footfall's Base44 entry has them: how the mascot and billboard bring people
// to the business, what each real customer cost next to the owner's other ads, and 3 to 5 ideas to bring more, each
// one tap from the billboard or the mascot (through the dashboard's own save). A demo business sees the made-up sample
// and the page says so; the price and "Only during quiet hours" are a demo too, and say so.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Ad from './Ad';
import { DEMO_PRICE, WEEKDAYS, daysLabel, hoursLabel, realInsights, sampleInsights, specialOf, timesLess, type Day, type Insights,
  type Rhythm, type Stats, type Tip } from './insights';
import { shortName } from './ownerParts';
import { MENU_COLUMNS } from './shopQuery';
import { ago, db, DEMO_OWNER, dollars, hostOf, orderOf, sectionOf, type MenuItem, type Shop } from './shops';
import { Icon } from './ui';

const count = new Intl.NumberFormat('en-US');
const percent = (rate: number | null) => (rate === null ? '—' : rate < 0.1 ? `${(rate * 100).toFixed(1)}%` : `${Math.round(rate * 100)}%`);
const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
/** The hours the strip shows: a business's day, 7 am to 10 pm. */
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7);
const shortHour = (h: number) => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
const bar = (n: number, most: number) => `${n ? Math.max(8, Math.round((n / most) * 100)) : 3}%`;

export default function OwnerInsights({ shop, state, onSave }: { shop: Shop; state: string; onSave: (patch: Partial<Shop>) => void }) {
  const [data, setData] = useState<Insights | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(0);   // the live billboard's 'Save $X' frame, for the preview
  const title = useRef<HTMLHeadingElement>(null);
  const mascot = shortName(hostOf(shop));
  const sample = shop.demo || shop.owner === DEMO_OWNER;
  useEffect(() => {
    window.scrollTo(0, 0);
    title.current?.focus();
  }, []);
  // Worked out once on opening, from the shop as it was then: the ideas don't reshuffle as one of them is saved.
  useEffect(() => {
    let live = true;
    void (async () => {
      const menu = ((await db.from('menu_items').select(MENU_COLUMNS).eq('shop_id', shop.id)).data ?? []) as MenuItem[];
      const order = orderOf(shop, menu);
      if (live) setSaving(order?.saving ?? 0);
      if (sample) {
        if (live) setData(sampleInsights({ shop, mascot, order }));
        return;
      }
      const [visits, reviews] = await Promise.all([
        db.rpc('owner_visits', { p_shop: shop.id, p_days: 30 }),
        db.from('reviews').select('rating,body,created_at').eq('shop_id', shop.id).order('created_at', { ascending: false }).limit(100),
      ]);
      if (!live) return;
      if (!Array.isArray(visits.data) || reviews.error) setFailed(true);
      else setData(realInsights({ shop, mascot, order, days: visits.data as Day[], reviews: reviews.data ?? [] }));
    })();
    return () => {
      live = false;
    };
  }, [shop.id]);

  return (
    <main className="owner-dash ins" style={{ '--c': sectionOf(shop).color } as CSSProperties}>
      <header className="dash-head">
        <span className="brand-tile small"><Icon name="walk" size={18} color="#5BE38F" stroke={2.4} /></span>
        <b className="dash-brand">footfall <span>for businesses</span></b>
        <a className="owner-link-btn dash-signout" href="#">← Dashboard</a>
      </header>
      <div className="dash-title">
        <small>Insights</small>
        <h1 ref={title} tabIndex={-1}>{shop.name.trim() || 'Your business'}</h1>
        <p>How Footfall brings people to your business</p>
        {sample && <p className="demo-data"><b>SAMPLE DATA</b> These numbers and ideas are made up for the demo. A real business sees only its own.</p>}
      </div>
      <p className="owner-state" role="status">{state}</p>
      {!data ? (
        <p className="owner-help ins-wait" role="status">{failed ? 'Couldn’t read your numbers. Open Insights again in a moment.' : 'Adding up your last 30 days…'}</p>
      ) : (
        <>
          <ThisWeek data={data} mascot={mascot} />
          <div className="dash-cols">
            <div className="dash-col">
              <Visits stats={data.stats} sample={sample} />
              <Cost visits={data.stats.month} sample={sample} />
              <Billboard data={data} />
              <Ideas shop={shop} data={data} mascot={mascot} saving={saving} onSave={onSave} />
            </div>
            <div className="dash-col">
              <Rhythm stats={data.stats} rhythm={data.rhythm} sample={sample} />
              {data.food && <Saved stats={data.stats} sample={sample} />}
              <AskedBox data={data} mascot={mascot} />
              <Unanswered shop={shop} data={data} mascot={mascot} onSave={onSave} />
              <ReviewsBox reviews={data.reviews} sample={sample} />
            </div>
          </div>
        </>
      )}
    </main>
  );
}

/** A card's heading, what it covers, and a SAMPLE tag on a demo business's numbers. */
function Head({ id, title, note, sample }: { id: string; title: string; note?: string; sample: boolean }) {
  return (
    <div className="ins-head">
      <h2 id={id} tabIndex={-1}>{title}</h2>
      <span>{note}{sample && <>{note && ' '}<em className="demo">SAMPLE</em></>}</span>
    </div>
  );
}

/** This week at a glance: the visits, what visitors asked the mascot most, and the first idea. */
function ThisWeek({ data, mascot }: { data: Insights; mascot: string }) {
  const top = data.asked?.[0];
  const tip = data.tips[0];
  const week = data.stats.week;
  return (
    <section className="owner-section ins-thisweek" aria-labelledby="ins-thisweek">
      <Head id="ins-thisweek" title="This week" note="Last 7 days" sample={data.sample} />
      <div className="ins-sum">
        <div><b>{week}</b><span>verified {week === 1 ? 'visit' : 'visits'}</span></div>
        <div>
          <b>{top ? `“${top.question}”` : 'No questions yet'}</b>
          <span>{top ? `asked ${mascot} most (${top.count}×)` : data.asked ? `what visitors ask ${mascot} shows here` : `Footfall doesn’t keep talks with ${mascot} yet`}</span>
        </div>
        {tip && <div><b>{tip.title}</b><span>Idea: {tip.headline ? `${tip.headline}${tip.sub ? ` · ${tip.sub}` : ''}` : tip.action}</span></div>}
      </div>
    </section>
  );
}

function Visits({ stats, sample }: { stats: Stats; sample: boolean }) {
  const most = Math.max(1, ...stats.days.map((row) => row.visits));
  const days = stats.days;
  return (
    <section className="owner-section" aria-labelledby="ins-visits">
      <Head id="ins-visits" title="Verified visits" note="Counter code typed at the till" sample={sample} />
      <div className="ins-nums">
        <div><b>{stats.today}</b><span>today</span></div>
        <div><b>{stats.week}</b><span>last 7 days</span></div>
        <div><b>{stats.month}</b><span>last 30 days</span></div>
      </div>
      <div className="ins-bars" role="img" aria-label={`Verified visits a day, last 30 days: ${days.map((row) => `${dayLabel(row.day)} ${row.visits}`).join(', ')}`}>
        {days.map((row, i) => <div key={row.day} className={i === days.length - 1 ? 'is-today' : ''}><i style={{ height: bar(row.visits, most) }} /></div>)}
      </div>
      {days.length > 14 && (
        <div className="ins-axis" aria-hidden="true"><span>{dayLabel(days[0].day)}</span><span>{dayLabel(days[14].day)}</span><span>Today</span></div>
      )}
    </section>
  );
}

/** What one real customer cost: Footfall's (demo) price per verified visit against the owner's other ads, on the numbers
 * they type here. Nothing typed is saved or sent. */
function Cost({ visits, sample }: { visits: number; sample: boolean }) {
  const [spent, setSpent] = useState(sample ? '120' : '');
  const [brought, setBrought] = useState(sample ? '15' : '');
  const customers = Math.round(Number(brought));
  const times = timesLess(Number(spent), customers);
  const theirs = Number(spent) > 0 && customers >= 1 ? Number(spent) / customers : null;
  return (
    <section className="owner-section" aria-labelledby="ins-cost">
      <Head id="ins-cost" title="Cost per real customer" note="Demo price" sample={sample} />
      <div className="ins-vs">
        <div className="is-ours">
          <small>Footfall</small>
          <b>{dollars(DEMO_PRICE)}</b>
          <span>per verified visit · {visits} in 30 days = {dollars(visits * DEMO_PRICE)}</span>
        </div>
        <div>
          <small>Your other ads</small>
          <b>{theirs === null ? '—' : dollars(theirs)}</b>
          <span>{theirs === null ? 'per customer · add your numbers below' : `per customer · ${dollars(Number(spent))} for ${customers}`}</span>
        </div>
      </div>
      {times >= 2 && <p className="ins-say" role="status">On your numbers, a customer from Footfall costs <b>{times}× less</b>.</p>}
      <fieldset className="ins-ads">
        <legend>What did your other ads cost last month, and how many customers did they bring?</legend>
        <label>
          <span>Spent ($)</span>
          <input name="ads_spent" inputMode="decimal" value={spent} placeholder="120" onChange={(e) => setSpent(e.target.value.replace(/[^0-9.]/g, '').slice(0, 9))} />
        </label>
        <label>
          <span>Customers</span>
          <input name="ads_customers" inputMode="numeric" value={brought} placeholder="15" onChange={(e) => setBrought(e.target.value.replace(/[^0-9]/g, '').slice(0, 7))} />
        </label>
      </fieldset>
      <p className="owner-help">
        {sample ? 'Sample numbers: put in your own. ' : ''}Demo price: billing isn’t live yet. You would pay only for verified visits, never for views or clicks.
        What you type stays on this page.
      </p>
    </section>
  );
}

const STEPS: ['seen' | 'card' | 'walk' | 'visit', string, string][] = [
  ['seen', 'Saw you on the map', 'opened your card'],
  ['card', 'Opened your card', 'started walking'],
  ['walk', 'Started walking over', 'verified a visit'],
  ['visit', 'Verified a visit', ''],
];

/** The billboard as an ad: seen on the map, card opened (its click-through), and the visits it brought. */
function Billboard({ data }: { data: Insights }) {
  const funnel = data.funnel;
  return (
    <section className="owner-section" aria-labelledby="ins-funnel">
      <Head id="ins-funnel" title="Billboard performance" note="Last 30 days" sample={data.sample} />
      {!funnel ? (
        <p className="owner-help">
          Footfall doesn’t count billboard views and card opens for your business yet, only verified visits ({data.stats.month} in 30 days). Your
          click-through shows here once it does.
        </p>
      ) : (
        <>
          <div className="ins-ctr">
            <div><b>{percent(funnel.rates[0])}</b><span>click-through: saw your billboard, opened your card</span></div>
            <div><b>{percent(funnel.card > 0 ? Math.min(1, funnel.visit / funnel.card) : null)}</b><span>of those who opened it walked in and verified a visit</span></div>
          </div>
          <h3 className="ins-sub">How your mascot and billboard bring people in</h3>
          <ol className="ins-funnel">
            {STEPS.map(([key, label, next], i) => (
              <li key={key}>
                <div className="ins-step"><span>{label}</span><b>{count.format(funnel[key])}</b></div>
                <div className="ins-meter"><i style={{ width: `${Math.max(2, Math.sqrt(funnel[key] / Math.max(1, funnel.seen)) * 100)}%` }} /></div>
                {next && <small className="ins-rate">{percent(funnel.rates[i])} {next}</small>}
              </li>
            ))}
          </ol>
          <p className="owner-help">Read like an ad’s click-through. Counts only: Footfall never records who your visitors are or where they are.</p>
        </>
      )}
    </section>
  );
}

/** The ideas, each with its billboard as it would look; a tap puts it on the real billboard or in the mascot's mouth. */
function Ideas({ shop, data, mascot, saving, onSave }: { shop: Shop; data: Insights; mascot: string; saving: number; onSave: (patch: Partial<Shop>) => void }) {
  const [done, setDone] = useState<Record<number, string>>({});   // the idea's last action, said under its buttons
  const say = (i: number, text: string) => setDone((all) => ({ ...all, [i]: text }));
  const quiet = data.rhythm && data.rhythm.quietHour >= 0 ? hoursLabel(data.rhythm.quietHour) : '';
  // The dashboard has no field for today's special, so an idea's save can be undone here: back to what was there first.
  const [before, setBefore] = useState<Partial<Shop> | null>(null);
  const apply = (patch: Partial<Shop>) => {
    setBefore((first) => first ?? { ad_headline: shop.ad_headline, ad_sub: shop.ad_sub, special: shop.special });
    onSave(patch);
  };
  const board = (tip: Tip) => apply({ ad_headline: tip.headline, ad_sub: tip.sub ?? '', special: specialOf(tip) });
  return (
    <section className="owner-section ins-ideas" aria-labelledby="ins-ideas">
      <Head id="ins-ideas" title="Grow your business" note={data.sample ? 'Sample ideas' : 'From your numbers'} sample={data.sample} />
      <div className="ins-now">
        <small>Your billboard now</small>
        <span className="board-cab board-screen" style={{ '--ad-c': shop.ad_color || sectionOf(shop).color } as CSSProperties}>
          <Ad shop={shop} height={150} width="100%" running saving={saving} />
        </span>
        {(before || shop.special) && (
          <button type="button" className="btn-ghost small" onClick={() => {
            onSave(before ?? { special: '' }); setBefore(null); setDone({});
            document.getElementById('ins-ideas')?.focus();   // this button goes: keep the reader in the section
          }}>
            {before ? 'Undo: put back your billboard and special' : 'Clear today’s special'}
          </button>
        )}
      </div>
      <ul className="ins-tips">
        {data.tips.map((tip, i) => (
          <li key={tip.title}>
            <b>{tip.title}</b>
            <p className="ins-why">{tip.why}</p>
            <p className="ins-do"><Icon name="star" size={15} />{tip.action}</p>
            {tip.headline && (
              <>
                <Ad shop={{ ...shop, ad_headline: tip.headline, ad_sub: tip.sub ?? '' }} height={90} className="ins-preview" />
                <div className="ins-acts">
                  <button type="button" className="btn-ghost small" onClick={() => { board(tip); say(i, `On your billboard, and ${mascot} mentions it as today’s special.`); }}>
                    <Icon name="map" size={16} />Put it on my billboard
                  </button>
                  <button type="button" className="btn-ghost small" onClick={() => { apply({ special: specialOf(tip) }); say(i, `${mascot} mentions it from now on.`); }}>
                    <Icon name="mic" size={16} />Tell {mascot} to mention it
                  </button>
                  <button type="button" className="btn-ghost small" onClick={() => say(i, `Demo: it would run only during quiet hours${quiet ? `, ${quiet}` : ''}. Nothing is scheduled yet.`)}>
                    <Icon name="clock" size={16} />Only during quiet hours
                  </button>
                </div>
              </>
            )}
            <p className="ins-used" role="status">{done[i] ?? ''}</p>
          </li>
        ))}
      </ul>
      <p className="owner-help">
        {data.sample ? 'Ideas from the sample numbers above.' : 'Ideas from your own numbers only: no market statistics, nothing made up.'} “Only during
        quiet hours” is a demo: nothing is scheduled yet.
      </p>
    </section>
  );
}

function Rhythm({ stats, rhythm, sample }: { stats: Stats; rhythm: Rhythm | null; sample: boolean }) {
  const most = Math.max(1, ...stats.weekday);
  const hour = stats.hour;
  const peak = hour ? Math.max(1, ...HOURS.map((h) => hour[h])) : 1;
  return (
    <section className="owner-section" aria-labelledby="ins-rhythm">
      <Head id="ins-rhythm" title="When people come" note="Last 30 days" sample={sample} />
      {!rhythm ? (
        <p className="owner-help">Your busiest days and hours show here after your first verified visits.</p>
      ) : (
        <>
          <p className="ins-say">
            Busiest: <b>{daysLabel(rhythm.busyDays)}</b>{rhythm.busyHour >= 0 && <>, around <b>{hoursLabel(rhythm.busyHour)}</b></>}.
            {rhythm.quietHour >= 0 && <> Quietest: <b>{hoursLabel(rhythm.quietHour)}</b>.</>}
          </p>
          <div className="ins-week" role="img" aria-label={`Verified visits by weekday: ${WEEKDAYS.map((d, i) => `${d} ${stats.weekday[i]}`).join(', ')}`}>
            {WEEKDAYS.map((d, i) => <div key={d}><i style={{ height: bar(stats.weekday[i], most) }} /><span>{d}</span></div>)}
          </div>
          {hour ? (
            <div className="ins-hours" role="img" aria-label={`Verified visits by hour: ${HOURS.map((h) => `${shortHour(h)} ${hour[h]}`).join(', ')}`}>
              {HOURS.map((h) => (
                <div key={h}><i style={{ opacity: hour[h] ? 0.25 + 0.75 * (hour[h] / peak) : 0.08 }} /><span>{h % 3 === 1 ? shortHour(h) : ''}</span></div>
              ))}
            </div>
          ) : (
            <p className="owner-help">Footfall keeps the day of each verified visit, not its time, so your busiest hours don’t show yet.</p>
          )}
        </>
      )}
    </section>
  );
}

function Saved({ stats, sample }: { stats: Stats; sample: boolean }) {
  return (
    <section className="owner-section" aria-labelledby="ins-saved">
      <Head id="ins-saved" title="What walking in saved your customers" sample={sample} />
      {stats.saved === null ? (
        <p className="owner-help">Shows here once your usual order has its walk-in and delivery-app prices.</p>
      ) : (
        <>
          <div className="ins-nums">
            <div><b>{dollars(stats.savedWeek ?? 0)}</b><span>last 7 days</span></div>
            <div><b>{dollars(stats.saved)}</b><span>last 30 days</span></div>
          </div>
          <p className="owner-help">
            Against the same order on delivery apps, with typical fees{sample ? '' : ', worked out on your usual order'}. A reason people choose to walk over.
          </p>
        </>
      )}
    </section>
  );
}

function AskedBox({ data, mascot }: { data: Insights; mascot: string }) {
  return (
    <section className="owner-section" aria-labelledby="ins-asked">
      <Head id="ins-asked" title="What visitors asked this week" note="Last 7 days" sample={data.sample} />
      {!data.asked ? (
        <p className="owner-help">Footfall doesn’t keep what visitors say to {mascot} yet, so their questions don’t show here.</p>
      ) : (
        <ul className="ins-asked">
          {data.asked.map((row) => <li key={row.question}><span>{row.question}</span><b>{row.count}×</b></li>)}
        </ul>
      )}
    </section>
  );
}

/** What the mascot couldn't answer: the owner's answer goes into the shop's story, which the mascot answers from. */
function Unanswered({ shop, data, mascot, onSave }: { shop: Shop; data: Insights; mascot: string; onSave: (patch: Partial<Shop>) => void }) {
  const [waiting, setWaiting] = useState(data.unanswered);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const teach = (question: string) => {
    const answer = (drafts[question] ?? '').trim();
    if (answer.length < 2) return setNote('Type the answer in a line or two first.');
    const story = `${shop.story.trim()}\n${question} ${answer}`.trim();
    if (story.length > 400) return setNote('Your story is full (400 characters). Shorten it on the dashboard first.');
    onSave({ story });
    setWaiting((rows) => (rows ?? []).filter((row) => row !== question));
    document.getElementById('ins-unknown')?.focus();   // its row goes
    setNote(`${mascot} knows that now: it’s in your story on the dashboard, and ${mascot} tells everyone who asks.`);
  };
  return (
    <section className="owner-section" aria-labelledby="ins-unknown">
      <Head id="ins-unknown" title={`Questions ${mascot} couldn’t answer`} note={waiting ? (waiting.length ? `${waiting.length} waiting` : 'Nothing waiting') : ''}
        sample={data.sample} />
      {!waiting ? (
        <p className="owner-help">Footfall doesn’t keep {mascot}’s talks yet. Add what visitors often ask to your story on the dashboard, and {mascot} answers from it.</p>
      ) : waiting.length === 0 ? (
        <p className="owner-help">{mascot} has an answer for everything visitors asked so far.</p>
      ) : (
        <ul className="ins-unknown">
          {waiting.map((question) => (
            <li key={question}>
              <p>{question}</p>
              <div className="ins-teach">
                <input value={drafts[question] ?? ''} maxLength={200} placeholder="Your answer, in a line or two" aria-label={`Answer: ${question}`}
                  onChange={(e) => setDrafts((all) => ({ ...all, [question]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); teach(question); } }} />
                <button type="button" className="btn-dark small" onClick={() => teach(question)}>Teach it</button>
              </div>
              <button type="button" className="owner-link-btn ins-letgo" onClick={() => { setWaiting((rows) => (rows ?? []).filter((row) => row !== question)); document.getElementById('ins-unknown')?.focus(); }}>
                Not needed
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="owner-help" role="status">{note}</p>
    </section>
  );
}

function ReviewsBox({ reviews, sample }: { reviews: Insights['reviews']; sample: boolean }) {
  const [now] = useState(() => Date.now());
  return (
    <section className="owner-section" aria-labelledby="ins-reviews">
      <Head id="ins-reviews" title="What visitors say"
        note={reviews.count ? `★ ${reviews.avg} · ${reviews.count} ${reviews.count === 1 ? 'review' : 'reviews'}` : 'No reviews yet'} sample={sample} />
      {reviews.latest.length > 0 && (
        <ul className="ins-reviews">
          {reviews.latest.map((row, i) => (
            <li key={i}>
              <span className="ins-stars" role="img" aria-label={`${row.rating} of 5`}>{'★'.repeat(row.rating)}<s>{'☆'.repeat(5 - row.rating)}</s></span>
              <p>{row.body}</p>
              {row.at && <small>{ago(row.at, now)}</small>}
            </li>
          ))}
        </ul>
      )}
      <p className="owner-help">Only visitors who typed your counter code can review you.</p>
    </section>
  );
}
