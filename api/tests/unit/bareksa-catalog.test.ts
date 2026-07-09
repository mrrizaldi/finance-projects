import { describe, it, expect } from 'vitest';
import { slugify } from '../../src/lib/nav-source/bareksa-catalog.js';

describe('slugify', () => {
  it('matches bareksa.com own product URL slug', () => {
    expect(slugify('Majoris Pasar Uang Indonesia')).toBe('majoris-pasar-uang-indonesia');
  });

  it('strips non-word/non-space characters', () => {
    expect(slugify('Sucorinvest Sharia Equity Fund (Kelas A)')).toBe('sucorinvest-sharia-equity-fund-kelas-a');
  });

  it('collapses multiple spaces into single hyphen', () => {
    expect(slugify('Avrist  Ada   Kas Mutiara')).toBe('avrist-ada-kas-mutiara');
  });
});
