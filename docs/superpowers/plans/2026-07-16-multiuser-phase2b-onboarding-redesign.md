# Multi-User Phase 2b — Onboarding Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace invite-code onboarding with web-first signup → dashboard "Connect Telegram" → bot pending request → owner manual approval (telegram buttons + /admin).

**Architecture:** Supabase owns account creation (web signup + email confirm). The bot only links an existing user's chat to their account, in a `pending` state, until the owner approves. Per-user scoping (JWT + ALS proxy + RLS) from Phase 2 is unchanged.

**Tech Stack:** Supabase (RLS, auth), Fastify API, React Router v8 SPA (Tailwind v4, shadcn/ui, Supabase browser client), grammY bot (server, tsx), Supabase MCP (migrations), ssh MCP (bot + deploy), plain-Node integration tests.

**Branch:** `multiuser-phase2` (continue on it). **Owner user id:** `dc20c468-c97f-4086-90f5-493007704eff`. **Owner telegram chat id:** `1172022947`. **Bot username:** `aldi_monman_bot`.
**Spec:** `docs/superpowers/specs/2026-07-16-multiuser-phase2b-onboarding-redesign-design.md`

**Conventions:**
- DB via Supabase MCP (`apply_migration`, `execute_sql`), project `dqvdhkpqyynvwfbuqyzu`. Save SQL to `supabase/migrations/`.
- Bot code lives on the server `~/dev/finance-project/telegram-bot` (edit via ssh MCP; back up each file `*.bak-phase2b`; `./node_modules/.bin/tsc --noEmit`; `pm2 restart finance-bot`; PATH `export PATH="$HOME/.proto/tools/node/globals/bin:$HOME/.proto/bin:$PATH"`). Repo gets empty-commit notes for bot changes.
- Test key wrapper (never print secrets):
```bash
cd /home/mrrizaldi/dev/finance-project
export SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' api/.env | cut -d= -f2- | tr -d '"')
export SUPABASE_ANON_KEY=$(grep '^VITE_SUPABASE_ANON_KEY=' dashboard/.env.local | cut -d= -f2- | tr -d '"')
export SUPABASE_JWT_SECRET=$(ssh mrrizaldi@192.168.31.221 'grep "^SUPABASE_JWT_SECRET=" ~/dev/finance-project/.env | cut -d= -f2-' | tr -d '"' | tr -d "\r")
```

---

## Task 0: Supabase auth config (owner action)
- [ ] **Step 1:** In Supabase dashboard → Authentication → Providers/Settings: ensure **Email** signups are **enabled** and **"Confirm email"** is ON.
- [ ] **Step 2:** Authentication → URL Configuration → add the dashboard origin (`https://finance-dashboard.mrrizaldi.my.id`) to **Redirect URLs** and set Site URL if unset.
- [ ] **Step 3:** Reply "done". (Blocks the manual signup test in Task 11, not the code tasks.)

---

## Task 1: Migration 049 — link status + connect tokens

**Files:** Create `supabase/migrations/049_telegram_onboarding_v2.sql`

- [ ] **Step 1: Write SQL**
```sql
-- 049: onboarding v2 — pending/approved link status + connect tokens.
ALTER TABLE public.telegram_links
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending','approved')),
  ADD COLUMN IF NOT EXISTS requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE TABLE IF NOT EXISTS public.telegram_connect_tokens (
  token       text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_connect_tokens_user ON public.telegram_connect_tokens(user_id);
ALTER TABLE public.telegram_connect_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_token ON public.telegram_connect_tokens;
CREATE POLICY own_token ON public.telegram_connect_tokens FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```
- [ ] **Step 2: Apply** via Supabase MCP `apply_migration` name `049_telegram_onboarding_v2`.
- [ ] **Step 3: Verify** (`execute_sql`): `select status from telegram_links where chat_id = 1172022947;` → `approved` (owner unaffected). `select count(*) from telegram_connect_tokens;` → 0. Confirm RLS on the new table (relrowsecurity true).
- [ ] **Step 4: Commit** `supabase/migrations/049_telegram_onboarding_v2.sql` — `feat(db): telegram link status + connect tokens (049)`.

