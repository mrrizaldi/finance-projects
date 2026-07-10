import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseRetailSeriesTable } from '../../src/lib/nav-source/phei.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(__dirname, '../fixtures/phei-retail-series.html'), 'utf-8');

describe('parseRetailSeriesTable — SPEC v2 Fase 3, 1 fetch = semua seri', () => {
  it('parse semua baris valid dari tabel "Retail Series" sekaligus', () => {
    const result = parseRetailSeriesTable(FIXTURE);
    const seriesNames = result.map((r) => r.series);
    expect(seriesNames).toContain('ORI023T3');
    expect(seriesNames).toContain('SR018T5');
  });

  it('parse angka format Indonesia (koma desimal) dengan benar, bukan 95 dari "95,8856"', () => {
    const result = parseRetailSeriesTable(FIXTURE);
    const ori = result.find((r) => r.series === 'ORI023T3')!;
    expect(ori.todayPricePct).toBeCloseTo(99.9862, 4);
    expect(ori.yesterdayPricePct).toBeCloseTo(99.9828, 4);
    expect(ori.couponPct).toBeCloseTo(5.9, 4);
  });

  it('deviasi >5% dari kemarin -> tetap disimpan tapi ditandai needsReview', () => {
    const result = parseRetailSeriesTable(FIXTURE);
    const flagged = result.find((r) => r.series === 'SR999TX')!;
    expect(flagged).toBeDefined();
    expect(flagged.needsReview).toBe(true);
  });

  it('deviasi kecil -> needsReview false', () => {
    const result = parseRetailSeriesTable(FIXTURE);
    const ori = result.find((r) => r.series === 'ORI023T3')!;
    expect(ori.needsReview).toBe(false);
  });

  it('harga di luar rentang wajar 50-150% of par -> di-skip, bukan disimpan (kemungkinan parse salah)', () => {
    const result = parseRetailSeriesTable(FIXTURE);
    expect(result.find((r) => r.series === 'SR888TX')).toBeUndefined();
  });

  it('struktur heading "Retail Series" gak ketemu -> error jelas, bukan silent empty array', () => {
    expect(() => parseRetailSeriesTable('<html><body>halaman kosong</body></html>')).toThrow(/Retail Series/);
  });
});
