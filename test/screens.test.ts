// Integration tests: render the real screens (overview and event cards) with a tiny fake DOM.
import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, fake, fakeRoot, find, walk, fire } from './fake-dom.ts';
import { renderOverview } from '../client/ui/overview.ts';
import { renderEvents } from '../client/ui/events.ts';
import type { Ctx } from '../client/ui/context.ts';
import { sampleSeason } from '../shared/sample.ts';
import { buildPlan } from '../shared/plan.ts';
import { cashCalendar } from '../shared/cash.ts';
import { suggestFixes } from '../shared/fixes.ts';
import { applyChange } from '../shared/change.ts';
import type { Season } from '../shared/types.ts';
import type { ChangeResult } from '../server/tasks.ts';
import { TODAY } from './helpers.ts';

let restore = (): void => {};
beforeEach(() => {
  restore = installFakeDom();
});
afterEach(() => restore());

type Call = [string, ...unknown[]];

const unused = async (): Promise<never> => {
  throw new Error('not used in this test');
};

function context(season: Season, overrides: Partial<Ctx> = {}): { ctx: Ctx; calls: Call[] } {
  const plan = buildPlan(season);
  const calls: Call[] = [];
  const ctx: Ctx = {
    season,
    plan,
    today: TODAY,
    progress: { done: {}, vendors: {} },
    ideaCache: {},
    cal: cashCalendar(season, plan),
    fixes: suggestFixes(season),
    say: (m) => {
      calls.push(['say', m]);
    },
    applyFix: (f) => {
      calls.push(['fix', f.label]);
    },
    commit: (s, note) => {
      calls.push(['commit', s, note]);
    },
    requestChange: unused,
    fetchIdeas: unused,
    ask: unused,
    readQuote: unused,
    draftMessage: unused,
    copy: async () => {},
    setOverride: (...a) => {
      calls.push(['override', ...a]);
    },
    toggleTask: (k) => {
      calls.push(['task', k]);
    },
    setVendor: () => {},
    ...overrides,
  };
  return { ctx, calls };
}

test('a season with a wedding, a birthday and a community event renders all three event cards', () => {
  const season = sampleSeason(TODAY);
  const root = fakeRoot();
  renderEvents(root, context(season).ctx);
  const text = fake(root).textContent;
  for (const e of season.events) assert.ok(text.includes(e.name), e.name);
  assert.ok(text.includes('Budget') && text.includes('Timeline') && text.includes('Vendor checklist'));
});

test('the overview shows the first short day, a chart with a text label, and a table twin', () => {
  const root = fakeRoot();
  renderOverview(root, context(sampleSeason(TODAY)).ctx);
  const text = fake(root).textContent;
  assert.match(text, /You run short on/);
  assert.ok(text.includes('Show the same information as a table'));
  const svg = find(root, (n) => n.tag === 'svg');
  assert.equal(svg.attrs.role, 'img');
  assert.match(svg.attrs['aria-label'] ?? '', /Cash balance/);
});

test('pressing "Use this fix" hands the chosen fix to the app, and "Test a bad day" changes nothing', async () => {
  const { ctx, calls } = context(sampleSeason(TODAY));
  const root = fakeRoot();
  renderOverview(root, ctx);
  await fire(find(root, (b) => b.tag === 'button' && b.textContent === 'Use this fix'));
  assert.equal(calls.filter((c) => c[0] === 'fix').length, 1);
  const before = JSON.stringify(ctx.season);
  await fire(find(root, (b) => b.tag === 'button' && b.textContent.startsWith('Income arrives')));
  assert.equal(JSON.stringify(ctx.season), before);
  assert.ok(walk(fake(root)).some((n) => n.tag === 'div' && n.textContent.startsWith('Income arrives')));
});

test('a season with no shortfall shows the "no gap" message and no fixes', () => {
  const root = fakeRoot();
  renderOverview(root, context({ ...sampleSeason(TODAY), startBalance: 90_000_000 }).ctx);
  const text = fake(root).textContent;
  assert.ok(!text.includes('You run short'));
  assert.ok(text.includes('No gap to fix'));
});

test('empty changes are refused before any request is sent', async () => {
  let asked = 0;
  const { ctx, calls } = context(sampleSeason(TODAY), {
    requestChange: async () => {
      asked += 1;
      return unused();
    },
  });
  const root = fakeRoot();
  renderOverview(root, ctx);
  find(root, (n) => n.tag === 'textarea').value = '   ';
  await fire(find(root, (n) => n.tag === 'button' && n.textContent === 'Check this change'));
  assert.equal(asked, 0);
  assert.deepEqual(calls.at(-1), ['say', 'Type the change first.']);
});

test('a change read by Gemini is shown back first and applied only after "Apply this change"', async () => {
  const season = sampleSeason(TODAY);
  const answer: ChangeResult = {
    source: 'gemini',
    model: 'm',
    change: { eventId: 'e2', guestsDelta: 10, assumptions: ['Guessed the birthday.'] },
  };
  const { ctx, calls } = context(season, { requestChange: async () => answer });
  const root = fakeRoot();
  renderOverview(root, ctx);
  find(root, (n) => n.tag === 'textarea').value = '10 more for Dadi';
  await fire(find(root, (n) => n.tag === 'button' && n.textContent === 'Check this change'));
  const text = fake(root).textContent;
  assert.match(text, /read by Gemini/);
  assert.match(text, /Assumption: Guessed the birthday/);
  assert.equal(calls.filter((c) => c[0] === 'commit').length, 0, 'nothing is applied before the person confirms');
  await fire(find(root, (n) => n.tag === 'button' && n.textContent === 'Apply this change'));
  const committed = calls.find((c) => c[0] === 'commit')?.[1];
  assert.deepEqual(committed, applyChange(season, answer.change));
});
