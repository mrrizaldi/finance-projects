# API Route User-Scoping Audit (Multi-user Phase 1, Task 12)

Context: RLS with `user_id = auth.uid()` policies is now enabled on all
user-owned tables. This audit checks every route in `api/src/routes/*.ts` for
places that use the **service-role client** (`createServiceClient()`, bypasses
RLS) on user-owned data without an explicit filter to the authenticated
caller's id. Routes that only use the **auth-scoped client** from
`requireUser()` are RLS-scoped automatically and need no additional filter.

Enumeration command:
```
grep -rn "createServiceClient\|requireUser\|createBrowserClient" api/src/routes
```

Verified (see below) that no route creates a Supabase client any other way —
`grep -rn "createClient("` across `api/src/routes`, `api/src/lib`,
`api/src/jobs` only matches `api/src/lib/supabase.ts` itself (the
`createServiceClient()` / `DISABLE_AUTH` dev-escape-hatch definitions). So the
client-usage classification below is exhaustive.

## Results

| Route file | Client used | User data? | Filtered by caller? | Verdict | Note |
|---|---|---|---|---|---|
| `accounts.ts` | auth-scoped (`requireUser`) | yes (`accounts` insert) | yes — `user_id: user.id` on insert, RLS on read | SAFE | — |
| `accounts-id.ts` | auth-scoped | yes (`accounts`) | yes — RLS scopes `.eq('id', id)` to caller's rows | SAFE | — |
| `accounts-id-adjust.ts` | auth-scoped | yes (`accounts`, `transactions`, RPC `set_account_balance`) | yes — RLS + `user_id: user.id` on transaction insert | SAFE | RPC called through auth-scoped client, so `auth.uid()` populated correctly |
| `categories.ts` | auth-scoped | yes (`categories`) | yes — `user_id: user.id` on insert | SAFE | — |
| `categories-id.ts` | auth-scoped | yes (`categories`) | yes — RLS | SAFE | — |
| `installments.ts` | auth-scoped | yes (`installments`, `installment_months`) | yes — `user_id: user.id` on insert, RLS thereafter | SAFE | — |
| `installments-id.ts` | auth-scoped | yes (`installments`, `installment_months`) | yes — RLS | SAFE | — |
| `installments-id-append.ts` | auth-scoped | yes (`installments`, `installment_months`) | yes — RLS | SAFE | — |
| `installments-id-pay.ts` | auth-scoped | yes (`installments`, `installment_months`, `transactions`) | yes — RLS | SAFE | — |
| `transactions.ts` | auth-scoped | yes (`v_transactions` view) | yes — RLS on the view (security_invoker, migration 043) | SAFE | — |
| `transactions-id.ts` | auth-scoped | yes (`transactions`, `accounts`) | yes — RLS | SAFE | `SupabaseClient` type import only; no second client instance created |
| `transactions-recalculate.ts` | auth-scoped | yes (`accounts`, `transactions` via `recalculateForAccounts` lib) | yes — RLS (lib helper receives the auth-scoped client) | SAFE | — |
| `investments.ts` | auth-scoped | yes (`instruments`, RPCs `get_portfolio_value`/`get_portfolio_summary`/`get_portfolio_history`) | yes — RLS + RPCs called through auth-scoped client | SAFE | — |
| `investments-instruments.ts` | auth-scoped | yes (`instruments`, RPC `get_all_instruments_value`) | yes — RLS + RPC via auth-scoped client | SAFE | — |
| `investments-instruments-purchase.ts` | auth-scoped | yes (`instruments`, RPC `record_instrument_purchase`) | yes — `p_user_id: user.id` passed explicitly + RPC via auth-scoped client | SAFE | — |
| `investments-purchase.ts` | auth-scoped | yes (`instruments`/`accounts`/`transactions` via `recordFundPurchase` lib) | yes — `userId: user.id` passed through, RLS | SAFE | — |
| `investments-corporate-actions.ts` | auth-scoped | yes (`corporate_actions`, RPC `apply_corporate_action`) | yes — RLS + RPC via auth-scoped client | SAFE | — |
| `investments-coupon-rates.ts` | auth-scoped | yes (`coupon_rates`) | yes — RLS | SAFE | — |
| `investments-distributions.ts` | auth-scoped | yes (`distributions`, `instruments`, `coupon_rates`, RPC `confirm_distribution`) | yes — RLS + `p_user_id: user.id` + RPC via auth-scoped client | SAFE | — |
| `profile.ts` | auth-scoped | yes (`profiles`) | yes — `.eq('id', user.id)` explicit | SAFE | — |
| `push-subscribe.ts` | auth-scoped | yes (`push_subscriptions`) | yes — `user_id: user.id` on upsert, `.eq('user_id', user.id)` on delete | SAFE | — |
| `push-vapid-key.ts` | none (no Supabase client at all) | no — returns `process.env.VAPID_PUBLIC_KEY` | n/a | SAFE | No DB access |
| `chat.ts` | auth-scoped | yes (RPCs `get_summary`/`get_category_breakdown`, `accounts`) | yes — RLS + RPC via auth-scoped client | SAFE | — |
| `categorize.ts` | auth-scoped | yes (`categories`) | yes — RLS | SAFE | — |
| `budget-suggest.ts` | auth-scoped (guard only, no DB query) | no — pure LLM call on client-supplied JSON body | n/a | SAFE | Only calls `requireUser` as an auth gate; doesn't touch Supabase |
| `push-notify.ts` | service-role (`createServiceClient`) | yes (reads `push_subscriptions`) | yes — filters by `record.user_id` from the DB trigger payload (the record owner, not a logged-in caller) | **EXEMPT** | Explicitly excluded by task scope — webhook fans out to the owning user's devices by design; not touched |
| `investments-fetch-nav.ts` | service-role (`createServiceClient`) | yes (`instruments`, `price_history`, all users') | no per-caller filter — auth is a shared `x-webhook-secret` header, not a logged-in user | **NEEDS REVIEW** | See note below |
| `investments-fetch-stock-prices.ts` | service-role | yes (`instruments`, `holdings`, `price_history`, `corporate_actions`, `distributions`, all users') | no per-caller filter (same webhook-secret auth) | **NEEDS REVIEW** | See note below |
| `investments-fetch-bond-prices.ts` | service-role | yes (`instruments`, `price_history`, all users') | no per-caller filter (same webhook-secret auth) | **NEEDS REVIEW** | See note below |
| `investments-revalue.ts` | service-role | yes (`accounts`, `instruments`, `holdings`, `price_history`, `categories`, `transactions`, all users') | no per-caller filter (same webhook-secret auth); writes `transactions.user_id` hardcoded to `process.env.OWNER_USER_ID` | **NEEDS REVIEW** | See note below |

## NEEDS REVIEW — the four investment cron/webhook routes

`investments-fetch-nav.ts`, `investments-fetch-stock-prices.ts`,
`investments-fetch-bond-prices.ts`, `investments-revalue.ts` are not
per-user API routes: they're internal jobs gated by a shared secret header
(`x-webhook-secret` == `INVESTMENT_JOB_SECRET`), not `requireUser`/a logged-in
session. There is no "authenticated caller id" to filter by — the task's fix
pattern (`.eq('user_id', user.id)` from `requireUser`) doesn't apply here, so
per the task rules ("if a route legitimately needs cross-user access ... do
NOT force a change") these were left as-is.

Reasoning per job:
- **`fetch-nav` / `fetch-stock-prices` / `fetch-bond-prices`**: intentionally
  fetch market prices (NAV/stock/bond) for **every** active instrument across
  **all** users in one run — that's the whole point of a shared price-fetch
  cron (one Bareksa/Yahoo/PHEI call feeding every user's portfolio, not just
  one). Scoping to a single caller would break the job's purpose. This looks
  like intentional cross-tenant-by-design, same shape as `push-notify.ts`'s
  exemption, just not literally that file.
- **`revalue-investments.ts`** does the same fan-out over all investment
  accounts (any user), which is consistent with the above. However it also
  stamps every inserted revaluation `transactions` row with
  `user_id: process.env.OWNER_USER_ID` (a single fixed env var, see
  `api/src/jobs/revalue-investments.ts:17,149`) regardless of which user
  actually owns the account being revalued. Pre-multi-user this was correct
  (single owner). Post-multi-user this is a **separate correctness bug**
  (misattributed `user_id`, not a service-role scoping leak in the audited
  sense — there's no caller to scope to, and the row already gets a
  `user_id`, just possibly the wrong one for a second user's investment
  account). Flagging for follow-up: the fix is to derive `user_id` from
  `accounts.user_id` per row (already selected in the `accounts` query,
  would just need adding `user_id` to the `.select()` and using
  `account.user_id` in the insert) rather than a single ownerId env var.
  Left untouched here per the "don't force it, mark NEEDS REVIEW" rule since
  it's outside the requireUser-caller-filter fix pattern this task describes,
  and touching the job's ownership model deserves its own reviewed change.

## Outcome

- **Routes audited**: 29
- **LEAK (fixed)**: 0
- **SAFE**: 24 (23 auth-scoped data routes + `push-vapid-key.ts`)
- **EXEMPT**: 1 (`push-notify.ts`, per task instructions)
- **NEEDS REVIEW**: 4 (`investments-fetch-nav.ts`, `investments-fetch-stock-prices.ts`,
  `investments-fetch-bond-prices.ts`, `investments-revalue.ts`)

No code in `api/src/routes` was modified — every route that touches
user-owned data already goes exclusively through the auth-scoped
`requireUser()` client, which is automatically RLS-scoped to the caller.
