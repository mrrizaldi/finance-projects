# Multi-User Phase 2b — Onboarding Redesign (web-first + manual approval)

**Date:** 2026-07-16
**Status:** Approved design, ready for implementation plan
**Supersedes:** the invite-code onboarding from Phase 2 (`/invite` + `/start <code> <email>`).
**Depends on:** Phase 2 (scoping infra, telegram_links, admin panel) — all live on branch `multiuser-phase2` (not merged).

## Context & motivation

Phase 2 shipped **telegram-first invite-code** onboarding: owner runs `/invite`,
hands a code to each person, they `/start <code> <email>` and the bot provisions
their Supabase user. After seeing it, the owner wants a different model:

- **Web-first signup** (Supabase handles account creation + email confirmation),
- then the user **connects telegram** from the dashboard (deep link),
- and the owner **manually approves** each connection.

This moves account creation out of the bot (Supabase owns it) and makes the gate
an explicit **approval**, not a shared code.

### Decisions (locked in brainstorming)
- **Signup:** open self-signup on the web (email + password, Supabase email
  confirmation). The gate is approval, not signup.
- **Bot-link delivery:** a dashboard **"Connect Telegram" page** (deep link +
  status). No second email.
- **Approval:** **both** — an inline Approve/Reject button DM'd to the owner in
  telegram, AND a pending-requests list in the `/admin` panel.

### Reused from Phase 2 (unchanged)
Per-user scoping (HS256 JWT + ALS `db` proxy + RLS), `telegram_links`, admin role
+ `is_admin()`, the `/admin` page, `/account`, all bot commands' scoping.

### Removed
`/invite` command; `invite_codes` usage (table left in place, unused — no
destructive migration); bot-side `createUser`/email provisioning in `/start`.

## Flow (end to end)

1. **Signup (web):** user visits `/signup`, submits email + password →
   `supabase.auth.signUp`. Supabase sends a confirmation email.
2. **Confirm:** user clicks the link → email confirmed → can log in.
3. **Connect prompt:** a logged-in user with no **approved** telegram link is
   nudged to `/connect`. That page requests a **connect token** from the API and
   shows a deep link `https://t.me/aldi_monman_bot?start=<token>` + current status
   (not connected / pending / connected).
4. **Bot link request:** user taps the link → telegram opens the bot → sends
   `/start <token>`. The bot resolves the token → `user_id`, upserts
   `telegram_links (chat_id, user_id, status='pending')`, consumes the token, and
   **DMs the owner** a message with inline **Approve / Reject** buttons. It replies
   to the user: "Request terkirim, nunggu approve admin."
5. **Approve/Reject (owner):**
   - **Telegram:** owner taps Approve → `telegram_links.status='approved'`,
     `approved_at=now`; bot messages the requester "Disetujui! Silakan pakai." Tap
     Reject → delete the pending row; bot messages "Maaf, ditolak."
   - **/admin panel:** the same pending requests appear with Approve/Reject; acting
     there does the same state change.
6. **Use:** the bot's `withUser` middleware treats a chat as a real user **only
   when its link is `approved`**. Pending → "Requestmu masih nunggu approve."
   No link → "Daftar & connect telegram dulu di <dashboard>."

## Design

### 1. DB (migration `049_telegram_onboarding_v2.sql`)
- `telegram_links`: add
  - `status text NOT NULL DEFAULT 'approved'` (existing owner row stays approved),
    CHECK in ('pending','approved'),
  - `requested_at timestamptz`, `approved_at timestamptz`.
- `telegram_connect_tokens`:
  - `token text PRIMARY KEY`, `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`,
    `expires_at timestamptz NOT NULL`, `created_at timestamptz DEFAULT now()`.
  - RLS: `USING (user_id = auth.uid())` (a user can create/read own token; the bot
    reads/consumes via service role).
- Keep `invite_codes` (unused).

### 2. Bot (server)
- **`resolveApprovedUserId(chatId)`** (replaces the plain `resolveUserId` use in
  the middleware): returns `user_id` only when `status='approved'`. A second helper
  `getLink(chatId)` returns `{ user_id, status } | null` so the middleware can
  distinguish none/pending/approved.
- **`withUser` middleware:** approved → `als.run` + proceed; pending → reply
  "nunggu approve" (still allow `/start`,`/help`); none → reply
  "daftar+connect di web" (allow `/start`,`/help`).
