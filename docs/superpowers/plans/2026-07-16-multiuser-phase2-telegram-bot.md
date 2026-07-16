# Multi-User Phase 2 — Telegram Bot + Invite Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the telegram bot multi-user: invited people onboard via the bot, each gets an isolated account, and the bot enforces isolation via per-user JWT + RLS.

**Architecture:** Per message, resolve `chat_id → user_id` (service role), mint an HS256 JWT (`sub = user_id`, signed with `SUPABASE_JWT_SECRET`) and run all user data ops through an auth-scoped client → RLS scopes automatically. Provisioning/admin (create user, invites, links, resolution) use the service role.

**Tech Stack:** grammY (`Bot<MyContext>`, `@grammyjs/conversations`), `@supabase/supabase-js` ^2.39 (admin API), `node:crypto` for JWT (no new dep), Supabase Postgres (RLS, HS256 legacy JWT), Supabase MCP for migrations, ssh MCP for bot edits, plain-Node integration tests.

**Spec:** `docs/superpowers/specs/2026-07-16-multiuser-phase2-telegram-bot-design.md`
**Owner user id:** `dc20c468-c97f-4086-90f5-493007704eff`
**Bot location (server, NOT in repo):** `~/dev/finance-project/telegram-bot` (pm2 app `finance-bot`, runs via tsx). Edit via ssh MCP (`mcp__ssh-mcp__exec` to `192.168.31.221`). PATH for node/pm2/tsc: `export PATH="$HOME/.proto/tools/node/globals/bin:$HOME/.proto/bin:$PATH"`.
**Bot env file:** `~/dev/finance-project/.env` (dotenv, read by `src/config.ts`).

**Conventions:**
- DB ops via Supabase MCP (`apply_migration`, `execute_sql`), project `dqvdhkpqyynvwfbuqyzu`. Never psql/CLI.
- Bot code: read the current server file before editing; back it up (`cp x x.bak-phase2`) first; after edits run `./node_modules/.bin/tsc --noEmit` in the bot dir (npx is unavailable) then `pm2 restart finance-bot`.
- Test keys: `SUPABASE_SERVICE_ROLE_KEY` (`api/.env`), `SUPABASE_ANON_KEY` (`dashboard/.env.local` → `VITE_SUPABASE_ANON_KEY`), `SUPABASE_JWT_SECRET` (see Task 0).
- Account types: `bank | ewallet | cash | marketplace | other | investment`.

---

## Task 0: Prerequisite — add SUPABASE_JWT_SECRET (owner action)

**This is a human/owner step; the JWT tasks are blocked until it's done.**

- [ ] **Step 1:** Owner copies the project JWT secret: Supabase dashboard → Project Settings → API → **JWT Secret**.
- [ ] **Step 2:** Add it to the bot env on the server: append `SUPABASE_JWT_SECRET=<value>` to `~/dev/finance-project/.env`. Also export it in the shell used to run the repo integration tests (or add to a local `.env` the tests read).
- [ ] **Step 3:** Verify it's a legacy HS256 secret: signing an HS256 JWT with it and calling Supabase REST must return 200 (proven by Task 3). If the project uses asymmetric keys instead (no shared secret), STOP — the design's self-signing approach must be revisited.

---

## Task 1: Migration 047 — telegram_links + invite_codes

**Files:**
- Create: `supabase/migrations/047_telegram_multiuser.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 047: Phase 2 multi-user — telegram chat linking + invite codes.
CREATE TABLE IF NOT EXISTS public.telegram_links (
  chat_id     bigint PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telegram_links_user ON public.telegram_links(user_id);
ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_link ON public.telegram_links;
CREATE POLICY own_link ON public.telegram_links FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.invite_codes (
  code        text PRIMARY KEY,
  created_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text,
  used_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at     timestamptz,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invite_codes_creator ON public.invite_codes(created_by);
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_invites ON public.invite_codes;
CREATE POLICY own_invites ON public.invite_codes FOR ALL
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
```

