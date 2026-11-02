// Saves the plan in this browser only. Every read is re-validated, and any storage
// problem (private window, full disk) just means the app starts fresh.

import { normalizeSeason } from '../../shared/schema.ts';
import { cleanProgress } from '../../shared/progress.ts';
import type { Progress } from '../../shared/progress.ts';
import { field } from '../../shared/guards.ts';
import type { Season } from '../../shared/types.ts';

const KEY = 'family-sangam:v1';

export interface SavedState {
  season: Season;
  progress: Progress;
}

export function loadState(): SavedState | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    const checked = normalizeSeason(field(saved, 'season'));
    return checked.ok ? { season: checked.season, progress: cleanProgress(field(saved, 'progress')) } : null;
  } catch {
    return null;
  }
}

export function saveState(state: SavedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: keep working in memory */
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
