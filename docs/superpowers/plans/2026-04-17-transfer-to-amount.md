# Transfer to_amount (Admin Fee Support) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow transfer conversations to accept two different amounts — one deducted from source, one credited to destination — to silently absorb admin fees.

**Architecture:** Add nullable `to_amount` column to `transactions` table. Update the `Transaction` TypeScript type, balance-update logic, conversation flow, undo/delete handlers, and confirmation message. All existing single-amount transfers remain backward compatible (`to_amount IS NULL` → behaves like before).

**Tech Stack:** TypeScript, grammY, Supabase (PostgreSQL), pnpm, pm2, rsync

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/014_transfer_to_amount.sql` | CREATE — add `to_amount` column |
| `telegram-bot/src/types/index.ts` | MODIFY — add `to_amount?: number` to `Transaction` |
| `telegram-bot/src/services/formatter.ts` | MODIFY — add `to_amount?` to `formatTransactionMessage` signature + render admin fee line |
| `telegram-bot/src/bot.ts` | MODIFY — conversation, `insertTransactionWithBalanceSnapshots`, `/undo`, `delete_txn_` callback, help message |

---

### Task 1: DB Migration — add `to_amount` column

**Files:**
- Create: `supabase/migrations/014_transfer_to_amount.sql`

- [ ] **Step 1: Write migration file**

```sql
-- 014_transfer_to_amount.sql
-- Add nullable to_amount for transfers where admin fee causes source/dest amounts to differ.
-- NULL means same as amount (backward compatible).
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS to_amount NUMERIC;

COMMENT ON COLUMN transactions.to_amount IS
  'For transfers only: amount credited to destination account. NULL = same as amount.';
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `mcp__supabase__execute_sql` with the SQL above on project `dqvdhkpqyynvwfbuqyzu`.

Expected: no error, column appears in `transactions` schema.

