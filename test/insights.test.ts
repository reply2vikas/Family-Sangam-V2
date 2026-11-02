import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { verifyNumbers, buildFacts, offlineExplain, cleanRsvp, offlineRsvp, totalRsvp } from '../shared/insights.ts';
import { runExplain, runRsvp } from '../server/more.ts';
import { resetCooldowns } from '../server/gemini.ts';
import { resetRateLimit } from '../server/http.ts';
import { buildPlan } from '../shared/plan.ts';
import { cashCalendar } from '../shared/cash.ts';
import { suggestFixes } from '../shared/fixes.ts';
import { sampleSeason } from '../shared/sample.ts';
import { randomSeason, TODAY } from './helpers.ts';
import { answering as answer, failure, KEY, hasStatus, recording } from './helpers.ts';
import type { FetchLike } from '../server/gemini.ts';

beforeEach(() => {
  resetCooldowns();
  resetRateLimit();
});
const down: FetchLike = async () => failure(503);

const allowedBig = [101, 500, 1234, 9999, 45000, 70000, 150000, 1500000, 6818, 220000, 1050000, 99999999];
for (const n of allowedBig) {
  const formatted = n.toLocaleString('en-IN');
  test(`verifyNumbers accepts ${formatted} when it is in the facts`, () =>
    assert.ok(verifyNumbers(`It costs ₹${formatted} in total`, new Set([n])).ok));
  test(`verifyNumbers rejects ${formatted} when it is NOT in the facts`, () =>
    assert.deepEqual(verifyNumbers(`It costs ₹${formatted} in total`, new Set([n + 1])).unknown, [n]));
}
const alwaysOk = [0, 1, 7, 31, 50, 99, 100, 2026, 2027, 2100, 2020];
for (const n of alwaysOk)
  test(`verifyNumbers lets ${n} through (small number, date or year)`, () =>
    assert.ok(verifyNumbers(`on ${n}`, new Set()).ok));
const alwaysBad = [101, 2019, 2101, 999, 12345];
for (const n of alwaysBad)
  test(`verifyNumbers does not let ${n} through unless given`, () =>
    assert.ok(!verifyNumbers(`about ${n}`, new Set()).ok));
test('verifyNumbers handles no numbers, many numbers and mixed text', () => {
  assert.ok(verifyNumbers('No digits here', new Set()).ok);
  assert.deepEqual(verifyNumbers('₹5,00,000 and ₹7,00,000 and 12 guests', new Set([500000])).unknown, [700000]);
});

const rsvpCases = [
  ['Amit: yes', 'yes', 1],
  ['Amit: yes coming with 2', 'yes', 3],
  ['Amit: yes +3', 'yes', 4],
  ['Amit: confirmed plus 1', 'yes', 2],
  ['Amit: count us in, with 4', 'yes', 5],
  ['Raj: maybe', 'maybe', 1],
  ['Raj: not sure yet', 'maybe', 1],
  ['Raj: will try to come', 'maybe', 1],
  ['Raj: let you know later', 'maybe', 1],
  ['Raj: shayad', 'maybe', 1],
  ['Sunita: sorry cant make it', 'no', 1],
  ['Sunita: no', 'no', 1],
  ['Sunita: unable to attend', 'no', 1],
  ['Sunita: nahi aa payenge', 'no', 1],
  ["Sunita: can't come", 'no', 1],
  ['Pooja: haan', 'yes', 1],
  ['Pooja: aayenge', 'yes', 1],
  ['Pooja: sure!', 'yes', 1],
  ['Pooja: will be there', 'yes', 1],
  ['Pooja: yeah', 'yes', 1],
  ['Neha: hmm', 'unclear', 1],
  ['Neha: 👍', 'unclear', 1],
  ['Neha: ok', 'unclear', 1],
  ['Neha: thanks for the invite', 'unclear', 1],
  ['yes we will come', 'yes', 1],
  ['no problem, will come', 'yes', 1],
  ['maybe, with 2', 'maybe', 3],
  ['Dev: yes with 30', 'yes', 20],
  ['Dev: yes and 1', 'yes', 2],
  ['Dev: YES', 'yes', 1],
];
rsvpCases.forEach(([line, response, party], i) =>
  test(`RSVP case ${i + 1}: "${line}" -> ${response}, party ${party}`, () => {
    const r = offlineRsvp(line).replies[0];
    assert.equal(r.response, response);
    assert.equal(r.party, party);
  }),
);
test('offlineRsvp: names, blank lines, totals and limits', () => {
  const out = offlineRsvp('Amit: yes with 2\n\nSunita: no\nRaj: maybe\nthanks everyone');
  assert.deepEqual(
    out.replies.map((r) => r.name),
    ['Amit', 'Sunita', 'Raj', 'Guest'],
  );
  assert.deepEqual(out.totals, { yes: 3, no: 1, maybe: 1, unclear: 1, repliesCounted: 4 });
  assert.equal(offlineRsvp('x\n'.repeat(500)).replies.length, 200);
  assert.deepEqual(offlineRsvp(undefined).replies, []);
});
test('cleanRsvp validates responses and party sizes; totals are computed by code', () => {
  const out = cleanRsvp({
    replies: [
      { name: '<b>A</b>', response: 'yes', party: 3 },
      { response: 'definitely', party: 1 },
      { name: 'C', response: 'no', party: 5 },
      { name: 'D', response: 'yes', party: 99 },
      { name: 'E', response: 'maybe', party: 2.5 },
    ],
  });
  assert.deepEqual(
    out.replies.map((r) => r.response),
    ['yes', 'unclear', 'no', 'yes', 'maybe'],
  );
  assert.deepEqual(
    out.replies.map((r) => r.party),
    [3, 1, 5, 1, 1],
  );
  assert.deepEqual(out.totals, { yes: 4, no: 1, maybe: 1, unclear: 1, repliesCounted: 5 });
  assert.ok(!out.replies[0].name.includes('<'));
  assert.deepEqual(cleanRsvp(null).replies, []);
  assert.equal(totalRsvp([]).repliesCounted, 0);
});

