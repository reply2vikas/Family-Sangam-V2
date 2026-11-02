// One-click "test a bad day" scenarios. Each returns a changed copy of the season; the
// caller compares the cash calendar before and after.

import { cashCalendar } from './cash.ts';
import { addDays, formatDate } from './dates.ts';
import { formatINR } from './money.ts';
import type { CashCalendar, Season } from './types.ts';

export interface Scenario {
  id: string;
  label: string;
  /** Returns a changed copy of the season. */
  apply: (season: Season) => Season;
}

export interface ScenarioResult {
  id: string;
  label: string;
  before: CashCalendar;
  after: CashCalendar;
  lowestChange: number;
  text: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'income-late',
    label: 'Income arrives 10 days late',
    apply: (s) => ({ ...s, incomes: s.incomes.map((i) => ({ ...i, date: addDays(i.date, 10) })) }),
  },
  {
    id: 'prices-up',
    label: 'Vendor prices rise 10%',
    apply: (s) => ({ ...s, priceUpPct: (s.priceUpPct || 0) + 10 }),
  },
  {
    id: 'guests-up',
    label: '20% more guests everywhere',
    apply: (s) => ({
      ...s,
      events: s.events.map((e) => ({ ...e, guests: Math.min(5000, Math.ceil(e.guests * 1.2)) })),
    }),
  },
  {
    id: 'first-earlier',
    label: 'First event moves 2 weeks earlier',
    apply: (s) => {
      const first = [...s.events].sort((a, b) => a.date.localeCompare(b.date))[0];
      if (!first) return s;
      const day = addDays(first.date, -14);
      return {
        ...s,
        events: s.events.map((e) => (e.id === first.id ? { ...e, date: day < s.startDate ? s.startDate : day } : e)),
      };
    },
  },
];

/** Compare a scenario against the current season. */
export function runScenario(season: Season, scenarioId: string): ScenarioResult {
  const sc = SCENARIOS.find((x) => x.id === scenarioId);
  if (!sc) throw new RangeError(`unknown scenario: ${scenarioId}`);
  const before = cashCalendar(season);
  const after = cashCalendar(sc.apply(season));
  const change = after.lowest.balance - before.lowest.balance;
  const text = after.shortfall
    ? `Cash runs out on ${formatDate(after.shortfall.date)}. You would need ${formatINR(after.needed)} more.`
    : `Still fine. The lowest balance would be ${formatINR(after.lowest.balance)} on ${formatDate(after.lowest.date)}.`;
  return { id: sc.id, label: sc.label, before, after, lowestChange: change, text };
}
