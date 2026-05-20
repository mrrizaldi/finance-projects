import { describe, it, expect } from 'vitest';
import { parseAmountInput, formatRupiahInput } from '@/lib/utils';

describe('parseAmountInput', () => {
  it('plain integer', () => expect(parseAmountInput('358762')).toBe(358762));
  it('dot as thousands separator', () => expect(parseAmountInput('1.500.000')).toBe(1500000));
  it('rb shorthand', () => expect(parseAmountInput('50rb')).toBe(50000));
  it('500rb', () => expect(parseAmountInput('500rb')).toBe(500000));
  it('jt shorthand integer', () => expect(parseAmountInput('2jt')).toBe(2000000));
  it('jt shorthand decimal with dot', () => expect(parseAmountInput('1.5jt')).toBe(1500000));
  it('jt shorthand decimal with comma', () => expect(parseAmountInput('1,5jt')).toBe(1500000));
  it('jt large', () => expect(parseAmountInput('10jt')).toBe(10000000));
  it('zero string', () => expect(parseAmountInput('0')).toBe(0));
  it('empty string', () => expect(parseAmountInput('')).toBe(0));
  it('non-numeric string', () => expect(parseAmountInput('abc')).toBe(0));
  // Minus sign is stripped by the regex [^0-9.,rbjt], so '-50000' becomes '50000'
  it('negative sign stripped (not blocked)', () => expect(parseAmountInput('-50000')).toBe(50000));
  // 'Rp 1.000.000' → lowercased 'rp 1.000.000' → regex strips space and 'p', leaving 'r1.000.000'
  // parseFloat('r1000000') = NaN, falls back to 0
  it('rupiah prefix results in 0 (prefix not handled)', () => expect(parseAmountInput('Rp 1.000.000')).toBe(0));
});

describe('formatRupiahInput', () => {
  it('zero returns empty string', () => expect(formatRupiahInput(0)).toBe(''));
  it('formats with id-ID locale dots', () => expect(formatRupiahInput(1500000)).toBe('1.500.000'));
  it('small number', () => expect(formatRupiahInput(358762)).toBe('358.762'));
});
