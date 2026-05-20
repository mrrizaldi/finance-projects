import { test, expect } from '@playwright/test';

test.describe('Transfer Form', () => {
  async function gotoTransfer(page: Parameters<Parameters<typeof test>[1]>[0]) {
    await page.goto('/add');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Transfer', exact: true }).click();
    // Wait for the Transfer form to render
    await expect(page.getByRole('button', { name: /Simpan Transfer/ })).toBeVisible();
  }

  test('TC-E2E-07: Transfer tab shows source and destination account fields', async ({ page }) => {
    await gotoTransfer(page);

    // "Dari Akun" label and its select must be visible
    await expect(page.getByText('Dari Akun')).toBeVisible();
    // "Ke Akun" label and its select must be visible
    await expect(page.getByText('Ke Akun')).toBeVisible();

    // Both comboboxes must be present
    const selects = page.locator('select');
    await expect(selects).toHaveCount(2);
  });

  test('TC-E2E-08: Simpan Transfer disabled with no amount', async ({ page }) => {
    await gotoTransfer(page);

    // Submit button should be disabled when amount is empty (0)
    await expect(page.getByRole('button', { name: /Simpan Transfer/ })).toBeDisabled();
  });

  test('TC-E2E-09: Account swap regression — changing Dari Akun to same as Ke Akun triggers swap, button stays enabled', async ({ page }) => {
    await gotoTransfer(page);

    // Fill in an amount so the button can become enabled
    const amountInput = page.getByPlaceholder('0').first();
    await amountInput.fill('100000');
    await amountInput.blur();

    // Read the initial values of both selects
    const fromSelect = page.locator('select').first();
    const toSelect = page.locator('select').last();

    const initialFrom = await fromSelect.inputValue(); // e.g. BCA id
    const initialTo = await toSelect.inputValue();     // e.g. BSI id

    // Change "Dari Akun" to the same value as "Ke Akun" — should trigger a swap
    await fromSelect.selectOption(initialTo);

    // After the swap, "Ke Akun" should now hold the old "Dari Akun" value
    await expect(toSelect).toHaveValue(initialFrom);

    // The accounts are now different (swapped), so the submit button must NOT be disabled
    await expect(page.getByRole('button', { name: /Simpan Transfer/ })).not.toBeDisabled();
  });

  test('TC-E2E-10: Button enabled when amount filled and accounts differ', async ({ page }) => {
    await gotoTransfer(page);

    // Initially disabled
    await expect(page.getByRole('button', { name: /Simpan Transfer/ })).toBeDisabled();

    // Fill in amount
    const amountInput = page.getByPlaceholder('0').first();
    await amountInput.fill('50000');
    await amountInput.blur();

    // Accounts already differ by default (BCA vs BSI), so button should now be enabled
    await expect(page.getByRole('button', { name: /Simpan Transfer/ })).not.toBeDisabled();
  });

  test('TC-E2E-11: Successful transfer saves and shows "Tersimpan!"', async ({ page }) => {
    await gotoTransfer(page);

    // Fill in the amount
    const amountInput = page.getByPlaceholder('0').first();
    await amountInput.fill('75000');
    await amountInput.blur();

    // Click the submit button
    await page.getByRole('button', { name: /Simpan Transfer/ }).click();

    // Should show the success message
    await expect(page.getByText('Tersimpan!')).toBeVisible({ timeout: 10000 });
  });
});
