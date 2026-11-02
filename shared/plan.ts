// Turns a season (events, budgets, guests) into line items, payments and tasks.
// Pure and deterministic: the same season always gives the same plan.

import { EVENT_TYPES, REFUND_WINDOW_DAYS } from './templates.ts';
import { allocate } from './money.ts';
import { addDays, minDate } from './dates.ts';
import type { BudgetLine, CelebrationEvent, Payment, Plan, PlannedEvent, Season, Task, TaskStatus } from './types.ts';

const lineKey = (eventId: string, lineId: string): string => `${eventId}:${lineId}`;

/** Budget after any "prices go up" what-if, in whole rupees. */
export function effectiveBudget(event: CelebrationEvent, season: Season): number {
  return Math.round((event.budget * (100 + (season.priceUpPct || 0))) / 100);
}

function buildLines(event: CelebrationEvent, season: Season): BudgetLine[] {
  const tpl = EVENT_TYPES[event.type];
  const overrides = event.overrides ?? {};
  const trimmed = new Set(season.adjust?.trimmed ?? []);
  const budget = effectiveBudget(event, season);

  const fixed = new Map<string, number>();
  for (const l of tpl.lines) {
    const v = overrides[l.id];
    if (v !== undefined && Number.isSafeInteger(v) && v >= 0) fixed.set(l.id, v);
  }
  const fixedTotal = [...fixed.values()].reduce((a, b) => a + b, 0);
  const free = tpl.lines.filter((l) => !fixed.has(l.id));
  const remaining = Math.max(0, budget - fixedTotal);
  const weights = free.map((l) =>
    l.perGuest ? Math.max(1, Math.round((l.weight * event.guests) / tpl.refGuests)) : l.weight,
  );
  const shares = free.length ? allocate(remaining, weights) : [];
  const shareOf = new Map(free.map((l, i) => [l.id, shares[i]]));

  return tpl.lines.map((l) => {
    const own = fixed.get(l.id);
    return {
      key: lineKey(event.id, l.id),
      id: l.id,
      label: l.label,
      must: Boolean(l.must),
      vendor: l.vendor ?? null,
      reserve: Boolean(l.reserve),
      perGuest: Boolean(l.perGuest),
      amount: own ?? shareOf.get(l.id) ?? 0,
      source: own === undefined ? 'estimate' : 'you',
      trimmed: trimmed.has(lineKey(event.id, l.id)),
    };
  });
}

function buildPayments(event: CelebrationEvent, lines: BudgetLine[], season: Season): Payment[] {
  const tpl = EVENT_TYPES[event.type];
  const reserveUsed = (season.adjust?.reserve ?? []).includes(event.id);
  const shifted = season.adjust?.shifted ?? {};
  const out: Payment[] = [];

  for (const line of lines) {
    const spec = tpl.lines.find((l) => l.id === line.id);
    if (!spec || line.trimmed || line.amount <= 0) continue;
    if (line.reserve && reserveUsed) continue;
    const balDate = addDays(event.date, -spec.bal.daysBefore);
    let balAmount = line.amount;

    if (spec.adv) {
      const advAmount = Math.round((line.amount * spec.adv.pct) / 100);
      const date = addDays(event.date, -spec.adv.daysBefore);
      const latest = minDate(addDays(date, spec.adv.flex), addDays(balDate, -1));
      const id = `${line.key}:adv`;
      const moved = shifted[id];
      const when = moved && moved >= date && moved <= latest ? moved : date;
      out.push({
        id,
        eventId: event.id,
        lineKey: line.key,
        label: `${line.label}: advance`,
        kind: 'advance',
        amount: advAmount,
        date: when,
        original: date,
        earliest: date,
        latest,
        refundableUntil: addDays(date, REFUND_WINDOW_DAYS),
        overdue: when < season.startDate,
      });
      balAmount -= advAmount;
    }
    if (balAmount > 0) {
      out.push({
        id: `${line.key}:bal`,
        eventId: event.id,
        lineKey: line.key,
        label: `${line.label}: balance`,
        kind: 'balance',
        amount: balAmount,
        date: balDate,
        original: balDate,
        earliest: balDate,
        latest: balDate,
        refundableUntil: null,
        overdue: balDate < season.startDate,
      });
    }
  }
  return out;
}

function buildTasks(event: CelebrationEvent): Task[] {
  return EVENT_TYPES[event.type].tasks.map((t) => ({
    key: lineKey(event.id, t.id),
    id: t.id,
    eventId: event.id,
    label: t.label,
    due: addDays(event.date, -t.daysBefore),
    after: t.after.map((a) => lineKey(event.id, a)),
  }));
}

/** Lines, payments and tasks for every event in the season, payments sorted by date. */
export function buildPlan(season: Season): Plan {
  const payments: Payment[] = [];
  const events = season.events.map((event): PlannedEvent => {
    const lines = buildLines(event, season);
    const pays = buildPayments(event, lines, season);
    payments.push(...pays);
    const budget = effectiveBudget(event, season);
    return {
      ...event,
      lines,
      payments: pays,
      tasks: buildTasks(event),
      budget,
      perGuest: Math.round(budget / event.guests),
      savedByTrim: lines.filter((l) => l.trimmed).reduce((a, l) => a + l.amount, 0),
    };
  });
  payments.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return { events, payments };
}

/**
 * Task status for a given day. A task is "late" when its due date has passed and it
 * is not done; it is "blocked" when something it depends on is not finished yet.
 */
export function taskStatuses(tasks: Task[], done: Record<string, boolean>, today: string): TaskStatus[] {
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  return tasks.map((t) => {
    const finished = Boolean(done[t.key]);
    const waitingOn = t.after.filter((k) => !done[k] && byKey.has(k));
    const late = !finished && t.due < today;
    const slippedBy = waitingOn.filter((k) => (byKey.get(k)?.due ?? today) < today);
    return { ...t, finished, late, waitingOn, atRisk: !finished && !late && slippedBy.length > 0 };
  });
}
