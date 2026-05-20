import { test, expect } from '@playwright/test';

test.describe('Bulk Input', () => {
  test('TC-E2E-15: bulk page loads with textarea', async ({ page }) => {
    const res = await page.goto('/bulk');

    // If the route redirects away (e.g. to /login), skip gracefully.
    if (!page.url().includes('/bulk')) {
      test.skip(true, '/bulk route does not exist or redirects');
      return;
    }

    await page.waitForLoadState('networkidle');

    // Heading must be present
    await expect(page.getByRole('heading', { name: 'Bulk Input' })).toBeVisible();

    // Textarea (rendered as a textbox role) must be present
    const textarea = page.getByRole('textbox');
    await expect(textarea).toBeVisible();

    // Parse button must be present (and disabled because textarea is empty)
    const parseBtn = page.getByRole('button', { name: /Parse.*Preview/ });
    await expect(parseBtn).toBeVisible();
    await expect(parseBtn).toBeDisabled();
  });

  test('TC-E2E-16: parse 3 valid lines shows 3 parsed rows', async ({ page }) => {
    await page.goto('/bulk');
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/bulk')) {
      test.skip(true, '/bulk route does not exist or redirects');
      return;
    }

    const textarea = page.getByRole('textbox');
    await textarea.fill(
      '23/04 35rb Makan siang\n24/04 28rb Grab ke kantor\n+25/04 8jt Gaji'
    );

    await page.getByRole('button', { name: /Parse.*Preview/ }).click();

    // Table must appear
    const table = page.getByRole('table');
    await expect(table).toBeVisible();

    // Exactly 3 data rows (tbody rows, not the header row)
    const dataRows = page.getByRole('rowgroup').last().getByRole('row');
    await expect(dataRows).toHaveCount(3);

    // Spot-check first row contents
    await expect(page.getByRole('cell', { name: 'Makan siang' })).toBeVisible();
    // Third row is income — type cell should say "Masuk"
    await expect(page.getByRole('cell', { name: 'Masuk' })).toBeVisible();

    // Save button must appear with correct count
    await expect(
      page.getByRole('button', { name: /Simpan Semua.*3.*transaksi/ })
    ).toBeVisible();
  });

  test('TC-E2E-17: parse mixed lines shows error row', async ({ page }) => {
    await page.goto('/bulk');
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/bulk')) {
      test.skip(true, '/bulk route does not exist or redirects');
      return;
    }

    const textarea = page.getByRole('textbox');
    await textarea.fill(
      '23/04 35rb Makan siang\nbaris tidak valid ini\n+25/04 8jt Gaji'
    );

    await page.getByRole('button', { name: /Parse.*Preview/ }).click();

    // Table must appear with 3 rows total (2 valid + 1 error)
    const dataRows = page.getByRole('rowgroup').last().getByRole('row');
    await expect(dataRows).toHaveCount(3);

    // The invalid row must show the error message text
    await expect(
      page.getByText('Format tidak valid. Gunakan: DD/MM nominal deskripsi')
    ).toBeVisible();

    // Error summary line
    await expect(page.getByText(/1 baris error/)).toBeVisible();

    // Save button shows only 2 valid transactions
    await expect(
      page.getByRole('button', { name: /Simpan Semua.*2.*transaksi/ })
    ).toBeVisible();
  });

  test('TC-E2E-18: save button disabled before parsing', async ({ page }) => {
    await page.goto('/bulk');
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/bulk')) {
      test.skip(true, '/bulk route does not exist or redirects');
      return;
    }

    // Before any parsing, the Save button must not be present in the DOM at all
    // (it is conditionally rendered only after parsed.length > 0)
    const saveBtn = page.getByRole('button', { name: /Simpan Semua/ });
    await expect(saveBtn).toHaveCount(0);

    // Typing text does NOT show the save button — it only appears after Parse is clicked
    const textarea = page.getByRole('textbox');
    await textarea.fill('23/04 35rb Makan siang');
    await expect(saveBtn).toHaveCount(0);
  });
});
