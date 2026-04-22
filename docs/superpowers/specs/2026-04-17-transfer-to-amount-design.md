# Transfer with Admin Fee Support

**Date:** 2026-04-17
**Status:** Approved

## Problem

Transfer between accounts may incur admin fees, causing the amount deducted from the source to differ from the amount received at the destination. Currently the system uses a single `amount` for both sides.

## Decision

Absorb the difference silently into the transfer record — no separate admin fee expense transaction.

## Database Change

Add nullable column to `transactions`:

```sql
ALTER TABLE transactions ADD COLUMN to_amount NUMERIC;
```

- `to_amount` is only set when source and destination amounts differ.
- When `to_amount IS NULL`, behavior is identical to the current single-amount transfer.
- Backward compatible: all existing transfer records continue to work.

## TypeScript Type Change

Add `to_amount?: number` to `Transaction` interface in `types/index.ts`.

## Conversation Flow (recordTransferConvo)

```
1. "Nominal keluar dari akun sumber?"  → from_amount (parseAmount)
2. "Nominal masuk ke akun tujuan? (Enter/= untuk sama)"  → to_amount (defaults to from_amount if blank/=)
3. Pilih akun sumber (InlineKeyboard)
4. Pilih akun tujuan (InlineKeyboard, excludes source)
5. Catatan (opsional, "-" to skip)
```

Step 2 is skipped in display if `to_amount === from_amount` (no admin fee case — user just presses Enter).

## Balance Updates

| Account | Delta |
|---------|-------|
| Source  | `-from_amount` |
| Destination | `+to_amount` |

`to_amount` defaults to `from_amount` when not set.

## insertTransactionWithBalanceSnapshots

- Pass `to_amount` separately from `amount`.
- Source balance: `-input.amount` (from_amount).
- Dest balance: `+(input.to_amount ?? input.amount)`.
- Undo rollback: source `+input.amount`, dest `-(input.to_amount ?? input.amount)`.

## Confirmation Message

When `to_amount !== from_amount`:
```
💸 Transfer BCA → GoPay
Keluar : Rp 50.500
Masuk  : Rp 50.000
Biaya  : Rp 500
```

When equal (no admin fee):
```
💸 Transfer BCA → GoPay
Nominal: Rp 50.000
```

## Undo / Delete Behavior

All undo paths (`/undo`, inline delete button) must use `to_amount ?? amount` when reversing destination balance, instead of `amount`.

Affected locations in `bot.ts`:
- `/undo` handler (~line 1391)
- Inline delete callback (~line 2165)

## Out of Scope

- Reporting admin fees as a separate expense category.
- `to_amount` in email-parsed transfers (all email transfers remain single-amount).
- Dashboard changes (transfer already shown as type=transfer, no display change needed).
