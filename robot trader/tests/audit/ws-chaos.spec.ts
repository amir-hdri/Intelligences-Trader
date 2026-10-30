import { test, expect, type WebSocketRoute } from '@playwright/test';

test.describe('WebSocket resilience', () => {
  test('disconnects cleanly, reconnects, and does not duplicate paper outcomes', async ({ page }) => {
    const marketSockets: WebSocketRoute[] = [];
    await page.routeWebSocket('**/ws**', async socket => {
      marketSockets.push(socket);
      await socket.connectToServer();
    });

    await page.goto('/');
    const connectedBadge = page.getByLabel('Connection status: CONNECTED').filter({ visible: true });
    await expect(connectedBadge).toBeVisible({ timeout: 20_000 });

    const logsBefore = await page.evaluate(() => {
      const raw = localStorage.getItem('tradeLogs');
      return raw ? JSON.parse(raw).length : 0;
    });

    await marketSockets[marketSockets.length - 1].close({ code: 1011, reason: 'chaos' });
    const lostBadge = page.getByLabel(/Connection status: (DISCONNECTED|RECONNECTING)/).filter({ visible: true });
    await expect(lostBadge).toBeVisible({ timeout: 10_000 });

    await expect(connectedBadge).toBeVisible({ timeout: 35_000 });

    const logsAfter = await page.evaluate(() => {
      const raw = localStorage.getItem('tradeLogs');
      return raw ? JSON.parse(raw).length : 0;
    });
    expect(logsAfter).toBe(logsBefore);
  });
});
