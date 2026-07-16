#!/usr/bin/env node
// tests/integration/bot-provisioning.test.js
// Replicates the telegram bot's onboarding flow end-to-end against real Supabase:
// invite -> provision user -> link chat -> consume code -> seeded + isolated + scoped-writable.
import { test, expect, runSuite } from './run.js';
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

await runSuite('Bot provisioning + scoping', async () => {
  await test('invite -> provision -> link -> consume; new user seeded, isolated, and scoped-writable', async () => {
    const code = `bot-${Date.now()}`;
    const email = `bot-provision-${Date.now()}@example.com`;
    const fakeChatId = 900000000 + (Date.now() % 1000000);
    let newUserId = null;

    try {
      // 1. Owner creates an invite.
      const inviteRes = await sr('/invite_codes', {
        method: 'POST',
        body: JSON.stringify({ code, created_by: OWNER_ID, expires_at: '2100-01-01' }),
      });
      expect(inviteRes.status).toBe(201);

      // 2. Validate the code as the bot does.
      const nowISO = new Date().toISOString();
      const validateRes = await sr(
        `/invite_codes?code=eq.${code}&used_by=is.null&expires_at=gt.${nowISO}`
      );
      const validRows = await validateRes.json();
      expect(validRows.length).toBe(1);

      // 3. Provision: admin-create a user (fires DB trigger: seeds categories + Cash account).
      const createRes = await fetch(`${SB_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          apikey: SR,
          Authorization: `Bearer ${SR}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          email_confirm: true,
          password: crypto.randomUUID(),
        }),
      });
      const created = await createRes.json();
      if (!created.id) throw new Error(`create user failed: ${JSON.stringify(created)}`);
      newUserId = created.id;

      // 4. Link chat.
      const linkRes = await sr('/telegram_links', {
        method: 'POST',
        body: JSON.stringify({ chat_id: fakeChatId, user_id: newUserId }),
      });
      expect(linkRes.status).toBe(201);

      // 5. Consume the invite.
      const consumeRes = await sr(`/invite_codes?code=eq.${code}`, {
        method: 'PATCH',
        body: JSON.stringify({ used_by: newUserId, used_at: new Date().toISOString() }),
      });
      expect(consumeRes.status).toBe(204);

      // 6. Assertions.
      const jwt = signUserJwt(newUserId, JWT_SECRET);
      const asNewUser = asUser(jwt);

      // Seed fired.
      const cats = await (await asNewUser('/categories?select=id')).json();
      expect(cats.length).toBeGreaterThan(0);
      const accounts = await (await asNewUser('/accounts?select=name')).json();
      expect(accounts.some((a) => a.name === 'Cash')).toBe(true);

      // Isolation: no owner rows visible.
      const txRes = await asNewUser('/transactions?select=user_id&limit=1000');
      const tx = await txRes.json();
      expect(Array.isArray(tx)).toBe(true);
      expect(tx.length).toBe(0);
      expect(tx.some((r) => r.user_id === OWNER_ID)).toBe(false);

      // Link + consume persisted.
      const linkCheck = await (await sr(`/telegram_links?chat_id=eq.${fakeChatId}`)).json();
      expect(linkCheck.length).toBe(1);
      expect(linkCheck[0].user_id).toBe(newUserId);
      const codeCheck = await (await sr(`/invite_codes?code=eq.${code}`)).json();
      expect(codeCheck.length).toBe(1);
      expect(codeCheck[0].used_by).toBe(newUserId);

      // Scoped write: trigger auto-stamps user_id from auth.uid().
      const writeRes = await asNewUser('/accounts', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ name: 'BotTest', type: 'ewallet', balance: 50 }),
      });
      expect(writeRes.status).toBe(201);
      const written = await writeRes.json();
      expect(written[0].user_id).toBe(newUserId);
    } finally {
      // 7. Cleanup — unconditional, in dependency order.
      await sr(`/telegram_links?chat_id=eq.${fakeChatId}`, { method: 'DELETE' });
      await sr(`/invite_codes?code=eq.${code}`, { method: 'DELETE' });
      if (newUserId) {
        for (const tbl of ['transactions', 'installments', 'recurring_transactions',
                            'budgets', 'instruments', 'categories', 'accounts']) {
          await sr(`/${tbl}?user_id=eq.${newUserId}`, { method: 'DELETE' });
        }
        await sr(`/profiles?id=eq.${newUserId}`, { method: 'DELETE' });
        await fetch(`${SB_URL}/auth/v1/admin/users/${newUserId}`, {
          method: 'DELETE',
          headers: { apikey: SR, Authorization: `Bearer ${SR}` },
        });
      }
    }
  });
});
