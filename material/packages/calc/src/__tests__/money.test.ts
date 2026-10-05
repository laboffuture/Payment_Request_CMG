import { describe, expect, it } from 'vitest';
import { clampMin0, fmtMoney, num, qf, r2, sum } from '../money.js';
import {
  formatItemCode,
  formatNo,
  highestItemCode,
  mrCounterKey,
  poCounterKey,
  yy,
} from '../numbering.js';

describe('rounding', () => {
  it('num keeps 3 decimals and survives strings and rubbish', () => {
    expect(num('12.3456')).toBe(12.346);
    expect(num(0.1 + 0.2)).toBe(0.3);
    expect(num('')).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num('abc')).toBe(0);
    expect(num(Infinity)).toBe(0);
  });

  it('r2 keeps 2 decimals', () => {
    expect(r2(21.5 * 3)).toBe(64.5);
    expect(r2('1.006')).toBe(1.01);
    expect(r2(1.994)).toBe(1.99);
    expect(r2(null)).toBe(0);
  });

  it('rounds a half-cent the way binary floating point lands, like the prototype', () => {
    // 1.005 * 100 is 100.49999999999999, so this rounds down. The prototype's
    // r2() does exactly the same, and every money figure in the system goes
    // through this one function — so totals and their parts always agree.
    expect(r2(1.005)).toBe(1);
    expect(r2(1.015)).toBe(1.01);
    // 2.675 * 100 lands just above the half, so this one rounds up.
    expect(r2(2.675)).toBe(2.68);
  });

  it('sum takes a field name or a function', () => {
    const rows = [{ qty: 1.5 }, { qty: 2.25 }];
    expect(sum(rows, 'qty')).toBe(3.75);
    expect(sum(rows, (r) => r.qty * 2)).toBe(7.5);
  });

  it('clampMin0 floors at zero', () => {
    expect(clampMin0(-3)).toBe(0);
    expect(clampMin0(3.0001)).toBe(3);
  });

  it('formats quantities without trailing zeros and money with two decimals', () => {
    expect(qf(12.5)).toBe('12.5');
    expect(qf(12)).toBe('12');
    expect(fmtMoney(1234.5)).toBe('1,234.50');
  });
});

describe('numbering', () => {
  const d = new Date('2026-03-04T00:00:00Z');

  it('builds the MR counter key from the project code', () => {
    expect(mrCounterKey('PRJ-0114', d)).toBe('MR-0114-26');
    expect(mrCounterKey('0098', d)).toBe('MR-0098-26');
  });

  it('formats document numbers to four digits', () => {
    expect(formatNo(poCounterKey(d), 7)).toBe('PO-26-0007');
    expect(formatNo(mrCounterKey('PRJ-0114', d), 1)).toBe('MR-0114-26-0001');
  });

  it('formats item codes to five digits and finds the highest existing one', () => {
    expect(formatItemCode(231)).toBe('ITM-00231');
    expect(highestItemCode(['ITM-00231', 'ITM-00955', 'nonsense'])).toBe(955);
    expect(highestItemCode([])).toBe(0);
  });

  it('uses a two-digit year', () => {
    expect(yy(d)).toBe('26');
  });
});
