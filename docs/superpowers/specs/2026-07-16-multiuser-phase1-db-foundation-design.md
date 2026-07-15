# Multi-User Phase 1 — DB + App-Layer Foundation

**Date:** 2026-07-16
**Status:** Approved design, ready for implementation plan
**Owner:** Rizaldi (`dc20c468-c97f-4086-90f5-493007704eff`)

## Context

The app runs in **single-user mode**. Migration `015` originally built full
isolated multi-user (profiles, `user_id` on core tables, per-user RLS,
auto-seed). Migration `019` **deliberately reverted** it: disabled RLS on all
tables and stripped `auth.uid()` filters from analytics RPCs, so today the anon
key can read/write every row.

We want to **revive isolated multi-user** (each user owns their own
accounts/transactions/balances, nobody sees anyone else's). This spec covers
**Phase 1 only**: make the DB and app layer fully user-scoped and RLS-secured so
a second user is *safe* to add. Onboarding (invite codes, telegram linking, bot
provisioning) is **Phase 2** and out of scope here.

### Decisions locked in brainstorming
- **Model:** isolated per-user finances (not shared household).
- **Input for other users:** telegram bot + web only. The n8n email parser keeps
  reading the owner's single Gmail and stamps the **owner's fixed `user_id`**.
- **Onboarding:** invite-code based (Phase 2).
- **AI:** basic commands work without openclaw; AI is optional (affects Phase 2).

### Non-goals (Phase 2+)
- Invite codes, telegram `chat_id ↔ user_id` linking, bot user provisioning.
- Per-user email/IMAP sourcing.
- Web signup/onboarding UX.

## Current state (audited 2026-07-16)

- **User:** one real user, `dc20c468…` (Rizaldi).
- **Transactions:** 319 rows — 177 already carry the owner's `user_id`, **142 are
  NULL** (email_bca 65, email_bsi 52, manual_web 18, manual_telegram 7).
- **Tables with `user_id`:** accounts, budgets, categories, installments,
  instruments, push_subscriptions, recurring_transactions, transactions.
- **Tables without `user_id`** (scope via parent join): `installment_months`→installments;
  `holdings`/`price_history`/`distributions`/`coupon_rates`/`corporate_actions`→instruments.
  `profiles` is keyed by `id = auth.uid()`.
- **RLS:** OFF on all 15 tables. All `015` per-user policies dropped by `019`.
- **Views (both DEFINER → bypass RLS):** `v_transactions`, `v_investment_reconciliation`.
- **Analytics RPCs (8, SECURITY DEFINER → bypass RLS):** `get_summary`,
  `get_category_breakdown`, `get_expense_heatmap`, `get_monthly_trend`,
  `get_period_comparison`, `get_savings_rate_trend`, `get_top_transactions`,
  `get_daily_spending`.
- **Investment RPCs are INVOKER** (respect RLS) — `get_portfolio_summary`, etc.
- **Existing scaffolding (reuse):**
  - `handle_new_user` → inserts profile on new auth user.
  - `on_profile_created_seed` (AFTER INSERT on profiles) → `seed_user_data`
    seeds 17 categories + one `Cash` account.
  - `trg_set_user_id` (BEFORE INSERT) on accounts/categories/installments/transactions
    → `set_user_id_on_insert` sets `user_id := auth.uid()` when NULL.
  - **Gap:** `auth.uid()` is NULL for **service-role** writers (n8n, bot, API
    service client), so those inserts land with `user_id = NULL`. This is the
    root cause of the 142 NULL rows.

## Design

Delivered as sequential, reversible migrations `041`–`045` plus app-layer edits.
Owner-facing behavior does not change; only isolation/security is added.

### 1. Backfill (`041_backfill_user_id.sql`)
- `UPDATE ... SET user_id = 'dc20c468…' WHERE user_id IS NULL` on: transactions,
  accounts, categories, installments, instruments, budgets, recurring_transactions.
- Child tables inherit via parent — no backfill needed.
- Then `ALTER TABLE ... ALTER COLUMN user_id SET NOT NULL` on those 7 tables to
  prevent future orphan rows.
- **Guard:** assert `SELECT count(*) FROM transactions WHERE user_id IS NULL = 0`
  before the NOT NULL step.

### 2. RLS + policies (`042_enable_rls_multiuser.sql`)
Enable RLS on all 15 tables. Policies:
- **Direct** `USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`:
  accounts, categories, transactions, installments, instruments, budgets,
  recurring_transactions, push_subscriptions.
- **Via-join** (child inherits parent ownership):
  - `installment_months`: `EXISTS (SELECT 1 FROM installments i WHERE i.id = installment_months.installment_id AND i.user_id = auth.uid())`
  - `holdings`/`price_history`/`distributions`/`coupon_rates`/`corporate_actions`:
    `EXISTS (SELECT 1 FROM instruments i WHERE i.id = <child>.instrument_id AND i.user_id = auth.uid())`
- **profiles:** `USING (id = auth.uid())`.
- Service-role client (API `createServiceClient`, n8n, bot) bypasses RLS by
  design — those paths must scope by user explicitly (see §6).

### 3. Views — close the silent leak (`043_views_security_invoker.sql`)
- `ALTER VIEW v_transactions SET (security_invoker = on);`
- `ALTER VIEW v_investment_reconciliation SET (security_invoker = on);`
- Without this, views execute as owner and **return every user's rows** even
  with RLS enabled. Highest-risk, easiest-to-miss item.

### 4. RPC user-scoping (`044_rpc_user_scoping.sql`)
- The 8 DEFINER analytics functions: add `AND user_id = auth.uid()` to every
  query over `transactions`/`v_transactions`. Keep SECURITY DEFINER + explicit
  filter (matches the pre-`019` shape).
- Verify INVOKER investment RPCs return correct results once policies exist
  (they rely on RLS; no code change expected, but covered by tests).

### 5. Auto-stamp + seed (`045_auto_stamp_and_seed.sql`)
- Extend `trg_set_user_id` (BEFORE INSERT) to the remaining owned tables:
  instruments, budgets, recurring_transactions (accounts/categories/installments/
  transactions already have it). This covers **authenticated** (browser) inserts.
- `seed_user_data` / `on_profile_created_seed` already seed new users — verify
  intact after RLS. New users: 17 categories + 1 Cash account, zero bank accounts
  (they add their own).

### 6. App layer (no migration)
- **push-notify** (`api/src/routes/push-notify.ts`): restore
  `.eq('user_id', record.user_id)` on the subscriptions query (revert the
  single-user `ponytail:` shortcut). Owner email rows will now carry the owner's
  id (see below), so bank notifications still fire.
- **n8n email parser:** the insert node must set `user_id = 'dc20c468…'`
  (fixed owner id) so RLS + push work. Edit via n8n MCP.
- **API service-role routes (19):** audit each route that uses
  `createServiceClient`. Any read/write of user-owned data must filter by the
  authenticated user's id (from `requireUser`), because the service role bypasses
  RLS. Routes that already run per-request auth and only touch the caller's data
  via the browser client are fine. Produce a checklist; fix the ones that return
  or mutate cross-user data.

### 7. Testing (`tests/`)
Integration tests using the service role to set up two users, then the anon/
authenticated client to assert isolation:
- User B **cannot** read User A's transactions/accounts/instruments (direct table).
- `v_transactions` and `v_investment_reconciliation` return only caller's rows.
- Each of the 8 analytics RPCs returns only caller's data.
- Investment RPCs (`get_portfolio_summary`, etc.) scoped correctly.
- New-user signup seeds categories + Cash account for that user only.
- Owner's existing data intact (counts unchanged: 319 tx, 11 accounts).

## Rollout & rollback
- **Backup taken:** `~/finance-db-backup-20260715-200047.sql` (verified: 319 tx,
  11 accounts, full schema).
- Apply migrations via Supabase MCP `apply_migration` in order 041→045.
- Deploy API (push-notify) via the existing rsync+build+`pm2 restart finance-api`
  flow. Update n8n via MCP.
- **Rollback:** migrations are individually reversible (re-`DISABLE RLS`, drop
  policies, restore prior RPC bodies from git); worst case restore the dump.

## Risks
1. **View `security_invoker` (§3)** — omitting it silently leaks all data. Covered
   by test asserting view isolation.
2. **Missed DEFINER RPC (§4)** — same silent-leak class. Test every analytics RPC.
3. **Service-role API route (§6)** — bypasses RLS; an unscoped route leaks across
   users. Explicit audit + checklist.
4. **NOT NULL backfill (§1)** — guard with a pre-check; a stray NULL aborts the
   migration rather than corrupting.

## Open items for Phase 2 (recorded, not built now)
- Invite codes + `telegram_links` table + bot provisioning via service role.
- Bot: resolve `chat_id → user_id`, scope every command, stamp `user_id`.
- Web login path for bot-provisioned users (magic-link vs password).
