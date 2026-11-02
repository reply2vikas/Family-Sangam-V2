// Tests for the browser-side helpers using a tiny fake DOM, so no browser is needed.
import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { FakeText, installFakeDom, fake, find, has, fire, partialCtx } from './fake-dom.ts';
import { h, clear, field, svgEl } from '../client/ui/h.ts';
import { loadState, saveState, clearState } from '../client/ui/state.ts';
import { postJSON } from '../client/ui/api.ts';
import { helpersCard } from '../client/ui/helpers.ts';
import { sampleSeason } from '../shared/sample.ts';
import { buildPlan } from '../shared/plan.ts';
import type { Season } from '../shared/types.ts';
import { valid } from './helpers.ts';

let restore = (): void => {};
beforeEach(() => {
  restore = installFakeDom();
});
afterEach(() => restore());

test('h builds elements, text nodes and listeners, and skips empty values', () => {
  const click = (): void => {};
  const el = fake(
    h(
      'button',
      { class: 'x', disabled: true, hidden: false, title: null, onclick: click, 'aria-label': 5 },
      'Hi ',
      3,
      null,
      false,
      ['a', h('b', {}, 'b')],
    ),
  );
  assert.equal(el.attrs.class, 'x');
  assert.equal(el.attrs.disabled, '');
  assert.equal(el.attrs['aria-label'], '5');
  assert.ok(!('hidden' in el.attrs) && !('title' in el.attrs));
  assert.equal(el.listeners.click, click);
  assert.equal(el.textContent, 'Hi 3ab');
});

test('h never turns text into markup: angle brackets stay text', () => {
  const el = fake(h('p', {}, '<img src=x onerror=alert(1)>'));
  assert.equal(el.children.length, 1);
  assert.ok(el.children[0] instanceof FakeText);
  assert.equal(el.tag, 'p');
});

test('svgEl creates SVG elements in the SVG namespace; h creates HTML ones', () => {
  const s = fake(svgEl('circle', { r: 5 }));
  assert.equal(s.ns, 'http://www.w3.org/2000/svg');
  assert.equal(fake(svgEl('svg', {})).ns, 'http://www.w3.org/2000/svg');
  assert.equal(fake(h('div', {})).ns, undefined);
  assert.equal(s.attrs.r, '5');
});

test('nested child arrays are flattened at any depth', () => {
  assert.equal(fake(h('p', {}, ['a', ['b', ['c', null]]], 'd')).textContent, 'abcd');
});

test('clear empties an element; field returns a label and an input', () => {
  const el = h('div', {}, 'x');
  assert.equal(fake(clear(el)).children.length, 0);
  const [label, input] = field('Name', 'n1', { type: 'text' });
  assert.equal(fake(label).attrs.for, 'n1');
  assert.equal(fake(input).attrs.id, 'n1');
});

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const data: Record<string, string> = { ...initial };
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
    clear: () => {},
    key: () => null,
    length: 0,
  };
}

test('state: save then load round-trips, and progress is cleaned', () => {
  globalThis.localStorage = fakeStorage();
  saveState({ season: sampleSeason('2026-11-01'), progress: { done: { 'e1:date': true, '??': true }, vendors: {} } });
  const back = loadState();
  assert.equal(back?.season.events.length, 3);
  assert.deepEqual(back?.progress.done, { 'e1:date': true });
  clearState();
  assert.equal(loadState(), null);
});

test('state: corrupt, invalid or unavailable storage never throws', () => {
  globalThis.localStorage = fakeStorage({ 'family-sangam:v1': '{not json' });
  assert.equal(loadState(), null);
  globalThis.localStorage = fakeStorage({ 'family-sangam:v1': JSON.stringify({ season: { startDate: 'bad' } }) });
  assert.equal(loadState(), null);
  const blocked = (): never => {
    throw new Error('blocked');
  };
  globalThis.localStorage = { ...fakeStorage(), getItem: blocked, setItem: blocked, removeItem: blocked };
  assert.equal(loadState(), null);
  assert.doesNotThrow(() => saveState({ season: sampleSeason('2026-11-01'), progress: { done: {}, vendors: {} } }));
  assert.doesNotThrow(() => clearState());
});

