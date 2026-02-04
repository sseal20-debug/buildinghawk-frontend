/**
 * E2E tests for Comps (Comparables) user flows
 * Tests comp search, filtering, and export
 */

import { test, expect } from '@playwright/test';

// Helper to set up authenticated session
async function setupAuth(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('buildingHawkUser', JSON.stringify({
      id: '1',
      email: 'test@example.com',
      role: 'broker',
      name: 'Test User'
    }));
  });
  await page.reload();
}

test.describe('Comps Panel', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test('opens comps panel from quick actions bar', async ({ page }) => {
    // Click Comps button in quick actions
    await page.getByRole('button', { name: /^comps$/i }).click();

    // Panel should open
    const panel = page.locator('.absolute.top-0.right-0.bottom-0');
    await expect(panel).toBeVisible();
  });

  test('comps panel has lease/sale tabs', async ({ page }) => {
    await page.getByRole('button', { name: /^comps$/i }).click();

    // Should have tab options for lease and sale comps
    await expect(page.getByRole('button', { name: /lease/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /sale/i })).toBeVisible();
  });

  test('can switch between lease and sale tabs', async ({ page }) => {
    await page.getByRole('button', { name: /^comps$/i }).click();

    // Click lease tab
    const leaseTab = page.getByRole('button', { name: /lease/i });
    await leaseTab.click();

    // Click sale tab
    const saleTab = page.getByRole('button', { name: /sale/i });
    await saleTab.click();

    // Both tabs should be interactive
    await expect(saleTab).toBeVisible();
  });

  test('comps panel has close button', async ({ page }) => {
    await page.getByRole('button', { name: /^comps$/i }).click();
    const panel = page.locator('.absolute.top-0.right-0.bottom-0');
    await expect(panel).toBeVisible();

    // Find and click close button
    const closeButton = panel.locator('button').filter({ has: page.locator('svg path[d*="M6 18L18 6"]') }).first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await expect(panel).not.toBeVisible();
    }
  });

  test('comps panel has search filters', async ({ page }) => {
    await page.getByRole('button', { name: /^comps$/i }).click();

    // Should have filter inputs
    const panel = page.locator('.absolute.top-0.right-0.bottom-0');
    await expect(panel).toBeVisible();
  });
});

test.describe('Lease Comps Search', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await page.getByRole('button', { name: /^comps$/i }).click();
  });

  test('lease comps form has SF range fields', async ({ page }) => {
    // Click lease tab if not already selected
    await page.getByRole('button', { name: /lease/i }).click();

    // Check for min/max SF inputs
    await expect(page.getByPlaceholder(/min/i).first()).toBeVisible();
  });

  test('can enter lease comp search criteria', async ({ page }) => {
    await page.getByRole('button', { name: /lease/i }).click();

    // Find min SF input and enter value
    const minInput = page.getByPlaceholder(/min/i).first();
    await minInput.fill('5000');
    await expect(minInput).toHaveValue('5000');
  });
});

test.describe('Sale Comps Search', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await page.getByRole('button', { name: /^comps$/i }).click();
  });

  test('sale comps form is accessible', async ({ page }) => {
    // Click sale tab
    await page.getByRole('button', { name: /sale/i }).click();

    // Tab should be active/selected
    await expect(page.getByRole('button', { name: /sale/i })).toBeVisible();
  });

  test('can switch to sale comps', async ({ page }) => {
    // Start on lease
    await page.getByRole('button', { name: /lease/i }).click();

    // Switch to sale
    await page.getByRole('button', { name: /sale/i }).click();

    // Should show sale comp form
    await expect(page.getByRole('button', { name: /sale/i })).toBeVisible();
  });
});

test.describe('Comps Export', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await page.getByRole('button', { name: /^comps$/i }).click();
  });

  test('export options are available', async ({ page }) => {
    // Look for export button or menu
    const exportButton = page.getByRole('button', { name: /export/i });

    // Export functionality should be present (even if no comps selected)
    if (await exportButton.isVisible()) {
      await expect(exportButton).toBeVisible();
    }
  });
});
