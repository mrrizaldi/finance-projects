# Multi-User Phase 2 — Telegram Bot + Invite Onboarding

**Date:** 2026-07-16
**Status:** Approved design, ready for implementation plan
**Depends on:** Phase 1 (DB multi-user foundation, RLS live). See
`2026-07-16-multiuser-phase1-db-foundation-design.md`.

## Context

Phase 1 made the DB isolated-multi-user (per-user RLS on all tables, live on
prod). The **telegram bot** (`~/dev/finance-project/telegram-bot` on the server,
pm2 app `finance-bot`, runs via tsx — **not in this repo**) is still single-user:

- It uses a **service-role** Supabase singleton (`db` from
  `src/services/supabase.ts`, ~19 methods) that bypasses RLS.
- It has an **owner gate** at `src/bot.ts:147`
  (`if (ctx.from?.id.toString() !== config.telegram.ownerId) reject`).
- Phase 1's NOT NULL already forced a stopgap: transaction/installment inserts
  now stamp `process.env.OWNER_USER_ID` (hotfix committed on server;
  backup `supabase.ts.bak-phase1`). Phase 2 replaces that stopgap with the real
  per-user id.

Phase 2 makes the bot the **multi-user channel**: invited people onboard via the
bot, each gets an isolated account, and the bot enforces isolation.

### Decisions locked (brainstorming)
- **Identity:** email required at onboarding → provisioned users get a normal
  Supabase account and can log into the web dashboard.
- **Web credential:** Supabase magic-link/recovery to their email (password never
  transits telegram). Requires Supabase email delivery working.
- **Invite:** owner-only bot command `/invite`; codes are **single-use, 7-day
  expiry**.
- **Bot data scoping:** per message, resolve `chat_id → user_id`, mint a
  Supabase-compatible **HS256 JWT** (`sub = user_id`, signed with the project JWT
  secret) and use an **auth-scoped client** → **RLS does all scoping**. No
  per-query filters. Provisioning/admin ops keep the service role.
- **AI (openclaw/LLM):** unchanged — basic commands work without it; now runs in
  per-user context automatically (categories/accounts come from the scoped client).

