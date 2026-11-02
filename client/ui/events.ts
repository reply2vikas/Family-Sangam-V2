// One section per event: Budget, Timeline, Vendor checklist and Personalised ideas.

import { h, clear } from './h.ts';
import { formatINR, pct } from '../../shared/money.ts';
import { formatDate } from '../../shared/dates.ts';
import { taskStatuses } from '../../shared/plan.ts';
import { VENDOR_STATUS } from '../../shared/progress.ts';
import type { VendorStatus } from '../../shared/progress.ts';
import { EVENT_TYPES } from '../../shared/templates.ts';
import type { Payment, PlannedEvent } from '../../shared/types.ts';
import { quoteCard, messageCard } from './tools.ts';
import { helpersCard } from './helpers.ts';
import { ideasCard } from './ideas.ts';
import type { Ctx } from './context.ts';
import type { Child } from './h.ts';

function budgetCard(ev: PlannedEvent, ctx: Ctx): HTMLDivElement {
  const rows = ev.lines.map((l) => {
    const id = `amt-${ev.id}-${l.id}`;
    const amount = h('input', {
      id,
      type: 'number',
      min: 0,
      step: 1000,
      value: l.amount,
      'aria-label': `${l.label} amount in rupees`,
    });
    amount.addEventListener('change', () =>
      ctx.setOverride(ev.id, l.id, amount.value === '' ? null : Number(amount.value)),
    );
    return h(
      'tr',
      {},
      h(
        'td',
        {},
        h('label', { for: id, class: 'sr' }, `${l.label} amount`),
        l.label,
        l.must && h('span', { class: 'small' }, ' (must-have)'),
        l.trimmed && h('span', { class: 'badge late' }, 'skipped'),
      ),
      h('td', { class: 'num' }, amount),
      h(
        'td',
        {},
        h(
          'span',
          { class: `badge ${l.source === 'you' ? 'you' : 'est'}` },
          l.source === 'you' ? 'you entered' : 'estimate',
        ),
      ),
      h('td', { class: 'num' }, `${pct(l.amount, ev.budget)}%`),
    );
  });
  return h(
    'div',
    { class: 'card' },
    h('h3', {}, 'Budget'),
    h(
      'p',
      { class: 'small' },
      `${formatINR(ev.budget)} for ${ev.guests} guests, about ${formatINR(ev.perGuest)} per guest. Type over any amount and the rest re-balance.`,
    ),
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        {},
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { scope: 'col' }, 'Item'),
            h('th', { scope: 'col', class: 'num' }, 'Amount (₹)'),
            h('th', { scope: 'col' }, 'Source'),
            h('th', { scope: 'col', class: 'num' }, 'Share'),
          ),
        ),
        h('tbody', {}, rows),
      ),
    ),
    ev.lines.some((l) => l.source === 'you') &&
      h(
        'button',
        { type: 'button', class: 'ghost', onclick: () => ctx.setOverride(ev.id, null, null) },
        'Reset to estimates',
      ),
  );
}

function timelineCard(ev: PlannedEvent, ctx: Ctx): HTMLDivElement {
  const names = new Map(ev.tasks.map((t) => [t.key, t.label]));
  const items = taskStatuses(ev.tasks, ctx.progress.done, ctx.today).sort((a, b) => a.due.localeCompare(b.due));
  return h(
    'div',
    { class: 'card' },
    h('h3', {}, 'Timeline'),
    h(
      'ul',
      { class: 'tasks' },
      items.map((t) => {
        const id = `task-${t.key.replace(':', '-')}`;
        return h(
          'li',
          {},
          h('input', { id, type: 'checkbox', checked: t.finished, onchange: () => ctx.toggleTask(t.key) }),
          h(
            'label',
            { for: id },
            `${t.label}, by ${formatDate(t.due)}`,
            t.late && h('span', { class: 'badge late' }, 'late'),
            t.atRisk &&
              h('span', { class: 'badge wait' }, `waiting on: ${t.waitingOn.map((k) => names.get(k)).join(', ')}`),
          ),
        );
      }),
    ),
  );
}

function firstPayment(p: Payment): Child {
  if (p.overdue)
    return [
      `${formatINR(p.amount)} `,
      h('span', { class: 'badge late' }, 'already due'),
      ` (planned for ${formatDate(p.original)}). Check this with the vendor now.`,
    ];
  return `${formatINR(p.amount)} on ${formatDate(p.date)}${p.refundableUntil ? `, refundable until ${formatDate(p.refundableUntil)}` : ''}`;
}

function vendorCard(ev: PlannedEvent, ctx: Ctx): HTMLDivElement {
  const lines = ev.lines.filter((l) => l.vendor && !l.trimmed);
  const rows = lines.map((l) => {
    const saved = ctx.progress.vendors[l.key] ?? { status: VENDOR_STATUS[0], name: '' };
    const adv = ev.payments.find((p) => p.lineKey === l.key && p.kind === 'advance');
    const first = adv ?? ev.payments.find((p) => p.lineKey === l.key);
    const sid = `vs-${ev.id}-${l.id}`;
    const nid = `vn-${ev.id}-${l.id}`;
    const name = h('input', { id: nid, value: saved.name, maxlength: 60, placeholder: 'Name' });
    name.addEventListener('change', () => ctx.setVendor(l.key, { name: name.value }));
    const status = h(
      'select',
      { id: sid },
      VENDOR_STATUS.map((s) => h('option', { value: s, selected: s === saved.status }, s)),
    );
    status.addEventListener('change', () => ctx.setVendor(l.key, { status: status.value as VendorStatus }));
    return h(
      'tr',
      {},
      h('td', {}, l.vendor),
      h('td', {}, h('label', { for: nid, class: 'sr' }, `${l.vendor} name`), name),
      h('td', {}, h('label', { for: sid, class: 'sr' }, `${l.vendor} status`), status),
      h('td', {}, first ? firstPayment(first) : 'No advance'),
    );
  });
  return h(
    'div',
    { class: 'card' },
    h('h3', {}, 'Vendor checklist'),
    h(
      'p',
      { class: 'small' },
      'Dates and refund windows are typical assumptions. Confirm each one in your written quote.',
    ),
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        {},
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            ['Vendor', 'Name', 'Status', 'First payment'].map((c) => h('th', { scope: 'col' }, c)),
          ),
        ),
        h('tbody', {}, rows),
      ),
    ),
  );
}

export function renderEvents(root: HTMLElement, ctx: Ctx): void {
  clear(root).append(
    ...ctx.plan.events.map((ev) =>
      h(
        'section',
        { 'aria-labelledby': `h-${ev.id}` },
        h(
          'div',
          { class: 'event-head' },
          h('h2', { id: `h-${ev.id}` }, ev.name),
          h('p', { class: 'small' }, `${EVENT_TYPES[ev.type].label} on ${formatDate(ev.date)}, ${ev.guests} guests`),
        ),
        h(
          'div',
          { class: 'cols wide' },
          budgetCard(ev, ctx),
          timelineCard(ev, ctx),
          vendorCard(ev, ctx),
          ideasCard(ev, ctx),
          quoteCard(ev, ctx),
          messageCard(ev, ctx),
          helpersCard(ev, ctx),
        ),
      ),
    ),
  );
}
