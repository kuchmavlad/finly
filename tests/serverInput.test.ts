import assert from 'node:assert/strict';
import test from 'node:test';
import { decimalAmount, operationDate } from '../src/domain/serverInput.ts';

test('server input preserves decimal precision beyond Number and supports comma', () => {
  assert.equal(decimalAmount('999999999999999999.123456789012345678'), '999999999999999999.123456789012345678');
  assert.equal(decimalAmount(' 0,000000000000000001 '), '0.000000000000000001');
  for (const value of ['0', '0.00', '-1', 'NaN', 'Infinity', '1e3', '01', '1.2.3', '1000000000000000000', '0.0000000000000000001']) {
    assert.throws(() => decimalAmount(value), value);
  }
});

test('server dates reject normalized impossible dates and allow leap days', () => {
  assert.equal(operationDate('2024-02-29'), '2024-02-29');
  for (const value of ['2023-02-29', '2024-04-31', '2024-13-01', '01-01-2024', '1899-12-31']) {
    assert.throws(() => operationDate(value), value);
  }
});