---

## Task 2: Onboarding-v2 integration test (RED then GREEN across later tasks)

**Files:** Create `tests/integration/onboarding-v2.test.js`

This test replicates the flow at the DB level (the API/bot do the same steps). It fully passes once migration 049 (Task 1) is applied — it does not depend on the API/bot being deployed.

- [ ] **Step 1: Write the test** using `helpers/users.js` (`createTestUser`) + `helpers/jwt.js` (`signUserJwt`). Suite "Onboarding v2 — connect + approve":
  1. Create a throwaway user B.
  2. Insert a connect token (service role): `POST /rest/v1/telegram_connect_tokens {token, user_id:B, expires_at:'2100-01-01'}`.
  3. Simulate bot `/start <token>`: look up token → user_id; upsert `telegram_links {chat_id:<fake>, user_id:B, status:'pending', requested_at:now}`; delete token.
  4. Assert: token consumed (0 rows for it); a **pending** link exists; and B is NOT yet an approved user — i.e., a query "approved link for chat" (`telegram_links?chat_id=eq.<fake>&status=eq.approved`) returns 0.
  5. Approve: `PATCH telegram_links?chat_id=eq.<fake> {status:'approved', approved_at:now}`.
  6. Assert: approved link resolves; and as B (signUserJwt) the user sees only their own seeded data (categories>0, transactions=0, no owner rows).
  7. Reject path (separate test): create another pending link, DELETE it, assert gone.
  8. `finally`: delete links by chat_id, tokens, B's rows + user (reuse the cleanup pattern from `bot-provisioning.test.js`).
- [ ] **Step 2: Run** with the wrapper → `node tests/integration/onboarding-v2.test.js`. Expected: all pass (Task 1 applied). If pending link incorrectly counts as approved, STOP (status logic wrong).
- [ ] **Step 3: Commit** — `test(phase2b): onboarding v2 connect/approve/reject flow`.

---

## Task 3: API — connect-token + status

**Files:** Create `api/src/routes/telegram.ts`; modify `api/src/app.ts`; add `TELEGRAM_BOT_USERNAME=aldi_monman_bot` to `api/.env` (local) and the server `api/.env`.

- [ ] **Step 1: Read** `api/src/routes/push-subscribe.ts` for the `requireUser` pattern + `createServiceClient`.
- [ ] **Step 2: Create `telegram.ts`** with (each `requireUser`-guarded):
  - `POST /api/telegram/connect-token`: `const { supabase, user, unauthorized } = await requireUser(request)`; 401 if unauthorized. `const admin = createServiceClient();` delete any existing tokens for `user.id`, insert `{ token: randomBytes(12).toString('base64url'), user_id: user.id, expires_at: new Date(Date.now()+3600e3).toISOString() }`, return `{ token, deepLink: 'https://t.me/'+process.env.TELEGRAM_BOT_USERNAME+'?start='+token, botUsername }`.
  - `GET /api/telegram/status`: look up `admin.from('telegram_links').select('status').eq('user_id', user.id).maybeSingle()` → return `{ status: row?.status ?? 'none' }`.
- [ ] **Step 3: Register** in `app.ts` (`await app.register(telegramRoutes);`, `.js` import).
- [ ] **Step 4: Env** — add `TELEGRAM_BOT_USERNAME=aldi_monman_bot` to `api/.env` locally; note to add on server at deploy (Task 11).
- [ ] **Step 5: Typecheck** `cd api && pnpm typecheck` → clean.
- [ ] **Step 6: Commit** `api/src/routes/telegram.ts api/src/app.ts` — `feat(api): telegram connect-token + status endpoints`.

---

## Task 4: API admin — pending requests + approve/reject

**Files:** Modify `api/src/routes/admin.ts`

