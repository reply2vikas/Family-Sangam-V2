// Five more Gemini helpers. Same pattern as tasks.ts: fenced prompt, structured JSON, code validates.

import { askGemini, fence, str, int, obj, arr } from './gemini.ts';
import type { Env, GeminiDeps, GeminiSchema } from './gemini.ts';
import { httpError } from './http.ts';
import type { EventHelpBody, ExplainBody, RsvpBody, SavingsBody } from './requests.ts';
import { normalizeSeason, cleanText } from '../shared/schema.ts';
import { buildPlan } from '../shared/plan.ts';
import { cashCalendar } from '../shared/cash.ts';
import { suggestFixes } from '../shared/fixes.ts';
import { isLanguage } from '../shared/message.ts';
import type { Language } from '../shared/message.ts';
import { EVENT_TYPES, isEventType } from '../shared/templates.ts';
import { isISODate } from '../shared/dates.ts';
import { field } from '../shared/guards.ts';
import {
  cleanChecklist,
  cleanRunshow,
  cleanSavings,
  offlineSavings,
  offlineChecklist,
  offlineRunshow,
} from '../shared/extras.ts';
import type { ChecklistItem, RunshowRow, SavingsIdea } from '../shared/extras.ts';
import { buildFacts, verifyNumbers, offlineExplain, cleanRsvp, offlineRsvp } from '../shared/insights.ts';
import type { RsvpResult } from '../shared/insights.ts';
import type { EventType, Plan, Season } from '../shared/types.ts';

type HelperKey = 'checklist' | 'runshow' | 'savings' | 'explain' | 'rsvp';

const SCHEMAS: Record<HelperKey, GeminiSchema> = {
  checklist: obj({ items: arr(obj({ title: str, daysBefore: int, why: str }, ['title', 'daysBefore'])) }, ['items']),
  runshow: obj({ schedule: arr(obj({ time: str, activity: str, owner: str }, ['time', 'activity'])) }, ['schedule']),
  savings: obj({ ideas: arr(obj({ lineId: str, idea: str, saveAmount: int }, ['lineId', 'idea', 'saveAmount'])) }, [
    'ideas',
  ]),
  explain: obj({ summary: str }, ['summary']),
  rsvp: obj(
    {
      replies: arr(
        obj({ name: str, response: { type: 'STRING', enum: ['yes', 'no', 'maybe', 'unclear'] }, party: int }, [
          'response',
        ]),
      ),
    },
    ['replies'],
  ),
};

/** The event details a helper prompt needs. */
interface EventBrief {
  type: EventType;
  name: string;
  date: string | null;
  guests: number | null;
}

/** A helper's answer plus where it came from ("gemini" or a named offline fallback). */
export type Sourced<T> = T & { source: string; model?: string | undefined; note?: string };
export type ChecklistResult = Sourced<{ items: ChecklistItem[] }>;
export type RunshowResult = Sourced<{ schedule: RunshowRow[] }>;
export type SavingsResult = Sourced<{ ideas: SavingsIdea[]; totalSaving: number }>;
export type ExplainResult = Sourced<{ language: Language; summary: string }>;
export type RsvpHelperResult = Sourced<RsvpResult>;

function eventFrom(raw: unknown): EventBrief {
  const type = field(raw, 'type');
  if (!isEventType(type)) throw httpError(400, 'Choose an event first.');
  const date = field(raw, 'date');
  const guests = field(raw, 'guests');
  return {
    type,
    name: cleanText(field(raw, 'name'), 60) || 'the event',
    date: isISODate(date) ? date : null,
    guests: typeof guests === 'number' && Number.isSafeInteger(guests) && guests > 0 ? guests : null,
  };
}

const describe = (ev: EventBrief): string =>
  `${EVENT_TYPES[ev.type].label}: ${fence(ev.name, 60)}${ev.date ? ` on ${ev.date}` : ''}${ev.guests ? `, ${ev.guests} guests` : ''}.`;

export async function runChecklist(body: EventHelpBody, env: Env, deps: GeminiDeps = {}): Promise<ChecklistResult> {
  const ev = eventFrom(body.event);
  const user = [
    `Suggest 4 to 8 extra checklist items this family might forget for: ${describe(ev)}`,
    'Each has a title, daysBefore (whole days before the event it should be done), and a short why. Do not repeat basics like booking the venue or caterer.',
    `<data>${fence(body.note, 300)}</data>`,
  ].join('\n');
  const r = await askGemini(SCHEMAS.checklist, user, env, deps);
  const items = r ? cleanChecklist(r.data) : [];
  if (r && items.length) return { source: 'gemini', model: r.model, items };
  return {
    source: 'offline-sample',
    note: 'Gemini was not reachable, so these are built-in suggestions.',
    items: offlineChecklist(ev.type),
  };
}

