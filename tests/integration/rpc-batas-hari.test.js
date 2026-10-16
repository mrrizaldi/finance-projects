#!/usr/bin/env node
import { test, expect, runSuite } from './run.js';
import { asUser, createTestUser } from './helpers/users.js';

const SB_URL = 'https://dqvdhkpqyynvwfbuqyzu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const LAST_DAY_LATE_NIGHT = { at: '2026-10-31T23:30:00+07:00', amount: 1000 };
const NEXT_MONTH_JUST_AFTER_MIDNIGHT = { at: '2026-11-01T00:30:00+07:00', amount: 20000 };
const FIRST_DAY_EARLY_MORNING = { at: '2026-10-01T03:00:00+07:00', amount: 300 };
const OCTOBER_EXPENSE = LAST_DAY_LATE_NIGHT.amount + FIRST_DAY_EARLY_MORNING.amount;
const SUNDAY = 0;
const TOP_LIMIT = 10;

const OCTOBER = { start: '2026-10-01', end: '2026-10-31' };
const NOVEMBER = { start: '2026-11-01', end: '2026-11-30' };

async function createAccount(userId) {
  const res = await fetch(`${SB_URL}/rest/v1/accounts`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ name: 'TEST_BATAS_HARI', type: 'cash', balance: 0, is_active: false, user_id: userId }),
  });
  const [account] = await res.json();
  return account.id;
}

function rpcAs(user) {
  return async (fn, args) => {
    const res = await asUser(user.jwt)(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
    const body = await res.json();
    if (!res.ok) throw new Error(`rpc ${fn} ${res.status}: ${JSON.stringify(body)}`);
    return body;
  };
}

const user = await createTestUser(`batas-hari-${Date.now()}@example.com`);
try {
  const rpc = rpcAs(user);
  const categories = await (await asUser(user.jwt)(`/categories?select=id&type=eq.expense&limit=1`)).json();
  const [{ id: categoryId }] = categories;
  const accountId = await createAccount(user.userId);

  for (const tx of [LAST_DAY_LATE_NIGHT, NEXT_MONTH_JUST_AFTER_MIDNIGHT, FIRST_DAY_EARLY_MORNING]) {
    await rpc('record_manual_entry', {
      p_account: accountId,
      p_type: 'expense',
      p_amount: tx.amount,
      p_category: categoryId,
      p_description: 'test batas hari',
      p_date: tx.at,
    });
  }

  await runSuite('RPC periode memakai batas hari Asia/Jakarta', async () => {
    await test('get_summary Oktober memuat 31 Okt 23:30 & 1 Okt 03:00 WIB, tanpa 1 Nov 00:30', async () => {
      const [summary] = await rpc('get_summary', { p_start_date: OCTOBER.start, p_end_date: OCTOBER.end });
      expect(Number(summary.total_expense)).toBe(OCTOBER_EXPENSE);
    });

    await test('get_summary November memuat 1 Nov 00:30 WIB', async () => {
      const [summary] = await rpc('get_summary', { p_start_date: NOVEMBER.start, p_end_date: NOVEMBER.end });
      expect(Number(summary.total_expense)).toBe(NEXT_MONTH_JUST_AFTER_MIDNIGHT.amount);
    });

    await test('get_category_breakdown Oktober sama dengan total hari Jakarta', async () => {
      const rows = await rpc('get_category_breakdown', {
        p_start_date: OCTOBER.start,
        p_end_date: OCTOBER.end,
        p_type: 'expense',
      });
      const total = rows.reduce((sum, row) => sum + Number(row.total_amount), 0);
      expect(total).toBe(OCTOBER_EXPENSE);
    });

    await test('get_daily_spending mengelompokkan per tanggal Jakarta', async () => {
      const rows = await rpc('get_daily_spending', { p_start: OCTOBER.end, p_end: NOVEMBER.start });
      const byDay = Object.fromEntries(rows.map((row) => [row.day, Number(row.daily_expense)]));
      expect(byDay[OCTOBER.end]).toBe(LAST_DAY_LATE_NIGHT.amount);
      expect(byDay[NOVEMBER.start]).toBe(NEXT_MONTH_JUST_AFTER_MIDNIGHT.amount);
    });

    await test('get_daily_spending 1 Okt memuat transaksi 03:00 WIB', async () => {
      const [row] = await rpc('get_daily_spending', { p_start: OCTOBER.start, p_end: OCTOBER.start });
      expect(Number(row.daily_expense)).toBe(FIRST_DAY_EARLY_MORNING.amount);
    });

    await test('get_period_comparison memakai batas hari Jakarta untuk dua periode', async () => {
      const [cmp] = await rpc('get_period_comparison', {
        p_start: NOVEMBER.start,
        p_end: NOVEMBER.end,
        p_prev_start: OCTOBER.start,
        p_prev_end: OCTOBER.end,
      });
      expect(Number(cmp.curr_expense)).toBe(NEXT_MONTH_JUST_AFTER_MIDNIGHT.amount);
      expect(Number(cmp.prev_expense)).toBe(OCTOBER_EXPENSE);
    });

    await test('get_top_transactions Oktober tanpa transaksi 1 Nov 00:30 WIB', async () => {
      const rows = await rpc('get_top_transactions', { p_start: OCTOBER.start, p_end: OCTOBER.end, p_limit: TOP_LIMIT });
      const amounts = rows.map((row) => Number(row.amount)).sort((a, b) => b - a);
      expect(amounts).toEqual([LAST_DAY_LATE_NIGHT.amount, FIRST_DAY_EARLY_MORNING.amount]);
    });

    await test('get_expense_heatmap memakai hari Jakarta (1 Nov 2026 = Minggu)', async () => {
      const rows = await rpc('get_expense_heatmap', { p_start_date: NOVEMBER.start, p_end_date: NOVEMBER.start });
      const days = rows.map((row) => row.day_of_week);
      expect(days).toEqual([SUNDAY]);
    });
  });
} finally {
  await user.cleanup();
}