- [ ] **Step 2: Apply** via Supabase MCP `apply_migration`, name `047_telegram_multiuser`, project `dqvdhkpqyynvwfbuqyzu`.

- [ ] **Step 3: Verify** (Supabase MCP `execute_sql`):
```sql
select c.relname, c.relrowsecurity, count(p.polname) policies
from pg_class c left join pg_policy p on p.polrelid=c.oid
where c.relname in ('telegram_links','invite_codes') group by 1,2;
```
Expected: both `relrowsecurity = true`, `policies = 1`.

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/047_telegram_multiuser.sql
git commit -m "feat(db): telegram_links + invite_codes tables + RLS (047)"
```

---

## Task 2: Seed the owner's telegram link

**Files:** none (data step)

- [ ] **Step 1: Read the owner's telegram id from server env** (ssh MCP):
```bash
grep "^TELEGRAM_OWNER_ID=" ~/dev/finance-project/.env | cut -d= -f2- | tr -d '"'
```
Capture the numeric id (call it `<OWNER_CHAT_ID>`).

- [ ] **Step 2: Insert the link** via Supabase MCP `execute_sql` (project `dqvdhkpqyynvwfbuqyzu`):
```sql
insert into public.telegram_links (chat_id, user_id)
values (<OWNER_CHAT_ID>, 'dc20c468-c97f-4086-90f5-493007704eff')
on conflict (chat_id) do update set user_id = excluded.user_id;
```

- [ ] **Step 3: Verify**:
```sql
select chat_id, user_id from public.telegram_links where user_id = 'dc20c468-c97f-4086-90f5-493007704eff';
```
Expected: one row with the owner's chat_id. (No commit — data only.)

---

## Task 3: JWT→RLS proof (validates the whole scoping approach)

**Files:**
- Create: `tests/integration/helpers/jwt.js`
- Create: `tests/integration/jwt-scoping.test.js`

- [ ] **Step 1: Write the HS256 signer** (`tests/integration/helpers/jwt.js`):

```javascript
// Sign a Supabase-compatible HS256 user JWT with the project JWT secret.
import crypto from 'node:crypto';

const b64url = (s) => Buffer.from(s).toString('base64url');

export function signUserJwt(userId, secret, ttlSeconds = 300) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({
    sub: userId, role: 'authenticated', aud: 'authenticated',
    iat: now, exp: now + ttlSeconds,
  }));
  const data = `${header}.${payload}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}
```

- [ ] **Step 2: Write the failing test** (`tests/integration/jwt-scoping.test.js`):

```javascript
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
    if (!JWT_SECRET) throw new Error('SUPABASE_JWT_SECRET not set (Task 0)');
    const b = await createTestUser(`phase2-jwt-${Date.now()}@example.com`);
    try {
      const jwt = signUserJwt(b.userId, JWT_SECRET);
      const res = await fetch(`${SB_URL}/rest/v1/transactions?select=id,user_id&limit=1000`, {
        headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
      });
      expect(res.status).toBe(200);
      const rows = await res.json();
      // fresh user: zero transactions, and definitely none of the owner's
      expect(rows.some((r) => r.user_id === OWNER_ID)).toBe(false);
      expect(rows.length).toBe(0);
    } finally {
      await b.cleanup();
    }
  });
});
```

- [ ] **Step 3: Run** (from repo root):
```
SUPABASE_SERVICE_ROLE_KEY=<api/.env> SUPABASE_ANON_KEY=<VITE_SUPABASE_ANON_KEY> SUPABASE_JWT_SECRET=<Task 0> node tests/integration/jwt-scoping.test.js
```
Expected: PASS (200, zero rows, no owner rows). If it returns 401/403, the JWT secret or claims are wrong — STOP and report (the whole approach depends on this).

- [ ] **Step 4: Commit**
```bash
git add tests/integration/helpers/jwt.js tests/integration/jwt-scoping.test.js
git commit -m "test(phase2): self-signed HS256 JWT scopes via RLS"
```

