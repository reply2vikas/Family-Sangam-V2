// Validation for everything that crosses a trust boundary: the setup form, saved state,
// and anything an AI model returns. Unknown fields are dropped, numbers are range-checked.

import { isISODate } from './dates.ts';
import { TYPE_IDS, isEventType } from './templates.ts';
import { asList, asRecord as asLoose } from './guards.ts';
import type { Adjust, CelebrationEvent, Income, Season } from './types.ts';

type Range = readonly [number, number];

export const LIMITS = {
  events: 6,
  incomes: 12,
  guests: [1, 5000] as Range,
  budget: [1000, 100000000] as Range,
  balance: [0, 1000000000] as Range,
  name: 60,
} as const;

const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const inRange = (v: unknown, [lo, hi]: Range): v is number => isInt(v) && v >= lo && v <= hi;

/** Make any value safe, single-line text: no markup characters, no control characters. */
export function cleanText(value: unknown, max: number = LIMITS.name): string {
  return String(value ?? '')
    .replace(/[<>\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanIncomes(list: unknown, errors: string[], startDate: string): Income[] {
  const out: Income[] = [];
  for (const [i, item] of asList(list).slice(0, LIMITS.incomes).entries()) {
    const raw = asLoose(item);
    const label = cleanText(raw.label) || `Income ${i + 1}`;
    const { date, amount } = raw;
    if (!isISODate(date)) {
      errors.push(`${label}: date is not a valid date`);
      continue;
    }
    if (!inRange(amount, [1, LIMITS.balance[1]])) {
      errors.push(`${label}: amount must be a whole number of rupees`);
      continue;
    }
    out.push({ id: `i${out.length + 1}`, label, date: date < startDate ? startDate : date, amount });
  }
  return out;
}

function cleanOverrides(raw: unknown, budget: number): Record<string, number> {
  const overrides: Record<string, number> = {};
  for (const [k, v] of Object.entries(asLoose(raw)))
    if (isInt(v) && v >= 0 && v <= budget) overrides[cleanText(k, 20)] = v;
  return overrides;
}

function cleanEvents(list: unknown, errors: string[], startDate: string): CelebrationEvent[] {
  const out: CelebrationEvent[] = [];
  for (const item of asList(list).slice(0, LIMITS.events)) {
    const raw = asLoose(item);
    const name = cleanText(raw.name) || 'Event';
    const { type, date, guests, budget } = raw;
    if (!isEventType(type)) {
      errors.push(`${name}: type must be one of ${TYPE_IDS.join(', ')}`);
      continue;
    }
    if (!isISODate(date)) {
      errors.push(`${name}: date is not a valid date`);
      continue;
    }
    if (date < startDate) {
      errors.push(`${name}: date is before the season starts`);
      continue;
    }
    if (!inRange(guests, LIMITS.guests)) {
      errors.push(`${name}: guests must be between 1 and 5000`);
      continue;
    }
    if (!inRange(budget, LIMITS.budget)) {
      errors.push(`${name}: budget must be a whole number of rupees (at least 1,000)`);
      continue;
    }
    const event: CelebrationEvent = { id: `e${out.length + 1}`, type, name, date, guests, budget };
    const overrides = cleanOverrides(raw.overrides, budget);
    if (Object.keys(overrides).length) event.overrides = overrides;
    out.push(event);
  }
  return out;
}

function cleanAdjust(input: unknown, events: CelebrationEvent[]): Adjust | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const adjust = asLoose(input);
  const ids = new Set(events.map((e) => e.id));
  const ok = (key: unknown): boolean => ids.has(String(key).split(':')[0] ?? '');
  const shifted: Record<string, string> = {};
  for (const [k, v] of Object.entries(asLoose(adjust.shifted))) if (ok(k) && isISODate(v)) shifted[k] = v;
  return {
    shifted,
    trimmed: asList(adjust.trimmed).filter((k): k is string => typeof k === 'string' && ok(k)),
    reserve: asList(adjust.reserve).filter((id): id is string => typeof id === 'string' && ids.has(id)),
  };
}

export type SeasonCheck = { ok: true; season: Season } | { ok: false; errors: string[] };

/** Validate and clean a season from any source; unknown fields are dropped. */
export function normalizeSeason(input: unknown): SeasonCheck {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return { ok: false, errors: ['Season is missing.'] };
  const raw = asLoose(input);
  const { startDate, startBalance } = raw;
  if (!isISODate(startDate)) return { ok: false, errors: ['Start date is not a valid date.'] };
  if (!inRange(startBalance, LIMITS.balance)) errors.push('Opening balance must be a whole number of rupees.');
  const events = cleanEvents(raw.events, errors, startDate);
  if (events.length === 0) errors.push('Add at least one valid event.');
  const incomes = cleanIncomes(raw.incomes, errors, startDate);
  if (errors.length || !isInt(startBalance)) return { ok: false, errors };
  const season: Season = {
    name: cleanText(raw.name, 80) || 'Our celebration season',
    startDate,
    startBalance,
    incomes,
    events,
  };
  const adjust = cleanAdjust(raw.adjust, events);
  if (adjust) season.adjust = adjust;
  return { ok: true, season };
}
