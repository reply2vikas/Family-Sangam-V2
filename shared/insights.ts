// Plain-words season summary (with a number check) and RSVP counting.

import { formatINR } from './money.ts';
import { formatDate } from './dates.ts';
import { cleanText } from './schema.ts';
import { asList, field } from './guards.ts';
import type { CashCalendar, Fix, Plan } from './types.ts';

export interface Facts {
  lines: string[];
  /** Every number the summary is allowed to mention. */
  numbers: Set<number>;
}

export type RsvpResponse = 'yes' | 'no' | 'maybe' | 'unclear';

export interface RsvpReply {
  name: string;
  response: RsvpResponse;
  party: number;
}

export interface RsvpTotals extends Record<RsvpResponse, number> {
  repliesCounted: number;
}

export interface RsvpResult {
  replies: RsvpReply[];
  totals: RsvpTotals;
}

/** Facts computed by code. The model may only talk about these. */
export function buildFacts(plan: Plan, cal: CashCalendar, fixes: Fix[] = []): Facts {
  const numbers = new Set<number>();
  const lines: string[] = [];
  const add = (text: string, ...nums: number[]): void => {
    lines.push(text);
    nums.forEach((n) => numbers.add(Math.abs(n)));
  };
  for (const ev of plan.events) {
    add(
      `${ev.name} (${ev.type}) on ${formatDate(ev.date)}: ${ev.guests} guests, budget ${formatINR(ev.budget)}, about ${formatINR(ev.perGuest)} per guest.`,
      ev.guests,
      ev.budget,
      ev.perGuest,
    );
  }
  if (cal.shortfall)
    add(
      `Cash runs short on ${formatDate(cal.shortfall.date)}. The worst day needs ${formatINR(cal.needed)} more.`,
      cal.needed,
    );
  else
    add(
      `Cash stays above zero. The lowest balance is ${formatINR(cal.lowest.balance)} on ${formatDate(cal.lowest.date)}.`,
      cal.lowest.balance,
    );
  for (const f of fixes.slice(0, 3))
    add(`Possible fix: ${f.label}. ${f.resolved ? 'This closes the gap.' : 'This helps but does not close the gap.'}`);
  return { lines, numbers };
}

/** Every number in `text` must be small (0 to 100, like dates or percentages), a year, or in `allowed`. */
export function verifyNumbers(text: string, allowed: Set<number>): { ok: boolean; unknown: number[] } {
  const unknown: number[] = [];
  for (const m of String(text).matchAll(/\d[\d,]*/g)) {
    const n = Number(m[0].replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 100 || (n >= 2020 && n <= 2100) || allowed.has(n)) continue;
    unknown.push(n);
  }
  return { ok: unknown.length === 0, unknown };
}

/** Code-written summary used when the model is unreachable or quotes a number it was not given. */
export function offlineExplain(facts: Facts): string {
  return facts.lines.join(' ');
}

const RESPONSES: RsvpResponse[] = ['yes', 'no', 'maybe', 'unclear'];
const isResponse = (v: unknown): v is RsvpResponse => (RESPONSES as unknown[]).includes(v);
const isParty = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 1 && v <= 20;

/** Clean RSVP rows from the model and add up the totals by code. */
export function cleanRsvp(raw: unknown): RsvpResult {
  const rows = asList(field(raw, 'replies'))
    .slice(0, 200)
    .map((r): RsvpReply => {
      const response = field(r, 'response');
      const party = field(r, 'party');
      return {
        name: cleanText(field(r, 'name'), 40) || 'Guest',
        response: isResponse(response) ? response : 'unclear',
        party: isParty(party) ? party : 1,
      };
    });
  return { replies: rows, totals: totalRsvp(rows) };
}

/** Totals by response; "yes" and "maybe" count whole parties, "no" counts one per reply. */
export function totalRsvp(rows: RsvpReply[]): RsvpTotals {
  const t: RsvpTotals = { yes: 0, no: 0, maybe: 0, unclear: 0, repliesCounted: rows.length };
  for (const r of rows) t[r.response] += r.response === 'no' ? 1 : r.party;
  return t;
}

const YES =
  /\b(yes|yep|yeah|coming|will come|will be there|confirmed?|count (me|us) in|sure|haan|aa(ye)?nge|aayenge)\b/i;
const NO = /\b(no|nope|can'?t|cannot|won'?t|unable|not (able|coming)|sorry|nahi|nahin)\b/i;
const MAYBE = /\b(maybe|might|not sure|will try|try to|let you know|shayad)\b/i;

/** Offline reader: one reply per line, in the form "Name: message". */
export function offlineRsvp(text: unknown): RsvpResult {
  const replies: RsvpReply[] = [];
  for (const line of String(text || '')
    .split('\n')
    .slice(0, 200)) {
    const t = line.trim();
    if (!t) continue;
    const [first = '', ...rest] = t.split(':');
    const hasName = rest.length > 0 && first.length <= 40;
    const body = hasName ? rest.join(':') : t;
    let response: RsvpResponse = 'unclear';
    if (MAYBE.test(body)) response = 'maybe';
    else if (NO.test(body) && !YES.test(body)) response = 'no';
    else if (YES.test(body)) response = 'yes';
    const plus = /(?:\+|with|plus|and)\s*(\d{1,2})\b/i.exec(body);
    replies.push({
      name: hasName ? cleanText(first, 40) : 'Guest',
      response,
      party: plus ? Math.min(20, 1 + Number(plus[1])) : 1,
    });
  }
  return { replies, totals: totalRsvp(replies) };
}