test('postJSON: sends JSON, returns data, and turns failures into readable errors', async () => {
  const realFetch = globalThis.fetch;
  const respond = (ok: boolean, json: () => Promise<unknown>): Response => ({ ok, json }) as unknown as Response;
  try {
    let seen: RequestInit = {};
    globalThis.fetch = async (_url, init) => {
      seen = init ?? {};
      return respond(true, async () => ({ ok: 1 }));
    };
    assert.deepEqual(await postJSON('/api/x', { a: 1 }), { ok: 1 });
    assert.equal(seen.method, 'POST');
    assert.equal((seen.headers as Record<string, string>)['content-type'], 'application/json');
    assert.equal(seen.body, '{"a":1}');
    globalThis.fetch = async () => respond(false, async () => ({ error: 'Too many requests.' }));
    await assert.rejects(postJSON('/api/x', {}), /Too many requests/);
    globalThis.fetch = async () =>
      respond(false, async () => {
        throw new Error('html');
      });
    await assert.rejects(postJSON('/api/x', {}), /did not work/);
    globalThis.fetch = async () => {
      throw new Error('offline');
    };
    await assert.rejects(postJSON('/api/x', {}), /Could not reach the server/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

const plannedFirst = (season: Season) => {
  const ev = buildPlan(season).events[0];
  assert.ok(ev);
  return ev;
};

test('More help card: a result with no confirmed guests shows no stray "false" and no button', async () => {
  const season = valid(sampleSeason('2026-11-01'));
  const answer = {
    source: 'gemini',
    replies: [{ name: 'Guest', response: 'unclear', party: 1 }],
    totals: { yes: 0, maybe: 0, no: 0, unclear: 1, repliesCounted: 1 },
  };
  const ctx = partialCtx({ season, commit: () => {}, ask: async <T>() => answer as T });
  const card = helpersCard(plannedFirst(season), ctx);
  find(card, (e) => e.tag === 'select').value = 'rsvp';
  find(card, (e) => e.tag === 'textarea').value = 'hello';
  await fire(find(card, (e) => e.tag === 'button'));
  const text = fake(card).textContent;
  assert.match(text, /Unclear: 1/);
  assert.ok(!/false|undefined|null/.test(text), text);
  assert.ok(!has(card, (e) => e.tag === 'button' && /Set guests/.test(e.textContent)));
});

test('More help card: with confirmed guests the "Set guests" button appears and applies the count', async () => {
  const season = valid(sampleSeason('2026-11-01'));
  let committed: Season | null = null;
  const answer = { source: 'gemini', replies: [], totals: { yes: 3, maybe: 0, no: 0, unclear: 0, repliesCounted: 0 } };
  const ctx = partialCtx({
    season,
    commit: (next) => {
      committed = next;
    },
    ask: async <T>() => answer as T,
  });
  const card = helpersCard(plannedFirst(season), ctx);
  find(card, (e) => e.tag === 'select').value = 'rsvp';
  find(card, (e) => e.tag === 'textarea').value = 'Amit: yes';
  await fire(find(card, (e) => e.tag === 'button'));
  await fire(find(card, (e) => e.tag === 'button' && /Set guests to 3/.test(e.textContent)));
  assert.equal((committed as Season | null)?.events[0]?.guests, 3);
});

test('More help card: RSVP without pasted replies asks for them and sends nothing', async () => {
  const season = valid(sampleSeason('2026-11-01'));
  let asked = 0;
  const ctx = partialCtx({
    season,
    commit: () => {},
    ask: async <T>() => {
      asked += 1;
      return {} as T;
    },
  });
  const card = helpersCard(plannedFirst(season), ctx);
  find(card, (e) => e.tag === 'select').value = 'rsvp';
  await fire(find(card, (e) => e.tag === 'button'));
  assert.equal(asked, 0);
  assert.match(fake(card).textContent, /Paste the replies first/);
});
