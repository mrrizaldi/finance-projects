#!/usr/bin/env node
// tests/integration/onboarding-v2.test.js
// Replicates the new telegram onboarding flow at the DB level (API/bot do the same steps):
// web signup -> dashboard connect (deep-link token) -> bot creates pending telegram_links row
// -> owner approves -> linked. Also covers reject.
import { test, expect, runSuite } from './run.js';
import { createTestUser } from './helpers/users.js';
import { signUserJwt } from './helpers/jwt.js';

const SB_URL = 'https://dqvdhkpqyynvwfbuqyzu.supabase.co';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const OWNER_ID = 'dc20c468-c97f-4086-90f5-493007704eff';

if (!SR) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
if (!ANON) throw new Error('SUPABASE_ANON_KEY not set');
if (!JWT_SECRET) throw new Error('SUPABASE_JWT_SECRET not set');

const sr = (path, init = {}) =>
  fetch(`${SB_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SR,
      Authorization: `Bearer ${SR}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

const asUser = (jwt) => (path, init = {}) =>
  fetch(`${SB_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

await runSuite('Onboarding v2 — connect / approve / reject', async () => {
  let userB = null;
  const fakeChatId = 900000000 + (Date.now() % 1000000);
  const fakeChatId2 = fakeChatId + 1;
  const token = `tok-${Date.now()}`;

  try {
    await test('connect-token → pending → approve; user scoped, isolated', async () => {
      // 1. Throwaway user B.
      userB = await createTestUser(`onboarding-v2-${Date.now()}@example.com`);

      // 2. Insert connect token (SR).
      const tokenRes = await sr('/telegram_connect_tokens', {
        method: 'POST',
        body: JSON.stringify({ token, user_id: userB.userId, expires_at: '2100-01-01' }),
      });
      expect(tokenRes.status).toBe(201);

      // 3a. Bot looks up the token.
      const nowISO = new Date().toISOString();
      const lookupRes = await sr(`/telegram_connect_tokens?token=eq.${token}&expires_at=gt.${nowISO}`);
      const lookupRows = await lookupRes.json();
      expect(lookupRows.length).toBe(1);
      expect(lookupRows[0].user_id).toBe(userB.userId);

      // 3b. Bot upserts a pending telegram_links row.
      const upsertRes = await sr('/telegram_links', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          chat_id: fakeChatId,
          user_id: userB.userId,
          status: 'pending',
          requested_at: nowISO,
        }),
      });
      expect([200, 201].includes(upsertRes.status)).toBe(true);

      // 3c. Bot deletes the token (single-use).
      await sr(`/telegram_connect_tokens?token=eq.${token}`, { method: 'DELETE' });

      // 4. Assertions: token gone, pending link exists, no approved link yet.
      const tokenCheck = await (await sr(`/telegram_connect_tokens?token=eq.${token}`)).json();
      expect(tokenCheck.length).toBe(0);

      const pendingCheck = await (
        await sr(`/telegram_links?chat_id=eq.${fakeChatId}&select=status`)
      ).json();
      expect(pendingCheck.length).toBe(1);
      expect(pendingCheck[0].status).toBe('pending');

      const notYetApproved = await (
        await sr(`/telegram_links?chat_id=eq.${fakeChatId}&status=eq.approved`)
      ).json();
      expect(notYetApproved.length).toBe(0);

      // 5. Owner approves.
      const approveRes = await sr(`/telegram_links?chat_id=eq.${fakeChatId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved', approved_at: new Date().toISOString() }),
      });
      expect(approveRes.status).toBe(204);

      // 6. Assert approved.
      const approvedCheck = await (
        await sr(`/telegram_links?chat_id=eq.${fakeChatId}&status=eq.approved`)
      ).json();
      expect(approvedCheck.length).toBe(1);
      expect(approvedCheck[0].user_id).toBe(userB.userId);

      // 7. Scoping/isolation as user B.
      const jwt = signUserJwt(userB.userId, JWT_SECRET);
      const asB = asUser(jwt);

      const cats = await (await asB('/categories?select=id')).json();
      expect(cats.length).toBeGreaterThan(0);

      const tx = await (await asB('/transactions?select=user_id&limit=1000')).json();
      expect(tx.length).toBe(0);
      expect(tx.some((r) => r.user_id === OWNER_ID)).toBe(false);
    });

    await test('reject removes the pending link', async () => {
      const pendingRes = await sr('/telegram_links', {
        method: 'POST',
        body: JSON.stringify({
          chat_id: fakeChatId2,
          user_id: userB.userId,
          status: 'pending',
          requested_at: new Date().toISOString(),
        }),
      });
      expect(pendingRes.status).toBe(201);

      const rejectRes = await sr(`/telegram_links?chat_id=eq.${fakeChatId2}&status=eq.pending`, {
        method: 'DELETE',
      });
      expect(rejectRes.status).toBe(204);

      const gone = await (await sr(`/telegram_links?chat_id=eq.${fakeChatId2}`)).json();
      expect(gone.length).toBe(0);
    });
  } finally {
    // Cleanup — unconditional.
    await sr(`/telegram_links?chat_id=eq.${fakeChatId}`, { method: 'DELETE' });
    await sr(`/telegram_links?chat_id=eq.${fakeChatId2}`, { method: 'DELETE' });
    await sr(`/telegram_connect_tokens?token=eq.${token}`, { method: 'DELETE' });
    if (userB) await userB.cleanup();
  }
});
