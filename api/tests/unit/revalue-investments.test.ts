import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { revalueInvestmentAccounts } from '../../src/jobs/revalue-investments.js';

// PostgREST embed (instruments -> holdings) berubah cardinality begitu unique constraint
// holdings pindah dari (instrument_id) ke (instrument_id, order_ref) [SPEC v2 Fase 1]:
// `holdings(quantity)` sekarang balik ARRAY, bukan objek tunggal. Regression test ini
// nyekek bug yang sempat lolos ke prod: quantity harus dijumlah dari semua row, bukan
// diakses langsung sebagai properti objek (yang diam-diam jadi `undefined` -> 0 -> job
// nganggep portofolio kosong dan nulis investment_loss palsu sebesar seluruh saldo).

function makeChain(result: { data?: any; error?: any }) {
  const chain: any = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'in', 'gte', 'update', 'ilike']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.insert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve(result) }) }));
  chain.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

function makeSupabase(resolvers: Record<string, Array<{ data?: any; error?: any }>>) {
  const callCounts: Record<string, number> = {};
  return {
    from: vi.fn((table: string) => {
      const idx = callCounts[table] ?? 0;
      callCounts[table] = idx + 1;
      const responses = resolvers[table] ?? [{ data: null, error: null }];
      return makeChain(responses[Math.min(idx, responses.length - 1)]);
    }),
  } as any;
}

const ACCOUNT = { id: 'acc-bibit', name: 'Bibit', balance: 1_000_000, last_portfolio_value: null };

describe('revalueInvestmentAccounts — holdings embed sebagai array', () => {
  const originalOwner = process.env.OWNER_USER_ID;
  beforeEach(() => {
    process.env.OWNER_USER_ID = 'user-1';
  });
  afterEach(() => {
    if (originalOwner === undefined) delete process.env.OWNER_USER_ID;
    else process.env.OWNER_USER_ID = originalOwner;
  });

  it('menjumlahkan quantity dari banyak holdings row (array embed), bukan cuma baris pertama', async () => {
    const supabase = makeSupabase({
      accounts: [{ data: [ACCOUNT], error: null }],
      categories: [{ data: { id: 'cat-invest' }, error: null }],
      instruments: [{
        data: [{ id: 'fund-1', quote_convention: 'nav_per_unit', holdings: [{ quantity: '300' }, { quantity: '323.2083' }] }],
        error: null,
      }],
      price_history: [{ data: { value: 1623.65 }, error: null }],
      // 1st call: cek transaksi bulan ini (belum ada) -> 2nd call: insert income
      transactions: [
        { data: null, error: null },
        { data: { id: 'tx-1' }, error: null },
      ],
    });

    const results = await revalueInvestmentAccounts(supabase);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('recorded');
    // (300 + 323.2083) unit * 1623.65 NAV
    expect(results[0].portfolio_value).toBeCloseTo(623.2083 * 1623.65, 2);
  });

  it('holdings kosong dianggap quantity 0, fund itu di-skip tanpa error', async () => {
    const supabase = makeSupabase({
      accounts: [{ data: [ACCOUNT], error: null }],
      categories: [{ data: { id: 'cat-invest' }, error: null }],
      instruments: [{ data: [{ id: 'fund-1', quote_convention: 'nav_per_unit', holdings: [] }], error: null }],
      transactions: [
        { data: null, error: null },
        { data: { id: 'tx-2' }, error: null },
      ],
    });

    const results = await revalueInvestmentAccounts(supabase);
    expect(results[0].account_id).toBe('acc-bibit');
    expect(() => results[0]).not.toThrow();
  });
});

