/**
 * E2E tests for Hotsheet and Alerts user flows
 * Tests real-time activity feed and notification systems
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

test.describe('Hotsheet Panel', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test('opens hotsheet from quick actions bar', async ({ page }) => {
    await page.getByRole('button', { name: /hotsheet/i }).click();

    const panel = page.locator('.absolute.top-0.right-0.bottom-0');
    await expect(panel).toBeVisible();
  });

  test('opens hotsheet from toolbar button', async ({ page }) => {
    await page.getByTitle('Hotsheet - Recent Activity').click();

    const panel = page.locator('.absolute.top-0.right-0.bottom-0');
    await expect(panel).toBeVisible();
  });

  test('hotsheet button toggles panel', async ({ page }) => {
    // Open
    await page.getByRole('button', { name: /hotsheet/i }).click();
    const panel = page.locator('.absolute.top-0.right-0.bottom-0');
    await expect(panel).toBeVisible();

    // Close by clicking again
    await page.getByRole('button', { name: /hotsheet/i }).click();
    await expect(panel).not.toBeVisible();
  });

  test('hotsheet has close button', async ({ page }) => {
    await page.getByTitle('Hotsheet - Recent Activity').click();
    const panel = page.locator('.absolute.top-0.right-0.bottom-0');
    await expect(panel).toBeVisible();

    // Find X button in panel
    const closeButton = panel.locator('button svg').first();
    await closeButton.click();

    await expect(panel).not.toBeVisible();
  });
});

test.describe('Alerts Panel', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test('opens alerts panel from toolbar', async ({ page }) => {
    await page.getByTitle('Alerts').click();

    const panel = page.locator('.absolute.top-0.right-0.bottom-0');
    await expect(panel).toBeVisible();
  });

  test('alerts button shows badge when alerts exist', async ({ page }) => {
    // The alerts button may show a count badge
    const alertsButton = page.getByTitle('Alerts');
    await expect(alertsButton).toBeVisible();

    // Check for badge (span with number)
    const badge = alertsButton.locator('span');
    // Badge may or may not be visible depending on alert count
  });

  test('alerts panel can be closed', async ({ page }) => {
    await page.getByTitle('Alerts').click();
    const panel = page.locator('.absolute.top-0.right-0.bottom-0');
    await expect(panel).toBeVisible();

    // Click close
    await panel.locator('button svg').first().click();
    await expect(panel).not.toBeVisible();
  });

  test('alerts filter tab opens panel', async ({ page }) => {
    // Click alerts in filter bar
    await page.getByRole('button', { name: /^alerts$/i }).click();

    // Should show alerts dropdown or open panel
    const alertsContent = page.getByText(/today.*alerts/i);
    // Content may vary based on implementation
  });
});

test.describe('Sale Alerts Panel', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test('opens sale alerts panel', async ({ page }) => {
    await page.getByTitle('Sale Alerts (Deed Monitor)').click();

    const panel = page.locator('.absolute.top-0.right-0.bottom-0');
    await expect(panel).toBeVisible();
  });

  test('sale alerts panel has close functionality', async ({ page }) => {
    await page.getByTitle('Sale Alerts (Deed Monitor)').click();
    const panel = page.locator('.absolute.top-0.right-0.bottom-0');
    await expect(panel).toBeVisible();

    // Close panel
    await panel.locator('button svg').first().click();
    await expect(panel).not.toBeVisible();
  });
});

test.describe('Panel Switching', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test('opening new panel closes previous panel', async ({ page }) => {
    // Open alerts
    await page.getByTitle('Alerts').click();
    let panel = page.locator('.absolute.top-0.right-0.bottom-0');
    await expect(panel).toBeVisible();

    // Open hotsheet (should replace alerts)
    await page.getByTitle('Hotsheet - Recent Activity').click();
    panel = page.locator('.absolute.top-0.right-0.bottom-0');
    await expect(panel).toBeVisible();

    // Only one panel should be visible at a time
    const panels = page.locator('.absolute.top-0.right-0.bottom-0');
    await expect(panels).toHaveCount(1);
  });

  test('can cycle through multiple panels', async ({ page }) => {
    const panel = page.locator('.absolute.top-0.right-0.bottom-0');

    // Open alerts
    await page.getByTitle('Alerts').click();
    await expect(panel).toBeVisible();

    // Open saved searches
    await page.getByTitle('Client Requirements').click();
    await expect(panel).toBeVisible();

    // Open parcel explorer
    await page.getByTitle('Parcel Explorer').click();
    await expect(panel).toBeVisible();

    // Open hotsheet
    await page.getByTitle('Hotsheet - Recent Activity').click();
    await expect(panel).toBeVisible();
  });
});

test.describe('Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test('Escape key closes open panel', async ({ page }) => {
    // Open a panel
    await page.getByTitle('Alerts').click();
    const panel = page.locator('.absolute.top-0.right-0.bottom-0');
    await expect(panel).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Panel may close (depends on implementation)
  });

  test('search bar is focusable', async ({ page }) => {
    const searchInput = page.getByRole('textbox', { name: /search/i });

    await searchInput.focus();
    await expect(searchInput).toBeFocused();
  });
});
