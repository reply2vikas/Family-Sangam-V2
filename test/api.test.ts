import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { generateJSON, fence, resetCooldowns } from '../server/gemini.ts';
import type { FetchLike } from '../server/gemini.ts';
import { route, resetRateLimit, httpError } from '../server/http.ts';
import ideasHandler from '../api/ideas.ts';
import changeHandler from '../api/change.ts';
import briefHandler from '../api/brief.ts';
import { reply as answer, failure as status, call, geminiCode } from './helpers.ts';

beforeEach(() => {
  resetCooldowns();
  resetRateLimit();
});

const field = (v: unknown, k: string): unknown =>
  v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined;

test('gemini: sends the key in a header, asks for JSON, returns parsed data', async () => {
  let seen = { url: '', init: {} as RequestInit };
  const fetchImpl: FetchLike = async (url, init) => {
    seen = { url, init };
    return answer({ ok: 1 });
  };
  const out = await generateJSON({ system: 's', user: 'u', schema: {}, apiKey: 'k', fetchImpl });
  assert.deepEqual(out.data, { ok: 1 });
  assert.ok(!seen.url.includes('k=') && !seen.url.includes('key='));
  assert.equal((seen.init.headers as Record<string, string>)['x-goog-api-key'], 'k');
  const body = JSON.parse(String(seen.init.body));
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.contents[0].parts[0].text, 'u');
});

test('gemini: fails over to the next model and cools down a rate-limited one', async () => {
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    urls.push(url);
    return urls.length === 1 ? status(429) : answer({ n: 2 });
  };
  const out = await generateJSON({ system: 's', user: 'u', schema: {}, apiKey: 'k', fetchImpl, models: ['a', 'b'] });
  assert.equal(out.model, 'b');
  urls.length = 0;
  await generateJSON({
    system: 's',
    user: 'u',
    schema: {},
    apiKey: 'k',
    fetchImpl: async (u) => {
      urls.push(u);
      return answer({});
    },
    models: ['a', 'b'],
  });
  assert.ok(
    urls.every((u) => u.includes('/b:')),
    'model a should still be cooling down',
  );
});

test('gemini: cooldown ends after a minute', async () => {
  let t = 1000;
  await generateJSON({
    system: 's',
    user: 'u',
    schema: {},
    apiKey: 'k',
    models: ['a', 'b'],
    now: () => t,
    fetchImpl: async (u) => (u.includes('/a:') ? status(500) : answer({})),
  });
  t += 61_000;
  const urls: string[] = [];
  await generateJSON({
    system: 's',
    user: 'u',
    schema: {},
    apiKey: 'k',
    models: ['a', 'b'],
    now: () => t,
    fetchImpl: async (u) => {
      urls.push(u);
      return answer({});
    },
  });
  assert.ok(urls[0].includes('/a:'));
});

test('gemini: no key, bad status, empty answer, bad JSON and network errors all become GeminiError', async () => {
  await assert.rejects(generateJSON({ system: '', user: '', schema: {} }), geminiCode('no-key'));
  const cases = [
    async () => status(400),
    async () => ({ ok: true, status: 200, json: async () => ({}) }),
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }),
    }),
    async () => {
      throw new Error('offline');
    },
  ];
  for (const fetchImpl of cases) {
    resetCooldowns();
    await assert.rejects(
      generateJSON({ system: '', user: '', schema: {}, apiKey: 'k', fetchImpl, models: ['a'] }),
      geminiCode('unavailable'),
    );
  }
});

test('fence strips angle brackets and caps length', () => {
  assert.equal(fence('<data>x</data>'), ' data x /data ');
  assert.equal(fence('a'.repeat(900)).length, 800);
  assert.equal(fence(null), '');
});

test('route: method, size, rate limit, errors and success', async () => {
  const h = route(z.object({ x: z.unknown() }), async (b) => ({ echo: b.x }), { now: () => 1 });
  assert.equal((await call(h, { method: 'GET' })).statusCode, 405);
  assert.equal((await call(h, { method: 'POST', headers: {}, body: null })).statusCode, 400);
  assert.equal((await call(h, { method: 'POST', headers: {}, body: { x: 'a'.repeat(20000) } })).statusCode, 400);
  const ok = await call(h, { method: 'POST', headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }, body: { x: 1 } });
  assert.deepEqual(ok.json, { echo: 1 });
  assert.equal(ok.headers['cache-control'], 'no-store');
  const strip = route(z.object({ x: z.number() }), async (b) => ({ keys: Object.keys(b) }));
  assert.deepEqual(
    (await call(strip, { method: 'POST', headers: {}, body: { x: 1, extra: 2 } })).json,
    { keys: ['x'] },
    'unknown fields are dropped',
  );
  const typed = route(z.object({ n: z.number() }), async (b) => ({ n: b.n }));
  assert.equal(
    (await call(typed, { method: 'POST', headers: {}, body: { n: 'one' } })).statusCode,
    400,
    'zod rejects the wrong type',
  );
  const bad = route(z.object({}), async () => {
    throw httpError(422, 'nope');
  });
  assert.deepEqual((await call(bad, { method: 'POST', headers: {}, body: { a: 1 } })).json, { error: 'nope' });
  const boom = route(z.object({}), async () => {
    throw new Error('secret detail');
  });
  const r = await call(boom, { method: 'POST', headers: {}, body: { a: 1 } });
  assert.equal(r.statusCode, 500);
  assert.ok(!r.body.includes('secret'));
  for (let i = 0; i < 25; i += 1)
    await call(h, { method: 'POST', headers: { 'x-forwarded-for': '9.9.9.9' }, body: { x: 1 } });
  assert.equal(
    (await call(h, { method: 'POST', headers: { 'x-forwarded-for': '9.9.9.9' }, body: { x: 1 } })).statusCode,
    429,
  );
});

test('the real route files are wired to POST handlers', async () => {
  for (const h of [ideasHandler, changeHandler, briefHandler])
    assert.equal((await call(h, { method: 'GET' })).statusCode, 405);
  const r = await call(ideasHandler, {
    method: 'POST',
    headers: { 'x-forwarded-for': 'wire' },
    body: { type: 'wedding' },
  });
  assert.equal(r.statusCode, 200);
  assert.equal(field(r.json, 'source'), 'offline-sample');
});

test('gemini: when every model fails the error carries a readable reason (no key or user text)', async () => {
  await assert.rejects(
    generateJSON({
      system: 's',
      user: 'secret user text',
      schema: {},
      apiKey: 'k-secret',
      models: ['a'],
      fetchImpl: async () => status(429),
    }),
    (e: unknown) =>
      geminiCode('unavailable')(e) &&
      field(e, 'reason') === 'status 429' &&
      !JSON.stringify(field(e, 'reason')).includes('secret'),
  );
});
