import assert from 'node:assert/strict';
import { cleanProgress } from '../shared/progress.ts';

export function progressCases() {
  const out = cleanProgress({
    done: { 'e1:date': true, 'bad key': true, 'e2:venue': false },
    vendors: {
      'e1:venue': { status: 'booked', name: '<b>Hall</b>' },
      x: { status: 'booked' },
      'e1:food': { status: 'hacked' },
    },
  });
  assert.deepEqual(out.done, { 'e1:date': true });
  assert.equal(out.vendors['e1:venue'].status, 'booked');
  assert.ok(!out.vendors['e1:venue'].name.includes('<'));
  assert.equal(out.vendors['e1:food'].status, 'to contact');
  assert.ok(!('x' in out.vendors));
  assert.deepEqual(cleanProgress(null), { done: {}, vendors: {} });
}