---

## Task 4: Isolation test for the new tables

**Files:**
- Modify: `tests/integration/rls-isolation.test.js`

- [ ] **Step 1: Append a suite** proving `telegram_links`/`invite_codes` isolation. Uses the signed JWT as a second user; seeds one owner-created invite via service role first.

```javascript
await runSuite('RLS isolation — phase2 tables', async () => {
  await test('user B sees no telegram_links / invite_codes of others', async () => {
    const { signUserJwt } = await import('./helpers/jwt.js');
    const SB = 'https://dqvdhkpqyynvwfbuqyzu.supabase.co';
    const ANON = process.env.SUPABASE_ANON_KEY;
    const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    const OWNER_ID = 'dc20c468-c97f-4086-90f5-493007704eff';

    // owner-created invite via service role
    const code = `test-${Date.now()}`;
    await fetch(`${SB}/rest/v1/invite_codes`, {
      method: 'POST',
      headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, created_by: OWNER_ID, expires_at: '2100-01-01' }),
    });
    try {
      const { createTestUser } = await import('./helpers/users.js');
      const b = await createTestUser(`phase2-iso-${Date.now()}@example.com`);
      try {
        const jwt = signUserJwt(b.userId, JWT_SECRET);
        const inv = await (await fetch(`${SB}/rest/v1/invite_codes?select=code`, {
          headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
        })).json();
        expect(inv.some((r) => r.code === code)).toBe(false);
        const links = await (await fetch(`${SB}/rest/v1/telegram_links?select=chat_id`, {
          headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
        })).json();
        expect(links.length).toBe(0); // B has no link
      } finally { await b.cleanup(); }
    } finally {
      await fetch(`${SB}/rest/v1/invite_codes?code=eq.${code}`, {
        method: 'DELETE', headers: { apikey: SR, Authorization: `Bearer ${SR}` },
      });
    }
  });
});
```

- [ ] **Step 2: Run** the full isolation suite (with all three keys). Expected: all suites PASS including the new one.

- [ ] **Step 3: Commit**
```bash
git add tests/integration/rls-isolation.test.js
git commit -m "test(phase2): telegram_links/invite_codes isolation"
```

---

## Task 5: Bot — auth helper (resolveUserId + scoped client)

**Files (server):**
- Create: `~/dev/finance-project/telegram-bot/src/services/auth.ts`
- Modify: `~/dev/finance-project/telegram-bot/src/services/supabase.ts`

- [ ] **Step 1: Read** the current `src/services/supabase.ts` fully (understand the `db` singleton, the `supabase` client creation at top, and every method) and `src/config.ts` (env access). Back up: `cp src/services/supabase.ts src/services/supabase.ts.bak-phase2`.

- [ ] **Step 2: Create `src/services/auth.ts`**:

```typescript
import crypto from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

const admin = createClient(config.supabase.url, config.supabase.serviceRoleKey);

const b64url = (s: string) => Buffer.from(s).toString('base64url');

export function signUserJwt(userId: string, ttl = 300): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error('SUPABASE_JWT_SECRET not set');
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({
    sub: userId, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + ttl,
  }));
  const data = `${header}.${payload}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export async function resolveUserId(chatId: number): Promise<string | null> {
  const { data } = await admin.from('telegram_links')
    .select('user_id').eq('chat_id', chatId).maybeSingle();
  return (data as any)?.user_id ?? null;
}

