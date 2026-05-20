import { Page } from '@playwright/test';

// Navigate to the add page and wait for it to load
export async function gotoAddPage(page: Page) {
  await page.goto('/add');
  await page.waitForLoadState('networkidle');
}

// Get balance from the balances page for a given account name
export async function getAccountBalance(page: Page, accountName: string): Promise<number> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Try to find balance text near account name
  try {
    const balanceEl = page.locator(`text=${accountName}`).locator('..').locator('[data-balance], [class*="balance"]').first();
    const balanceText = await balanceEl.textContent({ timeout: 3000 });
    if (!balanceText) return 0;
    return parseInt(balanceText.replace(/[^0-9]/g, ''), 10);
  } catch {
    return 0;
  }
}

// Fill and submit the expense/income form
export async function addTransaction(page: Page, opts: {
  type?: 'expense' | 'income';
  amount: string;
  accountName?: string;
}) {
  await gotoAddPage(page);

  if (opts.type === 'income') {
    await page.getByRole('button', { name: 'Pemasukan' }).click();
  }

  const amountInput = page.getByPlaceholder('0');
  await amountInput.fill(opts.amount);
  await amountInput.blur(); // trigger amount parse

  if (opts.accountName) {
    await page.locator('select').last().selectOption({ label: opts.accountName });
  }

  await page.getByRole('button', { name: /Simpan Transaksi/ }).click();
  await page.waitForSelector('text=Tersimpan!', { timeout: 10000 });
}