export async function runRunshow(body: EventHelpBody, env: Env, deps: GeminiDeps = {}): Promise<RunshowResult> {
  const ev = eventFrom(body.event);
  const user = [
    `Write an hour-by-hour schedule for the day of: ${describe(ev)}`,
    'Use 24-hour HH:MM times, a short activity, and who is responsible (a role, not a real name). 6 to 12 rows.',
    `<data>${fence(body.note, 300)}</data>`,
  ].join('\n');
  const r = await askGemini(SCHEMAS.runshow, user, env, deps);
  const schedule = r ? cleanRunshow(r.data) : [];
  if (r && schedule.length) return { source: 'gemini', model: r.model, schedule };
  return {
    source: 'offline-sample',
    note: 'Gemini was not reachable, so this is a built-in outline.',
    schedule: offlineRunshow(ev.type),
  };
}

function planFor(rawSeason: unknown): { season: Season; plan: Plan } {
  const checked = normalizeSeason(rawSeason);
  if (!checked.ok) throw httpError(400, 'The season could not be read.');
  return { season: checked.season, plan: buildPlan(checked.season) };
}

export async function runSavings(body: SavingsBody, env: Env, deps: GeminiDeps = {}): Promise<SavingsResult> {
  const { plan } = planFor(body.season);
  const ev = plan.events.find((e) => e.id === body.eventId) ?? plan.events[0];
  if (!ev) throw httpError(400, 'The season could not be read.');
  const roster = ev.lines
    .filter((l) => !l.trimmed)
    .map((l) => `${l.id}: ${l.label}, ${l.amount} rupees${l.must ? ', must-have' : ''}`)
    .join('\n');
  const user = [
    `Suggest up to 6 practical ways to spend less on ${describe(ev)}`,
    'Each idea must name one budget line by its id and say how many whole rupees it would save. Do not suggest cutting must-have items completely.',
    `Budget lines:\n${roster}`,
    `<data>${fence(body.note, 300)}</data>`,
  ].join('\n');
  const r = await askGemini(SCHEMAS.savings, user, env, deps);
  const ideas = r ? cleanSavings(r.data, ev.lines) : [];
  const fromModel = r !== null && ideas.length > 0;
  const list = fromModel ? ideas : offlineSavings(ev.lines);
  return {
    source: fromModel ? 'gemini' : 'offline-rules',
    model: fromModel ? r.model : undefined,
    ideas: list,
    totalSaving: list.reduce((a, i) => a + i.saveAmount, 0),
  };
}

export async function runExplain(body: ExplainBody, env: Env, deps: GeminiDeps = {}): Promise<ExplainResult> {
  const { season, plan } = planFor(body.season);
  const cal = cashCalendar(season, plan);
  const facts = buildFacts(plan, cal, suggestFixes(season));
  const language: Language = isLanguage(body.language) ? body.language : 'English';
  const user = [
    `Explain this family's season to a relative who does not like spreadsheets. Write in ${language}${language === 'Hinglish' ? ' (Hindi in the English alphabet)' : ''}, under 120 words, warm and plain.`,
    'All events are still in the future: use future or present tense, never say an event happened or guests attended. Use ONLY the facts below. Quote numbers exactly as given. Do not add any other number, price or date.',
    `Facts:\n${facts.lines.join('\n')}`,
  ].join('\n');
  const r = await askGemini(SCHEMAS.explain, user, env, deps);
  const text = r ? cleanText(field(r.data, 'summary'), 900) : '';
  if (r && text && verifyNumbers(text, facts.numbers).ok)
    return { source: 'gemini', model: r.model, language, summary: text };
  return {
    source: 'offline-summary',
    language: 'English',
    summary: offlineExplain(facts),
    note: text
      ? 'Gemini quoted a number that is not in your plan, so the plain facts are shown instead.'
      : 'Gemini was not reachable, so the plain facts are shown.',
  };
}

export async function runRsvp(body: RsvpBody, env: Env, deps: GeminiDeps = {}): Promise<RsvpHelperResult> {
  const text = String(body.text ?? '')
    .replace(/[<>]/g, ' ')
    .trim()
    .slice(0, 2500);
  if (text.length < 3) throw httpError(400, 'Paste the replies first, one per line.');
  const user = [
    'Read these guest replies (one per line, usually "Name: message"). For each give name, response (yes, no, maybe or unclear) and party size (the guest plus anyone they say they are bringing, at least 1).',
    'Replies can be in English, Hindi or Hinglish.',
    `<data>${fence(text, 2500)}</data>`,
  ].join('\n');
  const r = await askGemini(SCHEMAS.rsvp, user, env, deps);
  const clean = r ? cleanRsvp(r.data) : null;
  if (r && clean && clean.replies.length) return { source: 'gemini', model: r.model, ...clean };
  return { source: 'offline-reader', ...offlineRsvp(text) };
}
