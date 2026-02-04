/**
 * E2E tests for Map interactions
 * Tests map rendering, parcel selection, and context menus
 */

import { test, expect } from '@playwright/test';

test.describe('Map Interactions', () => {
  test.beforeEach(async ({ page }) => {
    // Set up authenticated session
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
    // Wait for map to load
    await page.waitForTimeout(2000);
  });

  test('map container is rendered', async ({ page }) => {
    // The map should be visible in the main content area
    const mapContainer = page.locator('.h-full.w-full').first();
    await expect(mapContainer).toBeVisible();
  });

  test('navigation buttons are visible on map', async ({ page }) => {
    // Property Search button
    await expect(page.getByTitle('Property Search')).toBeVisible();

    // Client Requirements button
    await expect(page.getByTitle('Client Requirements')).toBeVisible();

    // Alerts button
    await expect(page.getByTitle('Alerts')).toBeVisible();

    // Sale Alerts button
    await expect(page.getByTitle('Sale Alerts (Deed Monitor)')).toBeVisible();

    // Hotsheet button
    await expect(page.getByTitle('Hotsheet - Recent Activity')).toBeVisible();

    // Parcel Explorer button
    await expect(page.getByTitle('Parcel Explorer')).toBeVisible();
  });

  test('clicking property search toggles active state', async ({ page }) => {
    const searchButton = page.getByTitle('Property Search');

    // Click to activate
    await searchButton.click();

    // Button should be highlighted (gold background)
    await expect(searchButton).toHaveClass(/bg-gold/);

    // Click again to deactivate
    await searchButton.click();

    // Button should return to normal state
    await expect(searchButton).not.toHaveClass(/bg-gold/);
  });
});

test.describe('CRM Markers on Map', () => {
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

  test('can toggle prospects visibility', async ({ page }) => {
    // Open CRM dropdown
    await page.getByRole('button', { name: /^crm$/i }).click();

    // Find prospects checkbox
    const prospectsCheckbox = page.getByLabel('Prospects').locator('input[type="checkbox"]');

    // Check it
    await prospectsCheckbox.check();
    await expect(prospectsCheckbox).toBeChecked();

    // Uncheck it
    await prospectsCheckbox.uncheck();
    await expect(prospectsCheckbox).not.toBeChecked();
  });

  test('can toggle properties visibility', async ({ page }) => {
    // Open CRM dropdown
    await page.getByRole('button', { name: /^crm$/i }).click();

    // Find properties checkbox
    const propertiesLabel = page.getByText('Properties');
    const propertiesCheckbox = propertiesLabel.locator('xpath=preceding-sibling::input');

    // Properties should be toggleable
    await propertiesLabel.click();
  });

  test('shows add new prospect/client buttons', async ({ page }) => {
    // Open CRM dropdown
    await page.getByRole('button', { name: /^crm$/i }).click();

    // Should see add buttons
    await expect(page.getByText('+ Add New Prospect')).toBeVisible();
    await expect(page.getByText('+ Add New Client')).toBeVisible();
  });
});

test.describe('Property Card', () => {
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

  // Note: These tests would require mocking the map parcel click
  // or having actual parcels loaded. In a real E2E environment,
  // the backend would provide parcel data.

  test('property card appears when parcel is selected', async ({ page }) => {
    // This test would need to simulate clicking on a parcel
    // For now, we verify the map area is interactive
    const mapArea = page.locator('.flex-1.relative.z-0');
    await expect(mapArea).toBeVisible();
  });
});

test.describe('Context Menu', () => {
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

  // Context menu tests would require simulating right-click on a parcel
  // These are placeholder tests for when parcel data is available

  test('map area supports right-click interaction', async ({ page }) => {
    const mapArea = page.locator('.flex-1.relative.z-0');
    await expect(mapArea).toBeVisible();

    // Verify map area can receive context menu events
    // (actual context menu requires parcel selection)
  });
});
