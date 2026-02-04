/**
 * E2E tests for Search user flows
 * Tests property search, saved searches, and search results
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

test.describe('Property Search Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test('opens search panel from toolbar button', async ({ page }) => {
    // Click property search button
    await page.getByTitle('Property Search').click();

    // Panel should open with search form
    await expect(page.getByText('Property Search')).toBeVisible();
  });

  test('search panel has required form fields', async ({ page }) => {
    await page.getByTitle('Property Search').click();

    // Check for SF range inputs
    await expect(page.getByPlaceholder(/min.*sf/i)).toBeVisible();
    await expect(page.getByPlaceholder(/max.*sf/i)).toBeVisible();

    // Check for listing type checkboxes
    await expect(page.getByText(/for sale/i)).toBeVisible();
    await expect(page.getByText(/for lease/i)).toBeVisible();
    await expect(page.getByText(/vacant/i)).toBeVisible();
  });

  test('can enter search criteria', async ({ page }) => {
    await page.getByTitle('Property Search').click();

    // Enter min SF
    const minSfInput = page.getByPlaceholder(/min.*sf/i);
    await minSfInput.fill('10000');
    await expect(minSfInput).toHaveValue('10000');

    // Enter max SF
    const maxSfInput = page.getByPlaceholder(/max.*sf/i);
    await maxSfInput.fill('50000');
    await expect(maxSfInput).toHaveValue('50000');
  });

  test('can toggle for sale/lease checkboxes', async ({ page }) => {
    await page.getByTitle('Property Search').click();

    // Find and click For Sale checkbox
    const forSaleCheckbox = page.locator('input[type="checkbox"]').first();
    await forSaleCheckbox.check();
    await expect(forSaleCheckbox).toBeChecked();

    // Uncheck it
    await forSaleCheckbox.uncheck();
    await expect(forSaleCheckbox).not.toBeChecked();
  });

  test('clear button resets form', async ({ page }) => {
    await page.getByTitle('Property Search').click();

    // Enter some criteria
    const minSfInput = page.getByPlaceholder(/min.*sf/i);
    await minSfInput.fill('10000');

    // Click clear
    await page.getByRole('button', { name: /clear/i }).click();

    // Field should be empty
    await expect(minSfInput).toHaveValue('');
  });

  test('close button closes panel', async ({ page }) => {
    await page.getByTitle('Property Search').click();
    const panel = page.locator('.absolute.top-0.right-0.bottom-0');
    await expect(panel).toBeVisible();

    // Click X button
    await panel.locator('button').filter({ has: page.locator('svg') }).first().click();

    // Panel should close
    await expect(panel).not.toBeVisible();
  });

  test('save button is available', async ({ page }) => {
    await page.getByTitle('Property Search').click();

    // Save button should be visible
    await expect(page.getByRole('button', { name: /save/i })).toBeVisible();
  });
});

test.describe('Saved Searches Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test('opens saved searches panel', async ({ page }) => {
    await page.getByTitle('Client Requirements').click();

    // Panel should open
    const panel = page.locator('.absolute.top-0.right-0.bottom-0');
    await expect(panel).toBeVisible();
  });

  test('saved searches panel has header', async ({ page }) => {
    await page.getByTitle('Client Requirements').click();

    // Should show title or empty state
    await expect(page.locator('.absolute.top-0.right-0.bottom-0')).toBeVisible();
  });
});

test.describe('Search Bar Autocomplete', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test('search bar accepts input', async ({ page }) => {
    const searchInput = page.getByRole('textbox', { name: /search/i });
    await searchInput.fill('Anaheim');
    await expect(searchInput).toHaveValue('Anaheim');
  });

  test('search bar can be cleared', async ({ page }) => {
    const searchInput = page.getByRole('textbox', { name: /search/i });
    await searchInput.fill('Test Address');

    // Clear by selecting all and deleting
    await searchInput.clear();
    await expect(searchInput).toHaveValue('');
  });

  test('search bar shows placeholder', async ({ page }) => {
    const searchInput = page.getByRole('textbox', { name: /search/i });
    await expect(searchInput).toHaveAttribute('placeholder');
  });
});

test.describe('Filter Dropdown Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test('owner tab shows dropdown options', async ({ page }) => {
    await page.getByRole('button', { name: /^owner$/i }).click();

    await expect(page.getByText('Search by Owner Name')).toBeVisible();
    await expect(page.getByText('Owner Portfolio')).toBeVisible();
    await expect(page.getByText('Recent Purchases')).toBeVisible();
  });

  test('tenant tab shows dropdown options', async ({ page }) => {
    await page.getByRole('button', { name: /^tenant$/i }).click();

    await expect(page.getByText('Search by Tenant')).toBeVisible();
    await expect(page.getByText('Tenant Industry')).toBeVisible();
  });

  test('lease expiration tab shows time options', async ({ page }) => {
    await page.getByRole('button', { name: /lease expiration/i }).click();

    await expect(page.getByText('Expiring 30 Days')).toBeVisible();
    await expect(page.getByText('Expiring 90 Days')).toBeVisible();
    await expect(page.getByText('Expiring 6 Months')).toBeVisible();
  });

  test('vacant tab shows options', async ({ page }) => {
    await page.getByRole('button', { name: /^vacant$/i }).click();

    await expect(page.getByText('All Vacant')).toBeVisible();
    await expect(page.getByText('Vacant For Sale')).toBeVisible();
    await expect(page.getByText('Vacant For Lease')).toBeVisible();
  });

  test('location tab shows options', async ({ page }) => {
    await page.getByRole('button', { name: /^location$/i }).click();

    await expect(page.getByText('By City')).toBeVisible();
    await expect(page.getByText('By Zip Code')).toBeVisible();
    await expect(page.getByText('Draw on Map')).toBeVisible();
  });

  test('specs tab shows options', async ({ page }) => {
    await page.getByRole('button', { name: /^specs$/i }).click();

    await expect(page.getByText('Building SF')).toBeVisible();
    await expect(page.getByText('Clear Height')).toBeVisible();
    await expect(page.getByText('Dock Doors')).toBeVisible();
  });

  test('clicking dropdown option closes dropdown', async ({ page }) => {
    await page.getByRole('button', { name: /^owner$/i }).click();
    await expect(page.getByText('Search by Owner Name')).toBeVisible();

    // Click an option
    await page.getByText('Search by Owner Name').click();

    // Dropdown should close
    await expect(page.getByText('Search by Owner Name')).not.toBeVisible();
  });
});
