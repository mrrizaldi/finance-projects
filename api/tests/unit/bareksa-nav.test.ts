import { describe, it, expect } from 'vitest';
import { parseIndonesianNumber, parseIndonesianDate } from '../../src/lib/nav-source/bareksa.js';

describe('parseIndonesianNumber', () => {
  it('parses decimal comma without thousands separator', () => {
    expect(parseIndonesianNumber('439,14')).toBe('439.14');
  });

  it('parses one thousands separator', () => {
    expect(parseIndonesianNumber('1.234,56')).toBe('1234.56');
  });

  it('parses multiple thousands separators', () => {
    expect(parseIndonesianNumber('1.234.567,89')).toBe('1234567.89');
  });
});

describe('parseIndonesianDate', () => {
  it('parses "Hari, DD Bulan YYYY | HH:mm"', () => {
    expect(parseIndonesianDate('Kamis, 09 Juli 2026 | 12:35')).toBe('2026-07-09');
  });
});