- [ ] **Step 1: Add routes** (reuse the existing admin guard in the file):
  - `GET /api/admin/telegram-requests`: `admin.from('telegram_links').select('chat_id,user_id,requested_at').eq('status','pending')`; enrich each with email via `admin.auth.admin.getUserById(user_id)` (or `listUsers` map). Return array `{ chat_id, user_id, email, requested_at }`.
  - `POST /api/admin/telegram-requests/:chatId/approve`: `admin.from('telegram_links').update({status:'approved', approved_at:new Date().toISOString()}).eq('chat_id', chatId).eq('status','pending')`. Return `{ ok:true }`.
  - `POST /api/admin/telegram-requests/:chatId/reject`: `admin.from('telegram_links').delete().eq('chat_id', chatId).eq('status','pending')`. Return `{ ok:true }`.
- [ ] **Step 2: Typecheck** → clean.
- [ ] **Step 3: Commit** `api/src/routes/admin.ts` — `feat(api): admin telegram request approve/reject`.

---

## Task 5: Bot — approved-only resolution

**Files (server):** `src/services/auth.ts`, `src/bot.ts`. Back up both (`*.bak-phase2b`).

- [ ] **Step 1: Read** current `auth.ts` (`resolveUserId`) and `bot.ts` (`withUser` at ~line 147/439).
- [ ] **Step 2: In `auth.ts`** add:
```typescript
export async function getLink(chatId: number): Promise<{ user_id: string; status: string } | null> {
  const { data } = await adminClient
    .from('telegram_links').select('user_id, status').eq('chat_id', chatId).maybeSingle();
  return (data as any) ?? null;
}
```
  Keep `resolveUserId` (still used elsewhere) — or make it return only approved: simplest, leave `resolveUserId` and add `getLink`; the middleware uses `getLink`.
- [ ] **Step 3: In `bot.ts` `withUser`**, replace the resolve logic:
```typescript
async function withUser(ctx: MyContext, next: () => Promise<void>) {
  const chatId = ctx.from?.id;
  if (!chatId) return;
  const text = ctx.message?.text ?? '';
  const isStartOrHelp = text.startsWith('/start') || text.startsWith('/help');
  const link = await getLink(chatId);
  if (link?.status === 'approved') {
    ctx.userId = link.user_id;
    return als.run({ userId: link.user_id }, next);
  }
  if (isStartOrHelp) return next(); // let /start handle pending/new
  if (link?.status === 'pending') {
    return ctx.reply('Requestmu masih nunggu di-approve admin ya. Sabar 🙏');
  }
  return ctx.reply('Kamu belum konek. Daftar & hubungkan Telegram dari dashboard: https://finance-dashboard.mrrizaldi.my.id/connect');
}
```
  Update the import to include `getLink`.
- [ ] **Step 4: Typecheck** `./node_modules/.bin/tsc --noEmit` → 0. Do NOT restart yet (paired with Task 6).
- [ ] **Step 5: Commit note** — `chore(bot): getLink + approved-only withUser (server)`.

---

## Task 6: Bot — /start token flow + owner DM buttons; remove /invite

**Files (server):** `src/bot.ts`.

- [ ] **Step 1: Read** the current `/start` handler (the code-based onboarding branch) and the `/invite` command.
- [ ] **Step 2: Replace the `/start` handler** so:
  - If `getLink(chatId)?.status === 'approved'` → existing greeting (help if `isHelpRequest`).
  - Else parse `const token = arg.trim().split(/\s+/)[0]`.
    - No token → reply "Daftar & hubungkan Telegram dari dashboard dulu: …/connect".
    - Token → look up `adminClient.from('telegram_connect_tokens').select('*').eq('token', token).gt('expires_at', new Date().toISOString()).maybeSingle()`. If none → "Link kadaluarsa, generate ulang di dashboard." Else:
      - `const userId = tok.user_id;` upsert `telegram_links` `{ chat_id: chatId, user_id: userId, status:'pending', requested_at: now }` (onConflict chat_id).
      - Delete the token.
      - Fetch email: `const { data: u } = await adminClient.auth.admin.getUserById(userId);`
      - DM owner: `await ctx.api.sendMessage(config.telegram.ownerId, 'Join request: <b>'+ (u?.user?.email ?? userId) +'</b>', { parse_mode:'HTML', reply_markup: new InlineKeyboard().text('✅ Approve', 'tgapprove:'+chatId).text('❌ Reject','tgreject:'+chatId) })` (import `InlineKeyboard` from grammy if not already).
      - Reply user: "Request terkirim ✅ Nunggu approve admin."
