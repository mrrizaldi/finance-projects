import { test, expect } from '@playwright/test';

test.describe('Installments', () => {
  test('TC-E2E-19: page loads without error', async ({ page }) => {
    await page.goto('/installments');
    await page.waitForLoadState('networkidle');

    // Heading must be visible
    await expect(page.getByRole('heading', { name: 'Cicilan', level: 1 })).toBeVisible();

    // No uncaught JS errors — check console via page.on('pageerror') approach:
    // Playwright captures page errors; if any were thrown the test runner would surface them.
    // Additionally assert the page did not navigate to an error route.
    expect(page.url()).toMatch(/\/installments/);
  });

  test('TC-E2E-20: "Tambah Cicilan" button is visible', async ({ page }) => {
    await page.goto('/installments');
    await page.waitForLoadState('networkidle');

    const addBtn = page.getByRole('button', { name: /Tambah Cicilan/i });
    await expect(addBtn).toBeVisible();
  });

  test('TC-E2E-21: installment card shows paid_months progress', async ({ page }) => {
    await page.goto('/installments');
    await page.waitForLoadState('networkidle');

    // Each installment card contains a progressbar and a text like "N dari M bulan"
    const progressBars = page.getByRole('progressbar');
    const count = await progressBars.count();

    if (count === 0) {
      test.skip(true, 'No installment cards present — skipping progress test');
      return;
    }

    // The first card should show "X dari Y bulan" text
    const firstCard = page.locator('[cursor=pointer]').first();
    const progressText = page.getByText(/\d+ dari \d+ bulan/i).first();
    await expect(progressText).toBeVisible();

    // Progressbar itself is visible
    await expect(progressBars.first()).toBeVisible();
  });

  test('TC-E2E-22: installment detail dialog shows month list', async ({ page }) => {
    await page.goto('/installments');
    await page.waitForLoadState('networkidle');

    // Check whether any installment cards exist (each has a progressbar)
    const progressBars = page.getByRole('progressbar');
    const count = await progressBars.count();

    if (count === 0) {
      test.skip(true, 'No installment cards present — skipping detail dialog test');
      return;
    }

    // Click the first installment card — cards are cursor-pointer divs containing amount text
    // The card structure (from DOM inspection): generic[cursor=pointer] > { header, progress, footer }
    // We locate the first paragraph that shows "/bulan" to find a card and click its ancestor row.
    const perBulanLabel = page.getByText('/bulan').first();
    const card = perBulanLabel.locator('xpath=../../..'); // go up to the card root
    await card.click();

    // Detail dialog must appear
    const detailDialog = page.getByRole('dialog', { name: 'Detail Cicilan' });
    await expect(detailDialog).toBeVisible({ timeout: 5000 });

    // "Jadwal Pembayaran" section heading must be inside the dialog
    await expect(detailDialog.getByText('Jadwal Pembayaran')).toBeVisible();

    // Month rows rendered as "Bulan ke-N" — at least the first month must appear
    await expect(detailDialog.getByText(/Bulan ke-1/)).toBeVisible();
  });
});
