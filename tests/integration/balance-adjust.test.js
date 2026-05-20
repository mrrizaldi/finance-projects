#!/usr/bin/env node
// Tests: balance adjustment workflow
// Covers bugs: wrong field name (new_balance vs target_balance), is_adjustment flag

import { test, expect, runSuite } from './run.js';

const BASE = 'http://localhost:3700';
const SB_URL = 'https://dqvdhkpqyynvwfbuqyzu.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const json = await res.json();
  return { status: res.status, ...json };
}

async function sbQuery(table, params = '') {
  const res = await fetch(`${SB_URL}/rest/v1/${table}${params}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  return res.json();
}

// Get a real active account to test against
async function getTestAccount() {
  const accounts = await sbQuery('accounts', '?is_active=eq.true&limit=1');
  return accounts[0];
}

await runSuite('Balance Adjustment API', async () => {

  await test('rejects missing target_balance', async () => {
    const account = await getTestAccount();
    const r = await api(`/api/accounts/${account.id}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'test' }), // no target_balance
    });
    expect(r.status).toBe(400);
  });

  await test('rejects wrong field name (new_balance)', async () => {
    // This was the BalancesClient bug — sending new_balance instead of target_balance
    const account = await getTestAccount();
    const r = await api(`/api/accounts/${account.id}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_balance: account.balance }), // wrong field
    });
    // Should reject because target_balance is NaN
    expect(r.status).toBe(400);
  });

  await test('accepts correct target_balance field', async () => {
    const account = await getTestAccount();
    const r = await api(`/api/accounts/${account.id}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_balance: account.balance }), // correct field, same value = delta 0
    });
    expect(r.status).toBe(200);
    expect(r.success).toBe(true);
  });

  await test('delta=0 when target equals current balance (no tx created)', async () => {
    const account = await getTestAccount();
    const r = await api(`/api/accounts/${account.id}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_balance: account.balance }),
    });
    expect(r.data.delta).toBe(0);
  });

  await test('adjustment transaction has is_adjustment=true', async () => {
    const account = await getTestAccount();
    const newBalance = account.balance + 1; // +1 rupiah delta

    await api(`/api/accounts/${account.id}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_balance: newBalance, note: 'e2e test' }),
    });

    // Check adjustment transaction was created with is_adjustment=true
    const txs = await sbQuery('transactions',
      `?account_id=eq.${account.id}&is_adjustment=eq.true&order=created_at.desc&limit=1`
    );
    expect(txs.length).toBeGreaterThan(0);
    expect(txs[0].is_adjustment).toBe(true);
    expect(txs[0].amount).toBe(1);

    // Restore original balance
    await api(`/api/accounts/${account.id}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_balance: account.balance, note: 'e2e test cleanup' }),
    });
  });

  await test('adjustment NOT counted in get_summary analytics', async () => {
    const account = await getTestAccount();
    const today = new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];

    // Get baseline summary (must use POST for RPC)
    const before = await fetch(`${SB_URL}/rest/v1/rpc/get_summary`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_start_date: today, p_end_date: today }),
    }).then(r => r.json());

    // Adjust by +10000
    const newBalance = account.balance + 10000;
    await api(`/api/accounts/${account.id}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_balance: newBalance, note: 'e2e analytics test' }),
    });

    // Summary should not change (adjustment excluded)
    const after = await fetch(`${SB_URL}/rest/v1/rpc/get_summary`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_start_date: today, p_end_date: today }),
    }).then(r => r.json());

    expect(after[0].total_income).toBe(before[0]?.total_income ?? 0);
    expect(after[0].total_expense).toBe(before[0]?.total_expense ?? 0);

    // Restore
    await api(`/api/accounts/${account.id}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_balance: account.balance, note: 'e2e cleanup' }),
    });
  });
});
