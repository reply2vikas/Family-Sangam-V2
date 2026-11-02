// The season cash calendar: day-by-day balance from income dates and payment dates.

import { buildPlan } from './plan.ts';
import { addDays, daysBetween } from './dates.ts';
import type { CashCalendar, DayBalance, Plan, Season } from './types.ts';

const MAX_DAYS = 800;

/**
 * Day-by-day balance across the season. `shortfall` is the first day the balance goes below
 * zero; `needed` is how much extra cash the worst day would have required.
 */
export function cashCalendar(season: Season, plan: Plan = buildPlan(season)): CashCalendar {
  const start = season.startDate;
  const delta = new Map<string, number>();
  const add = (date: string, value: number): void => {
    const key = date < start ? start : date;
    delta.set(key, (delta.get(key) || 0) + value);
  };
  add(start, season.startBalance);
  for (const inc of season.incomes) add(inc.date, inc.amount);
  for (const p of plan.payments) add(p.date, -p.amount);

  // The horizon is set by payments only, so moving income around never changes the window.
  const last = plan.payments.reduce((m, p) => (p.date > m ? p.date : m), start);
  const length = Math.min(MAX_DAYS, daysBetween(start, last)) + 1;

  const days: DayBalance[] = [];
  let balance = 0;
  let shortfall: DayBalance | null = null;
  let lowest: DayBalance = { date: start, balance: Number.POSITIVE_INFINITY };
  for (let i = 0; i < length; i += 1) {
    const date = addDays(start, i);
    balance += delta.get(date) ?? 0;
    days.push({ date, balance });
    if (balance < lowest.balance) lowest = { date, balance };
    if (!shortfall && balance < 0) shortfall = { date, balance };
  }
  return { days, lowest, shortfall, needed: Math.max(0, -lowest.balance) };
}
