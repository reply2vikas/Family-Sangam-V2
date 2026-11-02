// The season overview: cash headline, chart, ranked fixes, bad-day tests and the change test.

import { h, clear, svgEl } from './h.ts';
import { chartGeometry, cashHeadline, paymentsByMonth } from '../../shared/view.ts';
import { SCENARIOS, runScenario } from '../../shared/whatif.ts';
import { describeChange, applyChange } from '../../shared/change.ts';
import { formatINR } from '../../shared/money.ts';
import { formatDate } from '../../shared/dates.ts';
import type { CashCalendar, Fix, Plan, Season } from '../../shared/types.ts';
import { explainPanel } from './helpers.ts';
import { errorText } from './context.ts';
import type { Ctx } from './context.ts';

function chart(cal: CashCalendar): SVGSVGElement {
  const W = 720;
  const H = 220;
  const g = chartGeometry(cal.days, W, H);
  const gap = g.marks.find((m) => m.negative);
  return svgEl(
    'svg',
    {
      class: 'chart',
      viewBox: `0 0 ${W} ${H}`,
      role: 'img',
      'aria-label': `Cash balance across the season. ${cashHeadline(cal)}`,
    },
    svgEl('line', { class: 'zero', x1: 12, x2: W - 12, y1: g.zeroY, y2: g.zeroY }),
    svgEl('polyline', { class: 'line', points: g.points }),
    gap && svgEl('circle', { class: 'gap', cx: gap.x, cy: gap.y, r: 6 }),
    svgEl('text', { x: 14, y: g.zeroY - 5, 'font-size': 12, fill: '#5a5348' }, '₹0'),
  );
}

function monthTable(cal: CashCalendar, plan: Plan): HTMLDetailsElement {
  const lastBalance = new Map<string, number>();
  for (const d of cal.days) lastBalance.set(d.date.slice(0, 7), d.balance);
  const rows = paymentsByMonth(plan.payments).map((m) =>
    h(
      'tr',
      {},
      h('td', {}, m.month),
      h('td', { class: 'num' }, formatINR(m.total)),
      h('td', { class: 'num' }, formatINR(lastBalance.get(m.month) ?? 0)),
    ),
  );
  return h(
    'details',
    {},
    h('summary', {}, 'Show the same information as a table'),
    h(
      'table',
      {},
      h('caption', { class: 'small' }, 'Payments due and the balance at the end of each month'),
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { scope: 'col' }, 'Month'),
          h('th', { scope: 'col', class: 'num' }, 'Payments due'),
          h('th', { scope: 'col', class: 'num' }, 'Balance at month end'),
        ),
      ),
      h('tbody', {}, rows),
    ),
  );
}

function fixesPanel(fixes: Fix[], onApply: (fix: Fix) => void): HTMLDivElement {
  if (!fixes.length) return h('div', {});
  return h(
    'div',
    {},
    h('h3', {}, 'Ways to close the gap, best first'),
    h('p', { class: 'small' }, 'Must-haves are never cut. Each fix is a small change you can undo.'),
    fixes.map((f) =>
      h(
        'div',
        { class: 'fix' },
        h('strong', {}, f.label),
        h('p', {}, f.detail),
        h(
          'p',
          { class: 'small' },
          f.resolved
            ? 'This alone closes the gap.'
            : `This helps but does not close the gap. The worst day improves to ${formatINR(f.lowestAfter)}.`,
        ),
        h('button', { type: 'button', class: 'ghost', onclick: () => onApply(f) }, 'Use this fix'),
      ),
    ),
  );
}

function scenariosPanel(season: Season): HTMLDivElement {
  const out = h('div', { 'aria-live': 'polite' });
  const buttons = SCENARIOS.map((s) =>
    h(
      'button',
      {
        type: 'button',
        class: 'chip ghost',
        onclick: () => {
          const r = runScenario(season, s.id);
          clear(out).append(h('div', { class: 'scenario' }, h('strong', {}, r.label), h('p', {}, r.text)));
        },
      },
      s.label,
    ),
  );
  return h(
    'div',
    {},
    h('h3', {}, 'Test a bad day'),
    h('p', { class: 'small' }, 'Nothing is saved. This only shows what would happen.'),
    h('div', { class: 'row' }, buttons),
    out,
  );
}

