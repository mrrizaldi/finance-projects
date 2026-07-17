#!/usr/bin/env node
// Tests: localized signup seed (migration 051)
//
// Guard fitur i18n: bahasa dipilih saat signup (metadata `locale`) → seed kategori default
// ikut bahasa itu, dan profiles.locale ke-set. Chain: auth.users insert →
// handle_new_user (baca raw_user_meta_data->>'locale') → profiles → seed_user_data (cabang id/en).
//
// Nama kategori = DATA USER: kita cuma cek LIST yang benar ke-insert, bukan translate runtime.

import { test, runSuite, expect } from './run.js';

const SB_URL = 'https://dqvdhkpqyynvwfbuqyzu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

// Buat user via admin API dgn user_metadata.locale (setara options.data di signUp).
async function createUser(email, meta) {
  const res = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ email, password: 'Test-Passw0rd!', email_confirm: true, user_metadata: meta }),
  });
  const user = await res.json();
  if (!user.id) throw new Error(`create user failed: ${JSON.stringify(user)}`);
  return user.id;
}

async function categoriesOf(userId) {
  const rows = await fetch(
    `${SB_URL}/rest/v1/categories?user_id=eq.${userId}&select=name,type,sort_order&order=sort_order`,
    { headers: H }
  ).then(r => r.json());
  return rows;
}

async function localeOf(userId) {
  const rows = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=locale`, { headers: H }).then(r => r.json());
  return rows[0]?.locale;
}

async function cleanup(userId) {
  if (!userId) return;
  // FK ke auth.users NO ACTION untuk categories/accounts → hapus baris dulu, baru user.
  for (const tbl of ['transactions', 'categories', 'accounts']) {
    await fetch(`${SB_URL}/rest/v1/${tbl}?user_id=eq.${userId}`, { method: 'DELETE', headers: H });
  }
  await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, { method: 'DELETE', headers: H });
  await fetch(`${SB_URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: H });
}

await runSuite('i18n localized seed (mig 051)', async () => {
  let enUser, idUser, defUser;
  try {
    await test('locale=en → kategori English + profiles.locale=en', async () => {
      enUser = await createUser(`i18n-en-${Date.now()}@example.com`, { display_name: 'EN User', locale: 'en' });
      expect(await localeOf(enUser)).toBe('en');
      const cats = await categoriesOf(enUser);
      expect(cats.length).toBe(17);
      const names = cats.map(c => c.name);
      // Sampel yang membedakan bahasa (bukan cognate spt Transport/Bonus/Cashback).
      expect(names).toContain('Food');
      expect(names).toContain('Shopping');
      expect(names).toContain('Salary');
      expect(names).toContain('Other Income');
      expect(names.includes('Makan')).toBe(false);
    });

    await test('locale=id → kategori Indonesia + profiles.locale=id', async () => {
      idUser = await createUser(`i18n-id-${Date.now()}@example.com`, { display_name: 'ID User', locale: 'id' });
      expect(await localeOf(idUser)).toBe('id');
      const names = (await categoriesOf(idUser)).map(c => c.name);
      expect(names).toContain('Makan');
      expect(names).toContain('Belanja');
      expect(names).toContain('Gaji');
      expect(names.includes('Food')).toBe(false);
    });

    await test('tanpa metadata locale → default Indonesia', async () => {
      defUser = await createUser(`i18n-def-${Date.now()}@example.com`, { display_name: 'Default User' });
      expect(await localeOf(defUser)).toBe('id');
      const names = (await categoriesOf(defUser)).map(c => c.name);
      expect(names).toContain('Makan');
    });
  } finally {
    await cleanup(enUser);
    await cleanup(idUser);
    await cleanup(defUser);
  }
});
