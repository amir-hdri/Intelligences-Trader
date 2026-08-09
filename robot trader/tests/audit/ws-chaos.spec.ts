import { test, expect } from '@playwright/test';

test.describe('WebSocket resilience', () => {
  test('disconnects cleanly, reconnects, and does not duplicate paper outcomes', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.getByText(/STREAM|CONNECTED/).first()).toBeVisible({ timeout: 20_000 });

    const logsBefore = await page.evaluate(() => {
      const raw = localStorage.getItem('tradeLogs');
      return raw ? JSON.parse(raw).length : 0;
    });

    await context.setOffline(true);
    await expect(page.getByText(/DISCONNECTED|RECONNECTING/).first()).toBeVisible({ timeout: 10_000 });

    await context.setOffline(false);
    await expect(page.getByText(/STREAM|CONNECTED/).first()).toBeVisible({ timeout: 35_000 });

    const logsAfter = await page.evaluate(() => {
      const raw = localStorage.getItem('tradeLogs');
      return raw ? JSON.parse(raw).length : 0;
    });
    expect(logsAfter).toBe(logsBefore);
  });
});
