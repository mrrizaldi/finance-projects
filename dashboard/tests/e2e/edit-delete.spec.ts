import { test, expect } from '@playwright/test';

// Helper: navigate to /transactions, wait for load, and return count of transaction rows.
// Transaction rows are divs with cursor-pointer inside the list (rendered by TransactionRow).
async function gotoTransactions(page: Parameters<Parameters<typeof test>[1]>[0]) {
  await page.goto('/transactions');
  await page.waitForLoadState('networkidle');
}

// Rows are rendered as divs with a colored dot + description + amount.
// They live inside the list container. Use the Playwright-visible heading text to identify them.
// The most reliable selector: any div that contains an amount string ("Rp") and has cursor-pointer.
// Based on DOM inspection: each row is a generic div[cursor=pointer] wrapping two child divs
// (description+meta, amount+balance). We select the first clickable row in the list.
function firstTransactionRow(page: Parameters<Parameters<typeof test>[1]>[0]) {
  // All clickable rows inside the transaction list have role=generic with cursor-pointer.
  // The list container is the only section that has many such divs.
  // Using CSS: any div that directly contains a <p> with an amount ("Rp") is a row.
  return page.locator('p').filter({ hasText: /^[-+]?Rp/ }).first().locator('..').locator('..');
}

test.describe('Edit and Delete Transactions', () => {
  test('TC-E2E-12: edit dialog opens from detail dialog', async ({ page }) => {
    await gotoTransactions(page);

    // Count transaction rows; the page shows ~26, so there should be rows present.
    // Look for the paragraph elements that show amounts like "-Rp X" or "+Rp X".
    const amountParas = page.locator('p').filter({ hasText: /^[-+]?Rp/ });
    const count = await amountParas.count();

    if (count === 0) {
      // No transactions on this page — skip gracefully.
      test.skip();
      return;
    }

    // Click the closest ancestor row div. The row itself wraps both the description block
    // and the amount block. Two levels up from the amount <p>:
    //   <div cursor-pointer>          ← the row
    //     <div>description block</div>
    //     <div>                       ← amount block
    //       <p>-Rp X</p>             ← amountParas item
    //       <p>Saldo: …</p>
    //     </div>
    //   </div>
    const firstAmount = amountParas.first();
    const row = firstAmount.locator('xpath=../..'); // two levels up to the cursor-pointer row
    await row.click();

    // Detail dialog must appear
    const detailDialog = page.getByRole('dialog', { name: 'Detail Transaksi' });
    await expect(detailDialog).toBeVisible({ timeout: 5000 });

    // Click Edit button inside the detail dialog
    await detailDialog.getByRole('button', { name: 'Edit' }).click();

    // Edit dialog must appear and detail dialog should close
    const editDialog = page.getByRole('dialog', { name: 'Edit Transaksi' });
    await expect(editDialog).toBeVisible({ timeout: 5000 });
    await expect(detailDialog).not.toBeVisible();
  });

  test('TC-E2E-13: delete confirmation dialog shown', async ({ page }) => {
    await gotoTransactions(page);

    const amountParas = page.locator('p').filter({ hasText: /^[-+]?Rp/ });
    const count = await amountParas.count();

    if (count === 0) {
      test.skip();
      return;
    }

    // Click the first row to open detail dialog
    const row = amountParas.first().locator('xpath=../..'); // two levels up = cursor-pointer row
    await row.click();

    const detailDialog = page.getByRole('dialog', { name: 'Detail Transaksi' });
    await expect(detailDialog).toBeVisible({ timeout: 5000 });

    // Click Hapus (Delete) button inside the detail dialog
    await detailDialog.getByRole('button', { name: 'Hapus' }).click();

    // Delete confirmation dialog must appear
    const deleteDialog = page.getByRole('dialog', { name: 'Hapus Transaksi' });
    await expect(deleteDialog).toBeVisible({ timeout: 5000 });

    // Confirmation text and action buttons must be present
    await expect(deleteDialog.getByText('Yakin ingin menghapus transaksi ini?')).toBeVisible();
    await expect(deleteDialog.getByRole('button', { name: 'Batal' })).toBeVisible();
    await expect(deleteDialog.getByRole('button', { name: 'Hapus' })).toBeVisible();
  });

  test('TC-E2E-14: Saldo Sebelum and Saldo Sesudah shown in detail', async ({ page }) => {
    await gotoTransactions(page);

    const amountParas = page.locator('p').filter({ hasText: /^[-+]?Rp/ });
    const count = await amountParas.count();

    if (count === 0) {
      test.skip();
      return;
    }

    // Click the first row to open detail dialog
    const row = amountParas.first().locator('xpath=../..'); // two levels up = cursor-pointer row
    await row.click();

    const detailDialog = page.getByRole('dialog', { name: 'Detail Transaksi' });
    await expect(detailDialog).toBeVisible({ timeout: 5000 });

    // Both balance labels must appear in the detail dialog
    await expect(detailDialog.getByText('Saldo Sebelum')).toBeVisible();
    await expect(detailDialog.getByText('Saldo Sesudah')).toBeVisible();
  });
});