function changePanel(season: Season, ctx: Ctx): HTMLDivElement {
  const out = h('div', { 'aria-live': 'polite' });
  const text = h('textarea', {
    id: 'change-text',
    rows: 2,
    maxlength: 400,
    placeholder: '50 more guests, smaller budget, event 2 weeks earlier',
  });
  const pick = h(
    'select',
    { id: 'change-event' },
    h('option', { value: '' }, 'Let the app choose from my words (nearest event if unclear)'),
    season.events.map((e) => h('option', { value: e.id }, `${e.name}, ${formatDate(e.date)}`)),
  );
  const ask = h(
    'button',
    {
      type: 'button',
      class: 'primary',
      onclick: async () => {
        const value = text.value.trim();
        if (!value) {
          ctx.say('Type the change first.', true);
          return;
        }
        ask.disabled = true;
        clear(out).append(h('p', { class: 'small' }, 'Reading your request…'));
        try {
          const { change, source } = await ctx.requestChange(value);
          if (pick.value) change.eventId = pick.value;
          const next = applyChange(season, change);
          const lines = describeChange(season, next);
          clear(out).append(
            h(
              'div',
              { class: 'scenario' },
              h('strong', {}, 'This is what I understood'),
              h('span', { class: 'badge ai' }, source === 'gemini' ? 'read by Gemini' : 'read by the offline parser'),
              h(
                'ul',
                {},
                lines.map((l) => h('li', {}, l)),
              ),
              change.assumptions.map((a) => h('p', { class: 'small' }, `Assumption: ${a}`)),
              h(
                'div',
                { class: 'row' },
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'primary',
                    onclick: () =>
                      ctx.commit(next, 'Change applied. Progress and your own amounts were kept where they still fit.'),
                  },
                  'Apply this change',
                ),
                h('button', { type: 'button', class: 'ghost', onclick: () => clear(out) }, 'Cancel'),
              ),
            ),
          );
        } catch (err) {
          clear(out).append(h('p', { class: 'errors' }, errorText(err)));
        } finally {
          ask.disabled = false;
        }
      },
    },
    'Check this change',
  );
  return h(
    'div',
    {},
    h('h3', {}, 'Something changed? Say it in plain words'),
    h('label', { for: 'change-event' }, 'Which event'),
    pick,
    h('label', { for: 'change-text' }, 'What changed'),
    text,
    h('div', { class: 'row' }, ask),
    out,
  );
}

export function renderOverview(root: HTMLElement, ctx: Ctx): void {
  const { season, plan, cal, fixes } = ctx;
  clear(root).append(
    h('div', { class: `alert ${cal.shortfall ? 'bad' : 'good'}`, role: 'status' }, cashHeadline(cal)),
    h(
      'div',
      { class: 'card' },
      h('h3', {}, 'Family cash across the season'),
      chart(cal),
      monthTable(cal, plan),
      h(
        'p',
        { class: 'small' },
        `Opening ${formatINR(season.startBalance)} on ${formatDate(season.startDate)}, ${season.incomes.length} income date(s), ${plan.payments.length} payments.`,
      ),
    ),
    h(
      'div',
      { class: 'cols' },
      h(
        'div',
        { class: 'card' },
        fixesPanel(fixes, ctx.applyFix),
        !fixes.length &&
          h(
            'p',
            {},
            cal.shortfall
              ? 'No single fix closes this. Try a smaller budget with the change box.'
              : 'No gap to fix. Use "Test a bad day" to see how safe this is.',
          ),
      ),
      h('div', { class: 'card' }, scenariosPanel(season)),
      h('div', { class: 'card' }, changePanel(season, ctx)),
      h('div', { class: 'card' }, explainPanel(ctx)),
    ),
  );
}
