// The personalised-ideas card: Gemini ideas for one event, refined with one tap.

import { h, clear } from './h.ts';
import { errorText } from './context.ts';
import type { Ctx } from './context.ts';
import type { PlannedEvent } from '../../shared/types.ts';
import type { IdeasResult } from '../../server/tasks.ts';

const REFINE = ['Cheaper', 'More traditional', 'Good for kids and elders', 'Less to arrange'];

export function ideasCard(ev: PlannedEvent, ctx: Ctx): HTMLDivElement {
  const out = h('div', { 'aria-live': 'polite' });
  const city = h('input', { id: `city-${ev.id}`, maxlength: 60, placeholder: 'City or area' });
  const vibe = h('input', {
    id: `vibe-${ev.id}`,
    maxlength: 300,
    placeholder: 'Simple, traditional, lots of children…',
  });
  const show = (r: IdeasResult): void => {
    out.replaceChildren(
      ...[
        h(
          'p',
          { class: 'small' },
          h('span', { class: 'badge ai' }, r.source === 'gemini' ? 'ideas from Gemini' : 'sample ideas'),
          r.note ? ` ${r.note}` : '',
        ),
        r.ideas.map((i) =>
          h(
            'div',
            { class: 'idea' },
            h('strong', {}, i.title),
            h('p', {}, i.detail),
            i.costNote && h('p', { class: 'small' }, i.costNote),
          ),
        ),
        h(
          'div',
          { class: 'row' },
          REFINE.map((c) =>
            h('button', { type: 'button', class: 'chip ghost', onclick: () => go(c.toLowerCase()) }, c),
          ),
        ),
      ].flat(),
    );
  };
  const go = async (extra = ''): Promise<void> => {
    if (extra) vibe.value = `${vibe.value} ${extra}`.trim();
    clear(out).append(h('p', { class: 'small' }, 'Thinking…'));
    try {
      show(await ctx.fetchIdeas(ev, city.value, vibe.value));
    } catch (err) {
      clear(out).append(h('p', { class: 'errors' }, errorText(err)));
    }
  };
  const cached = ctx.ideaCache[ev.id];
  if (cached) show(cached);
  return h(
    'div',
    { class: 'card no-print' },
    h('h3', {}, 'Personalised ideas'),
    h('label', { for: city.id }, 'Where is it?'),
    city,
    h('label', { for: vibe.id }, 'What should it feel like?'),
    vibe,
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'primary', onclick: () => go() }, 'Get ideas')),
    out,
  );
}
