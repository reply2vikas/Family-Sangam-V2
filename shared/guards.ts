// Narrowing helpers for data read from JSON (user input, saved state, AI answers).
// Everything starts as `unknown` and is checked field by field before use.

export type Loose = Record<string, unknown>;

/** True for plain objects (not null, not arrays). */
export function isRecord(value: unknown): value is Loose {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The value as an object whose fields are still unknown; {} for anything else. */
export function asRecord(value: unknown): Loose {
  return isRecord(value) ? value : {};
}

/** The value as an array of unknown items; [] for anything else. */
export function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** One field of an object-like value, or undefined. */
export function field(value: unknown, key: string): unknown {
  return asRecord(value)[key];
}