- [ ] **Step 3: Verify column exists**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'transactions' AND column_name = 'to_amount';
```

Expected: one row, `data_type = numeric`, `is_nullable = YES`.

- [ ] **Step 4: Commit migration file**

```bash
cd /home/mrrizaldi/dev/finance-project
git add supabase/migrations/014_transfer_to_amount.sql
git commit -m "feat(db): add to_amount column to transactions for transfer admin fee support"
```

---

### Task 2: Update TypeScript Transaction type

**Files:**
- Modify: `telegram-bot/src/types/index.ts`

- [ ] **Step 1: Add `to_amount` field**

In `telegram-bot/src/types/index.ts`, add `to_amount?: number;` after `amount: number;`:

```typescript
export interface Transaction {
  id?: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  to_amount?: number;           // ← ADD THIS
  description?: string;
  merchant?: string;
  category_id?: string;
  account_id?: string;
  to_account_id?: string;
  installment_id?: string;
  source: TransactionSource;
  email_subject?: string;
  email_sender?: string;
  email_raw_snippet?: string;
  raw_data?: Record<string, any>;
  balance_before?: number;
  balance_after?: number;
  to_balance_before?: number;
  to_balance_after?: number;
  is_adjustment?: boolean;
  adjustment_note?: string;
  transaction_date: string;
}
```

- [ ] **Step 2: Type-check**

```bash
cd /home/mrrizaldi/dev/finance-project/telegram-bot
pnpm exec tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add telegram-bot/src/types/index.ts
git commit -m "feat(types): add to_amount field to Transaction for transfer admin fee"
```

---

### Task 3: Update `formatTransactionMessage` to show admin fee

**Files:**
- Modify: `telegram-bot/src/services/formatter.ts`

- [ ] **Step 1: Add `to_amount` to function signature and render admin fee line**

Replace the entire `formatTransactionMessage` function:

```typescript
export function formatTransactionMessage(txn: {
  type: string;
  amount: number;
  to_amount?: number;
  description?: string;
  category_name?: string;
  account_name?: string;
  transaction_date: string;
  source: string;
}): string {
  const sign = txn.type === 'income' ? '+' : '-';
  const effectiveToAmount = txn.to_amount ?? txn.amount;
  const adminFee = txn.type === 'transfer' && txn.to_amount != null && txn.to_amount !== txn.amount
    ? txn.amount - txn.to_amount
    : null;

  const amountLine = txn.type === 'transfer'
    ? adminFee != null
      ? [
          `Keluar : -${formatRupiah(txn.amount)}`,
          `Masuk  : +${formatRupiah(effectiveToAmount)}`,
          `Biaya  : ${formatRupiah(adminFee)}`,
        ].join('\n')
      : `${sign}${formatRupiah(txn.amount)}`
    : `${sign}${formatRupiah(txn.amount)}`;

  return [
    `<b>Transaksi ${txn.type === 'income' ? 'Masuk' : txn.type === 'expense' ? 'Keluar' : 'Transfer'}</b>`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    amountLine,
    txn.description ? `Deskripsi: ${txn.description}` : '',
    txn.category_name ? `Kategori: ${txn.category_name}` : '',
    txn.account_name ? `Akun: ${txn.account_name}` : '',
    `Waktu: ${formatDate(txn.transaction_date)}`,
    `Sumber: ${txn.source.replace('_', ' ')}`,
    `━━━━━━━━━━━━━━━━━━━━━`,
  ]
    .filter(Boolean)
    .join('\n');
}
```

- [ ] **Step 2: Type-check**

```bash
cd /home/mrrizaldi/dev/finance-project/telegram-bot
pnpm exec tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add telegram-bot/src/services/formatter.ts
git commit -m "feat(formatter): show admin fee breakdown in transfer confirmation message"
```

---

### Task 4: Update `insertTransactionWithBalanceSnapshots` in bot.ts

**Files:**
- Modify: `telegram-bot/src/bot.ts` (~line 205)

- [ ] **Step 1: Update transfer balance logic to use `to_amount`**

Find the `insertTransactionWithBalanceSnapshots` function (around line 205). Replace the transfer branch:

```typescript
async function insertTransactionWithBalanceSnapshots(
  input: Omit<Transaction, 'id'>
): Promise<Transaction> {
  if (input.type === 'transfer') {
    if (!input.account_id || !input.to_account_id) {
      return db.insertTransaction(input);
    }

    const toAmount = input.to_amount ?? input.amount;

    const fromMutation = await db.updateAccountBalance(input.account_id, -input.amount);
    try {
      const toMutation = await db.updateAccountBalance(input.to_account_id, toAmount);
      try {
        return await db.insertTransaction({
          ...input,
          ...buildBalanceSnapshots({
            type: input.type,
            fromMutation,
            toMutation,
          }),
        });
      } catch (insertError) {
        await db.updateAccountBalance(input.account_id, input.amount);
        await db.updateAccountBalance(input.to_account_id, -toAmount);
        throw insertError;
      }
    } catch (toError) {
      await db.updateAccountBalance(input.account_id, input.amount);
      throw toError;
    }
  }

  if (!input.account_id) {
    return db.insertTransaction(input);
  }

  const delta = input.type === 'income' ? input.amount : -input.amount;
  const mutation = await db.updateAccountBalance(input.account_id, delta);

  try {
    return await db.insertTransaction({
      ...input,
      ...buildBalanceSnapshots({
        type: input.type,
        fromMutation: mutation,
      }),
    });
  } catch (insertError) {
    await db.updateAccountBalance(input.account_id, -delta);
    throw insertError;
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd /home/mrrizaldi/dev/finance-project/telegram-bot
pnpm exec tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add telegram-bot/src/bot.ts
git commit -m "feat(bot): use to_amount for destination balance update in transfers"
```

---

### Task 5: Update `/undo` and `delete_txn_` handlers to reverse `to_amount`

**Files:**
- Modify: `telegram-bot/src/bot.ts` (~line 1391, ~line 2165)

- [ ] **Step 1: Fix `/undo` transfer reversal (~line 1391)**

Find the `/undo` handler. Replace the transfer block:

```typescript
    if (lastTxn.type === 'transfer') {
      const toAmount = lastTxn.to_amount ?? lastTxn.amount;
      if (lastTxn.account_id) await db.updateAccountBalance(lastTxn.account_id, lastTxn.amount);
      if (lastTxn.to_account_id) await db.updateAccountBalance(lastTxn.to_account_id, -toAmount);
    } else if (lastTxn.account_id) {
```

- [ ] **Step 2: Fix `delete_txn_` callback transfer reversal (~line 2165)**

Find the `delete_txn_` callback. Replace the transfer block:

```typescript
    if (txn.type === 'transfer') {
      const toAmount = txn.to_amount ?? txn.amount;
      if (txn.account_id) await db.updateAccountBalance(txn.account_id, txn.amount);
      if (txn.to_account_id) await db.updateAccountBalance(txn.to_account_id, -toAmount);
    } else if (txn.account_id) {
```

- [ ] **Step 3: Type-check**

```bash
cd /home/mrrizaldi/dev/finance-project/telegram-bot
pnpm exec tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add telegram-bot/src/bot.ts
git commit -m "fix(bot): undo/delete transfer reversal uses to_amount for destination balance"
```

---

### Task 6: Update `recordTransferConvo` conversation flow

**Files:**
- Modify: `telegram-bot/src/bot.ts` (~line 789)

- [ ] **Step 1: Replace `recordTransferConvo` with two-amount flow**

Find and replace the entire `recordTransferConvo` function body:

```typescript
  async function recordTransferConvo(conversation: MyConversation, ctx: MyContext) {
    // Step 1: from_amount (deducted from source)
    await ctx.reply('Nominal keluar dari akun sumber?', { reply_markup: { force_reply: true } });
    const fromMsg = await conversation.wait();
    const fromAmount = parseAmount(fromMsg.message?.text || '');
    if (!fromAmount) return ctx.reply('Nominal tidak valid. Coba lagi dengan /transfer');

    // Step 2: to_amount (credited to destination) — Enter/= means same as fromAmount
    await ctx.reply(
      `Keluar: ${formatRupiah(fromAmount)}\n\nNominal masuk ke akun tujuan?\n<i>(Enter atau ketik "=" jika sama, tanpa biaya admin)</i>`,
      { parse_mode: 'HTML', reply_markup: { force_reply: true } }
    );
    const toMsg = await conversation.wait();
    const toRaw = (toMsg.message?.text || '').trim();
    let toAmount: number;
    if (toRaw === '' || toRaw === '=' || toRaw === '-') {
      toAmount = fromAmount;
    } else {
      const parsed = parseAmount(toRaw);
      if (!parsed) return ctx.reply('Nominal tidak valid. Coba lagi dengan /transfer');
      if (parsed > fromAmount) return ctx.reply('Nominal tujuan tidak boleh lebih besar dari nominal sumber. Coba lagi dengan /transfer');
      toAmount = parsed;
    }

    // Step 3: pick source account
    const accounts = await db.getAccounts();
    const fromKeyboard = new InlineKeyboard();
    accounts.forEach((a, i) => {
      fromKeyboard.text(`${a.name}`, `from_${a.id}`);
      if (i % 3 === 2) fromKeyboard.row();
    });

    const adminLine = toAmount !== fromAmount
      ? ` (biaya: ${formatRupiah(fromAmount - toAmount)})`
      : '';
    await ctx.reply(
      `Keluar: ${formatRupiah(fromAmount)} → Masuk: ${formatRupiah(toAmount)}${adminLine}\n\nDari akun mana?`,
      { reply_markup: fromKeyboard }
    );
    const fromCallback = await conversation.waitForCallbackQuery(/^from_/);
    const fromAccountId = fromCallback.callbackQuery.data?.replace('from_', '');
    const fromAccount = accounts.find((a) => a.id === fromAccountId);
    await fromCallback.answerCallbackQuery();

    // Step 4: pick destination account (exclude source)
    const toKeyboard = new InlineKeyboard();
    accounts
      .filter((a) => a.id !== fromAccountId)
      .forEach((a, i) => {
        toKeyboard.text(`${a.name}`, `to_${a.id}`);
        if (i % 3 === 2) toKeyboard.row();
      });

    await ctx.reply(`Ke akun mana? (dari ${fromAccount?.name})`, { reply_markup: toKeyboard });
    const toCallback = await conversation.waitForCallbackQuery(/^to_/);
    const toAccountId = toCallback.callbackQuery.data?.replace('to_', '');
    const toAccount = accounts.find((a) => a.id === toAccountId);
    await toCallback.answerCallbackQuery();

    // Step 5: note
    await ctx.reply('Catatan (opsional, ketik "-" untuk skip):', { reply_markup: { force_reply: true } });
    const noteMsg = await conversation.wait();
    const note = noteMsg.message?.text || '';
    const description = note === '-' ? `Transfer ${fromAccount?.name} → ${toAccount?.name}` : note;

    const txnInput: Omit<Transaction, 'id'> = {
      type: 'transfer',
      amount: fromAmount,
      description,
      account_id: fromAccountId,
      to_account_id: toAccountId,
      source: 'manual_telegram',
      transaction_date: new Date().toISOString(),
    };
    if (toAmount !== fromAmount) {
      txnInput.to_amount = toAmount;
    }

    const txn = await insertTransactionWithBalanceSnapshots(txnInput);

    // Sheets sync (fire-and-forget)
    sheets.syncTransaction({ ...txn, account_name: fromAccount?.name }).catch(() => {});

    await ctx.reply(
      formatTransactionMessage({
        type: 'transfer',
        amount: fromAmount,
        to_amount: toAmount !== fromAmount ? toAmount : undefined,
        description,
        account_name: `${fromAccount?.name} → ${toAccount?.name}`,
        transaction_date: txn.transaction_date || new Date().toISOString(),
        source: 'manual_telegram',
      }),
      { parse_mode: 'HTML', reply_markup: mainMenu }
    );
  }
```

- [ ] **Step 2: Update help message for `/transfer`**

Find `HELP_MESSAGES.transfer` and update:

```typescript
  transfer:
    `<b>Bantuan /transfer</b>\n\n` +
    `<code>/transfer</code>\n\n` +
    `Flow interaktif:\n` +
    `1. Nominal keluar (dari akun sumber, termasuk biaya admin)\n` +
    `2. Nominal masuk (ke akun tujuan — Enter jika sama)\n` +
    `3. Pilih akun sumber\n` +
    `4. Pilih akun tujuan\n` +
    `5. Catatan (opsional)\n\n` +
    `Contoh: transfer BCA ke GoPay dengan biaya admin Rp 500.`,
```

- [ ] **Step 3: Type-check**

```bash
cd /home/mrrizaldi/dev/finance-project/telegram-bot
pnpm exec tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add telegram-bot/src/bot.ts
git commit -m "feat(bot): transfer conversation accepts separate from/to amounts for admin fee support"
```

---

### Task 7: Deploy to server

**Files:** None (deployment only)

- [ ] **Step 1: Final type-check**

```bash
cd /home/mrrizaldi/dev/finance-project/telegram-bot
pnpm exec tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2: Sync to server via rsync**

```bash
rsync -avz --exclude='node_modules' --exclude='dist' \
  /home/mrrizaldi/dev/finance-project/telegram-bot/src/ \
  mrrizaldi@192.168.31.221:~/dev/finance-project/telegram-bot/src/
```

- [ ] **Step 3: Restart bot on server via SSH MCP**

```bash
export PATH="/home/mrrizaldi/.nvm/versions/node/v22.20.0/bin:$PATH"
cd ~/dev/finance-project/telegram-bot
pm2 restart finance-bot
```

- [ ] **Step 4: Verify bot is online**

```bash
pm2 list
```

Expected: `finance-bot` status = `online`.

- [ ] **Step 5: Smoke test**

In Telegram, send `/transfer`. Verify:
1. Bot asks "Nominal keluar dari akun sumber?"
2. Enter `50500` → bot asks "Nominal masuk ke akun tujuan?"
3. Enter `50000` → bot shows `Keluar: Rp 50.500 → Masuk: Rp 50.000 (biaya: Rp 500)`
4. Pick accounts, add note → confirmation shows Keluar/Masuk/Biaya breakdown
5. Test again with Enter (=) for same amount → confirmation shows single amount line

- [ ] **Step 6: Final commit (if any cleanup needed)**

```bash
cd /home/mrrizaldi/dev/finance-project
git log --oneline -6
```
