// Planning data for each event type. This is data, not code: the plan engine reads it.
// Budget lines carry an integer weight (their share of the budget), whether they are
// must-haves, and how they are paid: an optional advance and a balance, both expressed
// as "days before the event". `flex` is how many days an advance can usually be paid
// later without losing the booking; the engine uses it for "move this payment" fixes.
// These are planning assumptions, not quotes. The app labels every amount "estimate".

import type { EventType } from './types.ts';

export const REFUND_WINDOW_DAYS = 7;

/** An optional advance: a share of the line, paid some days before the event. */
export interface AdvanceTerm {
  pct: number;
  daysBefore: number;
  /** How many days later the advance can usually be paid without losing the booking. */
  flex: number;
}

export interface LineTemplate {
  id: string;
  label: string;
  weight: number;
  must?: boolean;
  reserve?: boolean;
  perGuest?: boolean;
  vendor?: string;
  adv?: AdvanceTerm;
  bal: { daysBefore: number };
}

export interface TaskTemplate {
  id: string;
  label: string;
  daysBefore: number;
  after: string[];
}

export interface EventTemplate {
  label: string;
  /** Guest count the line weights were written for. */
  refGuests: number;
  lines: LineTemplate[];
  tasks: TaskTemplate[];
}

const reserve = (weight: number): LineTemplate => ({
  id: 'reserve',
  label: 'Contingency reserve',
  weight,
  must: true,
  reserve: true,
  bal: { daysBefore: 0 },
});

