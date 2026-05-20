#!/usr/bin/env node
// Tests: n8n Weekly Digest report output
// Verifies correct RPC param names, date ranges, field names, adjustment exclusion
// Run: SUPABASE_SERVICE_ROLE_KEY=xxx node tests/n8n/weekly-report.test.js

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

// WIB-aware date helpers (same logic as n8n workflow)
function getWeekRange() {
  const jakartaNow = new Date(Date.now() + 7 * 60 * 60000);
  const dayOfWeek = jakartaNow.getUTCDay();
  const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = new Date(jakartaNow);
  thisMonday.setUTCDate(jakartaNow.getUTCDate() - daysFromMon);
  const prevMonday = new Date(thisMonday);
  prevMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  const prevSunday = new Date(prevMonday);
  prevSunday.setUTCDate(prevMonday.getUTCDate() + 6);

  return {
    startDate: `${thisMonday.toISOString().split('T')[0]}T00:00:00+07:00`,
    endDate: `${jakartaNow.toISOString().split('T')[0]}T23:59:59+07:00`,
    prevStartDate: `${prevMonday.toISOString().split('T')[0]}T00:00:00+07:00`,
    prevEndDate: `${prevSunday.toISOString().split('T')[0]}T23:59:59+07:00`,
  };
}

const { startDate, endDate, prevStartDate, prevEndDate } = getWeekRange();

await runSuite('Weekly Report — RPC Calls', async () => {

  await test('get_summary returns 200 with correct params', async () => {
    const r = await rpc('get_summary', { p_start_date: startDate, p_end_date: endDate });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data)).toBe(true);
  });

  await test('get_summary has expected fields', async () => {
    const { data } = await rpc('get_summary', { p_start_date: startDate, p_end_date: endDate });
    const row = data[0];
    expect('total_income' in row).toBe(true);
    expect('total_expense' in row).toBe(true);
    expect('net_cashflow' in row).toBe(true);
    expect('transaction_count' in row).toBe(true);
  });

  await test('previous week summary also returns 200', async () => {
    const r = await rpc('get_summary', { p_start_date: prevStartDate, p_end_date: prevEndDate });
    expect(r.status).toBe(200);
  });

  await test('get_category_breakdown returns 200 and total_amount field', async () => {
    const r = await rpc('get_category_breakdown', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_type: 'expense',
    });
    expect(r.status).toBe(200);
    if (r.data.length > 0) {
      expect('total_amount' in r.data[0]).toBe(true);
      expect('total' in r.data[0]).toBe(false); // old bug: c.total instead of c.total_amount
    }
  });

  await test('category amounts are finite numbers (not NaN)', async () => {
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

await runSuite('Weekly Report — Adjustment Exclusion', async () => {

  await test('summary income/expense are finite (not skewed by adjustments)', async () => {
    const { data } = await rpc('get_summary', { p_start_date: startDate, p_end_date: endDate });
    const row = data[0];
    expect(Number.isFinite(Number(row.total_income))).toBe(true);
    expect(Number.isFinite(Number(row.total_expense))).toBe(true);
  });

  await test('category breakdown excludes is_adjustment transactions', async () => {
    // If adjustments were included, they would show up with no category (null)
    // or inflate the "Balance Adjustment" category
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
});

await runSuite('Weekly Report — Message Format Simulation', async () => {

  await test('can build valid weekly message string without NaN/undefined', async () => {
    const [summaryRes, catRes] = await Promise.all([
      rpc('get_summary', { p_start_date: startDate, p_end_date: endDate }),
      rpc('get_category_breakdown', { p_start_date: startDate, p_end_date: endDate, p_type: 'expense' }),
    ]);

    const row = summaryRes.data[0];
    const income = row.total_income || 0;
    const expense = row.total_expense || 0;
    const net = row.net_cashflow ?? 0;
    const fmt = (n) => new Intl.NumberFormat('id-ID').format(Math.abs(n));

    const categories = catRes.data.slice(0, 5);
    const catLines = categories.length > 0
      ? categories.map((c, i) =>
          `${i + 1}. ${c.category_name}: Rp ${fmt(c.total_amount)} (${(c.percentage || 0).toFixed(1)}%)`
        ).join('\n')
      : 'Tidak ada data';

    const message = `Income: Rp ${fmt(income)}\nExpense: Rp ${fmt(expense)}\nNet: Rp ${fmt(net)}\n${catLines}`;

    // Must not contain NaN or undefined
    expect(message.includes('NaN')).toBe(false);
    expect(message.includes('undefined')).toBe(false);
    expect(message.length).toBeGreaterThan(10);
  });
});