test('buildFacts mentions every event and the cash result; numbers are collected', () => {
  const s = sampleSeason(TODAY);
  const plan = buildPlan(s);
  const cal = cashCalendar(s, plan);
  const facts = buildFacts(plan, cal, suggestFixes(s));
  assert.equal(facts.lines.filter((l) => l.includes('guests')).length, 3);
  assert.ok(facts.lines.some((l) => /runs short/.test(l)));
  assert.ok(facts.numbers.has(70000) && facts.numbers.has(1500000));
  assert.ok(facts.lines.some((l) => l.startsWith('Possible fix')));
  const rich = buildFacts(plan, { ...cal, shortfall: null }, []);
  assert.ok(rich.lines.some((l) => /stays above zero/.test(l)));
});
for (let seed = 1; seed <= 100; seed += 1) {
  test(`the code-written summary passes its own number check (random season ${seed})`, () => {
    const s = randomSeason(seed);
    const plan = buildPlan(s);
    const cal = cashCalendar(s, plan);
    const facts = buildFacts(plan, cal, suggestFixes(s));
    assert.ok(
      verifyNumbers(offlineExplain(facts), facts.numbers).ok,
      JSON.stringify(verifyNumbers(offlineExplain(facts), facts.numbers).unknown),
    );
  });
}

test('runExplain: a clean Gemini summary is used', async () => {
  const r = await runExplain({ season: sampleSeason(TODAY), language: 'Hindi' }, KEY, {
    fetchImpl: answer({ summary: 'Riya ki shaadi ka budget ₹15,00,000 hai. Cash 30 Jan ko kam padega.' }),
  });
  assert.equal(r.source, 'gemini');
  assert.equal(r.language, 'Hindi');
});
test('runExplain: a summary with an invented number is rejected and facts are shown instead', async () => {
  const r = await runExplain({ season: sampleSeason(TODAY) }, KEY, {
    fetchImpl: answer({ summary: 'You will save ₹3,45,678 if you cut the decor.' }),
  });
  assert.equal(r.source, 'offline-summary');
  assert.match(r.note ?? '', /not in your plan/);
  assert.ok(r.summary.includes('Riya'));
});
test('runExplain: outage, bad language and bad season', async () => {
  const r = await runExplain({ season: sampleSeason(TODAY), language: 'Klingon' }, KEY, { fetchImpl: down });
  assert.equal(r.source, 'offline-summary');
  assert.match(r.note ?? '', /not reachable/);
  await assert.rejects(runExplain({ season: null }, KEY), hasStatus(400));
});
test('runRsvp: Gemini rows are cleaned and totalled; empty answer falls back; input is checked', async () => {
  const r = await runRsvp({ text: 'Amit: yes with 2\nSunita: no' }, KEY, {
    fetchImpl: answer({
      replies: [
        { name: 'Amit', response: 'yes', party: 3 },
        { name: 'Sunita', response: 'no', party: 1 },
      ],
    }),
  });
  assert.equal(r.source, 'gemini');
  assert.equal(r.totals.yes, 3);
  const fb = await runRsvp({ text: 'Amit: yes with 2' }, KEY, { fetchImpl: answer({ replies: [] }) });
  assert.equal(fb.source, 'offline-reader');
  assert.equal(fb.totals.yes, 3);
  assert.equal((await runRsvp({ text: 'Amit: no' }, {}, {})).totals.no, 1);
  await assert.rejects(runRsvp({ text: ' ' }, KEY), hasStatus(400));
});

test('runExplain tells the model the events are still in the future', async () => {
  const { fetchImpl, prompt } = recording({ summary: 'Riya ki shaadi 30 Jan ko hogi.' });
  await runExplain({ season: sampleSeason(TODAY), language: 'Hindi' }, KEY, { fetchImpl });
  assert.match(prompt(), /still in the future/);
  assert.match(prompt(), /never say an event happened/);
});
