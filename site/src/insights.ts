// The owner's Insights (/owner/#insights), as Footfall's Base44 entry works them out: verified visits, when people come,
// the funnel from the map to the door, reviews, what visitors asked, and 3 to 5 ideas from those numbers. Plain
// functions with no imports, so site/scripts/insights.test.mjs reads the same maths. A demo business gets made-up
// numbers (sampleInsights), the same every time for the same shop on the same day; a real one its own (realInsights).

export type Day = { day: string; visits: number };
/** One made-up walk-in: its day, hour and what walking in saved against a delivery app. */
type Walk = { day: string; hour: number; saving: number };
export type Stats = { days: Day[]; today: number; week: number; month: number; weekday: number[]; hour: number[] | null; saved: number | null; savedWeek: number | null };
export type Rhythm = { busyHour: number; busyCount: number; quietHour: number; busyDays: number[]; busyDayCount: number };
export type Funnel = { seen: number; card: number; walk: number; visit: number; rates: (number | null)[] };
export type Review = { rating: number; body: string; at: string };
export type Asked = { question: string; count: number };
export type Tip = { title: string; why: string; action: string; headline?: string; sub?: string; special?: string };
export type Insights = {
  sample: boolean; food: boolean; stats: Stats; rhythm: Rhythm | null;
  /** null: not counted for this business (real businesses: Footfall doesn't log views yet). */
  funnel: Funnel | null;
  reviews: { count: number; avg: number; latest: Review[] };
  /** null: not recorded (talks aren't kept for real businesses). */
  asked: Asked[] | null; unanswered: string[] | null; tips: Tip[];
};
/** The usual order, as orderOf() in shops.ts gives it. */
type Order = { names: string; here: number; apps: number; saving: number };
type ShopFacts = { slug: string; section: string; special: string };

export const FOOD = new Set(['restaurant', 'cafe', 'juice', 'bakery', 'streetfood', 'grocery']);
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LONG_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_MS = 86400000;
/** What Footfall would charge for one verified visit. shortcut: billing isn't live, so this is a demo price the page
 * labels as one; take it from the real plan once billing exists. */
export const DEMO_PRICE = 0.5;

const pad = (n: number) => String(n).padStart(2, '0');
/** The day (YYYY-MM-DD) a moment falls on, on this device's clock. */
export const dayOf = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
/** Monday 0 … Sunday 6, for a YYYY-MM-DD day. */
export const weekdayOf = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
const cents = (amount: number) => Math.round(amount * 100) / 100;
const money = (amount: number) => `$${cents(amount) % 1 ? cents(amount).toFixed(2) : cents(amount)}`;
const cut = (text: string | undefined, max: number) => {
  const value = (text ?? '').trim().replace(/\s+/g, ' ');
  const chars = Array.from(value);   // by code point: half an emoji would make the save fail
  return chars.length <= max ? value : `${chars.slice(0, max - 1).join('').trimEnd()}…`;
};

/** Visits counted from the last 30 days (oldest first, today last). Today is still going, so the weekday and hour
 * patterns count whole days only. walks: each visit's hour and saving, when known. */
export function statsOf(days: Day[], walks: Walk[] | null, food: boolean): Stats {
  const today = days[days.length - 1]?.day ?? '';
  const weekFrom = days[Math.max(0, days.length - 7)]?.day ?? '';
  const sum = (rows: Day[]) => rows.reduce((total, row) => total + row.visits, 0);
  const weekday = Array(7).fill(0);
  for (const row of days) if (row.day !== today) weekday[weekdayOf(row.day)] += row.visits;
  const hour = walks ? Array(24).fill(0) : null;
  if (hour && walks) for (const walk of walks) if (walk.day !== today) hour[walk.hour] += 1;
  const saved = (from: string) => (walks && food ? cents(walks.reduce((total, walk) => total + (walk.day >= from ? walk.saving : 0), 0)) : null);
  return { days, today: days[days.length - 1]?.visits ?? 0, week: sum(days.slice(-7)), month: sum(days), weekday, hour,
    saved: saved(days[0]?.day ?? ''), savedWeek: saved(weekFrom) };
}

