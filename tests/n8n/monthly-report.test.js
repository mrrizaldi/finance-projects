#!/usr/bin/env node
// Tests: n8n Monthly Report output
// Verifies correct RPC param names, date ranges, adjustment exclusion, top transactions
// Run: SUPABASE_SERVICE_ROLE_KEY=xxx node tests/n8n/monthly-report.test.js

import { test, expect, runSuite } from '../integration/run.js';

const SB_URL = 'https://dqvdhkpqyynvwfbuqyzu.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SB_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY env var');
  process.exit(1);
}

const headers = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

async function rpc(fn, body) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers });
  return { status: res.status, data: await res.json() };
}

// WIB-aware month range (same logic as n8n workflow)
function getMonthRange() {
  const jakartaNow = new Date(Date.now() + 7 * 60 * 60000);
  const year = jakartaNow.getUTCFullYear();
  const month = jakartaNow.getUTCMonth() + 1;
  const today = jakartaNow.toISOString().split('T')[0];
  const startDate = `${year}-${String(month).padStart(2, '0')}-01T00:00:00+07:00`;
  const endDate = `${today}T23:59:59+07:00`;
  const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  const nextMonthStart = `${nextMonth}-01T00:00:00+07:00`;
  return { startDate, endDate, nextMonthStart, year, month };
}

const { startDate, endDate, nextMonthStart } = getMonthRange();

await runSuite('Monthly Report — RPC Calls', async () => {

  await test('get_summary returns 200', async () => {
    const r = await rpc('get_summary', { p_start_date: startDate, p_end_date: endDate });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data)).toBe(true);
  });

  await test('get_summary has all required fields', async () => {
    const { data } = await rpc('get_summary', { p_start_date: startDate, p_end_date: endDate });
    const row = data[0];
    expect('total_income' in row).toBe(true);
    expect('total_expense' in row).toBe(true);
    expect('net_cashflow' in row).toBe(true);
    expect('transaction_count' in row).toBe(true);
  });

  await test('get_category_breakdown returns 200 and total_amount (not total)', async () => {
    const r = await rpc('get_category_breakdown', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_type: 'expense',
    });
    expect(r.status).toBe(200);
    if (r.data.length > 0) {
      expect('total_amount' in r.data[0]).toBe(true);
      expect('total' in r.data[0]).toBe(false);
    }
  });

  await test('get_monthly_trend uses p_months param and returns income/expense/net', async () => {
    // Old bug: workflow sent n_months instead of p_months
    const wrong = await rpc('get_monthly_trend', { n_months: 3 });
    expect(wrong.status).toBe(404);

    const ok = await rpc('get_monthly_trend', { p_months: 3 });
    expect(ok.status).toBe(200);
    expect(ok.data.length).toBeGreaterThan(0);

    const row = ok.data[0];
    expect('income' in row).toBe(true);   // not total_income
    expect('expense' in row).toBe(true);  // not total_expense
    expect('net' in row).toBe(true);
  });
});

await runSuite('Monthly Report — Top Transactions Query', async () => {

  await test('v_transactions query excludes adjustments (is_adjustment=eq.false)', async () => {
    const r = await sbGet(
      `v_transactions?is_adjustment=eq.false&transaction_date=gte.${encodeURIComponent(startDate)}&transaction_date=lt.${encodeURIComponent(nextMonthStart)}&type=eq.expense&order=amount.desc&limit=10`
    );
    expect(r.status).toBe(200);
    const hasAdjustment = r.data.some((t) => t.is_adjustment === true);
    expect(hasAdjustment).toBe(false);
  });

  await test('top transactions have amount and description fields', async () => {
    const r = await sbGet(
      `v_transactions?is_adjustment=eq.false&type=eq.expense&order=amount.desc&limit=5`
    );
    expect(r.status).toBe(200);
    if (r.data.length > 0) {
      expect('amount' in r.data[0]).toBe(true);
      expect('description' in r.data[0]).toBe(true);
    }
  });
});

await runSuite('Monthly Report — Adjustment Exclusion', async () => {

  await test('category breakdown has no adjustment category entries', async () => {
    const { data } = await rpc('get_category_breakdown', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_type: 'expense',
    });
    const hasAdjustmentCategory = data.some(
      (c) => c.category_name?.toLowerCase().includes('adjustment') ||
              c.category_name?.toLowerCase().includes('penyesuaian')
    );
    expect(hasAdjustmentCategory).toBe(false);
  });

  await test('all category amounts are finite numbers (NaN check)', async () => {
    const { data } = await rpc('get_category_breakdown', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_type: 'expense',
    });
    for (const row of data) {
      expect(Number.isFinite(row.total_amount)).toBe(true);
    }
  });
});

await runSuite('Monthly Report — Message Format Simulation', async () => {

  await test('can build both message parts without NaN/undefined', async () => {
    const [summaryRes, catRes, topTxRes, trendRes] = await Promise.all([
      rpc('get_summary', { p_start_date: startDate, p_end_date: endDate }),
      rpc('get_category_breakdown', { p_start_date: startDate, p_end_date: endDate, p_type: 'expense' }),
      sbGet(
        `v_transactions?is_adjustment=eq.false&transaction_date=gte.${encodeURIComponent(startDate)}&transaction_date=lt.${encodeURIComponent(nextMonthStart)}&type=eq.expense&order=amount.desc&limit=10`
      ),
      rpc('get_monthly_trend', { p_months: 3 }),
    ]);

    const row = summaryRes.data[0];
    const income = row.total_income || 0;
    const expense = row.total_expense || 0;
    const net = row.net_cashflow ?? 0;
    const count = row.transaction_count || 0;
    const fmt = (n) => new Intl.NumberFormat('id-ID').format(Math.abs(n));
    const savingsRate = income > 0 ? ((net / income) * 100).toFixed(1) : '0';

    const catLines = catRes.data.slice(0, 5).map((c, i) =>
      `${i + 1}. ${c.category_name}: Rp ${fmt(c.total_amount)} (${(c.percentage || 0).toFixed(1)}%)`
    ).join('\n') || 'Tidak ada data';

    const txLines = topTxRes.data.slice(0, 10).map((t, i) =>
      `${i + 1}. Rp ${fmt(t.amount)} — ${t.description}`
    ).join('\n') || 'Tidak ada data';

    const trendLines = trendRes.data.map(
      (t) => `  ${t.month}: Rp ${fmt(t.income)} in / Rp ${fmt(t.expense)} out`
    ).join('\n');

    const msg1 = `Income: Rp ${fmt(income)}\nExpense: Rp ${fmt(expense)}\nNet: Rp ${fmt(net)}\nSavings: ${savingsRate}%\nTx: ${count}\n${catLines}`;
    const msg2 = `Top Tx:\n${txLines}\nTrend:\n${trendLines}`;

    expect(msg1.includes('NaN')).toBe(false);
    expect(msg1.includes('undefined')).toBe(false);
    expect(msg2.includes('NaN')).toBe(false);
    expect(msg2.includes('undefined')).toBe(false);
  });
});
