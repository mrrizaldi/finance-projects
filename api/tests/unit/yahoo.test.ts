import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseYahooChartResponse } from '../../src/lib/nav-source/yahoo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(readFileSync(join(__dirname, '../fixtures/yahoo-chart-bbca.json'), 'utf-8'));

describe('parseYahooChartResponse — SPEC v2 Fase 5, endpoint /v8/finance/chart no crumb', () => {
  it('ambil harga close terakhir + tanggalnya', () => {
    const quote = parseYahooChartResponse(FIXTURE);
    expect(quote.closePrice).toBe(6175);
    expect(quote.asOf).toBe('2026-07-10');
  });

  it('parse dividend event dari events.dividends', () => {
    const quote = parseYahooChartResponse(FIXTURE);
    expect(quote.dividends).toEqual([{ date: '2026-07-09', amountPerShare: 55 }]);
  });

  it('parse split event dari events.splits -- TIDAK diapply di sini, cuma di-parse', () => {
    const quote = parseYahooChartResponse(FIXTURE);
    expect(quote.splits).toEqual([{ date: '2026-07-06', numerator: 1, denominator: 2 }]);
  });

  it('response tanpa events sama sekali -> splits/dividends array kosong, bukan crash', () => {
    const noEvents = structuredClone(FIXTURE);
    delete noEvents.chart.result[0].events;
    const quote = parseYahooChartResponse(noEvents);
    expect(quote.splits).toEqual([]);
    expect(quote.dividends).toEqual([]);
  });

  it('chart.result kosong (ticker gak ketemu / struktur berubah) -> error jelas', () => {
    expect(() => parseYahooChartResponse({ chart: { result: [], error: null } })).toThrow(/Yahoo/);
  });

  it('hari terakhir close null (bursa libur) -> ambil hari sebelumnya yang valid', () => {
    const withNullTail = structuredClone(FIXTURE);
    const q = withNullTail.chart.result[0].indicators.quote[0];
    q.close[q.close.length - 1] = null;
    const quote = parseYahooChartResponse(withNullTail);
    expect(quote.closePrice).toBe(6200); // hari sebelum yang terakhir
    expect(quote.asOf).toBe('2026-07-09');
  });
});
