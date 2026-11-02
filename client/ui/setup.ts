// The ask-first setup form: opening money, income dates and events.

import { h, clear, byId } from './h.ts';
import { TYPE_IDS, EVENT_TYPES } from '../../shared/templates.ts';
import type { CelebrationEvent, Income } from '../../shared/types.ts';

/** What the form holds before validation: numbers may be NaN, text may be empty. */
export type FormRow = Record<string, string | number>;

export interface FormSeason {
  startDate: string;
  startBalance: number | string;
  incomes: Partial<Income>[];
  events: Partial<CelebrationEvent>[];
}

const input = (id: string): HTMLInputElement => byId<HTMLInputElement>(id);

function removeButton(row: HTMLElement, label: string): HTMLButtonElement {
  return h(
    'button',
    { type: 'button', class: 'danger', 'aria-label': `Remove ${label}`, onclick: () => row.remove() },
    'Remove',
  );
}

let counter = 0;
const uid = (p: string): string => `${p}-${(counter += 1)}`;

export function addIncomeRow(v: Partial<Income> = {}): void {
  const [a, b, c] = [uid('il'), uid('id'), uid('ia')];
  const row = h(
    'div',
    { class: 'grid-row', 'data-row': 'income' },
    h(
      'div',
      {},
      h('label', { for: a }, 'What is it'),
      h('input', { id: a, 'data-k': 'label', value: v.label ?? '', maxlength: 60, placeholder: 'Salary' }),
    ),
    h(
      'div',
      {},
      h('label', { for: b }, 'Arrives on'),
      h('input', { id: b, 'data-k': 'date', type: 'date', value: v.date ?? '' }),
    ),
    h(
      'div',
      {},
      h('label', { for: c }, 'Amount (₹)'),
      h('input', {
        id: c,
        'data-k': 'amount',
        type: 'number',
        min: 1,
        step: 1000,
        inputmode: 'numeric',
        value: v.amount ?? '',
      }),
    ),
  );
  row.append(removeButton(row, 'this income'));
  byId('incomes').append(row);
}

export function addEventRow(v: Partial<CelebrationEvent> = {}): void {
  const [id0, id1, id2, id3, id4] = Array.from({ length: 5 }, () => uid('ev'));
  const row = h(
    'div',
    { class: 'grid-row', 'data-row': 'event' },
    h(
      'div',
      {},
      h('label', { for: id0 }, 'Type'),
      h(
        'select',
        { id: id0, 'data-k': 'type' },
        TYPE_IDS.map((t) => h('option', { value: t, selected: v.type === t }, EVENT_TYPES[t].label)),
      ),
    ),
    h(
      'div',
      {},
      h('label', { for: id1 }, 'Name'),
      h('input', { id: id1, 'data-k': 'name', value: v.name ?? '', maxlength: 60, placeholder: "Riya's wedding" }),
    ),
    h(
      'div',
      {},
      h('label', { for: id2 }, 'Date'),
      h('input', { id: id2, 'data-k': 'date', type: 'date', value: v.date ?? '' }),
    ),
    h(
      'div',
      {},
      h('label', { for: id3 }, 'Guests'),
      h('input', {
        id: id3,
        'data-k': 'guests',
        type: 'number',
        min: 1,
        max: 5000,
        inputmode: 'numeric',
        value: v.guests ?? '',
      }),
    ),
    h(
      'div',
      {},
      h('label', { for: id4 }, 'Budget (₹)'),
      h('input', {
        id: id4,
        'data-k': 'budget',
        type: 'number',
        min: 1000,
        step: 5000,
        inputmode: 'numeric',
        value: v.budget ?? '',
      }),
    ),
  );
  row.append(removeButton(row, 'this event'));
  byId('events').append(row);
}

function readRow(row: Element): FormRow {
  const out: FormRow = {};
  for (const el of row.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]')) {
    const k = el.dataset.k;
    if (!k) continue;
    out[k] = el.type === 'number' ? (el.value === '' ? NaN : Number(el.value)) : el.value;
  }
  return out;
}

/** Read the form into a raw season object (validated later by normalizeSeason). */
export function readForm(): Record<string, unknown> {
  const balance = input('s-balance').value;
  return {
    startDate: input('s-start').value,
    startBalance: balance === '' ? NaN : Number(balance),
    incomes: [...document.querySelectorAll('[data-row="income"]')].map(readRow),
    events: [...document.querySelectorAll('[data-row="event"]')].map(readRow),
  };
}

export function fillForm(season: FormSeason): void {
  input('s-start').value = season.startDate;
  input('s-balance').value = String(season.startBalance);
  clear(byId('incomes'));
  clear(byId('events'));
  season.incomes.forEach((i) => addIncomeRow(i));
  season.events.forEach((e) => addEventRow(e));
}

export function showErrors(errors: string[]): void {
  const list = clear(byId('errors'));
  errors.forEach((e) => list.append(h('li', {}, e)));
}
