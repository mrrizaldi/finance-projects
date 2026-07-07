import { describe, it, expect } from 'vitest';
import { parseMonths } from '../../src/lib/installment-utils.js';

describe('parseMonths', () => {
  it('valid sequential months returned sorted', () => {
    const result = parseMonths([
      { month_number: 2, amount: 200000, is_paid: false },
      { month_number: 1, amount: 200000, is_paid: true },
      { month_number: 3, amount: 200000, is_paid: false },
    ]);
    expect(result).toHaveLength(3);
    expect(result[0].month_number).toBe(1);
    expect(result[1].month_number).toBe(2);
    expect(result[2].month_number).toBe(3);
  });

  it('is_paid boolean coerced', () => {
    const [m] = parseMonths([{ month_number: 1, amount: 100000, is_paid: 1 }]);
    expect(m.is_paid).toBe(true);
  });

  it('empty array throws', () => {
    expect(() => parseMonths([])).toThrow('Detail nominal bulanan wajib diisi');
  });

  it('non-array throws', () => {
    expect(() => parseMonths('not array')).toThrow('Detail nominal bulanan wajib diisi');
    expect(() => parseMonths(null)).toThrow('Detail nominal bulanan wajib diisi');
  });

  it('gap in month sequence throws', () => {
    expect(() => parseMonths([
      { month_number: 1, amount: 100000, is_paid: false },
      { month_number: 3, amount: 100000, is_paid: false },
    ])).toThrow('Urutan bulan harus berurutan mulai dari 1');
  });

  it('starts at 2 instead of 1 throws', () => {
    expect(() => parseMonths([
      { month_number: 2, amount: 100000, is_paid: false },
      { month_number: 3, amount: 100000, is_paid: false },
    ])).toThrow('Urutan bulan harus berurutan mulai dari 1');
  });

  it('amount = 0 throws', () => {
    expect(() => parseMonths([{ month_number: 1, amount: 0, is_paid: false }]))
      .toThrow('harus lebih dari 0');
  });

  it('negative amount throws', () => {
    expect(() => parseMonths([{ month_number: 1, amount: -100, is_paid: false }]))
      .toThrow('harus lebih dari 0');
  });

  it('month_number = 0 throws', () => {
    expect(() => parseMonths([{ month_number: 0, amount: 100000, is_paid: false }]))
      .toThrow('month_number');
  });

  it('non-object row throws', () => {
    expect(() => parseMonths(['invalid'])).toThrow('tidak valid');
  });

  it('single valid month', () => {
    const result = parseMonths([{ month_number: 1, amount: 500000, is_paid: false }]);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(500000);
  });
});
