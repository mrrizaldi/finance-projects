import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildPrompt,
  extractScreenshots,
  mergeScreenshotRows,
  normalizeRawRows,
  ScreenshotExtractionError,
  type ScreenshotRow,
} from '../../src/lib/screenshot-extractor.js';

const row = (date: string, amount: number, direction: 'debit' | 'credit' = 'debit', time: string | null = null, description = 'x'): ScreenshotRow => ({
  date, time, amount, direction, description, counterparty: null, balanceAfter: null, ref: null, confidence: 1,
});

const geminiReply = (payload: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status: 200 });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizeRawRows', () => {
  it('keeps valid rows, clamps confidence, drops broken ones', () => {
    const { rows, dropped } = normalizeRawRows([
      { date: '2026-08-04', time: '09:15', description: '  BIAYA   ADM ', amount: 15000, direction: 'debit', confidence: 1.4 },
      { date: '2026-08-04', time: '9:15', description: 'jam aneh', amount: '7000', direction: 'debit', confidence: 0.5 },
      { date: '2026-02-30', description: 'tanggal mustahil', amount: 1000, direction: 'debit', confidence: 1 },
      { date: '2026-08-04', description: 'nol', amount: 0, direction: 'debit', confidence: 1 },
      { date: '2026-08-04', description: 'arah aneh', amount: 1000, direction: 'keluar', confidence: 1 },
    ]);
    expect(dropped).toBe(3);
    expect(rows.map((r) => [r.description, r.time, r.amount, r.confidence])).toEqual([
      ['BIAYA ADM', '09:15', 15000, 1],
      ['jam aneh', null, 7000, 0.5],
    ]);
  });
});

describe('mergeScreenshotRows', () => {
  it('keeps one copy of a row seen on two overlapping screenshots', () => {
    const top = [row('2026-08-04', 15000), row('2026-08-04', 7000)];
    const bottom = [row('2026-08-04', 7000), row('2026-08-03', 33500)];
    expect(mergeScreenshotRows([top, bottom]).map((r) => r.amount)).toEqual([15000, 7000, 33500]);
  });

  it('keeps real repeats that appear twice on the same screenshot', () => {
    const first = [row('2026-08-04', 18000), row('2026-08-04', 18000)];
    const second = [row('2026-08-04', 18000)];
    expect(mergeScreenshotRows([first, second])).toHaveLength(2);
  });

  it('treats different times as different transactions', () => {
    const merged = mergeScreenshotRows([[row('2026-08-04', 18000, 'debit', '08:00')], [row('2026-08-04', 18000, 'debit', '19:00')]]);
    expect(merged.map((r) => r.time)).toEqual(['19:00', '08:00']);
  });
});

describe('buildPrompt', () => {
  it('anchors missing years and relative days to the reference date', () => {
    expect(buildPrompt('2026-10-19')).toContain('2026-10-19');
  });
});

describe('extractScreenshots', () => {
  const image = { data: Buffer.from('fake'), mimeType: 'image/png' };

  it('fails clearly without an API key', async () => {
    await expect(extractScreenshots([image], '2026-10-19', { apiKey: '' })).rejects.toMatchObject({ code: 'not_configured' });
  });

  it('sends the key as a header, merges images and picks the most common source', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(geminiReply({ source: 'dana', rows: [{ date: '2026-10-02', description: 'Tokopedia', amount: 27000, direction: 'debit', confidence: 0.9 }] }))
      .mockResolvedValueOnce(geminiReply({ source: 'DANA', rows: [{ date: '2026-10-02', description: 'Tokopedia', amount: 27000, direction: 'debit', confidence: 0.95 }] }))
      .mockResolvedValueOnce(geminiReply({ source: 'GOPAY', rows: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await extractScreenshots([image, image, image], '2026-10-19', { apiKey: 'k', model: 'm' });
    expect(result.source).toBe('DANA');
    expect(result.rows).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/m:generateContent');
    expect(String(url)).not.toContain('key=');
    expect(init.headers['x-goog-api-key']).toBe('k');
  });

  it('reports model HTTP errors and non JSON answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('quota', { status: 429 })));
    await expect(extractScreenshots([image], '2026-10-19', { apiKey: 'k' })).rejects.toMatchObject({ code: 'model_failed' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'bukan json' }] } }] }), { status: 200 }),
    ));
    await expect(extractScreenshots([image], '2026-10-19', { apiKey: 'k' })).rejects.toBeInstanceOf(ScreenshotExtractionError);
  });

  it('says so when nothing usable was read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiReply({ source: 'BCA', rows: [] })));
    await expect(extractScreenshots([image], '2026-10-19', { apiKey: 'k' })).rejects.toMatchObject({ code: 'empty' });
  });
});
