// tests/e2e/dashboard.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Dashboard Generation Flow', () => {
  test('should allow a user to submit a URL and see real-time progress', async ({ page }) => {
    // 1. Navigate to the dashboard (assuming logged in state is restored via setup)
    await page.goto('/dashboard');
    
    // 2. Locate the main URL input
    const urlInput = page.getByPlaceholder('https://www.youtube.com/watch?v=...');
    await expect(urlInput).toBeVisible();
    
    // 3. Submit a video
    await urlInput.fill('https://youtube.com/watch?v=test_viral_video');
    await page.getByRole('button', { name: 'Generate' }).click();
    
    // 4. Verify Optimistic UI transition
    await expect(urlInput).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Generate' })).toBeDisabled();
    
    // 5. Verify Real-Time SSE updates appear in the DOM
    // The "Processing Video" card should appear
    await expect(page.getByText('Processing Video')).toBeVisible();
    
    // We expect the "DOWNLOAD" stage to eventually light up as active
    const downloadStage = page.getByText('Download', { exact: true });
    await expect(downloadStage).toBeVisible();
    
    // Check for the "Processing..." state badge
    await expect(page.getByText('Processing...').first()).toBeVisible({ timeout: 10000 });
  });

  test('should gracefully handle Error Boundaries if the API crashes', async ({ page }) => {
    // Mock a 500 API failure
    await page.route('/api/v1/jobs', async (route) => {
      await route.fulfill({ status: 500, body: 'Internal Server Error' });
    });

    await page.goto('/dashboard');
    await page.getByPlaceholder('https://www.youtube.com/watch?v=...').fill('https://youtube.com/watch?v=fail');
    await page.getByRole('button', { name: 'Generate' }).click();
    
    // The UI should catch the error and display the "Failed" badge, not crash the page.
    await expect(page.getByText('FAILED')).toBeVisible();
  });
});
