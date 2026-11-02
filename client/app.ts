// Wires the form, the engine and the server routes together.

import { normalizeSeason } from '../shared/schema.ts';
import { buildPlan } from '../shared/plan.ts';
import { cashCalendar } from '../shared/cash.ts';
import { suggestFixes, applyAdjust } from '../shared/fixes.ts';
import { sampleSeason } from '../shared/sample.ts';
import { todayISO } from '../shared/dates.ts';
import { cleanProgress, VENDOR_STATUS } from '../shared/progress.ts';
import { loadState, saveState, clearState } from './ui/state.ts';
import type { SavedState } from './ui/state.ts';
import { postJSON } from './ui/api.ts';
import { addIncomeRow, addEventRow, readForm, fillForm, showErrors } from './ui/setup.ts';
import { renderOverview } from './ui/overview.ts';
import { renderEvents } from './ui/events.ts';
import { byId } from './ui/h.ts';
import { errorText } from './ui/context.ts';
import type { Ctx } from './ui/context.ts';
import type { Season } from '../shared/types.ts';
import type { BriefResult, ChangeResult, IdeasResult } from '../server/tasks.ts';
import type { MessageResult, QuoteResult } from '../server/writing.ts';

const today = todayISO();
const ideaCache: Record<string, IdeasResult> = {};
let state: SavedState | null = loadState();
let history: Season[] = [];

const button = (id: string): HTMLButtonElement => byId<HTMLButtonElement>(id);

function say(message: string, bad = false): void {
  const el = byId('status');
  el.textContent = message;
  el.classList.toggle('bad', bad);
}

function persist(): void {
  if (state) saveState(state);
  button('undo').disabled = history.length === 0;
}

function context(current: SavedState): Ctx {
  const { season } = current;
  const plan = buildPlan(season);
  return {
    season,
    plan,
    today,
    progress: current.progress,
    ideaCache,
    cal: cashCalendar(season, plan),
    fixes: suggestFixes(season),
    say,
    applyFix: (fix) => commit(applyAdjust(season, fix.patch), `Done: ${fix.label}`),
    commit,
    requestChange: (text) => postJSON<ChangeResult>('/api/change', { text, season }),
    fetchIdeas: async (ev, city, vibe) => {
      const r = await postJSON<IdeasResult>('/api/ideas', {
        type: ev.type,
        guests: ev.guests,
        budget: ev.budget,
        city,
        vibe,
      });
      ideaCache[ev.id] = r;
      return r;
    },
    ask: (path, body) => postJSON(path, body),
    readQuote: (b) => postJSON<QuoteResult>('/api/quote', b),
    draftMessage: (b) => postJSON<MessageResult>('/api/message', b),
    copy: async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        say('Copied.');
      } catch {
        say('Could not copy. Select the text and copy it by hand.', true);
      }
    },
    setOverride: (eventId, lineId, value) => {
      const events = season.events.map((e) => {
        if (e.id !== eventId) return e;
        if (lineId === null) {
          const { overrides: _cleared, ...rest } = e;
          return rest;
        }
        const overrides = { ...(e.overrides || {}) };
        if (value === null || !Number.isFinite(value)) delete overrides[lineId];
        else overrides[lineId] = Math.round(value);
        return { ...e, overrides };
      });
      commit({ ...season, events }, 'Amount updated. The other lines re-balanced to fit the budget.');
    },
    toggleTask: (key) => {
      const { done } = current.progress;
      if (done[key]) delete done[key];
      else done[key] = true;
      persist();
      renderEvents(byId('event-list'), context(current));
    },
    setVendor: (key, patch) => {
      const cur = current.progress.vendors[key] ?? { status: VENDOR_STATUS[0], name: '' };
      current.progress = cleanProgress({
        ...current.progress,
        vendors: { ...current.progress.vendors, [key]: { ...cur, ...patch } },
      });
      persist();
    },
  };
}

function render(): void {
  if (!state) return;
  byId('start').hidden = true;
  byId('plan').hidden = false;
  const ctx = context(state);
  renderOverview(byId('overview'), ctx);
  renderEvents(byId('event-list'), ctx);
  button('undo').disabled = history.length === 0;
}

function commit(season: Season, note: string): void {
  const checked = normalizeSeason(season);
  if (!checked.ok) {
    say(checked.errors[0] ?? 'That change could not be applied.', true);
    return;
  }
  if (state) {
    history.push(state.season);
    state = { ...state, season: checked.season };
  }
  persist();
  render();
  say(note);
}

function startFrom(season: unknown): void {
  const checked = normalizeSeason(season);
  if (!checked.ok) {
    showErrors(checked.errors);
    say('Please fix the points listed in the form.', true);
    return;
  }
  showErrors([]);
  history = [];
  state = { season: checked.season, progress: { done: {}, vendors: {} } };
  persist();
  render();
  say('Your season is ready.');
  byId('main').focus();
}

async function buildWithAI(): Promise<void> {
  const text = byId<HTMLTextAreaElement>('brief').value.trim();
  if (!text) {
    say('Write a few sentences about your events first.', true);
    return;
  }
  button('build-ai').disabled = true;
  say('Gemini is reading your description…');
  try {
    const { season } = await postJSON<BriefResult>('/api/brief', { text, today });
    fillForm(season);
    say('Gemini filled the form. Please check every number, then press "Plan my season".');
    byId('setup').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    say(errorText(err), true);
  } finally {
    button('build-ai').disabled = false;
  }
}

byId('add-income').addEventListener('click', () => addIncomeRow());
byId('add-event').addEventListener('click', () => addEventRow());
byId('build-ai').addEventListener('click', () => {
  void buildWithAI();
});
byId('sample').addEventListener('click', () => startFrom(sampleSeason(today)));
byId('setup').addEventListener('submit', (e) => {
  e.preventDefault();
  startFrom({ ...readForm(), name: 'Our celebration season' });
});
byId('print').addEventListener('click', () => window.print());
byId('undo').addEventListener('click', () => {
  const previous = history.pop();
  if (!state || !previous) return;
  state = { ...state, season: previous };
  persist();
  render();
  say('Last change undone.');
});
byId('reset').addEventListener('click', () => {
  clearState();
  state = null;
  history = [];
  byId('plan').hidden = true;
  byId('start').hidden = false;
  fillForm({ startDate: today, startBalance: '', incomes: [], events: [] });
  addEventRow();
  say('Cleared. Start a new season.');
});

if (state) {
  fillForm(state.season);
  render();
} else {
  byId<HTMLInputElement>('s-start').value = today;
  addIncomeRow();
  addEventRow();
}
