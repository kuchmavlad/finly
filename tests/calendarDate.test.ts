import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarDate, latestOperationDate, localDateString } from '../src/domain/calendarDate.ts';

test('calendar date preserves selected civil day across time zones and DST', () => {
  const original = process.env.TZ;
  try {
    for (const zone of ['Europe/Kyiv', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      process.env.TZ = zone;
      for (const day of ['1900-01-01', '2024-02-29', '2026-03-29', '2026-10-25']) {
        assert.equal(localDateString(calendarDate(day)), day);
      }
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
  assert.throws(() => calendarDate('2026-02-30'));
});

test('calendar maximum is no later than local today or the server UTC day', () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Kyiv';
    assert.equal(latestOperationDate(new Date('2026-10-15T22:30:00Z')), '2026-10-15');
    process.env.TZ = 'America/Los_Angeles';
    assert.equal(latestOperationDate(new Date('2026-10-16T01:00:00Z')), '2026-10-15');
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});
