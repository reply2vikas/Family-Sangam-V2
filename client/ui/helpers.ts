// "More help" card per event (checklist ideas, day-of schedule, savings, RSVP count)
// and the plain-words season summary.

import { h, clear } from './h.ts';
import type { Child } from './h.ts';
import { errorText } from './context.ts';
import type { Ctx } from './context.ts';
import { formatINR } from '../../shared/money.ts';
import { applyChange } from '../../shared/change.ts';
import { LANGUAGES } from '../../shared/message.ts';
import type { PlannedEvent } from '../../shared/types.ts';
import type {
  ChecklistResult,
  ExplainResult,
  RsvpHelperResult,
  RunshowResult,
  SavingsResult,
} from '../../server/more.ts';

const badge = (source: string, aiText: string): HTMLSpanElement =>
  h(
    'span',
    { class: `badge ${source === 'gemini' ? 'ai' : 'est'}` },
    source === 'gemini' ? aiText : 'built-in fallback',
  );

/** What one helper returns for display: where the answer came from, and the content to show. */
interface Shown {
  source: string;
  note?: string | undefined;
  content: Child;
}

interface HelperView {
  label: string;
  /** RSVP needs pasted replies; the others take an optional note. */
  needsText: boolean;
  run(ev: PlannedEvent, ctx: Ctx, text: string): Promise<Shown>;
}

const eventBody = (ev: PlannedEvent, ctx: Ctx, note: string): object => ({
  event: { type: ev.type, name: ev.name, date: ev.date, guests: ev.guests },
  eventId: ev.id,
  season: ctx.season,
  note,
});

function rsvpContent(r: RsvpHelperResult, ev: PlannedEvent, ctx: Ctx): Child {
  const t = r.totals;
  const setGuests = (): void =>
    ctx.commit(
      applyChange(ctx.season, {
        eventId: ev.id,
        guestsDelta: Math.max(-2000, Math.min(2000, t.yes - ev.guests)),
      }),
      `Guest count set to ${t.yes}.`,
    );
  return [
    h('p', {}, `Yes: ${t.yes}. Maybe: ${t.maybe}. No: ${t.no}. Unclear: ${t.unclear}.`),
    h(
      'ul',
      {},
      r.replies
        .slice(0, 12)
        .map((x) => h('li', {}, `${x.name}: ${x.response}${x.party > 1 ? ` (${x.party} people)` : ''}`)),
    ),
    t.yes > 0 &&
      h('button', { type: 'button', class: 'ghost', onclick: setGuests }, `Set guests to ${t.yes} (confirmed yes)`),
  ];
}

const VIEWS: Record<string, HelperView> = {
  checklist: {
    label: 'Extra checklist items',
    needsText: false,
    run: async (ev, ctx, note) => {
      const r = await ctx.ask<ChecklistResult>('/api/checklist', eventBody(ev, ctx, note));
      return {
        ...r,
        content: h(
          'ul',
          {},
          r.items.map((i) => h('li', {}, `${i.title} (${i.daysBefore} days before). ${i.why}`)),
        ),
      };
    },
  },
  runshow: {
    label: 'Day-of schedule',
    needsText: false,
    run: async (ev, ctx, note) => {
      const r = await ctx.ask<RunshowResult>('/api/runshow', eventBody(ev, ctx, note));
      const head = h(
        'thead',
        {},
        h(
          'tr',
          {},
          ['Time', 'What happens', 'Who'].map((c) => h('th', { scope: 'col' }, c)),
        ),
      );
      const rows = r.schedule.map((s) =>
        h('tr', {}, h('td', {}, s.time), h('td', {}, s.activity), h('td', {}, s.owner || '')),
      );
      return { ...r, content: h('div', { class: 'table-wrap' }, h('table', {}, head, h('tbody', {}, rows))) };
    },
  },
  savings: {
    label: 'Where can we save?',
    needsText: false,
    run: async (ev, ctx, note) => {
      const r = await ctx.ask<SavingsResult>('/api/savings', eventBody(ev, ctx, note));
      return {
        ...r,
        content: [
          h(
            'ul',
            {},
            r.ideas.map((i) => h('li', {}, `${i.lineLabel}: ${i.idea} Saves about ${formatINR(i.saveAmount)}.`)),
          ),
          h(
            'p',
            { class: 'small' },
            `Together about ${formatINR(r.totalSaving)}. Ideas only: nothing in your budget changes.`,
          ),
        ],
      };
    },
  },
  rsvp: {
    label: 'Count RSVP replies',
    needsText: true,
    run: async (ev, ctx, text) => {
      const r = await ctx.ask<RsvpHelperResult>('/api/rsvp', { text });
      return { ...r, content: rsvpContent(r, ev, ctx) };
    },
  },
};