describe('revalueInvestmentAccounts — Fase 4: generalisasi valueOf() semua instrument type', () => {
  beforeEach(() => {
    process.env.OWNER_USER_ID = 'user-1';
  });

  it('SPEC v2 §5.4 guard: SBR/ST (par_only) selalu = nominal, TIDAK PERNAH lookup price_history ' +
     '-- kupon confirmed tidak boleh bikin net worth naik dua kali', async () => {
    const supabase = makeSupabase({
      accounts: [{ data: [ACCOUNT], error: null }],
      categories: [{ data: { id: 'cat-invest' }, error: null }],
      instruments: [{
        data: [{ id: 'sbr-1', quote_convention: 'par_only', holdings: [{ quantity: '10000000' }] }],
        error: null,
      }],
      // Kalau kode salah dan tetap nge-query price_history buat par_only, mock ini bakal
      // ngasih harga 42 -- assert di bawah mastiin hasilnya TETAP 10jt, bukan 10jt*42.
      price_history: [{ data: { value: 42 }, error: null }],
      transactions: [
        { data: null, error: null },
        { data: { id: 'tx-3' }, error: null },
      ],
    });

    const results = await revalueInvestmentAccounts(supabase);
    expect(results[0].portfolio_value).toBe(10_000_000);
  });

  it('gabungan reksadana (nav_per_unit) + obligasi nontradable (par_only) dalam satu akun -- dijumlah benar', async () => {
    const supabase = makeSupabase({
      accounts: [{ data: [ACCOUNT], error: null }],
      categories: [{ data: { id: 'cat-invest' }, error: null }],
      instruments: [{
        data: [
          { id: 'fund-1', quote_convention: 'nav_per_unit', holdings: [{ quantity: '100' }] },
          { id: 'sbr-1', quote_convention: 'par_only', holdings: [{ quantity: '2000000' }] },
        ],
        error: null,
      }],
      price_history: [{ data: { value: 1500 }, error: null }],
      transactions: [
        { data: null, error: null },
        { data: { id: 'tx-4' }, error: null },
      ],
    });

    const results = await revalueInvestmentAccounts(supabase);
    // 100*1500 (reksadana) + 2_000_000*1.0 (par_only, harga di atas diabaikan)
    expect(results[0].portfolio_value).toBe(100 * 1500 + 2_000_000);
  });
});

describe('revalueInvestmentAccounts — cash (kupon/dividen confirmed) di akun investasi TIDAK boleh ketimpa', () => {
  beforeEach(() => {
    process.env.OWNER_USER_ID = 'user-1';
  });

  it('delta dihitung dari last_portfolio_value, bukan dari balance -- cash dividen yang numpuk di balance ikut kebawa, gak ditimpa', async () => {
    // Skenario: portofolio dulu 1.000.000 (last_portfolio_value). Kupon 100.000 di-confirm
    // ke akun investasi ini sendiri -> balance jadi 1.100.000 (1jt portofolio + 100rb cash).
    // Sekarang portofolio naik jadi 1.050.000 (gain 50rb). Balance baru HARUS 1.150.000
    // (1.100.000 + 50rb), BUKAN 1.050.000 (yang berarti cash 100rb dividen ilang).
    const accountWithCash = { id: 'acc-bibit', name: 'Bibit', balance: 1_100_000, last_portfolio_value: 1_000_000 };

    let updatePayload: any = null;
    const accountsChain: any = {
      select: vi.fn(() => accountsChain),
      eq: vi.fn(() => accountsChain),
      update: vi.fn((payload: any) => {
        updatePayload = payload;
        return { eq: vi.fn(() => Promise.resolve({ data: null, error: null })) };
      }),
      then: (resolve: any) => Promise.resolve({ data: [accountWithCash], error: null }).then(resolve),
    };

    let transactionsCallCount = 0;
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'accounts') return accountsChain;
        if (table === 'categories') return makeChain({ data: { id: 'cat-invest' }, error: null });
        if (table === 'instruments') {
          return makeChain({
            data: [{ id: 'fund-1', quote_convention: 'nav_per_unit', holdings: [{ quantity: '700' }] }],
            error: null,
          });
        }
        if (table === 'price_history') return makeChain({ data: { value: 1500 }, error: null }); // 700*1500 = 1.050.000
        if (table === 'transactions') {
          transactionsCallCount += 1;
          // 1st call: cek transaksi bulan ini (belum ada) -> 2nd call: insert income
          return makeChain(transactionsCallCount === 1 ? { data: null, error: null } : { data: { id: 'tx-5' }, error: null });
        }
        return makeChain({ data: null, error: null });
      }),
    } as any;

    const results = await revalueInvestmentAccounts(supabase);

    expect(results[0].portfolio_value).toBe(1_050_000);
    expect(results[0].delta).toBe(50_000); // vs last_portfolio_value (1jt), bukan vs balance (1.1jt)
    expect(updatePayload).toMatchObject({ balance: 1_150_000, last_portfolio_value: 1_050_000 });
  });
});
