# Multi-User Phase 1 — DB Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the DB and app layer fully user-scoped and RLS-secured so a second user is safe to add, with zero behavior change for the existing owner.

**Architecture:** Revive the isolated multi-user model that migration `015` built and `019` reverted. Backfill the owner's `user_id` onto NULL rows, re-enable RLS with per-user (and via-parent-join) policies, close view/RPC leaks (`security_invoker`, explicit `auth.uid()` filters), and scope the service-role writers (n8n, push, API) that bypass RLS. Prove isolation with integration tests that query as a real second user JWT.

**Tech Stack:** Supabase Postgres (RLS, SECURITY DEFINER/INVOKER, views), Supabase MCP `apply_migration`, Fastify (TypeScript) API, n8n (via MCP), plain-Node integration tests (`tests/integration/*.test.js`).

**Owner user id:** `dc20c468-c97f-4086-90f5-493007704eff`
**DB backup (rollback):** `~/finance-db-backup-20260715-200047.sql`
**Spec:** `docs/superpowers/specs/2026-07-16-multiuser-phase1-db-foundation-design.md`

**Conventions for this plan:**
- Migrations applied via Supabase MCP `apply_migration` (name = filename without `.sql`). Also save the SQL to `supabase/migrations/NNN_*.sql` so the repo stays the source of truth.
- All SQL/DB checks in this plan use the Supabase MCP (`apply_migration`, `execute_sql`) — never psql/CLI.
- Tests run against the live project. Every test that creates a user MUST tear it down.
- Env for tests: `SUPABASE_SERVICE_ROLE_KEY` (admin ops) and `SUPABASE_ANON_KEY` (user-JWT ops). Anon key lives in `dashboard/.env.local` as `VITE_SUPABASE_ANON_KEY`.

---

## File Structure

- `tests/integration/helpers/users.js` — **create** — test helper: create/sign-in/delete a throwaway user, return `{ userId, jwt, cleanup }`.
- `tests/integration/rls-isolation.test.js` — **create** — the isolation suite (tables, views, RPCs, seed).
- `supabase/migrations/041_backfill_user_id.sql` — **create** — backfill owner id + NOT NULL.
- `supabase/migrations/042_enable_rls_multiuser.sql` — **create** — RLS + policies.
- `supabase/migrations/043_views_security_invoker.sql` — **create** — view security_invoker.
- `supabase/migrations/044_rpc_user_scoping.sql` — **create** — analytics RPC filters.
- `supabase/migrations/045_extend_set_user_id_trigger.sql` — **create** — trigger on remaining tables.
- `api/src/routes/push-notify.ts` — **modify** — restore per-user filter.
- n8n "Email Parser" workflow(s) — **modify via n8n MCP** — stamp owner `user_id` on insert.
- `docs/superpowers/api-route-user-scoping-audit.md` — **create** — audit checklist + findings.

---

## Task 1: Test helper for throwaway users

**Files:**
- Create: `tests/integration/helpers/users.js`

- [ ] **Step 1: Write the helper**