export function scopedClient(userId: string): SupabaseClient {
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: { headers: { Authorization: `Bearer ${signUserJwt(userId)}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export { admin as adminClient };
```

> Requires `config.supabase.anonKey`. If `config.ts` lacks it, add `anonKey: process.env.SUPABASE_ANON_KEY!` to the supabase config block (the anon key is already in the server `.env` / available; add the line). Read `config.ts` first and mirror its style.

- [ ] **Step 3: Refactor `supabase.ts` into a factory.** Change the module to export `createDb(client: SupabaseClient)` that returns the existing ~19 methods, each using the passed `client` instead of the module singleton. Keep a default `db = createDb(adminClient)` export ONLY for admin/provisioning use, but command handlers will use a per-request scoped db (Task 6). Do not change method signatures/behavior otherwise. Remove the Phase-1 `user_id: process.env.OWNER_USER_ID` stopgap from `insertTransaction`/`insertInstallment` (the scoped client + `trg_set_user_id`/hardened RPCs now set `user_id` from `auth.uid()`/account).

- [ ] **Step 4: Typecheck**: `export PATH=...; cd ~/dev/finance-project/telegram-bot && ./node_modules/.bin/tsc --noEmit`. Expected: exit 0. Do NOT restart the bot yet (handlers not wired to scopedDb until Task 6).

- [ ] **Step 5: Commit a note** (bot code lives on server):
```bash
git commit --allow-empty -m "chore(bot): add auth.ts (resolveUserId/scopedClient/signUserJwt) + db factory (server)"
```

---

## Task 6: Bot — replace ownerOnly with per-user resolution middleware

**Files (server):**
- Modify: `~/dev/finance-project/telegram-bot/src/bot.ts`

- [ ] **Step 1: Read** `src/bot.ts` around the `ownerOnly` middleware (registered at ~line 432 via `bot.use(ownerOnly)`) and the `MyContext` type, and how commands access `db`. Back up `bot.ts`.

- [ ] **Step 2: Add `userId` + `sdb` (scoped db) to `MyContext`** and a resolution middleware replacing `ownerOnly`:

```typescript
// middleware: resolve chat -> user; attach scoped db; gate unlinked users
async function withUser(ctx: MyContext, next: () => Promise<void>) {
  const chatId = ctx.from?.id;
  if (!chatId) return;
  const userId = await resolveUserId(chatId);
  const text = ctx.message?.text ?? '';
  if (!userId) {
    // allow onboarding + help only
    if (text.startsWith('/start') || text.startsWith('/help')) return next();
    await ctx.reply('Kamu belum terdaftar. Minta invite code ke owner, lalu /start <code>.');
    return;
  }
  ctx.userId = userId;
  ctx.sdb = createDb(scopedClient(userId));
  return next();
}
```
Register `bot.use(withUser)` where `ownerOnly` was. Keep the conversations/session middleware order intact (session before conversations before withUser, as appropriate — mirror existing order).

- [ ] **Step 3: Switch command handlers to `ctx.sdb`.** Every handler that used the module `db` for user data now uses `ctx.sdb`. (Admin/provisioning in Task 8 uses `adminClient`.) Work through each command; the scoped client is the safety net (it can only see the caller's rows).

- [ ] **Step 4: Typecheck** (`tsc --noEmit`, exit 0).

- [ ] **Step 5: Restart + owner smoke**: `pm2 restart finance-bot`; confirm logs show it running; via telegram, the OWNER runs `/balance` and `/expense ...` and sees their own data (owner is linked from Task 2). Expected: identical to before.

- [ ] **Step 6: Commit note**:
```bash
git commit --allow-empty -m "feat(bot): per-user resolution middleware + scoped db (server)"
```

---

## Task 7: Bot — /invite (owner-only)

**Files (server):** Modify `~/dev/finance-project/telegram-bot/src/bot.ts`

- [ ] **Step 1: Add the command** (registered after middleware):

```typescript
bot.command('invite', async (ctx) => {
  if (ctx.from?.id.toString() !== config.telegram.ownerId) return; // owner-only
  const code = crypto.randomBytes(4).toString('hex'); // 8 chars
  const expires = new Date(Date.now() + 7 * 864e5).toISOString();
  const { error } = await adminClient.from('invite_codes')
    .insert({ code, created_by: ctx.userId, expires_at: expires });
  if (error) { await ctx.reply(`Gagal bikin invite: ${error.message}`); return; }
  await ctx.reply(`Invite code: <code>${code}</code>\nBerlaku 7 hari, sekali pakai.\nSuruh mereka: /start ${code}`, { parse_mode: 'HTML' });
});
```
(Import `crypto` and `adminClient`. `ctx.userId` is the owner's id — the owner is linked, so `withUser` populates it.)

- [ ] **Step 2: Typecheck + restart** (`tsc --noEmit`; `pm2 restart finance-bot`).

- [ ] **Step 3: Verify**: owner runs `/invite` in telegram → gets a code. Check DB (Supabase MCP): `select code, created_by, expires_at from invite_codes order by created_at desc limit 1` → row present, created_by = owner id.

- [ ] **Step 4: Commit note**:
```bash
git commit --allow-empty -m "feat(bot): /invite owner-only code generation (server)"
```

---

## Task 8: Bot — /start <code> onboarding + provisioning

**Files (server):** Modify `~/dev/finance-project/telegram-bot/src/bot.ts` (the existing `/start` handler at ~line 899)

- [ ] **Step 1: Read** the existing `/start` handler. Extend it: if the sender is already linked (`resolveUserId`), greet and return. Otherwise parse a code argument.

- [ ] **Step 2: Implement provisioning.** Use a grammY conversation (the bot already loads `@grammyjs/conversations`) OR a simple `/start <code> <email>` two-arg form to collect email. On valid code + email:

```typescript
// validate code (service role)
const { data: inv } = await adminClient.from('invite_codes')
  .select('*').eq('code', code).is('used_by', null).gt('expires_at', new Date().toISOString()).maybeSingle();
if (!inv) { await ctx.reply('Invite code tidak valid / kadaluarsa / sudah dipakai.'); return; }

// create user (auto-seed fires: categories + Cash)
const { data: created, error: cErr } = await adminClient.auth.admin.createUser({
  email, email_confirm: true, password: crypto.randomBytes(16).toString('hex'),
});
if (cErr || !created?.user) { await ctx.reply(`Gagal bikin akun: ${cErr?.message}`); return; }
const newUserId = created.user.id;

// link chat + consume code
await adminClient.from('telegram_links').insert({ chat_id: ctx.from!.id, user_id: newUserId });
await adminClient.from('invite_codes').update({ used_by: newUserId, used_at: new Date().toISOString() }).eq('code', code);

// email a set-password link for web login
await adminClient.auth.admin.generateLink({ type: 'recovery', email });

await ctx.reply('Akun kamu siap! ✅\nCek email buat set password & akses dashboard web.\nDi telegram, langsung coba /expense atau /account add.');
```

> `generateLink({type:'recovery'})` returns the link; whether Supabase auto-emails depends on project email config. If email delivery isn't configured, DM the returned link instead (record this fallback in the reply). Verify email works in Step 4; if not, use the DM fallback.

- [ ] **Step 3: Typecheck + restart** (`tsc --noEmit`; `pm2 restart finance-bot`).

- [ ] **Step 4: Verify end-to-end** with a throwaway invite: owner `/invite` → use a test telegram account (or a second chat) `/start <code> <your-test-email>`. Confirm: `telegram_links` row created, `invite_codes.used_by` set, a new auth user exists with seeded categories + Cash, and the recovery email arrives (or the DM fallback link works). Then that user's `/balance` shows only their own (empty) data. Clean up the throwaway user + link afterward (Supabase MCP delete).

- [ ] **Step 5: Commit note**:
```bash
git commit --allow-empty -m "feat(bot): /start invite onboarding + provisioning (server)"
```

---

## Task 9: Bot — /account command

**Files (server):** Modify `~/dev/finance-project/telegram-bot/src/bot.ts`

- [ ] **Step 1: Add the command** (uses `ctx.sdb` — scoped):

```typescript
const ACCOUNT_TYPES = ['bank', 'ewallet', 'cash', 'marketplace', 'other', 'investment'];
bot.command('account', async (ctx) => {
  const args = (ctx.match ?? '').toString().trim().split(/\s+/).filter(Boolean);
  if (args[0] === 'add') {
    const [, name, type, saldo] = args;
    if (!name || !ACCOUNT_TYPES.includes(type)) {
      await ctx.reply(`Format: /account add <nama> <tipe> [saldo]\ntipe: ${ACCOUNT_TYPES.join(', ')}`);
      return;
    }
    const balance = Number(saldo ?? 0) || 0;
    const { error } = await ctx.sdb.createAccount({ name, type, balance }); // add this method to createDb
    if (error) { await ctx.reply(`Gagal: ${error.message}`); return; }
    await ctx.reply(`Akun "${name}" (${type}) dibuat. Saldo awal: ${balance}.`);
    return;
  }
  // default: list
  const accounts = await ctx.sdb.getAccounts();
  const lines = accounts.map((a: any) => `• ${a.name} (${a.type}): ${a.balance}`);
  await ctx.reply(lines.length ? lines.join('\n') : 'Belum ada akun. /account add <nama> <tipe>.');
});
```

- [ ] **Step 2: Add `createAccount` to the db factory** (`supabase.ts`): `async createAccount({name,type,balance}) { return client.from('accounts').insert({name,type,balance,is_active:true}).select().single(); }` (user_id auto-stamped by `trg_set_user_id` via the scoped client's `auth.uid()`).

- [ ] **Step 3: Typecheck + restart** (`tsc --noEmit`; `pm2 restart finance-bot`).

- [ ] **Step 4: Verify**: owner `/account` lists their accounts; `/account add TestWallet ewallet 5000` creates one scoped to owner (Supabase MCP: newest account has owner user_id + is_active). Delete the test account after.

- [ ] **Step 5: Commit note**:
```bash
git commit --allow-empty -m "feat(bot): /account list + add (server)"
```

---

## Task 10: Full verification + wrap-up

**Files:** none

- [ ] **Step 1: Run the full repo test suite** (all three keys set): `bash tests/run-all.sh` — expect all suites pass (isolation incl. phase2, jwt-scoping, analytics, atomic-balance, timezone, balance-adjust needs local API as before).

- [ ] **Step 2: Bot regression (owner)**: owner exercises `/balance`, `/expense`, `/transfer`, `/report`, `/undo`, `/account` — all behave as before, scoped to owner.

- [ ] **Step 3: One real multi-user pass**: `/invite` → onboard a throwaway second user via a second telegram account → that user adds an account + an expense → confirm (Supabase MCP) their rows carry THEIR user_id and the owner cannot see them / they cannot see the owner's. Tear down the throwaway user.

- [ ] **Step 4: Confirm server backups exist** (`supabase.ts.bak-phase2`, `bot.ts.bak-phase2`) and `pm2 save` so finance-bot survives reboot.

- [ ] **Step 5: Push branch / open finish flow**: ensure all repo commits (migrations 047, tests, spec, plan, server-change notes) are pushed. Phase 2 complete.

---

## Self-review notes
- Spec §1 tables → Task 1; owner seed → Task 2; §2 scoping infra → Tasks 5–6; §3 onboarding → Task 8; §4 /invite → Task 7; §5 /account → Task 9; §6 AI → unchanged (covered by scoped db in Task 6); testing → Tasks 3,4,10.
- Blocking prereq: Task 0 (`SUPABASE_JWT_SECRET`) gates Tasks 3,4,5,6+. Do Task 0 first.
- Safety net: the scoped client can only ever read the caller's rows, so a missed `ctx.sdb` swap degrades to "command fails" not "data leak". Owner smoke + the multi-user pass (Task 10 §3) catch regressions.
- Bot code is on the server (not repo): every bot task = read current file → back up → edit → `tsc --noEmit` → `pm2 restart finance-bot` → verify; repo gets an empty commit note. Migrations/tests are real repo commits.
