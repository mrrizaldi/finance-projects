// Unit: formatter locale-aware (src/lib/utils.ts). Currency + compact + tanggal
// ikut bahasa aktif (i18next): ID → Rp/rb/jt, EN → IDR/K/M.
import { describe, it, expect } from 'vitest';
import i18n from '@/i18n';
import { formatRupiah, formatDate, rp } from '@/lib/utils';

describe('locale-aware formatters', () => {
  it('formatRupiah: ID pakai "Rp" + titik, EN pakai "IDR" + koma', async () => {
    await i18n.changeLanguage('id');
    expect(formatRupiah(1_500_000)).toBe('Rp 1.500.000');
    await i18n.changeLanguage('en');
    expect(formatRupiah(1_500_000)).toBe('IDR 1,500,000');
  });

  it('rp compact: ID "jt/rb", EN "M/K"', async () => {
    await i18n.changeLanguage('id');
    expect(rp(1_500_000, true)).toBe('1.5jt');
    expect(rp(800_000, true)).toBe('800rb');
    await i18n.changeLanguage('en');
    expect(rp(1_500_000, true)).toBe('1.5M');
    expect(rp(800_000, true)).toBe('800K');
  });

  it('rp non-compact: currency label ikut locale (Rp vs IDR)', async () => {
    await i18n.changeLanguage('id');
    expect(rp(1_500_000)).toContain('Rp');
    await i18n.changeLanguage('en');
    expect(rp(1_500_000)).toContain('IDR');
  });

  it('formatDate: nama bulan ikut locale', async () => {
    await i18n.changeLanguage('en');
    const en = formatDate('2026-08-15');
    await i18n.changeLanguage('id');
    const id = formatDate('2026-08-15');
    expect(en).toContain('Aug');
    expect(en).not.toBe(id);
  });
});
