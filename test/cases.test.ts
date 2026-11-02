// Table-driven cases: many inputs, one rule each.
import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate, formatINR } from '../shared/money.ts';
import { addDays, daysBetween, isISODate } from '../shared/dates.ts';
import { fallbackParseChange, validateChange, applyChange } from '../shared/change.ts';
import { buildPlan } from '../shared/plan.ts';
import { cashCalendar } from '../shared/cash.ts';
import { suggestFixes } from '../shared/fixes.ts';
import { normalizeSeason } from '../shared/schema.ts';
import { TYPE_IDS, EVENT_TYPES } from '../shared/templates.ts';
import { sampleSeason } from '../shared/sample.ts';
import { TODAY, valid } from './helpers.ts';
import type { Change } from '../shared/change.ts';

const money: [number, string][] = [
  [0, '₹0'],
  [999, '₹999'],
  [1000, '₹1,000'],
  [99999, '₹99,999'],
  [100000, '₹1,00,000'],
  [1234567, '₹12,34,567'],
  [10000000, '₹1,00,00,000'],
  [-1, '-₹1'],
  [-250000, '-₹2,50,000'],
  [12.6, '₹13'],
];
for (const [n, out] of money) test(`formatINR(${n}) = ${out}`, () => assert.equal(formatINR(n), out));

const dateCases: [string, number, string][] = [
  ['2026-01-31', 1, '2026-02-01'],
  ['2026-02-28', 1, '2026-03-01'],
  ['2028-02-28', 1, '2028-02-29'],
  ['2028-02-29', 1, '2028-03-01'],
  ['2026-12-31', 1, '2027-01-01'],
  ['2027-01-01', -1, '2026-12-31'],
  ['2026-03-01', -1, '2026-02-28'],
  ['2026-10-25', 7, '2026-11-01'],
  ['2026-11-01', 365, '2027-11-01'],
  ['2026-06-15', 0, '2026-06-15'],
];
for (const [d, n, out] of dateCases)
  test(`addDays(${d}, ${n}) = ${out}`, () => {
    assert.equal(addDays(d, n), out);
    assert.equal(daysBetween(d, out), n);
  });

const badDates = [
  '',
  '2026-00-10',
  '2026-04-31',
  '2026-02-29',
  '26-01-01',
  '2026/01/01',
  '2026-1-01',
  'tomorrow',
  null,
  undefined,
  20260101,
];
for (const d of badDates) test(`isISODate rejects ${JSON.stringify(d)}`, () => assert.equal(isISODate(d), false));

const phrases: [string, Partial<Change>][] = [
  ['20 more guests', { guestsDelta: 20 }],
  ['10 fewer guests', { guestsDelta: -10 }],
  ['five more people', { guestsDelta: 5 }],
  ['ten extra guests', { guestsDelta: 10 }],
  ['30 less guests', { guestsDelta: -30 }],
  ['budget 15% less', { budgetPct: -15 }],
  ['25% smaller budget', { budgetPct: -25 }],
  ['budget 20% more', { budgetPct: 20 }],
  ['10% higher budget', { budgetPct: 10 }],
  ['a bigger budget', { budgetPct: 10 }],
  ['lower budget', { budgetPct: -10 }],
  ['1 week earlier', { dateShiftDays: -7 }],
  ['2 weeks later', { dateShiftDays: 14 }],
  ['3 days sooner', { dateShiftDays: -3 }],
  ['four days later', { dateShiftDays: 4 }],
  ['move it 10 days after', { dateShiftDays: 10 }],
  ['50 more guests and a 10% smaller budget and 1 week later', { guestsDelta: 50, budgetPct: -10, dateShiftDays: 7 }],
];
for (const [text, expect] of phrases) {
  test(`fallbackParseChange("${text}")`, () => {
    const r = fallbackParseChange(text);
    for (const [k, v] of Object.entries(expect)) assert.equal(r[k as keyof Change], v, k);
  });
}
for (const text of ['', 'hello', 'make it nicer', 'guests', '??'])
  test(`fallbackParseChange finds nothing in "${text}"`, () =>
    assert.ok(!validateChange(fallbackParseChange(text), valid(sampleSeason(TODAY))).ok));

