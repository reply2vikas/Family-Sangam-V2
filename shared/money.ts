// Money helpers. All amounts are whole rupees (integers); nothing here uses floats for sums.

/**
 * Split `total` across `weights` using the largest-remainder (Hamilton) method.
 * Weights must be non-negative integers with a positive sum.
 * Guarantees: the parts add up to exactly `total`, and each part is within
 * one rupee of its exact share.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new RangeError('total must be a non-negative whole number');
  }
  if (!Array.isArray(weights) || weights.length === 0) {
    throw new RangeError('weights must be a non-empty array');
  }
  if (!weights.every((w) => Number.isSafeInteger(w) && w >= 0)) {
    throw new RangeError('weights must be non-negative whole numbers');
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new RangeError('weights must have a positive sum');

  const parts = weights.map((w) => Math.floor((total * w) / sum));
  const remainders = weights.map((w, i) => ({ i, r: (total * w) % sum }));
  let left = total - parts.reduce((a, b) => a + b, 0);
  remainders.sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of remainders) {
    if (left <= 0) break;
    parts[i] = (parts[i] ?? 0) + 1;
    left -= 1;
  }
  return parts;
}

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** Format whole rupees with Indian digit grouping, e.g. 1234567 -> "₹12,34,567". */
export function formatINR(n: number): string {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-₹' : '₹') + inr.format(Math.abs(v));
}

/** Percentage of `part` in `whole`, rounded to a whole number (0 when whole is 0). */
export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
