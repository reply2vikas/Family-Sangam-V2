// Ranked fixes for a cash shortfall. Each fix is a small change to season.adjust, so
// applying one is just "merge the patch and rebuild". Must-have lines are never cut.

import { buildPlan } from './plan.ts';
import { cashCalendar } from './cash.ts';
import { EVENT_TYPES } from './templates.ts';
import { formatINR } from './money.ts';
import { formatDate } from './dates.ts';
import type { Adjust, Fix, FixCandidate, FixType, Plan, Season } from './types.ts';

const EMPTY: Adjust = { shifted: {}, trimmed: [], reserve: [] };
const TYPE_ORDER: Record<FixType, number> = { move: 0, reserve: 1, trim: 2 };

/** Merge an adjustment patch into the season's adjustments (returns a new season). */
export function applyAdjust(season: Season, patch: Partial<Adjust>): Season {
  const cur: Adjust = { ...EMPTY, ...(season.adjust ?? {}) };
  return {
    ...season,
    adjust: {
      shifted: { ...cur.shifted, ...(patch.shifted ?? {}) },
      trimmed: [...new Set([...cur.trimmed, ...(patch.trimmed ?? [])])],
      reserve: [...new Set([...cur.reserve, ...(patch.reserve ?? [])])],
    },
  };
}

function candidates(season: Season, plan: Plan): FixCandidate[] {
  const out: FixCandidate[] = [];
  for (const p of plan.payments) {
    if (p.kind === 'advance' && p.date < p.latest) {
      out.push({
        type: 'move',
        patch: { shifted: { [p.id]: p.latest } },
        label: `Pay "${p.label}" on ${formatDate(p.latest)} instead of ${formatDate(p.date)}`,
        detail: `Usually still fine for the booking. Check with the vendor first. ${formatINR(p.amount)} moves later.`,
      });
    }
  }
  for (const ev of plan.events) {
    for (const l of ev.lines) {
      if (!l.must && !l.reserve && !l.trimmed && l.amount > 0) {
        out.push({
          type: 'trim',
          patch: { trimmed: [l.key] },
          label: `Skip "${l.label}" for ${ev.name}`,
          detail: `Optional line. Frees ${formatINR(l.amount)}. Must-haves are never cut.`,
        });
      }
    }
    const res = ev.lines.find((l) => l.reserve);
    const used = (season.adjust?.reserve ?? []).includes(ev.id);
    if (res && !used && res.amount > 0 && ev.type in EVENT_TYPES) {
      out.push({
        type: 'reserve',
        patch: { reserve: [ev.id] },
        label: `Hold back the ${ev.name} contingency reserve`,
        detail: `Keeps ${formatINR(res.amount)} in hand for now. Treat it as a loan from your safety margin.`,
      });
    }
  }
  return out;
}

/**
 * Suggest up to `limit` single-step fixes, best first. Returns [] when there is no shortfall.
 * Ranking: fixes that remove the shortfall first, then the ones that push it latest,
 * then the ones that raise the lowest balance most.
 */
export function suggestFixes(season: Season, limit = 3): Fix[] {
  const base = cashCalendar(season);
  if (!base.shortfall) return [];
  const plan = buildPlan(season);
  const scored = candidates(season, plan)
    .map((c) => {
      const after = cashCalendar(applyAdjust(season, c.patch));
      return {
        ...c,
        resolved: !after.shortfall,
        shortfallAfter: after.shortfall ? after.shortfall.date : null,
        lowestAfter: after.lowest.balance,
        gain: after.lowest.balance - base.lowest.balance,
      };
    })
    .filter((f) => f.gain > 0 || f.resolved);

  scored.sort(
    (a, b) =>
      Number(b.resolved) - Number(a.resolved) ||
      (b.shortfallAfter || '9999').localeCompare(a.shortfallAfter || '9999') ||
      b.lowestAfter - a.lowestAfter ||
      TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
      a.label.localeCompare(b.label),
  );

  // Show a mix: the best fix of each kind first, then the next best overall.
  const seen = new Set<FixType>();
  const picked: Omit<Fix, 'id'>[] = [];
  for (const f of scored)
    if (!seen.has(f.type)) {
      seen.add(f.type);
      picked.push(f);
    }
  for (const f of scored) if (!picked.includes(f)) picked.push(f);
  return picked.slice(0, limit).map((f, i) => ({ ...f, id: `fix-${i}-${f.type}` }));
}
