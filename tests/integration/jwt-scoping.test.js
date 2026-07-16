#!/usr/bin/env node
// Proves a self-signed HS256 user JWT scopes REST access via RLS (the Phase-2 bot approach).
import { test, expect, runSuite } from './run.js';
import { signUserJwt } from './helpers/jwt.js';
import { createTestUser } from './helpers/users.js';

const SB_URL = 'https://dqvdhkpqyynvwfbuqyzu.supabase.co';
const ANON = process.env.SUPABASE_ANON_KEY;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const OWNER_ID = 'dc20c468-c97f-4086-90f5-493007704eff';

await runSuite('JWT scoping — self-signed user token', async () => {
  await test('signed JWT sees only its own rows via RLS', async () => {
    if (!JWT_SECRET) throw new Error('SUPABASE_JWT_SECRET not set');
    const b = await createTestUser(`phase2-jwt-${Date.now()}@example.com`);
    try {
      const jwt = signUserJwt(b.userId, JWT_SECRET);
      const res = await fetch(`${SB_URL}/rest/v1/transactions?select=id,user_id&limit=1000`, {
        headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
      });
      expect(res.status).toBe(200);
      const rows = await res.json();
      expect(rows.some((r) => r.user_id === OWNER_ID)).toBe(false);
      expect(rows.length).toBe(0);
    } finally {
      await b.cleanup();
    }
  });
});