const guestCounts = [1, 2, 10, 50, 120, 400, 1500, 5000];
for (const type of TYPE_IDS) {
  for (const guests of guestCounts) {
    test(`${type} with ${guests} guests: lines add up, payments add up, calendar runs`, () => {
      const s = {
        name: 'x',
        startDate: TODAY,
        startBalance: 500000,
        incomes: [],
        events: [{ id: 'e1', type, name: 'T', date: addDays(TODAY, 60), guests, budget: 400000 }],
      };
      const plan = buildPlan(s);
      const ev = plan.events[0];
      assert.equal(
        ev.lines.reduce((a, l) => a + l.amount, 0),
        400000,
      );
      assert.equal(
        ev.payments.reduce((a, p) => a + p.amount, 0),
        400000,
      );
      assert.ok(ev.lines.every((l) => l.amount >= 0));
      assert.ok(cashCalendar(s, plan).days.length > 1);
    });
  }
  test(`${type}: every template line has valid payment terms and every task depends only on earlier tasks`, () => {
    const tpl = EVENT_TYPES[type];
    assert.ok(tpl.lines.filter((l) => l.reserve).length === 1);
    for (const l of tpl.lines) {
      assert.ok(Number.isInteger(l.weight) && l.weight > 0);
      if (l.adv) assert.ok(l.adv.pct > 0 && l.adv.pct < 100 && l.adv.daysBefore > l.bal.daysBefore, l.id);
    }
    const seen = new Set();
    for (const t of tpl.tasks) {
      for (const a of t.after) assert.ok(seen.has(a), `${t.id} after ${a}`);
      seen.add(t.id);
    }
  });
}

for (const [guests, pct, days] of [
  [10, -10, 7],
  [-5, 20, -7],
  [100, -50, 30],
  [0, 0, -30],
  [-1000, -90, 0],
]) {
  test(`applyChange guests ${guests}, budget ${pct}%, date ${days}: result is still a valid season`, () => {
    const s = valid(sampleSeason(TODAY));
    const v = validateChange({ eventId: 'e1', guestsDelta: guests, budgetPct: pct, dateShiftDays: days }, s);
    if (!v.ok) return assert.match(v.errors[0], /No guest|must be/);
    const next = applyChange(s, v.change);
    assert.ok(normalizeSeason(next).ok);
    assert.equal(
      buildPlan(next).events[0].lines.reduce((a, l) => a + l.amount, 0),
      next.events[0].budget,
    );
  });
}

for (let seed = 1; seed <= 12; seed += 1) {
  test(`the sample season shifted by ${seed * 9} days keeps the same cash shape`, () => {
    const a = cashCalendar(sampleSeason(TODAY));
    const b = cashCalendar(sampleSeason(addDays(TODAY, seed * 9)));
    assert.equal(a.lowest.balance, b.lowest.balance);
    assert.equal(a.days.length, b.days.length);
    assert.equal(Boolean(a.shortfall), Boolean(b.shortfall));
    assert.deepEqual(
      suggestFixes(sampleSeason(TODAY)).map((f) => f.type),
      suggestFixes(sampleSeason(addDays(TODAY, seed * 9))).map((f) => f.type),
    );
  });
}

const splits: [number, number[]][] = [
  [100, [1, 1]],
  [101, [1, 1]],
  [7, [3, 3, 1]],
  [1, [5, 5, 5]],
  [0, [2, 3]],
  [999999, [13, 7, 5, 3, 2]],
  [10, [0, 5]],
  [3, [1, 1, 1, 1, 1]],
];
for (const [total, weights] of splits)
  test(`allocate(${total}, [${weights}]) sums to the total`, () =>
    assert.equal(
      allocate(total, weights).reduce((a, b) => a + b, 0),
      total,
    ));
