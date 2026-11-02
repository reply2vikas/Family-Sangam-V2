// Personalised ideas: validation of AI output plus a labelled offline fallback.

import { cleanText } from './schema.ts';
import { isEventType } from './templates.ts';
import { field } from './guards.ts';
import type { EventType } from './types.ts';

export interface Idea {
  title: string;
  detail: string;
  costNote: string;
}

/** Keep at most 6 well-formed ideas; strip markup characters and cap lengths. */
export function cleanIdeas(raw: unknown): Idea[] {
  const ideas = field(raw, 'ideas');
  const list: unknown[] = Array.isArray(ideas) ? ideas : [];
  return list
    .slice(0, 6)
    .map((i) => ({
      title: cleanText(field(i, 'title'), 70),
      detail: cleanText(field(i, 'detail'), 240),
      costNote: cleanText(field(i, 'costNote'), 80),
    }))
    .filter((i) => i.title && i.detail);
}

const SAMPLE: Record<EventType, [string, string, string][]> = {
  wedding: [
    [
      'Mehendi lunch instead of a night event',
      'A daytime function costs less on lighting, staff and late-night food, and elders can attend comfortably.',
      'Often saves on décor and catering',
    ],
    [
      'Seasonal menu with fewer live counters',
      'Pick two live counters and keep the rest buffet. It cuts staff cost without making the meal feel plain.',
      'Lowers per-plate cost',
    ],
    [
      'Family-made welcome corner',
      'Photos of both families, written by cousins. Personal, cheap, and guests actually read it.',
      'Low cost',
    ],
    [
      'Shared photographer for sangeet and wedding',
      'Book one team for both days in a single contract rather than two separate bookings.',
      'Ask for a bundle price',
    ],
  ],
  birthday: [
    [
      "One theme taken from the person's own life",
      'For a grandparent, a "memory lane" photo wall does more than bought decorations.',
      'Low cost',
    ],
    [
      'Home-baked cake plus a small bakery cake',
      'The bakery cake is for cutting, the home-baked one is for sharing, so the order can be smaller.',
      'Saves on cake size',
    ],
    [
      'Games for mixed ages',
      'Antakshari or housie works for children and elders together, with no hired entertainer.',
      'Near zero',
    ],
  ],
  community: [
    [
      'Sponsor each stall instead of the whole event',
      'Local shops are more likely to say yes to a small, named ask than a large general one.',
      'Raises income',
    ],
    [
      'Volunteer roster with named leads',
      'Give every gate, stall and clean-up slot one name. Fewer paid staff are needed.',
      'Lowers security and clean-up cost',
    ],
    [
      'Collect contributions in two dates',
      'Half at registration and half a week before keeps cash steady for vendor advances.',
      'Smooths cash flow',
    ],
  ],
};

/** Offline ideas, clearly labelled as samples by the caller. */
export function sampleIdeas(type: unknown): Idea[] {
  const t: EventType = isEventType(type) ? type : 'wedding';
  return SAMPLE[t].map(([title, detail, costNote]) => ({ title, detail, costNote }));
}