const clock = (h: number) => `${h % 12 || 12}`;
const half = (h: number) => (h % 24 < 12 ? 'am' : 'pm');
/** "7–9 pm", "11 am–1 pm": the `span` hours starting at hour h. */
export function hoursLabel(h: number, span = 2) {
  const end = h + span;
  return half(h) === half(end) ? `${clock(h)}–${clock(end)} ${half(end)}` : `${clock(h)} ${half(h)}–${clock(end)} ${half(end)}`;
}
/** "Saturday", "Fri, Sat and Sun": the days a count is highest on. */
export function daysLabel(indexes: number[]) {
  if (indexes.length === 1) return LONG_DAYS[indexes[0]];
  const short = indexes.map((i) => WEEKDAYS[i]);
  return `${short.slice(0, -1).join(', ')} and ${short[short.length - 1]}`;
}

/** The busiest two hours, the quietest two inside the hours visitors do come (else 9 am–9 pm), and the busiest days.
 * Without hours (a real business: only visits a day are kept) the hours are -1. */
export function rhythmOf(stats: Stats): Rhythm | null {
  const most = Math.max(...stats.weekday);
  if (!most) return null;
  const busyDays = stats.weekday.flatMap((count, i) => (count === most ? [i] : []));
  const hour = stats.hour;
  if (!hour || !hour.some(Boolean)) return { busyHour: -1, busyCount: 0, quietHour: -1, busyDays, busyDayCount: most };
  const pair = (h: number) => hour[h % 24] + hour[(h + 1) % 24];
  let busy = 0;
  for (let h = 1; h < 24; h += 1) if (pair(h) > pair(busy)) busy = h;
  const seen = hour.flatMap((count, h) => (count ? [h] : []));
  const [from, to] = seen.length >= 3 ? [seen[0], seen[seen.length - 1]] : [9, 21];
  let quiet = -1;
  for (let h = from; h + 1 <= to; h += 1) if (quiet < 0 || pair(h) < pair(quiet)) quiet = h;
  return { busyHour: busy, busyCount: pair(busy), quietHour: quiet, busyDays, busyDayCount: most };
}

/** Seen on the map → card opened → walk started → verified visit, and each step's rate. */
export function funnelOf(seen: number, card: number, walk: number, visit: number): Funnel {
  const rate = (part: number, whole: number) => (whole > 0 ? Math.min(1, part / whole) : null);
  return { seen, card, walk, visit, rates: [rate(card, seen), rate(walk, card), rate(visit, walk)] };
}

/** Reviews: how many, the average to one decimal, and the latest three. */
export function reviewStats(rows: { rating: number; body: string; created_at: string }[]) {
  const kept = rows.filter((row) => row.rating >= 1 && row.rating <= 5);
  const avg = kept.length ? Math.round((kept.reduce((sum, row) => sum + row.rating, 0) / kept.length) * 10) / 10 : 0;
  const latest = [...kept].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3)
    .map((row) => ({ rating: row.rating, body: cut(row.body, 200), at: row.created_at }));
  return { count: kept.length, avg, latest };
}

/** On the owner's own numbers, how many times less a customer from Footfall costs (0 when there is nothing to compare). */
export function timesLess(spent: number, customers: number) {
  return spent > 0 && customers >= 1 ? Math.round(spent / customers / DEMO_PRICE) : 0;
}

type Facts = { mascot: string; sample?: boolean; food: boolean; special: string; order: Order | null; stats: Stats; rhythm: Rhythm | null;
  funnel: Funnel | null; reviews: { count: number; avg: number }; asked: Asked[] | null };