```javascript
// tests/integration/helpers/users.js
// Create a real auth user (admin), sign in to get a JWT, and delete it after.
const SB_URL = 'https://dqvdhkpqyynvwfbuqyzu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
if (!ANON_KEY) throw new Error('SUPABASE_ANON_KEY not set');

const admin = (path, init = {}) =>
  fetch(`${SB_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

// Query REST as a specific user (RLS applies). jwt=null => anonymous.
export function asUser(jwt) {
  return (path, init = {}) =>
    fetch(`${SB_URL}/rest/v1${path}`, {
      ...init,
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${jwt ?? ANON_KEY}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
}

export async function createTestUser(email, password = 'Test-Passw0rd!') {
  const res = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const user = await res.json();
  if (!user.id) throw new Error(`create user failed: ${JSON.stringify(user)}`);

  const signin = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const session = await signin.json();
  if (!session.access_token) throw new Error(`signin failed: ${JSON.stringify(session)}`);

  const cleanup = async () => {
    // Delete owned rows first (FKs to auth.users have no cascade), then the user.
    for (const tbl of ['transactions', 'installments', 'recurring_transactions',
                        'budgets', 'instruments', 'categories', 'accounts']) {
      await admin(`/rest/v1/${tbl}?user_id=eq.${user.id}`, { method: 'DELETE' });
    }
    await admin(`/rest/v1/profiles?id=eq.${user.id}`, { method: 'DELETE' });
    await admin(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' });
  };

  return { userId: user.id, jwt: session.access_token, cleanup };
}
```

- [ ] **Step 2: Smoke-check the helper**

Run: `SUPABASE_SERVICE_ROLE_KEY=$KEY SUPABASE_ANON_KEY=$ANON node -e "import('./tests/integration/helpers/users.js').then(async m => { const u = await m.createTestUser('phase1-smoke-'+Date.now()+'@example.com'); console.log('OK', !!u.jwt); await u.cleanup(); console.log('cleaned'); })"`
Expected: prints `OK true` then `cleaned`, exit 0. (Confirms admin create + sign-in + teardown work before RLS exists.)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/helpers/users.js
git commit -m "test(multiuser): add throwaway test-user helper"
```

---

## Task 2: Isolation test — transactions table (RED first)

**Files:**
- Create: `tests/integration/rls-isolation.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
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
```

- [ ] **Step 2: Run to verify it FAILS**

Run: `SUPABASE_SERVICE_ROLE_KEY=$KEY SUPABASE_ANON_KEY=$ANON node tests/integration/rls-isolation.test.js`
Expected: FAIL — RLS is off, so B's query returns owner rows and `some(... === OWNER_ID)` is true.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/integration/rls-isolation.test.js
git commit -m "test(multiuser): failing transactions isolation test"
```

---

## Task 3: Backfill migration (041)

**Files:**
- Create: `supabase/migrations/041_backfill_user_id.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 041: Backfill owner user_id onto NULL rows, then enforce NOT NULL.
-- Single-user history => every NULL row belongs to the owner.
DO $$
DECLARE owner uuid := 'dc20c468-c97f-4086-90f5-493007704eff';
BEGIN
  UPDATE transactions            SET user_id = owner WHERE user_id IS NULL;
  UPDATE accounts                SET user_id = owner WHERE user_id IS NULL;
  UPDATE categories              SET user_id = owner WHERE user_id IS NULL;
  UPDATE installments            SET user_id = owner WHERE user_id IS NULL;
  UPDATE instruments             SET user_id = owner WHERE user_id IS NULL;
  UPDATE budgets                 SET user_id = owner WHERE user_id IS NULL;
  UPDATE recurring_transactions  SET user_id = owner WHERE user_id IS NULL;
END $$;

-- Guard: abort if any transaction is still unowned.
DO $$
BEGIN
  IF (SELECT count(*) FROM transactions WHERE user_id IS NULL) > 0 THEN
    RAISE EXCEPTION 'transactions still have NULL user_id — aborting';
  END IF;
END $$;

ALTER TABLE transactions           ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE accounts               ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE categories             ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE installments           ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE instruments            ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE budgets                ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE recurring_transactions ALTER COLUMN user_id SET NOT NULL;
```

- [ ] **Step 2: Apply via Supabase MCP**

Apply migration name `041_backfill_user_id` with the SQL above (Supabase MCP `apply_migration`).

- [ ] **Step 3: Verify no NULLs and counts intact**

Run (Supabase MCP `execute_sql`):
```sql
select
  (select count(*) from transactions where user_id is null) as null_tx,
  (select count(*) from transactions) as total_tx,
  (select count(*) from accounts) as total_acct;
```
Expected: `null_tx = 0`, `total_tx = 319`, `total_acct = 11`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/041_backfill_user_id.sql
git commit -m "feat(db): backfill owner user_id, enforce NOT NULL (041)"
```

---

## Task 4: RLS + policies migration (042) — makes Task 2 GREEN

**Files:**
- Create: `supabase/migrations/042_enable_rls_multiuser.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 042: Enable RLS + per-user policies (isolated multi-user).
-- Direct-owned tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','categories','transactions','installments',
                           'instruments','budgets','recurring_transactions',
                           'push_subscriptions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS own_rows ON %I', t);
    EXECUTE format(
      'CREATE POLICY own_rows ON %I FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t);
  END LOOP;
END $$;

-- profiles keyed by id.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_profile ON profiles;
CREATE POLICY own_profile ON profiles FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- installment_months via parent installments.
ALTER TABLE installment_months ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_via_installment ON installment_months;
CREATE POLICY own_via_installment ON installment_months FOR ALL
  USING (EXISTS (SELECT 1 FROM installments i
                 WHERE i.id = installment_months.installment_id AND i.user_id = auth.uid()));

-- Investment children via parent instruments.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['holdings','price_history','distributions',
                           'coupon_rates','corporate_actions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS own_via_instrument ON %I', t);
    EXECUTE format(
      'CREATE POLICY own_via_instrument ON %I FOR ALL USING (EXISTS (SELECT 1 FROM instruments ins WHERE ins.id = %I.instrument_id AND ins.user_id = auth.uid()))',
      t, t);
  END LOOP;
END $$;
```

> **Note for implementer:** confirm each investment child table's FK column is named `instrument_id` before applying (Supabase MCP `execute_sql`: `select column_name from information_schema.columns where table_name='holdings'`). If a table references instruments by a different column, adjust that table's policy. If a child (e.g. `price_history`) has no `instrument_id`, scope it via its own parent chain and note it.

- [ ] **Step 2: Verify FK column names before applying**

Run (Supabase MCP `execute_sql`):
```sql
select table_name, column_name from information_schema.columns
where table_schema='public'
  and table_name in ('holdings','price_history','distributions','coupon_rates','corporate_actions')
  and column_name like '%instrument%' order by table_name;
```
Expected: each table shows an `instrument_id` (or equivalent) column. Adjust the SQL for any mismatch, then continue.

- [ ] **Step 3: Apply via Supabase MCP**

Apply migration name `042_enable_rls_multiuser`.

- [ ] **Step 4: Run the isolation test — now GREEN**

Run: `SUPABASE_SERVICE_ROLE_KEY=$KEY SUPABASE_ANON_KEY=$ANON node tests/integration/rls-isolation.test.js`
Expected: PASS — user B sees zero owner transactions.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/042_enable_rls_multiuser.sql
git commit -m "feat(db): enable RLS + per-user policies (042)"
```

---

## Task 5: Add view + owner-still-works isolation assertions

**Files:**
- Modify: `tests/integration/rls-isolation.test.js`

- [ ] **Step 1: Add tests (views + owner sanity) — expect view test to FAIL**

Append inside a new suite:
```javascript
await runSuite('RLS isolation — views & owner', async () => {
  await test('user B sees no owner rows in v_transactions', async () => {
    const b = await createTestUser(`phase1-vb-${Date.now()}@example.com`);
    try {
      const res = await asUser(b.jwt)(`/v_transactions?select=id&limit=1000`);
      const rows = await res.json();
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBe(0); // B has no transactions
    } finally {
      await b.cleanup();
    }
  });

  await test('owner still sees own rows through RLS', async () => {
    const owner = await createTestUser(`phase1-owner-check-${Date.now()}@example.com`);
    try {
      // brand-new user: seeded categories exist, transactions do not
      const cats = await (await asUser(owner.jwt)(`/categories?select=id`)).json();
      expect(cats.length).toBeGreaterThan(0);
      const tx = await (await asUser(owner.jwt)(`/transactions?select=id`)).json();
      expect(tx.length).toBe(0);
    } finally {
      await owner.cleanup();
    }
  });
});
```

- [ ] **Step 2: Run — view test FAILS (view still DEFINER)**

Run: `SUPABASE_SERVICE_ROLE_KEY=$KEY SUPABASE_ANON_KEY=$ANON node tests/integration/rls-isolation.test.js`
Expected: the `v_transactions` test FAILS (returns owner rows because the view bypasses RLS). The other tests pass.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/integration/rls-isolation.test.js
git commit -m "test(multiuser): failing v_transactions isolation + owner sanity"
```

---

## Task 6: Views security_invoker migration (043) — makes Task 5 GREEN

**Files:**
- Create: `supabase/migrations/043_views_security_invoker.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 043: Views must run with caller's rights so RLS applies. Without this they
-- execute as owner and leak every user's rows.
ALTER VIEW v_transactions             SET (security_invoker = on);
ALTER VIEW v_investment_reconciliation SET (security_invoker = on);
```

- [ ] **Step 2: Apply via Supabase MCP**

Apply migration name `043_views_security_invoker`.

- [ ] **Step 3: Run isolation test — view test now GREEN**

Run: `SUPABASE_SERVICE_ROLE_KEY=$KEY SUPABASE_ANON_KEY=$ANON node tests/integration/rls-isolation.test.js`
Expected: all tests PASS, including `v_transactions` isolation.

- [ ] **Step 4: Verify owner dashboard still loads (no view regression)**

Run (Supabase MCP `execute_sql`, as service role — sanity that view still returns data at all):
```sql
select count(*) from v_transactions;
```
Expected: `319` (service role bypasses RLS; confirms the view itself isn't broken by the option change).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/043_views_security_invoker.sql
git commit -m "feat(db): security_invoker on views to enforce RLS (043)"
```

---

## Task 7: Analytics RPC isolation test (RED)

**Files:**
- Modify: `tests/integration/rls-isolation.test.js`

- [ ] **Step 1: Add RPC isolation test**

Append a new suite:
```javascript
await runSuite('RLS isolation — analytics RPCs', async () => {
  const RPCS = [
    ['get_summary', { p_start_date: '2000-01-01', p_end_date: '2100-01-01' }],
    ['get_category_breakdown', { p_start_date: '2000-01-01', p_end_date: '2100-01-01', p_type: 'expense' }],
    ['get_monthly_trend', { p_months: 240 }],
    ['get_expense_heatmap', { p_start_date: '2000-01-01', p_end_date: '2100-01-01' }],
    ['get_period_comparison', { p_start: '2000-01-01', p_end: '2100-01-01', p_prev_start: '1999-01-01', p_prev_end: '1999-12-31' }],
    ['get_savings_rate_trend', { p_months: 240 }],
    ['get_top_transactions', { p_start: '2000-01-01', p_end: '2100-01-01', p_limit: 1000 }],
    ['get_daily_spending', { p_start: '2000-01-01', p_end: '2100-01-01' }],
  ];

  await test('every analytics RPC returns empty/zero for a fresh user', async () => {
    const b = await createTestUser(`phase1-rpc-${Date.now()}@example.com`);
    try {
      for (const [fn, body] of RPCS) {
        const res = await asUser(b.jwt)(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(body) });
        const data = await res.json();
        expect(res.status).toBe(200);
        // Fresh user has no transactions -> no rows, or a single all-zero summary row.
        const leaked = Array.isArray(data)
          ? data.some(r => Number(r.total_income ?? r.total_expense ?? r.total_amount ?? r.amount ?? r.income ?? r.expense ?? 0) !== 0
                        || Number(r.transaction_count ?? 0) !== 0)
          : false;
        expect(leaked).toBe(false);
      }
    } finally {
      await b.cleanup();
    }
  });
});
```

- [ ] **Step 2: Run — expect FAIL (RPCs are DEFINER, unscoped)**

Run: `SUPABASE_SERVICE_ROLE_KEY=$KEY SUPABASE_ANON_KEY=$ANON node tests/integration/rls-isolation.test.js`
Expected: FAIL — the DEFINER RPCs ignore RLS and return the owner's aggregates for user B.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/rls-isolation.test.js
git commit -m "test(multiuser): failing analytics RPC isolation"
```

---

## Task 8: RPC user-scoping migration (044) — makes Task 7 GREEN

**Files:**
- Create: `supabase/migrations/044_rpc_user_scoping.sql`

- [ ] **Step 1: Read each current RPC body**

Run (Supabase MCP `execute_sql`):
```sql
select proname, pg_get_functiondef(oid)
from pg_proc
where proname in ('get_summary','get_category_breakdown','get_expense_heatmap',
  'get_monthly_trend','get_period_comparison','get_savings_rate_trend',
  'get_top_transactions','get_daily_spending')
order by proname;
```
Expected: 8 function definitions. These are the source you edit — keep every signature, return type, param name, and column alias identical; only add a user filter.

- [ ] **Step 2: Write migration adding `user_id = auth.uid()`**

For each of the 8 functions, `CREATE OR REPLACE` with the body from Step 1, keeping `SECURITY DEFINER`, and adding `AND user_id = auth.uid()` (or `AND t.user_id = auth.uid()` matching the query's alias) to every `WHERE` over `transactions`/`v_transactions`. Save the full 8-function file as `044_rpc_user_scoping.sql`.

Illustrative shape (do NOT invent columns — copy from Step 1 output):
```sql
CREATE OR REPLACE FUNCTION get_summary(p_start_date date, p_end_date date)
RETURNS TABLE(total_income numeric, total_expense numeric, net_cashflow numeric, transaction_count bigint)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE type='income'), 0),
    COALESCE(SUM(amount) FILTER (WHERE type='expense'), 0),
    COALESCE(SUM(amount) FILTER (WHERE type='income'), 0) - COALESCE(SUM(amount) FILTER (WHERE type='expense'), 0),
    COUNT(*)
  FROM transactions
  WHERE is_deleted = false
    AND is_adjustment = false
    AND date BETWEEN p_start_date AND p_end_date
    AND user_id = auth.uid();   -- << added
$$;
-- ...repeat for the other 7, each preserving its exact original body + the added filter.
```

- [ ] **Step 3: Apply via Supabase MCP**

Apply migration name `044_rpc_user_scoping`.

- [ ] **Step 4: Run isolation test — RPC suite now GREEN**

Run: `SUPABASE_SERVICE_ROLE_KEY=$KEY SUPABASE_ANON_KEY=$ANON node tests/integration/rls-isolation.test.js`
Expected: all suites PASS.

- [ ] **Step 5: Run the existing analytics regression (owner-shape unchanged)**

Run: `SUPABASE_SERVICE_ROLE_KEY=$KEY node tests/integration/analytics-rpc.test.js`
Expected: PASS — param names, response shapes, and adjustment-exclusion still hold. (Note: this suite calls RPCs with the service-role key; `auth.uid()` is NULL there, so it validates the functions don't error and shapes are intact.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/044_rpc_user_scoping.sql
git commit -m "feat(db): scope analytics RPCs to auth.uid() (044)"
```

---

## Task 9: Extend auto-stamp trigger to remaining tables (045)

**Files:**
- Create: `supabase/migrations/045_extend_set_user_id_trigger.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 045: trg_set_user_id already covers accounts/categories/installments/transactions.
-- Extend it to the other owned tables so authenticated (browser) inserts auto-fill.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['instruments','budgets','recurring_transactions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_user_id ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_set_user_id BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION set_user_id_on_insert()', t);
  END LOOP;
END $$;
```

- [ ] **Step 2: Apply via Supabase MCP**

Apply migration name `045_extend_set_user_id_trigger`.

- [ ] **Step 3: Verify triggers attached**

Run (Supabase MCP `execute_sql`):
```sql
select event_object_table, trigger_name from information_schema.triggers
where trigger_name='trg_set_user_id' order by event_object_table;
```
Expected: rows for accounts, budgets, categories, installments, instruments, recurring_transactions, transactions (7 tables).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/045_extend_set_user_id_trigger.sql
git commit -m "feat(db): auto-stamp user_id on instruments/budgets/recurring (045)"
```

---

## Task 10: Restore per-user filter in push-notify

**Files:**
- Modify: `api/src/routes/push-notify.ts`

- [ ] **Step 1: Restore the filter**

Replace the single-user shortcut block:
```typescript
    // ponytail: single-user app — notify every subscription. Email-parsed (BCA/BSI)
    // transactions have user_id = NULL, so filtering by record.user_id would drop them.
    // Add .eq('user_id', ...) back if this ever goes multi-user.
    const { data: subs, error: subsError } = await (adminSupabase as any)
      .from('push_subscriptions').select('endpoint, p256dh, auth');
```
with:
```typescript
    const { data: subs, error: subsError } = await (adminSupabase as any)
      .from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', record.user_id);
```

- [ ] **Step 2: Typecheck**

Run: `cd api && pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add api/src/routes/push-notify.ts
git commit -m "feat(push): scope notifications to record.user_id (multi-user)"
```

> Deploy is handled in Task 12 together with the n8n change so email rows carry the owner id before the filter goes live.

---

## Task 11: n8n email parser stamps owner user_id

**Files:**
- Modify (via n8n MCP): the Email Parser workflow(s) that insert into `transactions`.

- [ ] **Step 1: Find the insert node(s)**

Use n8n MCP `n8n_list_workflows` then `n8n_get_workflow` for workflows matching `Email Parser`. Locate the node that inserts into `transactions` (Supabase/HTTP node).

- [ ] **Step 2: Add `user_id` to the inserted payload**

Set `user_id = dc20c468-c97f-4086-90f5-493007704eff` on the insert body (static value — the owner's email is the only email source). Use n8n MCP `n8n_update_partial_workflow`.

- [ ] **Step 3: Validate + verify**

Run n8n MCP `n8n_validate_workflow` on the edited workflow. Expected: valid.
Then confirm the DB NOT NULL constraint (Task 3) means any future email insert missing `user_id` would now be rejected — so this step is required for email parsing to keep working. Sanity: re-check the node payload includes `user_id`.

- [ ] **Step 4: Commit a note (workflow lives on server, not in repo)**

```bash
git commit --allow-empty -m "chore(n8n): email parser stamps owner user_id (see SERVER.md)"
```

---

## Task 12: API service-role route audit

**Files:**
- Create: `docs/superpowers/api-route-user-scoping-audit.md`
- Modify: any `api/src/routes/*.ts` found to leak cross-user data.

- [ ] **Step 1: Enumerate service-role usage**

Run: `grep -rn "createServiceClient\|requireUser" api/src/routes`
Produce a table in the audit doc: route file → uses service role? → does it read/write user-owned data? → is it filtered by the authenticated user?

- [ ] **Step 2: Classify each route**

For every route using `createServiceClient` on user-owned tables:
- **Safe:** it filters by the authenticated user's id (from `requireUser`) or only touches the caller's own row(s).
- **Leak:** returns or mutates rows without a user filter → must fix.
Record the verdict per route in the audit doc.

- [ ] **Step 3: Fix leaking routes**

For each leak, add the authenticated user id as a filter (`.eq('user_id', user.id)`), taking `user.id` from the `requireUser`/`supabase.auth.getUser()` result already used in these routes. Keep the change minimal and consistent with the route's existing style.

- [ ] **Step 4: Typecheck + commit**

Run: `cd api && pnpm typecheck`
Expected: no errors.
```bash
git add docs/superpowers/api-route-user-scoping-audit.md api/src/routes
git commit -m "fix(api): scope service-role routes to authenticated user"
```

> `push-notify` (Task 10) is intentionally cross-user-by-record (it fans out to the record owner's devices) and is exempt from this audit.

---

## Task 13: Deploy + full verification

**Files:** none (deploy + verify only)

- [ ] **Step 1: Run the full test suite**

Run: `SUPABASE_SERVICE_ROLE_KEY=$KEY SUPABASE_ANON_KEY=$ANON bash tests/run-all.sh`
Expected: all suites pass (isolation + analytics + existing integration).

- [ ] **Step 2: Deploy API to server**

Sync changed `api/` files to the server, build, restart — following the established flow:
```bash
SERVER=mrrizaldi@192.168.31.221
rsync -az api/src/routes/push-notify.ts $SERVER:~/dev/finance-project/api/src/routes/push-notify.ts
# plus any routes changed in Task 12
```
Then on the server (ssh MCP): `cd ~/dev/finance-project/api && pnpm build && pm2 restart finance-api` (PATH: `$HOME/.proto/tools/node/globals/bin`).
Health: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3701/api/push/vapid-key` → `200`.

- [ ] **Step 3: Owner smoke test (nothing changed for you)**

Load the dashboard as the owner; confirm totals/accounts/analytics render identically to before. Add one manual transaction and confirm it appears with the owner's `user_id` (Supabase MCP: `select user_id from transactions order by created_at desc limit 1` → owner id).

- [ ] **Step 4: Trigger a real email → push (end-to-end)**

After an email-parsed transaction arrives (or simulate an insert with the owner `user_id` via the normal path), confirm a push notification fires to the owner's subscribed device. Confirms n8n stamp + push filter + trigger all line up.

- [ ] **Step 5: Final commit / branch wrap-up**

Ensure all migration files + code + audit doc are committed and pushed. Multi-user Phase 1 foundation complete; onboarding (Phase 2) is the next spec.

---

## Self-review notes
- Spec §1 backfill → Task 3. §2 RLS/policies → Task 4. §3 views → Task 6. §4 RPCs → Task 8. §5 auto-stamp/seed → Task 9 (seed already exists; verified in Task 5 owner-sanity test). §6 app layer → Tasks 10 (push), 11 (n8n), 12 (API). §7 testing → Tasks 1,2,5,7 + Task 13 regression.
- RED/GREEN pairing: Task 2↔4 (tables), Task 5↔6 (views), Task 7↔8 (RPCs).
- Rollback anchor: `~/finance-db-backup-20260715-200047.sql`; each migration is independently reversible.