export const EVENT_TYPES: Record<EventType, EventTemplate> = {
  wedding: {
    label: 'Wedding',
    refGuests: 200,
    lines: [
      {
        id: 'venue',
        label: 'Venue and stay',
        weight: 22,
        must: true,
        vendor: 'Venue',
        adv: { pct: 40, daysBefore: 75, flex: 30 },
        bal: { daysBefore: 7 },
      },
      {
        id: 'food',
        label: 'Catering',
        weight: 28,
        must: true,
        perGuest: true,
        vendor: 'Caterer',
        adv: { pct: 30, daysBefore: 35, flex: 14 },
        bal: { daysBefore: 1 },
      },
      {
        id: 'decor',
        label: 'Decor and flowers',
        weight: 10,
        vendor: 'Decorator',
        adv: { pct: 50, daysBefore: 30, flex: 12 },
        bal: { daysBefore: 2 },
      },
      {
        id: 'photo',
        label: 'Photo and video',
        weight: 9,
        vendor: 'Photographer',
        adv: { pct: 40, daysBefore: 60, flex: 25 },
        bal: { daysBefore: 0 },
      },
      {
        id: 'attire',
        label: 'Clothes and jewellery',
        weight: 11,
        must: true,
        adv: { pct: 50, daysBefore: 50, flex: 20 },
        bal: { daysBefore: 10 },
      },
      {
        id: 'music',
        label: 'Music and DJ',
        weight: 5,
        vendor: 'DJ or band',
        adv: { pct: 30, daysBefore: 25, flex: 10 },
        bal: { daysBefore: 0 },
      },
      { id: 'rituals', label: 'Priest and rituals', weight: 3, must: true, bal: { daysBefore: 1 } },
      { id: 'invites', label: 'Invitations and gifts', weight: 3, bal: { daysBefore: 40 } },
      { id: 'travel', label: 'Guest transport', weight: 3, vendor: 'Transport', bal: { daysBefore: 2 } },
      reserve(6),
    ],
    tasks: [
      { id: 'date', label: 'Fix the date and head-count range', daysBefore: 120, after: [] },
      { id: 'venue', label: 'Book the venue and pay the advance', daysBefore: 100, after: ['date'] },
      { id: 'caterer', label: 'Shortlist caterers and get 2 quotes', daysBefore: 70, after: ['venue'] },
      { id: 'photo', label: 'Book the photographer', daysBefore: 60, after: ['date'] },
      { id: 'invites', label: 'Send invitations', daysBefore: 40, after: ['venue'] },
      { id: 'attire', label: 'Order clothes and jewellery', daysBefore: 50, after: ['date'] },
      { id: 'decor', label: 'Finalise decor and music', daysBefore: 30, after: ['venue'] },
      { id: 'rsvp', label: 'Confirm final head-count', daysBefore: 12, after: ['invites'] },
      { id: 'run', label: 'Share the day-of schedule with vendors', daysBefore: 3, after: ['rsvp', 'caterer'] },
    ],
  },
  birthday: {
    label: 'Birthday',
    refGuests: 40,
    lines: [
      {
        id: 'venue',
        label: 'Venue or hall',
        weight: 20,
        must: true,
        vendor: 'Venue',
        adv: { pct: 30, daysBefore: 21, flex: 8 },
        bal: { daysBefore: 1 },
      },
      {
        id: 'food',
        label: 'Food and drinks',
        weight: 33,
        must: true,
        perGuest: true,
        vendor: 'Caterer',
        adv: { pct: 30, daysBefore: 10, flex: 5 },
        bal: { daysBefore: 0 },
      },
      { id: 'cake', label: 'Cake', weight: 8, must: true, vendor: 'Bakery', bal: { daysBefore: 1 } },
      {
        id: 'decor',
        label: 'Decor and balloons',
        weight: 12,
        vendor: 'Decorator',
        adv: { pct: 40, daysBefore: 12, flex: 6 },
        bal: { daysBefore: 0 },
      },
      {
        id: 'fun',
        label: 'Entertainer or games',
        weight: 10,
        vendor: 'Entertainer',
        adv: { pct: 30, daysBefore: 14, flex: 7 },
        bal: { daysBefore: 0 },
      },
      { id: 'gifts', label: 'Return gifts', weight: 8, perGuest: true, bal: { daysBefore: 4 } },
      { id: 'photo', label: 'Photographer', weight: 4, vendor: 'Photographer', bal: { daysBefore: 0 } },
      reserve(5),
    ],
    tasks: [
      { id: 'date', label: 'Fix the date and guest list', daysBefore: 30, after: [] },
      { id: 'venue', label: 'Book the venue', daysBefore: 24, after: ['date'] },
      { id: 'invites', label: 'Send invitations', daysBefore: 18, after: ['date'] },
      { id: 'food', label: 'Order food and cake', daysBefore: 10, after: ['venue'] },
      { id: 'rsvp', label: 'Confirm head-count', daysBefore: 5, after: ['invites'] },
      { id: 'run', label: 'Confirm timings with vendors', daysBefore: 2, after: ['food', 'rsvp'] },
    ],
  },
  community: {
    label: 'Community event',
    refGuests: 150,
    lines: [
      {
        id: 'venue',
        label: 'Venue and permissions',
        weight: 15,
        must: true,
        vendor: 'Venue',
        adv: { pct: 30, daysBefore: 30, flex: 12 },
        bal: { daysBefore: 2 },
      },
      {
        id: 'food',
        label: 'Food and water',
        weight: 32,
        must: true,
        perGuest: true,
        vendor: 'Caterer',
        adv: { pct: 25, daysBefore: 14, flex: 7 },
        bal: { daysBefore: 0 },
      },
      {
        id: 'sound',
        label: 'Sound and lights',
        weight: 12,
        must: true,
        vendor: 'Sound vendor',
        adv: { pct: 30, daysBefore: 14, flex: 7 },
        bal: { daysBefore: 0 },
      },
      {
        id: 'decor',
        label: 'Decor and stage',
        weight: 9,
        vendor: 'Decorator',
        adv: { pct: 40, daysBefore: 10, flex: 5 },
        bal: { daysBefore: 0 },
      },
      { id: 'print', label: 'Printing and publicity', weight: 6, bal: { daysBefore: 12 } },
      { id: 'prizes', label: 'Prizes and gifts', weight: 8, perGuest: true, bal: { daysBefore: 5 } },
      { id: 'tees', label: 'Volunteer T-shirts', weight: 5, vendor: 'Printer', bal: { daysBefore: 8 } },
      {
        id: 'safety',
        label: 'Cleaning and security',
        weight: 8,
        must: true,
        vendor: 'Security',
        bal: { daysBefore: 0 },
      },
      reserve(5),
    ],
    tasks: [
      { id: 'date', label: 'Fix the date and the committee', daysBefore: 45, after: [] },
      { id: 'permit', label: 'Get permissions and the venue booking', daysBefore: 35, after: ['date'] },
      { id: 'sponsors', label: 'Confirm sponsors and collections', daysBefore: 25, after: ['date'] },
      { id: 'publicity', label: 'Print and share publicity', daysBefore: 14, after: ['permit'] },
      { id: 'volunteers', label: 'Brief volunteers', daysBefore: 4, after: ['permit'] },
      { id: 'run', label: 'Walk through the venue with vendors', daysBefore: 2, after: ['volunteers', 'sponsors'] },
    ],
  },
};

export const TYPE_IDS: EventType[] = ['wedding', 'birthday', 'community'];

/** Narrow an unknown value to a supported event type. */
export function isEventType(value: unknown): value is EventType {
  return typeof value === 'string' && (TYPE_IDS as string[]).includes(value);
}
