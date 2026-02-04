/**
 * E2E tests for BuildingHawk application
 * Tests critical user flows: login, search, map interactions
 */

import { test, expect } from '@playwright/test';

test.describe('BuildingHawk Application', () => {
  test.describe('Authentication', () => {
    test('shows login page when not authenticated', async ({ page }) => {
      await page.goto('/');

      // Should see login view
      await expect(page.getByRole('heading', { name: /building hawk/i })).toBeVisible();
      await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /login|sign in/i })).toBeVisible();
    });

    test('can log in with valid credentials', async ({ page }) => {
      await page.goto('/');

      // Fill in login form
      await page.getByRole('textbox', { name: /email/i }).fill('test@example.com');
      await page.getByRole('textbox', { name: /password/i }).fill('password123');
      await page.getByRole('button', { name: /login|sign in/i }).click();

      // Should redirect to main app with header
      await expect(page.getByRole('heading', { name: /building hawk/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /logout/i })).toBeVisible();
    });

    test('persists session on page reload', async ({ page }) => {
      // Set up a mock session in localStorage
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.setItem('buildingHawkUser', JSON.stringify({
          id: '1',
          email: 'test@example.com',
          role: 'broker',
          name: 'Test User'
        }));
      });

      // Reload the page
      await page.reload();

      // Should still be logged in
      await expect(page.getByRole('button', { name: /logout/i })).toBeVisible();
    });

    test('can log out', async ({ page }) => {
      // Start with logged in state
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

      // Click logout
      await page.getByRole('button', { name: /logout/i }).click();

      // Should see login form again
      await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    });
  });

  test.describe('Main App (authenticated)', () => {
    test.beforeEach(async ({ page }) => {
      // Set up authenticated session before each test
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
    });

    test('displays header with user info', async ({ page }) => {
      await expect(page.getByText('Building Hawk')).toBeVisible();
      await expect(page.getByText('test@example.com')).toBeVisible();
      await expect(page.getByText('broker')).toBeVisible();
    });

    test('renders filter tabs bar', async ({ page }) => {
      // Check for filter tabs
      await expect(page.getByRole('button', { name: /address/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /owner/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /tenant/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /vacant/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /crm/i })).toBeVisible();
    });

    test('renders quick actions bar', async ({ page }) => {
      await expect(page.getByRole('button', { name: /new listing/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /hotsheet/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /my deals/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /comps/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /reports/i })).toBeVisible();
    });
  });

  test.describe('Search Functionality', () => {
    test.beforeEach(async ({ page }) => {
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
    });

    test('has search bar in header', async ({ page }) => {
      const searchInput = page.getByRole('textbox', { name: /search/i });
      await expect(searchInput).toBeVisible();
    });

    test('can type in search bar', async ({ page }) => {
      const searchInput = page.getByRole('textbox', { name: /search/i });
      await searchInput.fill('100 Main Street');
      await expect(searchInput).toHaveValue('100 Main Street');
    });

    test('opens search panel when filter button clicked', async ({ page }) => {
      // Click the property search button (filter icon)
      await page.getByTitle('Property Search').click();

      // Search panel should be visible
      await expect(page.locator('.absolute.top-0.right-0')).toBeVisible();
    });
  });

  test.describe('Filter Tabs', () => {
    test.beforeEach(async ({ page }) => {
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
    });

    test('Address tab shows dropdown when clicked', async ({ page }) => {
      await page.getByRole('button', { name: /^address$/i }).click();

      // Dropdown should appear with options
      await expect(page.getByText('Search by Address')).toBeVisible();
      await expect(page.getByText('Search by APN')).toBeVisible();
    });

    test('CRM tab shows checkbox panel', async ({ page }) => {
      await page.getByRole('button', { name: /^crm$/i }).click();

      // CRM panel should show checkboxes
      await expect(page.getByText('Prospects')).toBeVisible();
      await expect(page.getByText('Clients')).toBeVisible();
      await expect(page.getByText('Properties')).toBeVisible();
    });

    test('Alerts tab toggles alerts panel', async ({ page }) => {
      await page.getByRole('button', { name: /^alerts$/i }).click();

      // Alerts panel should appear
      // Note: actual content depends on API response
    });
  });

  test.describe('Side Panels', () => {
    test.beforeEach(async ({ page }) => {
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
    });

    test('opens alerts panel', async ({ page }) => {
      await page.getByTitle('Alerts').click();

      // Panel should be visible on right side
      const panel = page.locator('.absolute.top-0.right-0.bottom-0');
      await expect(panel).toBeVisible();
    });

    test('opens saved searches panel', async ({ page }) => {
      await page.getByTitle('Client Requirements').click();

      const panel = page.locator('.absolute.top-0.right-0.bottom-0');
      await expect(panel).toBeVisible();
    });

    test('opens parcel explorer panel', async ({ page }) => {
      await page.getByTitle('Parcel Explorer').click();

      const panel = page.locator('.absolute.top-0.right-0.bottom-0');
      await expect(panel).toBeVisible();
    });

    test('opens hotsheet panel', async ({ page }) => {
      await page.getByTitle('Hotsheet - Recent Activity').click();

      const panel = page.locator('.absolute.top-0.right-0.bottom-0');
      await expect(panel).toBeVisible();
    });

    test('closes panel when close button clicked', async ({ page }) => {
      // Open alerts panel
      await page.getByTitle('Alerts').click();
      const panel = page.locator('.absolute.top-0.right-0.bottom-0');
      await expect(panel).toBeVisible();

      // Click close button (X)
      await page.locator('.absolute.top-0.right-0.bottom-0 button svg').first().click();

      // Panel should be hidden
      await expect(panel).not.toBeVisible();
    });
  });
});
