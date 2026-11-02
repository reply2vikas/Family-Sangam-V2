import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkHealth, resetHealth } from '../server/health.ts';
import { resetCooldowns } from '../server/gemini.ts';
import healthHandler from '../api/health.ts';
import { fakeRes, reply, failure } from './helpers.ts';
import type { FetchLike } from '../server/gemini.ts';

beforeEach(() => {
  resetHealth();
  resetCooldowns();
});
const good: FetchLike = async () => reply({ ok: true });
const KEY = `AIza${'a'.repeat(35)}`;

test('health: no key is reported plainly', async () => {
  const r = await checkHealth({});
  assert.equal(r.keyPresent, false);
  assert.match(r.gemini, /not set/);
});
test('health: a working key is reported as working and the key itself is never returned', async () => {
  const r = await checkHealth({ GEMINI_API_KEY: KEY }, { fetchImpl: good });
  assert.equal(r.gemini, 'working');
  assert.ok(r.keyLooksValid);
  assert.ok(!JSON.stringify(r).includes(KEY));
});
test('health: a failing key shows the reason, and a malformed key is flagged', async () => {
  const r = await checkHealth({ GEMINI_API_KEY: 'short' }, { fetchImpl: async () => failure(403) });
  assert.equal(r.keyLooksValid, false);
  assert.equal(r.gemini, 'failed: status 403');
});
test('health: odd answers are described and results are cached for a minute', async () => {
  let calls = 0;
  const odd: FetchLike = async () => {
    calls += 1;
    return reply({ ok: false });
  };
  const a = await checkHealth({ GEMINI_API_KEY: KEY }, { fetchImpl: odd, now: () => 1000 });
  assert.equal(a.gemini, 'answered but unexpected');
  const b = await checkHealth({ GEMINI_API_KEY: KEY }, { fetchImpl: odd, now: () => 30000 });
  assert.equal(b.cached, true);
  assert.equal(calls, 1);
  await checkHealth({ GEMINI_API_KEY: KEY }, { fetchImpl: odd, now: () => 90000 });
  assert.equal(calls, 2);
});
test('health route: GET works, other methods are refused', async () => {
  const bad = fakeRes();
  await healthHandler({ method: 'POST' }, bad);
  assert.equal(bad.statusCode, 405);
  const ok = fakeRes();
  await healthHandler({ method: 'GET' }, ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(JSON.parse(ok.body).keyPresent, Boolean(process.env.GEMINI_API_KEY));
});