- **`/start <token>`:**
  - already approved → greeting.
  - token present → look up `telegram_connect_tokens` (service role), not expired →
    `user_id`. Upsert `telegram_links(chat_id, user_id, status='pending', requested_at=now())`.
    Delete the token. DM owner (`config.telegram.ownerId`) with inline keyboard
    `Approve` (`callback_data=tgapprove:<chatId>`) / `Reject` (`tgreject:<chatId>`),
    showing the requester's email (from `auth.admin.getUserById`). Reply user: pending.
  - token invalid/expired → "Link kadaluarsa, generate ulang dari dashboard."
  - no token, not linked → "Daftar & connect telegram dari dashboard dulu."
- **Callback handler** for `tgapprove:`/`tgreject:`: only owner (`ctx.from.id ===
  ownerId`) may act. Approve → set status approved + `approved_at`; notify requester
  chat. Reject → delete pending row; notify requester. `answerCallbackQuery` + edit
  the owner's message to reflect the decision.
- **Remove** `/invite` and the old code-based `/start` branch.

### 3. API (Fastify)
- **`POST /api/telegram/connect-token`** (`requireUser`): generate a URL-safe token
  (≤ 32 chars), upsert `telegram_connect_tokens (token, user_id=caller, expires_at=now+1h)`
  (one active token per user — replace prior), return `{ token, deepLink, botUsername }`.
- **`GET /api/telegram/status`** (`requireUser`): return the caller's link status
  (`none | pending | approved`) so the connect page can render state.
- **Admin (extend `admin.ts`):**
  - `GET /api/admin/telegram-requests` → pending links joined with email
    (chat_id, user_id, email, requested_at).
  - `POST /api/admin/telegram-requests/:chatId/approve` and `/reject` → same state
    change as the bot buttons (service role), admin-guarded.

### 4. Dashboard
- **`/signup` route:** email + password form → `supabase.auth.signUp` (browser
  client) → "cek email buat konfirmasi" state; link back to `/login`. (Login page
  gets a "Belum punya akun? Daftar" link.)
- **`/connect` route:** for a logged-in user; calls `GET /api/telegram/status`:
  - `none` → "Hubungkan Telegram" button → `POST /api/telegram/connect-token` →
    show the `t.me/...?start=token` deep link (button + copyable) + short steps.
  - `pending` → "Requestmu nunggu approve admin."
  - `approved` → "Telegram terhubung ✓."
- **Nudge:** `app-layout` clientLoader (or home) checks status; if a logged-in user
  is not approved-linked, show a banner/redirect to `/connect`. Keep it light (a
  dismissible banner or a simple redirect for `none`).
- **`/admin` page:** add a **Pending Telegram Requests** section (email,
  requested_at, Approve/Reject buttons calling the admin endpoints + revalidate).

### 5. Supabase config (verify, not code)
- **Enable email signups** + **email confirmation** (Auth settings).
- Add the dashboard origin to **Redirect URLs** so the confirmation link returns to
  the app. Confirm the built-in mailer delivers (rate-limited; acceptable for a
  small circle — if not, revisit).

## Testing
- **Integration (repo):** extend `bot-provisioning` (or new `onboarding-v2.test.js`):
  connect-token issue → simulate `/start <token>` (pending link, token consumed) →
  approve → link approved → the (JWT-scoped) user sees only their own data; reject →
  link removed. Assert a pending link does NOT resolve as an approved user.
- **Auth flow** test already covers signup/login/recovery (Phase 2 `auth-flow.test.js`).
- **Manual (owner):** web signup → confirm email → `/connect` → deep link → bot →
  owner gets Approve button (telegram) + sees request in `/admin` → approve → user
  can use the bot; verify isolation from owner data.

## Rollout & rollback
- Migration 049 via Supabase MCP (additive; existing owner link defaults to
  `approved`). Deploy API + dashboard (build + `pm2 restart finance-api`). Bot edited
  on server + `pm2 restart finance-bot`; keep `*.bak-phase2b` backups.
- Rollback: revert bot files from backup; API/dashboard revert + rebuild; migration
  is additive (columns/table can be dropped). Owner is unaffected throughout.

## Risks
1. **Deep-link token in a URL** — short-lived (1h), single-use, and only creates a
   *pending* request that still needs approval, so leakage is low-impact.
2. **Approval race** (owner approves in telegram and /admin) — idempotent state set
   (`status='approved'`); rejecting an already-approved link should no-op with a note.
3. **Email deliverability** for signup confirmation — same Supabase-mailer caveat;
   verify before relying on it.
4. **Open signup abuse** — anyone can create an account, but they can't touch the
   bot or any data until approved; unapproved accounts are inert.

## Non-goals
- Self-serve reusable invite links, role management beyond owner-admin, suspending
  by the pending flow (suspend already exists in admin). Investment-job per-user
  attribution and the other Phase-2 debt items remain tracked separately.
