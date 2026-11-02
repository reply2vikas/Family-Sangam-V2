// Pure helpers that turn engine results into drawing instructions and sentences, so the
// browser code stays thin and this logic can be tested.

import { formatINR } from './money.ts';
import { formatDate } from './dates.ts';
import type { CashCalendar, DayBalance, Payment } from './types.ts';

export interface ChartMark {
  date: string;
  x: number;
  y: number;
  negative: boolean;
}

export interface ChartGeometry {
  points: string;
  zeroY: number;
  min: number;
  max: number;
  marks: ChartMark[];
}

export interface MonthGroup {
  month: string;
  total: number;
  items: Payment[];
}

/** Points for the cash chart in a width x height box with padding. */
export function chartGeometry(days: DayBalance[], width: number, height: number, pad = 12): ChartGeometry {
  const values = days.map((d) => d.balance);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const span = max - min;
  const x = (i: number): number => pad + (days.length > 1 ? (i * (width - 2 * pad)) / (days.length - 1) : 0);
  const y = (v: number): number => pad + ((max - v) * (height - 2 * pad)) / span;
  return {
    points: days.map((d, i) => `${x(i).toFixed(1)},${y(d.balance).toFixed(1)}`).join(' '),
    zeroY: Number(y(0).toFixed(1)),
    min,
    max,
    marks: days.map((d, i) => ({
      date: d.date,
      x: Number(x(i).toFixed(1)),
      y: Number(y(d.balance).toFixed(1)),
      negative: d.balance < 0,
    })),
  };
}

/** One sentence that tells the person where they stand. */
export function cashHeadline(cal: CashCalendar): string {
  if (cal.shortfall) {
    return `You run short on ${formatDate(cal.shortfall.date)}. The worst day needs ${formatINR(cal.needed)} more.`;
  }
  return `You stay above zero all season. The lowest balance is ${formatINR(cal.lowest.balance)} on ${formatDate(cal.lowest.date)}.`;
}

/** Group payments by month for the printable schedule. */
export function paymentsByMonth(payments: Payment[]): MonthGroup[] {
  const groups = new Map<string, Payment[]>();
  for (const p of payments) {
    const key = p.date.slice(0, 7);
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([month, items]) => ({
    month,
    total: items.reduce((a, p) => a + p.amount, 0),
    items,
  }));
}