- [ ] **Step 3: Remove** the `bot.command('invite', …)` block entirely.
- [ ] **Step 4: Typecheck** → 0.
- [ ] **Step 5: Commit note** — `feat(bot): /start token request + owner approve DM; remove /invite (server)`.

---

## Task 7: Bot — approve/reject callback handler

**Files (server):** `src/bot.ts`.

- [ ] **Step 1: Add** after the command registrations:
```typescript
bot.callbackQuery(/^tg(approve|reject):(.+)$/, async (ctx) => {
  if (ctx.from?.id.toString() !== config.telegram.ownerId) { await ctx.answerCallbackQuery('Bukan admin.'); return; }
  const [, action, chatIdStr] = ctx.match as RegExpMatchArray;
  const chatId = Number(chatIdStr);
  if (action === 'approve') {
    await adminClient.from('telegram_links').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('chat_id', chatId).eq('status', 'pending');
    await ctx.answerCallbackQuery('Approved');
    await ctx.editMessageText('✅ Approved.');
    try { await ctx.api.sendMessage(chatId, 'Kamu udah di-approve! ✅ Silakan pakai botnya — coba /balance atau /account.'); } catch {}
  } else {
    await adminClient.from('telegram_links').delete().eq('chat_id', chatId).eq('status', 'pending');
    await ctx.answerCallbackQuery('Rejected');
    await ctx.editMessageText('❌ Rejected.');
    try { await ctx.api.sendMessage(chatId, 'Maaf, request kamu ditolak admin.'); } catch {}
  }
});
```
  Ensure `adminClient` is imported (it is, from Task 6/earlier). Note: this callback must not be blocked by `withUser` — the owner is approved, so `withUser` runs `next()` in ALS and the callbackQuery handler still matches; verify order allows callback handlers to run.
- [ ] **Step 2: Typecheck** → 0. **Restart** `pm2 restart finance-bot`; check logs clean; owner `/balance` still works.
- [ ] **Step 3: Verify** (server tsx script, like prior tasks): insert a connect token for the owner-test scenario is not meaningful; instead assert the callback SQL by simulating: insert a pending link for a fake chat via adminClient, run the same update, confirm status→approved; then delete. (A small `verify-approve.ts` run + removed.)
- [ ] **Step 4: Commit note** — `feat(bot): approve/reject callback handler (server)`.

---

## Task 8: Dashboard — signup page

**Files:** `dashboard/src/routes/signup.tsx` (create); `dashboard/src/routes.ts` (register); `dashboard/src/routes/login.tsx` (add "Daftar" link).

- [ ] **Step 1: Read** `login.tsx` for the Supabase browser-client auth pattern (`getBrowserClient()`, form handling, styling).
- [ ] **Step 2: Create `signup.tsx`** (public route, outside the auth-guard layout — mirror how `login.tsx` is registered): email + password form → `getBrowserClient().auth.signUp({ email, password })`; on success show "Cek email kamu buat konfirmasi, terus login." On error show the message. Include a link to `/login`. Match login's styling.
- [ ] **Step 3: Register** `/signup` in `routes.ts` the same way `/login` is registered (public, no app-layout guard).
- [ ] **Step 4: Add** a "Belum punya akun? Daftar" link on `login.tsx` → `/signup`.
- [ ] **Step 5: Typecheck + build** `cd dashboard && pnpm typecheck && pnpm build` → both succeed.
- [ ] **Step 6: Commit** — `feat(dashboard): public signup page`.

