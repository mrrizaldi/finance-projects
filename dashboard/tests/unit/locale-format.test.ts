// Unit: formatter locale-aware (src/lib/utils.ts). Currency tetap Rupiah,
// grouping angka & nama bulan ikut bahasa aktif (i18next).
import { describe, it, expect } from 'vitest';
import i18n from '@/i18n';
import { formatRupiah, formatDate } from '@/lib/utils';

describe('locale-aware formatters', () => {
  it('formatRupiah: prefix Rp tetap, grouping ikut locale', async () => {
    await i18n.changeLanguage('id');
    expect(formatRupiah(1_500_000)).toBe('Rp 1.500.000'); // titik ribuan
    await i18n.changeLanguage('en');
    expect(formatRupiah(1_500_000)).toBe('Rp 1,500,000'); // koma ribuan
  });

  it('formatDate: nama bulan ikut locale', async () => {
    await i18n.changeLanguage('en');
    const en = formatDate('2026-08-15');
    await i18n.changeLanguage('id');
    const id = formatDate('2026-08-15');
    expect(en).toContain('Aug');
    expect(en).not.toBe(id); // bulan berbeda antar bahasa
  });
});