### Non-goals
- Per-user email/IMAP sourcing (email parser stays the owner's single Gmail).
- Dashboard invite UI (invites are bot-only).
- Fixing the documented Phase-1 debt (revalue-investments per-account attribution,
  other tx RPCs) — tracked separately.

## Feasibility notes
- This project uses **legacy HS256** Supabase JWTs (anon/service keys are
  `alg:HS256`), so self-signing an HS256 JWT with `SUPABASE_JWT_SECRET` produces a
  token PostgREST accepts; `auth.uid()` returns the `sub`. Claims required:
  `sub`, `role: 'authenticated'`, `aud: 'authenticated'`, short `exp`.
- **New secret:** owner must add `SUPABASE_JWT_SECRET` (Supabase → Settings → API →
  JWT Secret) to the bot env (`~/dev/finance-project/.env`, read via dotenv).

## Design

### 1. DB (migration `047_telegram_multiuser.sql`, in repo, applied via Supabase MCP)
- `telegram_links`:
  - `chat_id bigint PRIMARY KEY`, `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `created_at timestamptz default now()`.
  - RLS: `USING (user_id = auth.uid())` (a user sees their own link). Bot resolves
    links via the **service role** (bypasses RLS) — resolution is an admin lookup.
- `invite_codes`:
  - `code text PRIMARY KEY`, `created_by uuid NOT NULL`, `email text` (optional
    intended invitee), `used_by uuid`, `used_at timestamptz`, `expires_at timestamptz NOT NULL`, `created_at timestamptz default now()`.
  - RLS: `USING (created_by = auth.uid())`. Bot validates/consumes via service role.
- **Owner seed:** insert `telegram_links(chat_id = <owner telegram id>, user_id = 'dc20c468…')` so the owner's bot keeps working seamlessly. (Owner telegram id = `config.telegram.ownerId` / `TELEGRAM_OWNER_ID` on the server — read it, don't hardcode a guess.)

### 2. Bot scoping infrastructure (server: `src/services/`)
- **`auth.ts` (new):**
  - `resolveUserId(chatId): Promise<string | null>` — service-role lookup in
    `telegram_links`.
  - `signUserJwt(userId): string` — HS256 JWT `{ sub, role:'authenticated', aud:'authenticated', exp: now+300s }` signed with `SUPABASE_JWT_SECRET`.
- **`supabase.ts` refactor:** convert the singleton `db` into a factory
  `createDb(client)` returning the same ~19 methods bound to the passed client.
  - `scopedDb(userId)` = `createDb(anonClient with Authorization: Bearer signUserJwt(userId))` → all reads/writes RLS-scoped to that user.
  - Keep an `adminDb` / service-role client for provisioning + resolution only.
  - Remove the `OWNER_USER_ID` stopgap on inserts — with the scoped client,
    `trg_set_user_id` fills `user_id` from `auth.uid()`; the hardened manual RPCs
    derive from the account.
- **`src/bot.ts:147` gate → resolution middleware:** replace the owner-only reject
  with: resolve `chat_id → user_id`; if linked, attach `userId` + `scopedDb` to the
  handler context and proceed; if not linked, route to onboarding (allow `/start`
  and `/help`, reject the rest with an invite prompt). Every command handler uses
  the request's `scopedDb` instead of the module `db`.

### 3. Onboarding (`/start <code>`)
1. If already linked → greet, done.
2. Parse code. Validate via service role: exists, `used_by IS NULL`,
   `expires_at > now()`. Invalid → friendly rejection.
3. Ask for email (simple conversational state, or `/start <code> <email>`).
4. `supabase.auth.admin.createUser({ email, email_confirm: true, password: <random> })`
   → `on_profile_created_seed` auto-seeds categories + Cash.
5. Insert `telegram_links(chat_id, user_id)`; set invite `used_by`/`used_at`.
6. `supabase.auth.admin.generateLink({ type: 'recovery', email })` → send the link
   to the user's email (Supabase email) so they set a password + can log into web.
   Bot confirms "cek email buat akses dashboard web".
7. Welcome + quick help.

### 4. `/invite` (owner-only)
- If `chat_id === config.telegram.ownerId`: generate a random code (e.g. 8 chars),
  insert `invite_codes(created_by = owner user_id, expires_at = now()+7d)`, reply
  with the code + share instructions. Else: ignore (same as any non-owner command).

### 5. `/account` command (new)
- `/account` → list the user's accounts + balances (scoped).
- `/account add <name> <type> [saldo_awal]` → insert into `accounts` via scoped db
  (type ∈ the app's account types; validate). New users add their own banks/e-wallets
  since email parsing is owner-only.

### 6. AI / openclaw
- No behavioral change. Categorization + `ask`/`bulk` now read the caller's own
  categories/accounts via `scopedDb`. Basic commands remain functional with the LLM
  down.

## Testing
- **DB isolation (repo, extend `tests/integration/`):** a second user cannot see
  another's `telegram_links` / `invite_codes` (RLS).
- **JWT → RLS proof (repo):** sign a user JWT with `SUPABASE_JWT_SECRET`, hit REST
  as that token, assert it sees only that user's rows and `auth.uid()` resolves
  (this validates the whole scoping approach before the bot refactor).
- **Provisioning integration (repo):** create invite (service role) → simulate
  onboarding (admin createUser + link + consume code) → scoped queries isolated →
  teardown. Mirrors `tests/integration/helpers/users.js`.
- **Bot (server):** `npx tsc --noEmit` + manual smoke via telegram (owner still
  works; a test invite onboards a throwaway user; that user sees only their data).
  The telegram transport layer isn't unit-tested; the scoping + provisioning logic
  is covered by the repo integration tests above.

## Rollout & rollback
- Migration 047 via Supabase MCP. Add `SUPABASE_JWT_SECRET` to server `.env`.
- Bot edited on server (ssh MCP), `tsc --noEmit`, `pm2 restart finance-bot`.
  Keep `supabase.ts.bak-phase1`; take a fresh backup before the refactor.
- Rollback: revert bot files from backup + `pm2 restart`; `telegram_links`/
  `invite_codes` are additive (drop if needed). Owner is unaffected throughout
  (seeded link).

## Risks
1. **JWT correctness** — wrong secret/claims → PostgREST rejects or wrong scope.
   Mitigated by the JWT→RLS integration test before wiring the bot.
2. **Bot refactor breadth** — ~19 db methods + every command switch to `scopedDb`.
   RLS is the safety net: even a missed spot can only ever see the caller's rows
   (the scoped client can't reach other users). Owner smoke test guards regressions.
3. **Email delivery** — magic-link onboarding needs Supabase email working; verify
   before relying on it (fallback: DM a one-time recovery link).
4. **Resolution/provisioning on service role** — these few admin paths bypass RLS by
   necessity; keep them minimal and explicit (resolve, create user, link, consume
   code, generate link).
