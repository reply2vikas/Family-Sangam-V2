// A ready-made season so anyone can see the app work without typing or an API key.
// Dates are relative to the day it is opened, so the demo never goes stale.

import { addDays } from './dates.ts';
import type { Season } from './types.ts';

/** The demo season, with dates counted from `today`. */
export function sampleSeason(today: string): Season {
  return {
    name: 'The Sharma family: winter season',
    startDate: today,
    startBalance: 450000,
    incomes: [
      { id: 'i1', label: 'Salary', date: addDays(today, 24), amount: 250000 },
      { id: 'i2', label: 'Bonus', date: addDays(today, 50), amount: 450000 },
      { id: 'i3', label: 'Family contributions', date: addDays(today, 82), amount: 650000 },
    ],
    events: [
      { id: 'e1', type: 'wedding', name: "Riya's wedding", date: addDays(today, 90), guests: 220, budget: 1500000 },
      {
        id: 'e2',
        type: 'birthday',
        name: "Dadi's 80th birthday",
        date: addDays(today, 40),
        guests: 50,
        budget: 150000,
      },
      {
        id: 'e3',
        type: 'community',
        name: 'Colony Diwali mela',
        date: addDays(today, 60),
        guests: 180,
        budget: 220000,
      },
    ],
  };
}
