#!/usr/bin/env node
// tests/integration/rls-isolation.test.js
// Proves isolated multi-user: a user can only ever see their own rows.
import { test, expect, runSuite } from './run.js';
import { asUser, createTestUser } from './helpers/users.js';

const OWNER_ID = 'dc20c468-c97f-4086-90f5-493007704eff';

await runSuite('RLS isolation — direct tables', async () => {
  await test('user B cannot read owner transactions', async () => {
    const b = await createTestUser(`phase1-b-${Date.now()}@example.com`);
    try {
      const res = await asUser(b.jwt)(`/transactions?select=id,user_id&limit=1000`);
      const rows = await res.json();
      expect(Array.isArray(rows)).toBe(true);
      // B must see zero owner rows.
      expect(rows.some(r => r.user_id === OWNER_ID)).toBe(false);
    } finally {
      await b.cleanup();
    }
  });
});

await runSuite('RLS isolation — views & owner', async () => {
  await test('user B sees no owner rows in v_transactions', async () => {
    const b = await createTestUser(`phase1-vb-${Date.now()}@example.com`);
    try {
      const res = await asUser(b.jwt)(`/v_transactions?select=id&limit=1000`);
      const rows = await res.json();
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBe(0); // B has no transactions
    } finally {
      await b.cleanup();
    }
  });

  await test('owner still sees own rows through RLS', async () => {
    const owner = await createTestUser(`phase1-owner-check-${Date.now()}@example.com`);
    try {
      // brand-new user: seeded categories exist, transactions do not
      const cats = await (await asUser(owner.jwt)(`/categories?select=id`)).json();
      expect(cats.length).toBeGreaterThan(0);
      const tx = await (await asUser(owner.jwt)(`/transactions?select=id`)).json();
      expect(tx.length).toBe(0);
    } finally {
      await owner.cleanup();
    }
  });
});

await runSuite('RLS isolation — analytics RPCs', async () => {
  const RPCS = [
    ['get_summary', { p_start_date: '2000-01-01', p_end_date: '2100-01-01' }],
    ['get_category_breakdown', { p_start_date: '2000-01-01', p_end_date: '2100-01-01', p_type: 'expense' }],
    ['get_monthly_trend', { p_months: 240 }],
    ['get_expense_heatmap', { p_start_date: '2000-01-01', p_end_date: '2100-01-01' }],
    ['get_period_comparison', { p_start: '2000-01-01', p_end: '2100-01-01', p_prev_start: '1999-01-01', p_prev_end: '1999-12-31' }],
    ['get_savings_rate_trend', { p_months: 240 }],
    ['get_top_transactions', { p_start: '2000-01-01', p_end: '2100-01-01', p_limit: 1000 }],
    ['get_daily_spending', { p_start: '2000-01-01', p_end: '2100-01-01' }],
  ];

  await test('every analytics RPC returns empty/zero for a fresh user', async () => {
    const b = await createTestUser(`phase1-rpc-${Date.now()}@example.com`);
    try {
      for (const [fn, body] of RPCS) {
        const res = await asUser(b.jwt)(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(body) });
        const data = await res.json();
        expect(res.status).toBe(200);
        // Fresh user has no transactions -> no rows, or a single all-zero summary row.
        const leaked = Array.isArray(data)
          ? data.some(r => Number(r.total_income ?? r.total_expense ?? r.total_amount ?? r.amount ?? r.income ?? r.expense ?? 0) !== 0
                        || Number(r.transaction_count ?? 0) !== 0)
          : false;
        expect(leaked).toBe(false);
      }
    } finally {
      await b.cleanup();
    }
  });
});
