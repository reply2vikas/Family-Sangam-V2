import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSeason, cleanText, LIMITS } from '../shared/schema.ts';
import { validateChange, applyChange, describeChange, fallbackParseChange } from '../shared/change.ts';
import { cleanIdeas, sampleIdeas } from '../shared/ideas.ts';
import { chartGeometry, cashHeadline, paymentsByMonth } from '../shared/view.ts';
import { cashCalendar } from '../shared/cash.ts';
import { buildPlan } from '../shared/plan.ts';
import { sampleSeason } from '../shared/sample.ts';
import { TODAY, valid } from './helpers.ts';
import type { Season } from '../shared/types.ts';

const season = (): Season => valid(sampleSeason(TODAY));

test('normalizeSeason: the sample season passes and unknown fields are dropped', () => {
  const r = normalizeSeason({
    ...sampleSeason(TODAY),
    hacker: '<b>',
    events: sampleSeason(TODAY).events.map((e) => ({ ...e, extra: 1 })),
  });
  assert.ok(r.ok);
  assert.ok(!('hacker' in r.season) && !('extra' in r.season.events[0]));
});

test('normalizeSeason: reports each kind of problem', () => {
  const bad = normalizeSeason({
    startDate: TODAY,
    startBalance: -5,
    incomes: [
      { label: 'a', date: 'x', amount: 1 },
      { label: 'b', date: TODAY, amount: 0.5 },
    ],
    events: [
      { type: 'party', name: 'a', date: TODAY, guests: 5, budget: 5000 },
      { type: 'wedding', name: 'b', date: 'nope', guests: 5, budget: 5000 },
      { type: 'wedding', name: 'c', date: '2020-01-01', guests: 5, budget: 5000 },
      { type: 'wedding', name: 'd', date: TODAY, guests: 0, budget: 5000 },
      { type: 'wedding', name: 'e', date: TODAY, guests: 5, budget: 5 },
    ],
  });
  assert.ok(!bad.ok);
  assert.ok(bad.errors.length >= 7);
  assert.ok(!normalizeSeason(null).ok);
  assert.ok(!normalizeSeason({ startDate: 'x' }).ok);
  assert.ok(!normalizeSeason({ startDate: TODAY, startBalance: 0, events: [] }).ok);
});

test('normalizeSeason: caps lists, strips markup, clamps early income, keeps valid adjustments only', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    type: 'birthday',
    name: `<img onerror=1>${i}`,
    date: TODAY,
    guests: 10,
    budget: 20000,
  }));
  const r = normalizeSeason({
    startDate: TODAY,
    startBalance: 0,
    name: '<script>x</script>',
    incomes: [{ label: '', date: '2020-01-01', amount: 100 }],
    events: many,
    adjust: {
      shifted: { 'e1:venue:adv': '2026-12-01', 'zz:x': '2026-12-01', 'e1:y': 'bad' },
      trimmed: ['e1:decor', 'q9:x', 4],
      reserve: ['e1', 'e99'],
    },
  });
  assert.ok(r.ok);
  assert.equal(r.season.events.length, LIMITS.events);
  assert.ok(!/[<>]/.test(r.season.name + r.season.events[0].name));
  assert.equal(r.season.incomes[0].date, TODAY);
  assert.deepEqual(r.season.adjust, {
    shifted: { 'e1:venue:adv': '2026-12-01' },
    trimmed: ['e1:decor'],
    reserve: ['e1'],
  });
  assert.equal(valid({ ...sampleSeason(TODAY), adjust: 5 }).adjust, undefined);
  assert.equal(cleanText(null), '');
});

test('normalizeSeason keeps sane hand-entered overrides only', () => {
  const s = sampleSeason(TODAY);
  const overrides: Record<string, unknown> = { venue: 100000, bad: -4, huge: 99999999999, text: 'x' };
  const r = valid({ ...s, events: s.events.map((e, i) => (i === 0 ? { ...e, overrides } : e)) });
  assert.deepEqual(r.events[0].overrides, { venue: 100000 });
});

test('validateChange: accepts good changes and rejects the rest', () => {
  const s = season();
  const ok = validateChange(
    { eventId: 'e1', guestsDelta: 50, budgetPct: -10, dateShiftDays: -14, assumptions: ['<b>x</b>'] },
    s,
  );
  assert.ok(ok.ok);
  assert.ok(!ok.change.assumptions[0].includes('<'));
  assert.ok(!validateChange(null, s).ok);
  assert.ok(!validateChange({}, s).ok);
  assert.ok(!validateChange({ eventId: 'nope', guestsDelta: 1 }, s).ok);
  assert.ok(!validateChange({ guestsDelta: 99999 }, s).ok);
  assert.ok(!validateChange({ budgetPct: 1.5 }, s).ok);
  assert.ok(!validateChange({ budgetPct: -95 }, s).ok);
  assert.ok(validateChange({ guestsDelta: 0, budgetPct: null, dateShiftDays: 3 }, s).ok);
});