const tipOf = (tip: Tip): Tip => ({ title: cut(tip.title, 48), why: cut(tip.why, 150), action: cut(tip.action, 180),
  // The billboard's second line is cut to fit (40), today's special keeps the whole of it (140).
  ...(tip.headline ? { headline: cut(tip.headline, 22), sub: cut(tip.sub, 40), special: cut(`${tip.headline}${tip.sub ? ` · ${tip.sub}` : ''}`, 140) } : {}) });

/**
 * 3 to 5 ideas to bring more customers, from the business's own numbers only (the words are fixed, the numbers its own):
 * quiet hours → a happy hour, the usual order → a combo, its rating → what it is known for, what visitors ask → an
 * answer, and where the funnel loses people. Each one with a billboard line has a headline (at most 22 characters, the
 * billboard takes 24) and a line under it (40, as the billboard's).
 */
export function plainTips(f: Facts): Tip[] {
  const tips: Tip[] = [];
  const add = (tip: Tip) => { if (tips.length < 5) tips.push(tipOf(tip)); };
  const r = f.rhythm;
  if (r && r.quietHour >= 0 && f.stats.month >= 5) {
    const when = hoursLabel(r.quietHour);
    add({ title: 'Fill your quiet hours',
      why: `Your fewest walk-ins come ${when}, against ${r.busyCount} at ${hoursLabel(r.busyHour)}, over the last 30 days.`,
      action: `Run a happy hour ${when}: ${f.food ? '10% off for anyone who walks in' : 'a small walk-in offer'}. Put it on your billboard so people browsing the map see it.`,
      headline: `Happy hour ${when}`, sub: f.food ? '10% off when you walk in' : 'A walk-in offer, today' });
  }
  if (f.food && f.order) {
    const combo = Math.max(0.5, Math.floor(f.order.here * 0.9 * 2) / 2);
    add({ title: 'Make your usual order a combo',
      why: `Visitors compare your usual order, ${f.order.names}: ${money(f.order.here)} here against ${money(f.order.apps)} on delivery apps.`,
      action: `Sell it as one combo at ${money(combo)} and name it on your billboard. A clear deal is a reason to walk over now.`,
      headline: `Combo for ${money(combo)}`, sub: f.order.names });
  }
  if (f.reviews.count >= 3 && f.reviews.avg >= 4.5) {
    add({ title: 'Lead with what you’re known for', why: `Verified visitors rate you ${f.reviews.avg} of 5 across ${f.reviews.count} reviews.`,
      action: `Make it your billboard line${f.special ? `, with “${f.special}”` : ''}. Every review on Footfall comes from a verified visit, so it is a rating people trust.`,
      // A sample's rating is made up, so no number on the live billboard.
      headline: f.sample ? 'Loved by walk-ins' : `${f.reviews.avg}★ from walk-ins`, sub: f.special || 'Every review is a verified visit' });
  }
  const top = f.asked?.[0];
  if (top) {
    add({ title: 'Answer what people ask', why: `${top.count} ${top.count === 1 ? 'visitor' : 'visitors'} asked ${f.mascot} this week: “${top.question}”`,
      action: `If ${f.mascot} doesn’t know the answer yet, teach it under “Questions ${f.mascot} couldn’t answer”. If it is a yes, say it on your billboard.` });
  }
  const fu = f.funnel;
  if (fu && fu.card >= 10 && fu.rates[1] !== null && fu.rates[1] < 0.25) {
    add({ title: 'Turn looks into walks', why: `${fu.card.toLocaleString('en-US')} people opened your card in 30 days, and ${fu.walk.toLocaleString('en-US')} started walking over.`,
      action: 'Give them a reason to come now: today’s special, a clear walk-in offer, and your timings on the card.' });
  } else if (fu && fu.walk >= 5 && fu.rates[2] !== null && fu.rates[2] < 0.5) {
    add({ title: 'Turn walks into visits', why: `${fu.walk} people started walking to you in 30 days, and ${fu.visit} verified a visit with your code.`,
      action: 'Keep today’s counter code at the till and mention it when people pay, so every walk-in counts.' });
  }
  if (r && r.busyDays.length < 7 && tips.length < 5) {
    const around = r.busyHour >= 0 ? `, most around ${hoursLabel(r.busyHour)}` : '';
    add({ title: `Plan for ${daysLabel(r.busyDays)}`,
      why: `${daysLabel(r.busyDays)} ${r.busyDays.length === 1 ? 'is your busiest day' : 'are your busiest days'} (${r.busyDayCount} walk-ins${r.busyDays.length > 1 ? ' each' : ''})${around}.`,
      action: 'Put that day’s special on your billboard the evening before, so walkers plan their visit.',
      headline: `${WEEKDAYS[r.busyDays[0]]} special`, sub: f.special || 'Walk in and say hi' });
  }
  // A business with little to go on yet still gets three things to do this week.
  if (tips.length < 3) add({ title: 'Put an offer on your billboard', why: 'Your billboard stands beside your business on the 3D map visitors browse.',
    action: 'Give people a reason to come today: a small walk-in offer, your special, or what you are known for.',
    headline: 'Walk-in offer today', sub: f.special || `Meet ${f.mascot} at the door` });
  if (tips.length < 3) add({ title: 'Print your AR door', why: `${f.mascot} can stand at your door in AR for anyone who scans your QR code.`,
    action: 'Print the QR from your dashboard and put it at your door or counter.' });
  if (tips.length < 3) add({ title: `Teach ${f.mascot} your answers`, why: `${f.mascot} answers visitors from your timings, story and what you do.`,
    action: 'Keep them up to date on your dashboard: what you add, it says.' });
  return tips;
}

