// What the family has ticked off: tasks done and vendor status. Kept apart from the season
// itself so changing a date or a budget never loses this progress.

import { asRecord } from './guards.ts';

export const VENDOR_STATUS = ['to contact', 'quote received', 'booked'] as const;
export type VendorStatus = (typeof VENDOR_STATUS)[number];

export interface VendorProgress {
  status: VendorStatus;
  name: string;
}

export interface Progress {
  /** Task keys that are ticked. */
  done: Record<string, boolean>;
  /** Vendor progress by budget line key. */
  vendors: Record<string, VendorProgress>;
}

const KEY_PATTERN = /^e\d{1,2}:[a-z]{2,12}$/;

const isStatus = (v: unknown): v is VendorStatus => (VENDOR_STATUS as readonly unknown[]).includes(v);

/** Keep only well-formed progress entries from saved or imported data. */
export function cleanProgress(raw: unknown): Progress {
  const source = asRecord(raw);
  const done: Record<string, boolean> = {};
  const vendors: Record<string, VendorProgress> = {};
  for (const [k, v] of Object.entries(asRecord(source.done))) if (KEY_PATTERN.test(k) && v === true) done[k] = true;
  for (const [k, v] of Object.entries(asRecord(source.vendors))) {
    if (!KEY_PATTERN.test(k)) continue;
    const item = asRecord(v);
    vendors[k] = {
      status: isStatus(item.status) ? item.status : VENDOR_STATUS[0],
      name: String(item.name ?? '')
        .replace(/[<>]/g, ' ')
        .slice(0, 60),
    };
  }
  return { done, vendors };
}
