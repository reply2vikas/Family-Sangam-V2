// Two Gemini-powered cards per event: read a vendor quote, and draft a message.

import { h, clear } from './h.ts';
import { formatINR } from '../../shared/money.ts';
import { KINDS, LANGUAGES } from '../../shared/message.ts';
import type { MessageKind } from '../../shared/message.ts';
import type { PlannedEvent } from '../../shared/types.ts';
import { errorText } from './context.ts';
import type { Ctx } from './context.ts';

const sourceBadge = (source: string): HTMLSpanElement =>
  h(
    'span',
    { class: 'badge ai' },
    source === 'gemini' ? 'read by Gemini' : source === 'offline-reader' ? 'read by the offline reader' : source,
  );

function list(title: string, items: string[]): HTMLDivElement | null {
  return items.length
    ? h(
        'div',
        {},
        h('strong', {}, title),
        h(
          'ul',
          {},
          items.map((i) => h('li', {}, i)),
        ),
      )
    : null;
}

export function quoteCard(ev: PlannedEvent, ctx: Ctx): HTMLDivElement {
  const lines = ev.lines.filter((l) => l.vendor && !l.trimmed);
  const pick = h(
    'select',
    { id: `qline-${ev.id}` },
    lines.map((l) => h('option', { value: l.id }, `${l.vendor}: ${l.label}`)),
  );
  const text = h('textarea', {
    id: `qtext-${ev.id}`,
    rows: 4,
    maxlength: 2500,
    placeholder: 'Paste the quote you received on WhatsApp or email…',
  });
  const out = h('div', { 'aria-live': 'polite' });
  const go = h(
    'button',
    {
      type: 'button',
      class: 'primary',
      onclick: async () => {
        const line = lines.find((l) => l.id === pick.value);
        if (!line) return;
        go.disabled = true;
        clear(out).append(h('p', { class: 'small' }, 'Reading the quote…'));
        try {
          const r = await ctx.readQuote({ text: text.value, planned: line.amount, lineLabel: line.label });
          const q = r.quote;
          clear(out).append(
            h(
              'div',
              { class: 'scenario' },
              h('strong', {}, q.vendorName || 'Quote'),
              sourceBadge(r.source),
              h('p', {}, r.comparison ? r.comparison.text : formatINR(q.total)),
              q.advance && h('p', { class: 'small' }, `Advance asked: ${formatINR(q.advance)}`),
              list('Included', q.inclusions),
              list('Not included', q.exclusions),
              q.redFlags.length
                ? h(
                    'div',
                    {},
                    h('strong', {}, 'Check before you pay'),
                    h(
                      'ul',
                      {},
                      q.redFlags.map((f) => h('li', {}, f)),
                    ),
                  )
                : null,
              q.refundTerms && h('p', { class: 'small' }, `Refund terms: ${q.refundTerms}`),
              h(
                'button',
                { type: 'button', class: 'ghost', onclick: () => ctx.setOverride(ev.id, line.id, q.total) },
                'Use this price in my budget',
              ),
            ),
          );
        } catch (err) {
          clear(out).append(h('p', { class: 'errors' }, errorText(err)));
        } finally {
          go.disabled = false;
        }
      },
    },
    'Read this quote',
  );
  return h(
    'div',
    { class: 'card no-print' },
    h('h3', {}, 'Compare a vendor quote'),
    h(
      'p',
      { class: 'small' },
      'Paste a quote. Gemini pulls out the price, what is and is not included, and risks. The comparison with your plan is done by code.',
    ),
    h('label', { for: pick.id }, 'Which item is it for?'),
    pick,
    h('label', { for: text.id }, 'Quote text'),
    text,
    h('div', { class: 'row' }, go),
    out,
  );
}

export function messageCard(ev: PlannedEvent, ctx: Ctx): HTMLDivElement {
  const kind = h(
    'select',
    { id: `mk-${ev.id}` },
    Object.entries(KINDS).map(([k, v]) => h('option', { value: k }, v)),
  );
  const lang = h(
    'select',
    { id: `ml-${ev.id}` },
    LANGUAGES.map((l) => h('option', { value: l }, l)),
  );
  const vendor = h('input', { id: `mv-${ev.id}`, maxlength: 40, placeholder: 'Vendor name (for vendor messages)' });
  const note = h('input', {
    id: `mn-${ev.id}`,
    maxlength: 300,
    placeholder: 'Anything to include, e.g. dress code, parking',
  });
  const out = h('div', { 'aria-live': 'polite' });
  const go = h(
    'button',
    {
      type: 'button',
      class: 'primary',
      onclick: async () => {
        go.disabled = true;
        clear(out).append(h('p', { class: 'small' }, 'Writing…'));
        try {
          const r = await ctx.draftMessage({
            kind: kind.value as MessageKind,
            language: lang.value,
            vendor: vendor.value,
            note: note.value,
            event: { name: ev.name, type: ev.type, date: ev.date },
          });
          const box = h('textarea', { id: `mo-${ev.id}`, rows: 6, 'aria-label': 'Drafted message' }, r.body);
          box.value = r.subject ? `${r.subject}\n\n${r.body}` : r.body;
          clear(out).append(
            h(
              'p',
              { class: 'small' },
              h(
                'span',
                { class: 'badge ai' },
                r.source === 'gemini' ? `written by Gemini in ${r.language}` : 'built-in template',
              ),
              r.note ? ` ${r.note}` : '',
            ),
            box,
            h(
              'div',
              { class: 'row' },
              h('button', { type: 'button', class: 'ghost', onclick: () => ctx.copy(box.value) }, 'Copy message'),
            ),
          );
        } catch (err) {
          clear(out).append(h('p', { class: 'errors' }, errorText(err)));
        } finally {
          go.disabled = false;
        }
      },
    },
    'Write the message',
  );
  return h(
    'div',
    { class: 'card no-print' },
    h('h3', {}, 'Write a message'),
    h('label', { for: kind.id }, 'What for'),
    kind,
    h('label', { for: lang.id }, 'Language'),
    lang,
    h('label', { for: vendor.id }, 'Vendor (optional)'),
    vendor,
    h('label', { for: note.id }, 'Extra note (optional)'),
    note,
    h('div', { class: 'row' }, go),
    out,
  );
}
