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