/** What a billboard idea makes today's special, which the mascot tells visitors (the database keeps 140 characters). */
export const specialOf = (tip: Tip) => tip.special ?? cut(`${tip.headline ?? ''}${tip.sub ? ` · ${tip.sub}` : ''}`, 140);

const withTips = (base: Omit<Insights, 'rhythm' | 'tips'>, mascot: string, special: string, order: Order | null): Insights => {
  const rhythm = rhythmOf(base.stats);
  return { ...base, rhythm, tips: plainTips({ mascot, sample: base.sample, food: base.food, special: cut(special, 60), order: base.food ? order : null, stats: base.stats, rhythm,
    funnel: base.funnel, reviews: base.reviews, asked: base.asked }) };
};

/** A real business: its visits a day (owner_visits), its reviews and its usual order. Footfall keeps no hours, funnel
 * counts or talks for it yet, so those say so. What walking in saved is worked out on the usual order. */
export function realInsights({ shop, mascot, order, days, reviews }: { shop: ShopFacts; mascot: string; order: Order | null; days: Day[];
  reviews: { rating: number; body: string; created_at: string }[] }): Insights {
  const food = FOOD.has(shop.section);
  const stats = statsOf(days, null, food);
  if (food && order) Object.assign(stats, { saved: cents(stats.month * order.saving), savedWeek: cents(stats.week * order.saving) });
  return withTips({ sample: false, food, stats, funnel: null, reviews: reviewStats(reviews), asked: null, unanswered: null }, mascot, shop.special, order);
}

// The sample's random numbers: FNV-1a for the seed, mulberry32 for the stream.
const seedOf = (text: string) => { let h = 2166136261; for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; };
const rngOf = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
/** When walk-ins come, by hour (7 am to 10 pm): food around meals, other businesses after work. */
const HOUR_WEIGHTS = { food: [1, 3, 3, 1, 1, 2, 5, 5, 3, 1, 1, 2, 3, 5, 4, 2], other: [0, 0, 1, 2, 3, 3, 2, 2, 2, 2, 3, 4, 5, 4, 2, 1] };
/** Walk-ins a day, Monday to Sunday, before the shop's own scale: a busier weekend. */
const WEEK = [2, 3, 3, 3, 4, 4, 4];
const SAMPLE_REVIEWS = {
  food: ['Walked in instead of ordering, paid less, and it was ready in two minutes.', 'The mascot at the door answered everything before I even went in.',
    'Kind people, quick service, and no delivery fee. Will be back on Saturday.', 'Good value and quick. Took me a minute to find today’s code on my phone.'],
  other: ['Found exactly what I needed, and the mascot at the door told me where to look.', 'Friendly, quick and no waiting around.',
    'Kind people and fair prices. Will be back on Saturday.', 'Good value. Took me a minute to find today’s code on my phone.'],
};

