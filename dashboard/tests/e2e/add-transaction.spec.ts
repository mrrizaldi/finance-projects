import { test, expect } from '@playwright/test';

test.describe('Add Transaction', () => {
  test('TC-E2E-01: add expense form submits', async ({ page }) => {
    await page.goto('/add');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('0').fill('50000');
    await page.getByPlaceholder('0').blur();
    await page.getByRole('button', { name: /Simpan Transaksi/ }).click();
    await expect(page.getByText('Tersimpan!')).toBeVisible({ timeout: 10000 });
  });

  test('TC-E2E-02: add income type', async ({ page }) => {
    await page.goto('/add');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Pemasukan', exact: true }).click();
    await page.getByPlaceholder('0').fill('100000');
    await page.getByPlaceholder('0').blur();
    await page.getByRole('button', { name: /Simpan Transaksi/ }).click();
    await expect(page.getByText('Tersimpan!')).toBeVisible({ timeout: 10000 });
  });

  test('TC-E2E-03: submit disabled when amount zero', async ({ page }) => {
    await page.goto('/add');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /Simpan Transaksi/ })).toBeDisabled();
  });

  test('TC-E2E-04: rb shorthand parsed', async ({ page }) => {
    await page.goto('/add');
    await page.waitForLoadState('networkidle');
    const input = page.getByPlaceholder('0');
    await input.fill('50rb');
    await input.blur();
    await expect(input).toHaveValue('50.000');
  });

  test('TC-E2E-05: jt shorthand parsed', async ({ page }) => {
    await page.goto('/add');
    await page.waitForLoadState('networkidle');
    const input = page.getByPlaceholder('0');
    await input.fill('1.5jt');
    await input.blur();
    await expect(input).toHaveValue('1.500.000');
  });

  test('TC-E2E-06: balance fields shown in transaction detail', async ({ page }) => {
    await page.goto('/add');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('0').fill('25000');
    await page.getByPlaceholder('0').blur();
    await page.getByRole('button', { name: /Simpan Transaksi/ }).click();
    await page.waitForSelector('text=Tersimpan!', { timeout: 10000 });

    await page.goto('/transactions');
    await page.waitForLoadState('networkidle');
    const firstRow = page.locator('[data-testid="transaction-row"]').first();
    if (await firstRow.count() > 0) {
      await firstRow.click();
      await expect(page.getByText('Saldo Sebelum')).toBeVisible();
      await expect(page.getByText('Saldo Sesudah')).toBeVisible();
    }
  });
});