---

## Task 9: Dashboard — /connect page

**Files:** `dashboard/src/routes/connect.tsx` (create); `dashboard/src/routes.ts` (register under the app-layout/auth-guarded group).

- [ ] **Step 1: Create `connect.tsx`** (auth-guarded route): `clientLoader` fetches `GET /api/telegram/status` → `{ status }`. Component:
  - `status === 'approved'` → "Telegram terhubung ✓."
  - `status === 'pending'` → "Requestmu lagi nunggu approve admin."
  - `status === 'none'` → a "Hubungkan Telegram" button that POSTs `/api/telegram/connect-token`, then shows the returned `deepLink` as a big link/button ("Buka Telegram") + copyable text + 3 short steps ("buka bot → otomatis kirim request → tunggu approve"). After generating, offer a "Cek status" (revalidate) button.
  Match the dashboard's dark styling (CSS vars) + shadcn components.
- [ ] **Step 2: Register** `/connect` in `routes.ts` inside the app-layout group (so it's auth-guarded).
- [ ] **Step 3: Typecheck + build** → succeed.
- [ ] **Step 4: Commit** — `feat(dashboard): connect-telegram page`.

---

## Task 10: Dashboard — nudge banner + admin pending requests

**Files:** `dashboard/src/routes/app-layout.tsx` (nudge); `dashboard/src/routes/admin.tsx` (pending section).

- [ ] **Step 1: Nudge** — in `app-layout.tsx` (already loads the session), also fetch `GET /api/telegram/status`; if `status !== 'approved'`, render a dismissible banner "Hubungkan Telegram buat mulai — ke /connect" linking to `/connect`. Keep it light; don't hard-redirect (owner is approved, so they never see it).
- [ ] **Step 2: Admin pending** — in `admin.tsx`, extend `clientLoader` to also fetch `GET /api/admin/telegram-requests`; add a "Pending Telegram Requests" section: table (email, requested_at) + Approve/Reject buttons that POST `/api/admin/telegram-requests/:chatId/approve|reject` then `revalidate()`.
- [ ] **Step 3: Typecheck + build** → succeed.
- [ ] **Step 4: Commit** — `feat(dashboard): connect nudge + admin pending telegram requests`.

---

## Task 11: Deploy + full verification

- [ ] **Step 1: Full test suite** — `bash tests/run-all.sh` with the wrapper → all pass except `balance-adjust` (needs local API; env-gated).
- [ ] **Step 2: Deploy** — add `TELEGRAM_BOT_USERNAME=aldi_monman_bot` to server `api/.env`. rsync changed `api/` + `dashboard/` files to server; `cd api && pnpm build`; `cd dashboard && pnpm build`; `pm2 restart finance-api`. Bot already restarted (Task 7). Health: `/` → 200, `/api/telegram/status` (no auth) → 401.
- [ ] **Step 3: Owner smoke** — owner opens `/admin` (loads), `/connect` (shows "terhubung"), bot `/balance` still works.
- [ ] **Step 4: Real onboarding (owner-driven, needs Task 0 done)** — sign up a throwaway email on `/signup` → confirm email → `/connect` → open deep link in a second telegram account → owner gets Approve DM + sees it in `/admin` → approve → that account can use the bot and sees only its own data. Tear down the throwaway user after.
- [ ] **Step 5: Push branch**; report Phase 2b complete.

---

## Self-review notes
- Spec §1 DB → Task 1; §2 bot → Tasks 5–7; §3 API → Task 3; §4 admin API → Task 4; dashboard §4 → Tasks 8–10; testing → Tasks 2, 11.
- `/invite` + invite-code `/start` removed in Task 6; `invite_codes` table left unused (no migration).
- Safety: pending/none links can't enter ALS (never resolve as approved) → an unapproved chat can't touch data even if a bot bug slips; the onboarding-v2 test asserts pending≠approved.
- Bot edits paired: Tasks 5+6+7 land together before the Task 7 restart; keep `*.bak-phase2b` backups.
