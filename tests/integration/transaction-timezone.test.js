#!/usr/bin/env node
// Tests: transaction date/timezone correctness
// Covers bugs: date-only string stored as midnight UTC, UTC displayed as WIB in edit dialog

import { test, expect, runSuite } from './run.js';

const SB_URL = 'https://dqvdhkpqyynvwfbuqyzu.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// transactions.user_id is NOT NULL (multi-user); service-role inserts must set it explicitly.
const OWNER_ID = 'dc20c468-c97f-4086-90f5-493007704eff';

async function sbInsert(table, body) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function sbDelete(table, id) {
  await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'DELETE',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
}

async function sbGet(table, params) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}${params}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  return res.json();
}

// Get any active account + category for test inserts
const accounts = await sbGet('accounts', '?is_active=eq.true&limit=1');
const TEST_ACCOUNT = accounts[0];

await runSuite('Transaction Timezone Storage', async () => {

  await test('WIB date string (2026-05-18T00:00:00+07:00) stored as 17:00 UTC prev day', async () => {
    // "2026-05-18T00:00:00+07:00" = "2026-05-17T17:00:00Z"
    const [tx] = await sbInsert('transactions', {
      type: 'expense',
      amount: 1,
      description: 'timezone test - midnight wib',
      account_id: TEST_ACCOUNT.id,
      transaction_date: '2026-05-18T00:00:00+07:00',
      source: 'manual_web',
      is_deleted: false,
      user_id: OWNER_ID,
    });
    expect(tx.transaction_date).toContain('2026-05-17T17:00:00');
    await sbDelete('transactions', tx.id);
  });

  await test('date-only string stored as midnight UTC (known old bug pattern)', async () => {
    // Before fix: form sent "2026-05-18" (no time) → stored as midnight UTC = 07:00 WIB
    // This test documents the behavior — date-only inputs should NOT be used
    const [tx] = await sbInsert('transactions', {
      type: 'expense',
      amount: 1,
      description: 'timezone test - date only',
      account_id: TEST_ACCOUNT.id,
      transaction_date: '2026-05-18',
      source: 'manual_web',
      is_deleted: false,
      user_id: OWNER_ID,
    });
    // Stored as midnight UTC — not WIB-aware
    expect(tx.transaction_date).toContain('2026-05-18T00:00:00');
    await sbDelete('transactions', tx.id);
  });

  await test('WIB noon timestamp round-trips correctly', async () => {
    // "2026-05-18T12:30:00+07:00" = "2026-05-18T05:30:00Z"
    const [tx] = await sbInsert('transactions', {
      type: 'expense',
      amount: 1,
      description: 'timezone test - noon wib',
      account_id: TEST_ACCOUNT.id,
      transaction_date: '2026-05-18T12:30:00+07:00',
      source: 'manual_web',
      is_deleted: false,
      user_id: OWNER_ID,
    });
    expect(tx.transaction_date).toContain('2026-05-18T05:30:00');
    await sbDelete('transactions', tx.id);
  });

  await test('toWIBDatetimeLocal helper converts UTC to WIB correctly', async () => {
    // Simulate what TransactionEditDialog now does
    function toWIBDatetimeLocal(utcString) {
      const wib = new Date(new Date(utcString).getTime() + 7 * 60 * 60 * 1000);
      return wib.toISOString().slice(0, 16);
    }

    // 04:15 UTC → 11:15 WIB
    expect(toWIBDatetimeLocal('2026-05-18T04:15:00+00:00')).toBe('2026-05-18T11:15');
    // 17:00 UTC prev day → 00:00 WIB (midnight)
    expect(toWIBDatetimeLocal('2026-05-17T17:00:00+00:00')).toBe('2026-05-18T00:00');
    // 00:00 UTC → 07:00 WIB
    expect(toWIBDatetimeLocal('2026-05-18T00:00:00+00:00')).toBe('2026-05-18T07:00');
  });

  await test('WIB default date matches Jakarta date not UTC date', async () => {
    // Simulate TransactionForm default date logic (after fix)
    // At 00:30 UTC (07:30 WIB), UTC date = today but WIB date = also today (same)
    // At 18:00 UTC (01:00 WIB next day), UTC date = today but WIB date = tomorrow
    function getWIBDate(nowMs) {
      const wib = new Date(nowMs + 7 * 60 * 60 * 1000);
      return wib.toISOString().split('T')[0];
    }

    // Simulate: 2026-05-18 23:30 UTC = 2026-05-19 06:30 WIB
    const utcNight = new Date('2026-05-18T23:30:00Z').getTime();
    expect(getWIBDate(utcNight)).toBe('2026-05-19'); // WIB date is next day
    // Not '2026-05-18' (UTC date)
  });
});

await runSuite('n8n Email Parser — Timezone', async () => {

  await test('BCA parser converts DD/MM/YYYY to ISO+07:00 correctly', async () => {
    // BCA email date format: "14/05/2026, 14:55:58" (DD/MM/YYYY, HH:MM:SS)
    // n8n BCA parser must reformat to ISO before appending +07:00
    function parseBCADate(matched) {
      // matched = "14/05/2026, 14:55:58"
      const [datePart, timePart] = matched.split(', ');
      const [dd, mm, yyyy] = datePart.split('/');
      const iso = `${yyyy}-${mm}-${dd}T${timePart}+07:00`;
      return new Date(iso);
    }

    const parsed = parseBCADate('14/05/2026, 14:55:58');
    // 14:55:58 WIB = 07:55:58 UTC
    expect(parsed.toISOString()).toContain('2026-05-14T07:55:58');
  });

  await test('BSI parser uses explicit +07:00 in ISO string', async () => {
    // Simulate BSI parser logic
    const dd = '18', mon = 'Mei', yyyy = '2026', hh = '11', mm = '15';
    const monthMap = { Jan:1,Feb:2,Mar:3,Apr:4,Mei:5,Jun:6,Jul:7,Agt:8,Sep:9,Okt:10,Nov:11,Des:12 };
    const month = monthMap[mon];
    const transactionDate = new Date(
      `${yyyy}-${String(month).padStart(2,'0')}-${dd.padStart(2,'0')}T${hh}:${mm}:00+07:00`
    ).toISOString();
    // 11:15 WIB = 04:15 UTC
    expect(transactionDate).toContain('2026-05-18T04:15:00');
  });
});
