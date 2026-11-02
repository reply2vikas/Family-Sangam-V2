// Fixes for a cash gap and the one-click bad-day scenarios.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../shared/dates.ts';
import { buildPlan } from '../shared/plan.ts';
import { cashCalendar } from '../shared/cash.ts';
import { suggestFixes, applyAdjust } from '../shared/fixes.ts';
import { SCENARIOS, runScenario } from '../shared/whatif.ts';
import { sampleSeason } from '../shared/sample.ts';
import { rng, int, randomSeason, TODAY } from './helpers.ts';
import type { Season } from '../shared/types.ts';

test('fixes: only optional lines are trimmed and every fix helps', () => {
  const s = sampleSeason(TODAY);
  const base = cashCalendar(s);
  const fixes = suggestFixes(s, 10);
  assert.ok(fixes.length >= 2);
  for (const f of fixes) {
    assert.ok(f.resolved || f.gain > 0);
    assert.ok(f.lowestAfter > base.lowest.balance);
    for (const key of f.patch.trimmed || []) {
      const line = buildPlan(s)
        .events.flatMap((e) => e.lines)
        .find((l) => l.key === key);
      assert.ok(line && !line.must && !line.reserve, `${key} is a must-have`);
    }
  }
  assert.equal(new Set(fixes.map((f) => f.id)).size, fixes.length);
});

test('fixes: applying the top fix on random seasons never makes things worse and never cuts must-haves', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const s = randomSeason(seed);
    const before = cashCalendar(s);
    const [fix] = suggestFixes(s);
    if (!before.shortfall) {
      assert.deepEqual(suggestFixes(s), []);
      continue;
    }
    if (!fix) continue;
    const after = cashCalendar(applyAdjust(s, fix.patch));
    assert.ok(after.lowest.balance >= before.lowest.balance, `seed ${seed}`);
    const kept = buildPlan(applyAdjust(s, fix.patch))
      .events.flatMap((e) => e.lines)
      .filter((l) => l.must);
    assert.ok(kept.every((l) => !l.trimmed));
  }
});

test('fixes: applyAdjust merges and does not repeat entries', () => {
  const s = applyAdjust(applyAdjust(sampleSeason(TODAY), { trimmed: ['e1:photo'] }), {
    trimmed: ['e1:photo'],
    reserve: ['e1'],
    shifted: { 'e1:venue:adv': '2026-12-01' },
  });
  assert.deepEqual(s.adjust?.trimmed, ['e1:photo']);
  assert.deepEqual(s.adjust?.reserve, ['e1']);
  assert.equal(s.adjust?.shifted['e1:venue:adv'], '2026-12-01');
});

test('fixes: a shifted payment outside its window is ignored', () => {
  const s = applyAdjust(sampleSeason(TODAY), { shifted: { 'e1:venue:adv': '2030-01-01' } });
  const pay = buildPlan(s).payments.find((p) => p.id === 'e1:venue:adv');
  assert.equal(pay?.date, pay?.original);
});

test('what-if properties (seeded): later income, higher income, later payments', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const s = randomSeason(seed);
    const lowest = (x: Season): number => cashCalendar(x).lowest.balance;
    const base = lowest(s);
    const days = int(rng(seed), 1, 30);
    assert.ok(
      lowest({ ...s, incomes: s.incomes.map((i) => ({ ...i, date: addDays(i.date, days) })) }) <= base,
      `late income, seed ${seed}`,
    );
    assert.ok(lowest({ ...s, startBalance: s.startBalance + 1000 }) >= base, `more cash, seed ${seed}`);
    const pay = buildPlan(s).payments.find((p) => p.date < p.latest);
    if (pay)
      assert.ok(lowest(applyAdjust(s, { shifted: { [pay.id]: pay.latest } })) >= base, `later payment, seed ${seed}`);
  }
});

test('what-if scenarios run, explain themselves and never touch the original', () => {
  const s = sampleSeason(TODAY);
  const copy = JSON.stringify(s);
  for (const sc of SCENARIOS) {
    const r = runScenario(s, sc.id);
    assert.ok(r.text.length > 10);
    assert.ok(r.after.days.length > 0);
  }
  assert.equal(JSON.stringify(s), copy);
  assert.ok(runScenario(s, 'income-late').after.lowest.balance <= runScenario(s, 'income-late').before.lowest.balance);
  assert.throws(() => runScenario(s, 'nope'), RangeError);
});

test('what-if: a comfortable season reads as fine, and "earlier" never goes before the start', () => {
  const rich = { ...sampleSeason(TODAY), startBalance: 9_000_000 };
  assert.match(runScenario(rich, 'prices-up').text, /Still fine/);
  const soon = { ...sampleSeason(TODAY), events: [{ ...sampleSeason(TODAY).events[0], date: addDays(TODAY, 5) }] };
  assert.ok(runScenario(soon, 'first-earlier').after.days.length >= 1);
});

test('payments planned before the season starts are flagged overdue and still count on day one', () => {
  const s = { ...sampleSeason(TODAY), events: [{ ...sampleSeason(TODAY).events[0], date: addDays(TODAY, 20) }] };
  const plan = buildPlan(s);
  const late = plan.payments.filter((p) => p.overdue);
  assert.ok(late.length >= 2);
  assert.ok(late.every((p) => p.original < TODAY));
  assert.ok(buildPlan(sampleSeason(TODAY)).payments.every((p) => p.overdue === p.date < TODAY));
  const first = cashCalendar(s).days[0];
  assert.ok(
    first.balance <=
      s.startBalance -
        late.reduce((a, p) => a + p.amount, 0) +
        s.incomes.filter((i) => i.date === TODAY).reduce((a, i) => a + i.amount, 0),
  );
});
