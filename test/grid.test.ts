// A parameter grid and seeded random seasons: many small, independent checks of the same rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate } from '../shared/money.ts';
import { addDays, daysBetween, formatDate } from '../shared/dates.ts';
import { buildPlan } from '../shared/plan.ts';
import { cashCalendar } from '../shared/cash.ts';
import { suggestFixes, applyAdjust } from '../shared/fixes.ts';
import { runScenario, SCENARIOS } from '../shared/whatif.ts';
import { normalizeSeason } from '../shared/schema.ts';
import { TYPE_IDS } from '../shared/templates.ts';
import { randomSeason, TODAY } from './helpers.ts';

const budgets = [20000, 100000, 500000, 2500000, 10000000];
const guestSets = [5, 25, 100, 250, 800, 3000];
for (const type of TYPE_IDS)
  for (const guests of guestSets)
    for (const budget of budgets) {
      test(`grid ${type} / ${guests} guests / ₹${budget}: split exact, payments exact, per-guest sane, must-haves paid`, () => {
        const s = {
          name: 'g',
          startDate: TODAY,
          startBalance: budget,
          incomes: [],
          events: [{ id: 'e1', type, name: 'T', date: addDays(TODAY, 90), guests, budget }],
        };
        const ev = buildPlan(s).events[0];
        assert.equal(
          ev.lines.reduce((a, l) => a + l.amount, 0),
          budget,
        );
        assert.equal(
          ev.payments.reduce((a, p) => a + p.amount, 0),
          budget,
        );
        assert.equal(ev.perGuest, Math.round(budget / guests));
        assert.ok(
          ev.lines.filter((l) => l.must).every((l) => ev.payments.some((p) => p.lineKey === l.key) || l.amount === 0),
        );
        assert.ok(ev.payments.every((p) => p.date >= addDays(TODAY, 0) || p.overdue));
      });
    }

for (let seed = 1; seed <= 150; seed += 1) {
  test(`random season ${seed}: valid input, exact budgets, calendar consistent, fixes never hurt`, () => {
    const s = randomSeason(seed);
    assert.ok(normalizeSeason(s).ok);
    const plan = buildPlan(s);
    for (const ev of plan.events)
      assert.equal(
        ev.lines.reduce((a, l) => a + l.amount, 0),
        ev.budget,
      );
    const cal = cashCalendar(s, plan);
    assert.equal(cal.days[0].date, TODAY);
    assert.equal(cal.lowest.balance, Math.min(...cal.days.map((d) => d.balance)));
    assert.equal(Boolean(cal.shortfall), cal.lowest.balance < 0);
    assert.equal(cal.needed, Math.max(0, -cal.lowest.balance));
    if (cal.shortfall) {
      const first = cal.shortfall?.date ?? '';
      assert.ok(cal.days.filter((d) => d.date < first).every((d) => d.balance >= 0));
      for (const f of suggestFixes(s, 5))
        assert.ok(cashCalendar(applyAdjust(s, f.patch)).lowest.balance >= cal.lowest.balance);
    } else assert.deepEqual(suggestFixes(s), []);
    for (const sc of SCENARIOS) assert.ok(runScenario(s, sc.id).after.days.length > 0);
  });
}

const startDates = [
  '2026-01-31',
  '2026-02-28',
  '2027-02-28',
  '2028-02-28',
  '2028-02-29',
  '2026-12-31',
  '2026-03-31',
  '2026-10-31',
  '2026-05-01',
  '2026-06-30',
];
const offsets = [1, 7, 30, 31, 90, 365];
for (const d of startDates)
  for (const n of offsets) {
    test(`calendar: ${d} plus ${n} days and back`, () => {
      const out = addDays(d, n);
      assert.equal(daysBetween(d, out), n);
      assert.equal(addDays(out, -n), d);
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(out));
      assert.match(formatDate(out), /^\d{1,2} [A-Z][a-z]{2}$/);
    });
  }

const totals = [0, 1, 7, 99, 100, 1001, 99999, 1000003, 25000000];
const weightSets = [[1], [1, 1], [3, 2, 1], [10, 0, 5], [7, 7, 7, 7], [1, 100]];
for (const total of totals)
  for (const w of weightSets) {
    test(`allocate ${total} by [${w}]: exact sum, within one rupee, zero weight gets zero`, () => {
      const parts = allocate(total, w);
      const sum = w.reduce((a, b) => a + b, 0);
      assert.equal(
        parts.reduce((a, b) => a + b, 0),
        total,
      );
      parts.forEach((p, i) => {
        assert.ok(Math.abs(p - (total * w[i]) / sum) < 1);
        if (w[i] === 0) assert.equal(p, 0);
      });
    });
  }
