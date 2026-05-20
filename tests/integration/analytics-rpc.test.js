#!/usr/bin/env node
// Tests: Supabase RPC analytics functions
// Covers bugs: wrong param names (start_date vs p_start_date), is_adjustment exclusion, c.total vs c.total_amount

import { test, expect, runSuite } from './run.js';

const SB_URL = 'https://dqvdhkpqyynvwfbuqyzu.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function rpc(fn, body) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

const TODAY = new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];
const MONTH_START = TODAY.slice(0, 7) + '-01';

await runSuite('Supabase RPC — Param Names', async () => {

  await test('get_summary uses p_start_date / p_end_date (not start_date / end_date)', async () => {
    // Wrong params → should 404
    const wrong = await rpc('get_summary', { start_date: MONTH_START, end_date: TODAY });
    expect(wrong.status).toBe(404);

    // Correct params → 200
    const ok = await rpc('get_summary', { p_start_date: MONTH_START, p_end_date: TODAY });
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.data)).toBe(true);
  });

  await test('get_category_breakdown uses p_start_date / p_end_date / p_type', async () => {
    const wrong = await rpc('get_category_breakdown', { start_date: MONTH_START, end_date: TODAY, p_type: 'expense' });
    expect(wrong.status).toBe(404);

    const ok = await rpc('get_category_breakdown', { p_start_date: MONTH_START, p_end_date: TODAY, p_type: 'expense' });
    expect(ok.status).toBe(200);
  });

  await test('get_monthly_trend uses p_months (not n_months)', async () => {
    const wrong = await rpc('get_monthly_trend', { n_months: 3 });
    expect(wrong.status).toBe(404);

    const ok = await rpc('get_monthly_trend', { p_months: 3 });
    expect(ok.status).toBe(200);
  });

  await test('get_period_comparison returns 200', async () => {
    const prevStart = new Date(new Date(MONTH_START) - 30 * 86400000).toISOString().split('T')[0];
    const prevEnd = new Date(new Date(MONTH_START) - 86400000).toISOString().split('T')[0];
    const r = await rpc('get_period_comparison', {
      p_start: MONTH_START, p_end: TODAY,
      p_prev_start: prevStart, p_prev_end: prevEnd,
    });
    expect(r.status).toBe(200);
  });

  await test('get_daily_spending returns 200', async () => {
    const r = await rpc('get_daily_spending', { p_start: MONTH_START, p_end: TODAY });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data)).toBe(true);
  });

  await test('get_top_transactions returns 200', async () => {
    const r = await rpc('get_top_transactions', { p_start: MONTH_START, p_end: TODAY, p_limit: 5 });
    expect(r.status).toBe(200);
  });
});

await runSuite('Supabase RPC — Response Shape', async () => {

  await test('get_summary returns expected fields', async () => {
    const { data } = await rpc('get_summary', { p_start_date: MONTH_START, p_end_date: TODAY });
    const row = data[0];
    expect('total_income' in row).toBe(true);
    expect('total_expense' in row).toBe(true);
    expect('net_cashflow' in row).toBe(true);
    expect('transaction_count' in row).toBe(true);
  });

  await test('get_category_breakdown returns total_amount (not total)', async () => {
    // Bug: n8n used c.total, field is actually c.total_amount
    const { data } = await rpc('get_category_breakdown', {
      p_start_date: MONTH_START, p_end_date: TODAY, p_type: 'expense',
    });
    if (data.length > 0) {
      expect('total_amount' in data[0]).toBe(true);
      expect('total' in data[0]).toBe(false);
    }
  });

  await test('get_monthly_trend returns income/expense/net (not total_income/total_expense)', async () => {
    const { data } = await rpc('get_monthly_trend', { p_months: 3 });
    expect(data.length).toBeGreaterThan(0);
    expect('income' in data[0]).toBe(true);
    expect('expense' in data[0]).toBe(true);
    expect('net' in data[0]).toBe(true);
  });
});

await runSuite('Supabase RPC — Adjustment Exclusion', async () => {

  await test('get_top_transactions excludes is_adjustment=true', async () => {
    const { data } = await rpc('get_top_transactions', { p_start: MONTH_START, p_end: TODAY, p_limit: 50 });
    const hasAdjustment = data.some(t => t.description?.includes('Balance adjustment'));
    expect(hasAdjustment).toBe(false);
  });

  await test('v_transactions query with is_adjustment=eq.false excludes adjustments', async () => {
    const res = await fetch(
      `${SB_URL}/rest/v1/v_transactions?is_adjustment=eq.false&type=eq.expense&order=amount.desc&limit=10`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const data = await res.json();
    const hasAdjustment = data.some(t => t.description?.includes('Balance adjustment'));
    expect(hasAdjustment).toBe(false);
  });
});
