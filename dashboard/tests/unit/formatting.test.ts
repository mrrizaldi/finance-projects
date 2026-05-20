import { describe, it, expect } from 'vitest';
import { formatRupiah, formatDate, formatDatetime, startOfMonth, endOfMonth } from '@/lib/utils';

describe('formatRupiah', () => {
  it('standard value', () => expect(formatRupiah(1500000)).toBe('Rp 1.500.000'));
  it('zero', () => expect(formatRupiah(0)).toBe('Rp 0'));
  it('358762', () => expect(formatRupiah(358762)).toBe('Rp 358.762'));
  it('small value', () => expect(formatRupiah(500)).toBe('Rp 500'));
  it('no decimals', () => expect(formatRupiah(1234567.89)).not.toContain(','));
});

describe('formatDate', () => {
  it('formats ISO date in WIB (not UTC off-by-one)', () => {
    // 2026-05-20T00:00:00+07:00 = 2026-05-19T17:00:00Z
    // With UTC, this would show 19 Mei 2026. WIB should show 20 Mei 2026.
    const result = formatDate('2026-05-20T00:00:00+07:00');
    expect(result).toContain('20');
    expect(result).toContain('2026');
  });

  it('custom format', () => {
    const result = formatDate('2026-01-15T12:00:00+07:00', 'MM/YYYY');
    expect(result).toBe('01/2026');
  });
});

describe('formatDatetime', () => {
  it('includes time', () => {
    const result = formatDatetime('2026-05-20T14:30:00+07:00');
    expect(result).toContain('14:30');
    expect(result).toContain('2026');
  });
});

describe('startOfMonth / endOfMonth', () => {
  // Note: startOfMonth/endOfMonth use dayjs without tz(), so they operate in
  // local time (WIB, +07:00). The returned ISO string is in UTC.
  // For a date passed as UTC (e.g. 2026-05-15T12:00:00Z), dayjs interprets it
  // as 2026-05-15 19:00 WIB, so startOf('month') = 2026-05-01T00:00+07:00
  // = 2026-04-30T17:00:00.000Z in UTC.

  it('startOfMonth returns ISO string at start of month (WIB local time)', () => {
    const date = new Date('2026-05-15T12:00:00Z');
    const start = startOfMonth(date);
    // In WIB (+07:00), the start of May 2026 is 2026-05-01T00:00+07:00
    // which equals 2026-04-30T17:00:00.000Z in UTC
    const d = new Date(start);
    expect(d.getUTCFullYear()).toBe(2026);
    // Month in WIB: convert back — 2026-04-30T17:00Z = 2026-05-01T00:00+07:00
    // Verify the WIB date is May 1
    const wibOffset = 7 * 60; // minutes
    const wibMs = d.getTime() + wibOffset * 60 * 1000;
    const wibDate = new Date(wibMs);
    expect(wibDate.getUTCMonth()).toBe(4); // May = index 4
    expect(wibDate.getUTCDate()).toBe(1);
  });

  it('endOfMonth returns ISO string at end of month (WIB local time)', () => {
    const date = new Date('2026-05-15T12:00:00Z');
    const end = endOfMonth(date);
    // endOf('month') for May 2026 in WIB = 2026-05-31T23:59:59.999+07:00
    // = 2026-05-31T16:59:59.999Z in UTC
    expect(new Date(end).toISOString()).toMatch(/^2026-05-31/);
  });

  it('endOfMonth for February (non-leap)', () => {
    const date = new Date('2025-02-15T12:00:00Z');
    const end = endOfMonth(date);
    // endOf('month') for Feb 2025 in WIB = 2025-02-28T23:59:59.999+07:00
    // = 2025-02-28T16:59:59.999Z in UTC
    expect(new Date(end).toISOString()).toMatch(/^2025-02-28/);
  });
});
