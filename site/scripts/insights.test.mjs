// The owner's Insights maths (site/src/insights.ts): a demo shop's sample is the same every time and fits the billboard,
// a real shop gets only its own numbers, and the cost card says "16× less" on the sample.
// Run: node --test site/scripts/insights.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayOf, hoursLabel, realInsights, sampleInsights, specialOf, timesLess } from '../src/insights.ts';

const NOW = new Date(2026, 9, 20, 16, 30).getTime();   // a Tuesday afternoon on this machine's clock
const cafe = { slug: 'kettle-and-kulhad', section: 'cafe', special: '' };
const shopAt = (shop, order = null) => sampleInsights({ shop, mascot: 'Kiran', order, now: NOW });

test('a demo shop gets the same sample every time, another shop a different one', () => {
  assert.deepEqual(shopAt(cafe), shopAt(cafe));
  assert.notDeepEqual(shopAt(cafe).stats.days, shopAt({ ...cafe, slug: 'green-glass' }).stats.days);
});

test('the sample adds up: 30 days to today, the funnel narrows, 3 to 5 ideas that fit the billboard and the special', () => {
  const data = shopAt(cafe);
  const { stats, funnel } = data;
  assert.equal(data.sample, true);
  assert.equal(stats.days.length, 30);
  assert.equal(stats.days[29].day, dayOf(NOW));
  assert.equal(stats.month, stats.days.reduce((sum, row) => sum + row.visits, 0));
  assert.ok(stats.today <= stats.week && stats.week <= stats.month && stats.month > 0);
  assert.ok(funnel.seen > funnel.card && funnel.card > funnel.walk && funnel.walk > funnel.visit && funnel.visit === stats.month);
  assert.ok(data.tips.length >= 3 && data.tips.length <= 5);
  for (const tip of data.tips.filter((t) => t.headline)) {
    assert.ok(tip.headline.length <= 24 && tip.sub.length <= 40, tip.headline);   // the billboard's own limits
    assert.ok(specialOf(tip).length <= 140);
  }
  assert.ok(data.asked.length && data.unanswered.length && data.reviews.count === 4);
});

test('today counts only the walk-ins already in', () => {
  const early = sampleInsights({ shop: cafe, mascot: 'Kiran', order: null, now: new Date(2026, 9, 20, 6, 0).getTime() });
  assert.equal(early.stats.today, 0);
});

test('what walking in saved shows for food places only', () => {
  assert.ok(shopAt(cafe).stats.saved > 0);
  const boutique = shopAt({ slug: 'thread-and-bloom', section: 'boutique', special: 'Linen sale' });
  assert.equal(boutique.food, false);
  assert.equal(boutique.stats.saved, null);
});

test('the usual order makes a combo idea', () => {
  const data = shopAt(cafe, { names: 'masala chai + bun maska', here: 3.5, apps: 6.9, saving: 3.4 });
  const combo = data.tips.find((tip) => tip.title === 'Make your usual order a combo');
  assert.equal(combo?.headline, 'Combo for $3');
});

test('a real shop: its own visits and reviews, no made-up funnel or questions', () => {
  const days = Array.from({ length: 30 }, (_, i) => ({ day: dayOf(NOW - (29 - i) * 86400000), visits: i % 7 === 3 ? 4 : 1 }));
  const data = realInsights({ shop: cafe, mascot: 'Kiran', order: null, days,
    reviews: [{ rating: 5, body: 'Lovely', created_at: '2026-10-19T10:00:00Z' }, { rating: 4, body: 'Good', created_at: '2026-10-18T10:00:00Z' }] });
  assert.equal(data.sample, false);
  assert.equal(data.stats.month, days.reduce((sum, row) => sum + row.visits, 0));
  assert.equal(data.stats.hour, null);
  assert.equal(data.funnel, null);
  assert.equal(data.asked, null);
  assert.deepEqual([data.reviews.count, data.reviews.avg, data.reviews.latest[0].body], [2, 4.5, 'Lovely']);
  assert.equal(data.rhythm.busyHour, -1);
  assert.ok(data.tips.length >= 3);
});

test('a new real shop with nothing yet still gets three ideas', () => {
  const days = Array.from({ length: 30 }, (_, i) => ({ day: dayOf(NOW - (29 - i) * 86400000), visits: 0 }));
  const data = realInsights({ shop: cafe, mascot: 'Kiran', order: null, days, reviews: [] });
  assert.equal(data.rhythm, null);
  assert.equal(data.tips.length, 3);
});

test('cost per real customer and the hours', () => {
  assert.equal(timesLess(120, 15), 16);
  assert.equal(timesLess(0, 15), 0);
  assert.equal(timesLess(120, 0), 0);
  assert.equal(hoursLabel(19), '7–9 pm');
  assert.equal(hoursLabel(11), '11 am–1 pm');
});

test('a clock change in the last 30 days neither repeats nor skips a day', () => {
  const tz = process.env.TZ;
  process.env.TZ = 'Europe/Berlin';
  try {
    const late = new Date(2026, 9, 26, 23, 30).getTime();   // the night after the clocks went back
    const days = sampleInsights({ shop: cafe, mascot: 'Kiran', order: null, now: late }).stats.days.map((row) => row.day);
    assert.equal(new Set(days).size, 30);
    assert.equal(days[29], '2026-10-26');
  } finally {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  }
});