test('applyChange: changes only the target event; dates, guests and budget move; progress keys survive', () => {
  const s = season();
  const done: Record<string, boolean> = { 'e2:date': true };
  const next = applyChange(s, { eventId: 'e2', guestsDelta: 50, budgetPct: -20, dateShiftDays: -14 });
  const before = s.events[1];
  const after = next.events[1];
  assert.equal(after.guests, before.guests + 50);
  assert.equal(after.budget, Math.round(before.budget * 0.8));
  assert.equal(after.date, '2026-11-27');
  assert.deepEqual(next.events[0], s.events[0]);
  assert.ok(buildPlan(next).events[1].tasks.some((t) => done[t.key]));
});

test('applyChange: defaults to the earliest event, clamps limits and drops stale overrides', () => {
  const s = season();
  s.events[1].overrides = { venue: 5000 };
  const next = applyChange(s, { guestsDelta: -9999, budgetPct: -90, dateShiftDays: -170 });
  const ev = next.events[1];
  assert.equal(ev.guests, 1);
  assert.ok(ev.budget >= LIMITS.budget[0]);
  assert.equal(ev.date, TODAY);
  assert.ok(!('overrides' in ev));
  assert.equal(applyChange(s, { eventId: 'e1', budgetPct: 200, guestsDelta: 5000 }).events[0].guests, 5000);
});

test('describeChange: explains guests, budget, date, per-guest cost and cash effect', () => {
  const s = season();
  const lines = describeChange(
    s,
    applyChange(s, { eventId: 'e1', guestsDelta: 30, budgetPct: -10, dateShiftDays: -7 }),
  ).join(' | ');
  assert.match(lines, /guests 220 to 250/);
  assert.match(lines, /budget/);
  assert.match(lines, /date/);
  assert.match(lines, /per guest/);
  const rich = { ...s, startBalance: 90_000_000 };
  assert.match(describeChange(rich, rich).join(' '), /stays above zero/);
});

test('describeChange flags new and closed cash gaps', () => {
  const s = season();
  const tight = applyChange(s, { eventId: 'e1', budgetPct: 40 });
  assert.match(describeChange({ ...s, startBalance: s.startBalance + 200000 }, tight).join(' '), /new cash gap/);
  assert.match(describeChange(s, { ...s, startBalance: s.startBalance + 200000 }).join(' '), /closes the cash gap/);
});

test('fallbackParseChange: the SME example and other phrasings', () => {
  assert.deepEqual(fallbackParseChange('50 more guests, smaller budget, event 2 weeks earlier'), {
    eventId: null,
    assumptions: ['No percentage given, so I assumed a 10% smaller budget.'],
    guestsDelta: 50,
    budgetPct: -10,
    dateShiftDays: -14,
  });
  const b = fallbackParseChange('budget 25% less and ten fewer guests and 3 days later');
  assert.equal(b.budgetPct, -25);
  assert.equal(b.guestsDelta, -10);
  assert.equal(b.dateShiftDays, 3);
  assert.equal(fallbackParseChange('15% bigger budget').budgetPct, 15);
  assert.equal(fallbackParseChange('a higher budget').budgetPct, 10);
  assert.deepEqual(fallbackParseChange('hello'), { eventId: null, assumptions: [] });
  assert.deepEqual(fallbackParseChange(undefined), { eventId: null, assumptions: [] });
});

test('ideas: cleaning strips markup, caps length and drops empty items', () => {
  const out = cleanIdeas({
    ideas: [
      { title: '<b>Nice</b>', detail: 'x'.repeat(500), costNote: 5 },
      { title: '', detail: 'no title' },
      null,
      ...Array(10).fill({ title: 't', detail: 'd' }),
    ],
  });
  assert.ok(!out[0].title.includes('<'));
  assert.equal(out[0].detail.length, 240);
  assert.ok(out.length <= 6);
  assert.deepEqual(cleanIdeas(null), []);
  assert.ok(sampleIdeas('birthday').length >= 3);
  assert.deepEqual(sampleIdeas('???'), sampleIdeas('wedding'));
});

test('view: chart geometry, headline and monthly grouping', () => {
  const cal = cashCalendar(season());
  const g = chartGeometry(cal.days, 600, 200);
  assert.equal(g.marks.length, cal.days.length);
  assert.ok(g.zeroY >= 0 && g.zeroY <= 200);
  assert.ok(g.marks.some((m) => m.negative));
  assert.match(cashHeadline(cal), /run short on 30 Jan/);
  assert.match(cashHeadline({ ...cal, shortfall: null }), /stay above zero/);
  const one = chartGeometry([{ date: TODAY, balance: 5 }], 100, 50);
  assert.equal(one.marks.length, 1);
  const months = paymentsByMonth(buildPlan(season()).payments);
  assert.ok(months.length >= 3);
  assert.equal(
    months.reduce((a, m) => a + m.total, 0),
    buildPlan(season()).payments.reduce((a, p) => a + p.amount, 0),
  );
});
