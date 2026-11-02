// Cleaners for three Gemini helpers: extra checklist items, a day-of schedule and savings ideas.
// Each one accepts only well-formed items, caps sizes, and (for savings) caps amounts by code.

import { cleanText } from './schema.ts';
import { asList, field } from './guards.ts';
import { isEventType } from './templates.ts';
import type { BudgetLine, EventType } from './types.ts';

export interface ChecklistItem {
  title: string;
  daysBefore: number;
  why: string;
}

export interface RunshowRow {
  time: string;
  activity: string;
  owner: string;
}

export interface SavingsIdea {
  lineId: string;
  lineLabel: string;
  idea: string;
  saveAmount: number;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMinutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const wholeIn = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= lo && v <= hi ? v : null;

/** Extra checklist items: title, how many days before the event, and why. */
export function cleanChecklist(raw: unknown): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  for (const i of asList(field(raw, 'items')).slice(0, 8)) {
    const title = cleanText(field(i, 'title'), 80);
    const daysBefore = wholeIn(field(i, 'daysBefore'), 0, 365);
    if (title && daysBefore !== null) out.push({ title, daysBefore, why: cleanText(field(i, 'why'), 120) });
  }
  return out;
}

/** Day-of schedule: valid 24-hour times only, sorted, at most 14 rows. */
export function cleanRunshow(raw: unknown): RunshowRow[] {
  return asList(field(raw, 'schedule'))
    .map((r) => ({
      time: String(field(r, 'time') ?? '').trim(),
      activity: cleanText(field(r, 'activity'), 100),
      owner: cleanText(field(r, 'owner'), 40),
    }))
    .filter((r) => HHMM.test(r.time) && r.activity)
    .sort((a, b) => toMinutes(a.time) - toMinutes(b.time))
    .slice(0, 14);
}

/**
 * Savings ideas. `lines` are the plan's budget lines. An idea must name a real line, and the
 * amount it claims to save can never exceed what that line is worth. Must-have lines may be
 * trimmed by suggestion but a single idea cannot claim more than half of one.
 */
export function cleanSavings(raw: unknown, lines: BudgetLine[]): SavingsIdea[] {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const out: SavingsIdea[] = [];
  for (const i of asList(field(raw, 'ideas')).slice(0, 10)) {
    const line = byId.get(String(field(i, 'lineId')));
    const idea = cleanText(field(i, 'idea'), 160);
    const saveAmount = wholeIn(field(i, 'saveAmount'), 1, Number.MAX_SAFE_INTEGER);
    if (!line || !idea || saveAmount === null) continue;
    const cap = line.must ? Math.floor(line.amount / 2) : line.amount;
    out.push({ lineId: line.id, lineLabel: line.label, idea, saveAmount: Math.min(saveAmount, cap) });
  }
  return out.slice(0, 6);
}

/** Rule-based savings used when Gemini is not reachable: simplify optional lines by 20%. */
export function offlineSavings(lines: BudgetLine[]): SavingsIdea[] {
  return lines
    .filter((l) => !l.must && !l.reserve && l.amount > 0 && !l.trimmed)
    .slice(0, 5)
    .map((l) => ({
      lineId: l.id,
      lineLabel: l.label,
      idea: `Keep "${l.label}" simpler or get two quotes and ask for a bundle price.`,
      saveAmount: Math.round(l.amount * 0.2),
    }));
}

const GENERIC_CHECKLIST: Record<EventType, [string, number, string][]> = {
  wedding: [
    ['Arrange drinking water, parking and a helpdesk', 14, 'Guests notice these first'],
    ['Plan stay for elders close to the venue', 30, 'Avoids long travel'],
    ['Nominate one family point person per vendor', 20, 'One voice, fewer mix-ups'],
  ],
  birthday: [
    ['Confirm any food allergies among guests', 7, 'Avoids last-minute changes'],
    ['Plan a quiet corner for elders and toddlers', 5, 'Keeps everyone comfortable'],
  ],
  community: [
    ['Arrange first-aid kit and a lost-and-found desk', 5, 'Basic safety'],
    ['Keep a rain plan for outdoor areas', 7, 'Weather can change the day'],
  ],
};

/** Generic checklist items used when Gemini is not reachable. */
export function offlineChecklist(type: unknown): ChecklistItem[] {
  return GENERIC_CHECKLIST[isEventType(type) ? type : 'wedding'].map(([title, daysBefore, why]) => ({
    title,
    daysBefore,
    why,
  }));
}

const GENERIC_RUNSHOW: Record<EventType, [string, string, string][]> = {
  wedding: [
    ['07:00', 'Decor and sound check complete', 'Decorator'],
    ['10:00', 'Family and vendors arrive', 'Point person'],
    ['12:30', 'Main ceremony', 'Priest'],
    ['13:30', 'Lunch service begins', 'Caterer'],
    ['16:00', 'Photos with family', 'Photographer'],
  ],
  birthday: [
    ['16:00', 'Venue and decor ready', 'Decorator'],
    ['17:00', 'Guests arrive', 'Host'],
    ['18:00', 'Cake cutting', 'Host'],
    ['18:30', 'Games and food', 'Entertainer'],
  ],
  community: [
    ['07:00', 'Volunteers brief and set up', 'Lead volunteer'],
    ['09:00', 'Gates open', 'Gate team'],
    ['12:00', 'Main programme', 'Compere'],
    ['14:00', 'Food service', 'Caterer'],
    ['17:00', 'Clean-up', 'Volunteers'],
  ],
};

/** A generic day-of schedule used when Gemini is not reachable. */
export function offlineRunshow(type: unknown): RunshowRow[] {
  return GENERIC_RUNSHOW[isEventType(type) ? type : 'wedding'].map(([time, activity, owner]) => ({
    time,
    activity,
    owner,
  }));
}
