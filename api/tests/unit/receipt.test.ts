import { describe, expect, it } from 'vitest';
import { normalizeReceipt, rankCandidates, receiptTotal, totalMatches } from '../../src/lib/receipt.js';

const categories = [
  { id: 'cat-food', name: 'Makanan' },
  { id: 'cat-home', name: 'Rumah Tangga' },
];

describe('normalizeReceipt', () => {
  it('memetakan kind, tanda, kategori, dan tanggal', () => {
    const result = normalizeReceipt({
      merchant: ' Resto Sederhana ',
      purchased_at: '2026-09-10 19:42',
      printed_total: 124400,
      lines: [
        { kind: 'item', name: 'Nasi  goreng', qty: 1, amount: 45000, category: 'makanan' },
        { kind: 'item', name: 'Es teh', qty: 2, amount: 16000, category: 'Makanan' },
        { kind: 'item', name: 'Sabun', qty: 1, amount: 55000, category: 'Elektronik' },
        { kind: 'discount', name: 'Diskon member', amount: 8000 },
        { kind: 'service', name: 'Service', amount: 5400 },
        { kind: 'tax', name: 'PB1', amount: 11340 },
        { kind: 'rounding', name: 'Pembulatan', amount: -340 },
        { kind: 'item', name: 'Voucher', amount: -5000 },
        { kind: 'item', name: 'Rusak', amount: 'abc' },
      ],
    }, categories);
    expect(result.merchant).toBe('Resto Sederhana');
    expect(result.purchasedDate).toBe('2026-09-10');
    expect(result.purchasedTime).toBe('19:42');
    expect(result.printedTotal).toBe(124400);
    expect(result.lines.map((l) => [l.kind, l.amount, l.category_id])).toEqual([
      ['item', 45000, 'cat-food'],
      ['item', 16000, 'cat-food'],
      ['item', 55000, null],
      ['discount', -8000, null],
      ['service', 5400, null],
      ['tax', 11340, null],
      ['rounding', -340, null],
      ['discount', -5000, null],
    ]);
    expect(result.lines[0].name).toBe('Nasi goreng');
    expect(result.lines[1].qty).toBe(2);
  });

  it('tanggal rusak dan total kosong jadi null', () => {
    const result = normalizeReceipt({ purchased_at: '2026-02-30', printed_total: null, lines: [] }, categories);
    expect(result.purchasedDate).toBeNull();
    expect(result.purchasedTime).toBeNull();
    expect(result.printedTotal).toBeNull();
    expect(result.merchant).toBeNull();
  });
});

describe('total struk', () => {
  it('jumlah semua baris dibanding total tercetak', () => {
    const lines = normalizeReceipt({
      lines: [
        { kind: 'item', name: 'a', amount: 45000 }, { kind: 'item', name: 'b', amount: 16000 },
        { kind: 'item', name: 'c', amount: 55000 }, { kind: 'discount', name: 'd', amount: -8000 },
        { kind: 'service', name: 's', amount: 5400 }, { kind: 'tax', name: 't', amount: 11340 },
        { kind: 'rounding', name: 'r', amount: -340 },
      ],
    }, categories).lines;
    expect(receiptTotal(lines)).toBe(124400);
    expect(totalMatches(lines, 124400)).toBe(true);
    expect(totalMatches(lines, 125000)).toBe(false);
    expect(totalMatches(lines, null)).toBe(false);
  });
});

describe('rankCandidates', () => {
  const tx = (id: string, amount: number, date: string, merchant: string | null, extra: Record<string, unknown> = {}) => ({
    id, type: 'expense' as const, amount, to_amount: null, account_id: 'acc', to_account_id: null,
    transaction_date: date, description: null, merchant, is_adjustment: false, ...extra,
  });

  it('nominal persis + merchant mirip di urutan pertama, maksimal 3, yang gak cocok dibuang', () => {
    const ranked = rankCandidates({ date: '2026-09-10', time: '19:42', amount: 124400, merchant: 'Resto Sederhana' }, [
      tx('fee', 130900, '2026-09-10T12:45:00Z', 'QRIS RESTO SEDERHANA'),
      tx('exact', 124400, '2026-09-10T12:44:00Z', 'RESTO SEDERHANA'),
      tx('far', 124400, '2026-09-09T05:00:00Z', null),
      tx('other', 124400, '2026-09-10T03:00:00Z', 'TOKO LAIN'),
      tx('wrong', 50000, '2026-09-10T12:44:00Z', 'RESTO SEDERHANA'),
      tx('adj', 124400, '2026-09-10T12:44:00Z', 'RESTO SEDERHANA', { is_adjustment: true }),
      tx('income', 124400, '2026-09-10T12:44:00Z', 'RESTO SEDERHANA', { type: 'income' }),
    ]);
    expect(ranked).toHaveLength(3);
    expect(ranked[0].id).toBe('exact');
    expect(ranked.map((r) => r.id)).not.toContain('wrong');
    expect(ranked.map((r) => r.id)).not.toContain('adj');
    expect(ranked.map((r) => r.id)).not.toContain('income');
  });
});