/** A demo business's made-up last 30 days, the same for the same shop on the same day: each day's walk-ins come from
 * the shop's slug and the date, so yesterday's bar doesn't move tomorrow. The questions and ideas follow its kind,
 * menu (the usual order) and special. */
export function sampleInsights({ shop, mascot, order, now = Date.now() }: { shop: ShopFacts; mascot: string; order: Order | null; now?: number }): Insights {
  const food = FOOD.has(shop.section);
  const own = rngOf(seedOf(shop.slug));
  const scale = 0.8 + own() * 0.6;
  const weights = HOUR_WEIGHTS[food ? 'food' : 'other'];
  const total = weights.reduce((a, b) => a + b, 0);
  const hourNow = new Date(now).getHours();
  const noon = new Date(now).setHours(12, 0, 0, 0);   // days counted back from noon: a clock change can't repeat or skip one
  const walks: Walk[] = [];
  const days: Day[] = [];
  for (let i = 29; i >= 0; i -= 1) {
    const day = dayOf(noon - i * DAY_MS);
    const rng = rngOf(seedOf(`${shop.slug}:${day}`));
    const ramp = 0.75 + (0.25 * (29 - i)) / 29;   // a little busier each week since joining
    const count = Math.max(0, Math.round(WEEK[weekdayOf(day)] * scale * ramp + rng() * 1.6 - 0.8));
    let visits = 0;
    for (let n = 0; n < count; n += 1) {
      let pick = rng() * total;
      let h = 0;
      while (pick >= weights[h]) pick -= weights[h++];
      const saving = food ? cents(order ? order.saving : 2.5 + rng() * 4.5) : 0;
      if (i === 0 && h + 7 >= hourNow) continue;   // today: only the walk-ins already in
      walks.push({ day, hour: h + 7, saving });
      visits += 1;
    }
    days.push({ day, visits });
  }
  const stats = statsOf(days, walks, food);
  const walk = Math.round(stats.month * (2.1 + own() * 0.4));
  const card = Math.round(walk * (4.6 + own() * 0.8));
  const funnel = funnelOf(Math.round(card * (3.7 + own() * 0.6)), card, walk, stats.month);
  const reviews = reviewStats(SAMPLE_REVIEWS[food ? 'food' : 'other'].map((body, i) => ({
    rating: i === 3 ? 4 : 5, body, created_at: new Date(now - [6, 4, 3, 2][i] * DAY_MS).toISOString() })));
  const asked: Asked[] = ((food
    ? [['Is it cheaper if I walk in?', 5], ['What time do you open?', 4], [shop.special ? 'Is today’s special still on?' : 'What’s good today?', 3],
      ['Do you have anything on offer today?', 2], ['Can I order ahead?', 2]]
    : [['What are your timings?', 5], ['What do you have on offer?', 4], ['Is there parking nearby?', 3], ['Can I pay by card?', 2],
      ['Do you take large orders?', 2]]) as [string, number][])
    .map(([question, count], i) => ({ question, count: count + (i === 0 ? Math.floor(own() * 3) : 0) }));
  const unanswered = food ? ['Do you deliver?', 'Is there a loyalty card for regulars?'] : ['Can I book a time online?', 'Do you gift-wrap?'];
  return withTips({ sample: true, food, stats, funnel, reviews, asked, unanswered }, mascot, shop.special, order);
}
