// Three of the Gemini features: reading a brief, reading a change, and writing ideas. Each task: build a fenced prompt, ask for
// structured JSON, then validate the answer with the same code the rest of the app uses.
// If the model is unavailable the caller gets a clearly labelled offline result (or an error).

import { askGemini, fence, str, int, obj, arr } from './gemini.ts';
import type { Env, GeminiDeps, GeminiSchema } from './gemini.ts';
import { httpError } from './http.ts';
import type { BriefBody, ChangeBody, IdeasBody } from './requests.ts';
import { normalizeSeason, cleanText } from '../shared/schema.ts';
import { validateChange, fallbackParseChange } from '../shared/change.ts';
import type { Change, ChangeCheck } from '../shared/change.ts';
import { cleanIdeas, sampleIdeas } from '../shared/ideas.ts';
import type { Idea } from '../shared/ideas.ts';
import { TYPE_IDS, EVENT_TYPES, isEventType } from '../shared/templates.ts';
import { isISODate } from '../shared/dates.ts';
import { field } from '../shared/guards.ts';
import type { Season } from '../shared/types.ts';

const IDEAS_SCHEMA = obj({ ideas: arr(obj({ title: str, detail: str, costNote: str }, ['title', 'detail'])) }, [
  'ideas',
]);
const CHANGE_SCHEMA = obj({
  eventId: { type: 'STRING', nullable: true },
  guestsDelta: int,
  budgetPct: int,
  dateShiftDays: int,
  assumptions: arr(str),
});
const BRIEF_SCHEMA: GeminiSchema = obj(
  {
    name: str,
    startBalance: int,
    incomes: arr(obj({ label: str, date: str, amount: int }, ['label', 'date', 'amount'])),
    events: arr(
      obj({ type: { type: 'STRING', enum: TYPE_IDS }, name: str, date: str, guests: int, budget: int }, [
        'type',
        'name',
        'date',
        'guests',
        'budget',
      ]),
    ),
  },
  ['events'],
);

export interface IdeasResult {
  source: 'gemini' | 'offline-sample';
  model?: string;
  note?: string;
  ideas: Idea[];
}

export interface ChangeResult {
  source: 'gemini' | 'offline-parser';
  model: string | undefined;
  change: Change;
}

export interface BriefResult {
  source: 'gemini';
  model: string;
  season: Season;
}

export async function runIdeas(body: IdeasBody, env: Env, deps: GeminiDeps = {}): Promise<IdeasResult> {
  const type = isEventType(body.type) ? body.type : null;
  if (!type) throw httpError(400, 'Choose an event type.');
  const guests = Number.isSafeInteger(body.guests) ? body.guests : null;
  const budget = Number.isSafeInteger(body.budget) ? body.budget : null;
  const user = [
    `Event type: ${EVENT_TYPES[type].label}.`,
    guests ? `Guests: ${guests}.` : '',
    budget ? `Budget: ${budget} rupees.` : '',
    `<data>City or area: ${fence(body.city, 60)}\nStyle and wishes: ${fence(body.vibe, 300)}</data>`,
    'Give 4 to 6 practical ideas that fit this budget and head-count. Each has a short title, one or two sentences of detail, and a short costNote.',
  ]
    .filter(Boolean)
    .join('\n');
  const answer = await askGemini(IDEAS_SCHEMA, user, env, deps);
  const ideas = answer ? cleanIdeas(answer.data) : [];
  if (answer && ideas.length) return { source: 'gemini', model: answer.model, ideas };
  return {
    source: 'offline-sample',
    note: 'Gemini was not reachable, so these are built-in sample ideas.',
    ideas: sampleIdeas(type),
  };
}

export async function runChange(body: ChangeBody, env: Env, deps: GeminiDeps = {}): Promise<ChangeResult> {
  const text = cleanText(body.text, 400);
  if (!text) throw httpError(400, 'Describe the change in a sentence.');
  const checked = normalizeSeason(body.season);
  if (!checked.ok) throw httpError(400, 'The season could not be read.');
  const season = checked.season;
  const roster = season.events
    .map((e) => `${e.id}: ${fence(e.name, 60)}, ${e.type}, ${e.guests} guests, budget ${e.budget}, on ${e.date}`)
    .join('\n');
  const user = [
    'Turn the request into a change to ONE event. Set guestsDelta (people added or removed), budgetPct (percent change, negative to shrink) and dateShiftDays (negative = earlier).',
    'Use 0 for anything not mentioned. If the request names no event, set eventId to null. If you must guess a number, say so in assumptions.',
    `Events:\n${roster}`,
    `<data>${fence(text, 400)}</data>`,
  ].join('\n');
  const answer = await askGemini(CHANGE_SCHEMA, user, env, deps);
  const fromModel: ChangeCheck = answer ? validateChange(answer.data, season) : { ok: false, errors: [] };
  if (fromModel.ok) return { source: 'gemini', model: answer?.model, change: fromModel.change };
  const offline = validateChange(fallbackParseChange(text), season);
  if (!offline.ok)
    throw httpError(
      422,
      'I could not find a guest, budget or date change in that. Try: "50 more guests, 10% smaller budget, 2 weeks earlier".',
    );
  return { source: 'offline-parser', model: answer?.model, change: offline.change };
}

export async function runBrief(body: BriefBody, env: Env, deps: GeminiDeps = {}): Promise<BriefResult> {
  const text = cleanText(body.text, 1200);
  if (!text) throw httpError(400, 'Describe your events in a few sentences.');
  if (!isISODate(body.today)) throw httpError(400, "Today's date is missing.");
  const user = [
    `Today is ${body.today}. Read the description and list the family's events, with real calendar dates on or after today (use ISO YYYY-MM-DD).`,
    'Event type must be wedding, birthday or community. Include income the family mentions (salary, bonus, contributions) with the date it arrives. Use whole rupees. If a budget or guest count is not stated, make a modest guess.',
    `<data>${fence(text, 1200)}</data>`,
  ].join('\n');
  const answer = await askGemini(BRIEF_SCHEMA, user, env, deps);
  if (!answer) throw httpError(503, 'Gemini is not reachable right now. Use the form below or try the sample season.');
  const balance = field(answer.data, 'startBalance');
  const startBalance = typeof balance === 'number' && Number.isSafeInteger(balance) ? Math.max(0, balance) : 0;
  const data = answer.data && typeof answer.data === 'object' ? answer.data : {};
  const checked = normalizeSeason({ ...data, startDate: body.today, startBalance });
  if (!checked.ok)
    throw httpError(422, `The AI answer did not fit: ${checked.errors.slice(0, 2).join(' ')} Please edit the form.`);
  return { source: 'gemini', model: answer.model, season: checked.season };
}