export function helpersCard(ev: PlannedEvent, ctx: Ctx): HTMLDivElement {
  const pick = h(
    'select',
    { id: `hk-${ev.id}` },
    Object.entries(VIEWS).map(([k, v]) => h('option', { value: k }, v.label)),
  );
  const text = h('textarea', {
    id: `ht-${ev.id}`,
    rows: 3,
    maxlength: 2500,
    placeholder: 'Optional note. For RSVP: paste the replies, one per line, like "Amit: yes, coming with 2".',
  });
  const out = h('div', { 'aria-live': 'polite' });
  const go = h(
    'button',
    {
      type: 'button',
      class: 'primary',
      onclick: async () => {
        const view = VIEWS[pick.value];
        if (!view) return;
        if (view.needsText && !text.value.trim()) {
          clear(out).append(h('p', { class: 'errors' }, 'Paste the replies first.'));
          return;
        }
        go.disabled = true;
        clear(out).append(h('p', { class: 'small' }, 'Working…'));
        try {
          const shown = await view.run(ev, ctx, text.value);
          clear(out).append(
            h(
              'div',
              {},
              h('p', { class: 'small' }, badge(shown.source, 'by Gemini'), shown.note ? ` ${shown.note}` : ''),
              shown.content,
            ),
          );
        } catch (err) {
          clear(out).append(h('p', { class: 'errors' }, errorText(err)));
        } finally {
          go.disabled = false;
        }
      },
    },
    'Help me',
  );
  return h(
    'div',
    { class: 'card no-print' },
    h('h3', {}, 'More help'),
    h('label', { for: pick.id }, 'What do you need'),
    pick,
    h('label', { for: text.id }, 'Note or replies'),
    text,
    h('div', { class: 'row' }, go),
    out,
  );
}

export function explainPanel(ctx: Ctx): HTMLDivElement {
  const lang = h(
    'select',
    { id: 'explain-lang' },
    LANGUAGES.map((l) => h('option', { value: l }, l)),
  );
  const out = h('div', { 'aria-live': 'polite' });
  const go = h(
    'button',
    {
      type: 'button',
      class: 'ghost',
      onclick: async () => {
        go.disabled = true;
        clear(out).append(h('p', { class: 'small' }, 'Writing…'));
        try {
          const r = await ctx.ask<ExplainResult>('/api/explain', { season: ctx.season, language: lang.value });
          clear(out).append(
            h(
              'p',
              { class: 'small' },
              badge(r.source, `written by Gemini in ${r.language}`),
              r.note ? ` ${r.note}` : '',
            ),
            h('p', {}, r.summary),
          );
        } catch (err) {
          clear(out).append(h('p', { class: 'errors' }, errorText(err)));
        } finally {
          go.disabled = false;
        }
      },
    },
    'Explain my season',
  );
  return h(
    'div',
    {},
    h('h3', {}, 'Explain it to the family'),
    h(
      'p',
      { class: 'small' },
      'A short summary for relatives who do not like spreadsheets. Every number in it is checked against your plan.',
    ),
    h('label', { for: lang.id }, 'Language'),
    lang,
    h('div', { class: 'row' }, go),
    out,
  );
}
