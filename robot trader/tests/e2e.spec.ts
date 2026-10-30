import { test, expect } from '@playwright/test';

test('critical user journey works without hidden overflow', async ({ page }) => {
  await page.goto('/');

  const brand = page.getByRole('banner').getByText('Intelligences Trader').filter({ visible: true });
  await expect(brand).toBeVisible();
  await expect(page.getByRole('region', { name: 'AI Market Intelligence Signal' })).toBeVisible({ timeout: 20_000 });

  const hasHorizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);

  await page.keyboard.press('Control+K');
  const search = page.getByRole('textbox', { name: 'Search navigation' });
  await expect(search).toBeVisible();
  await search.fill('backtest');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Walk-Forward Backtesting & Scenario Lab' })).toBeVisible();

  await page.keyboard.press('Control+K');
  await search.fill('api configuration');
  await page.keyboard.press('Enter');
  await expect(page.getByText('API Proxy & Integration')).toBeVisible();
  await page.getByRole('button', { name: 'Save & Test Connection' }).click();
  await expect(page.getByRole('button', { name: /Connection Verified/ })).toBeVisible();
});

test('mobile navigation and dialogs remain usable', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'mobile-only interaction');
  await page.goto('/');

  await page.getByRole('button', { name: 'Open navigation' }).click();
  const drawer = page.getByRole('dialog', { name: 'Navigation Drawer' });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: /Trade Execution/ }).click();
  await expect(page.getByText('Execution Risk Controls')).toBeVisible();

  await page.getByRole('button', { name: 'Notifications' }).click();
  await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible();
  await page.getByRole('button', { name: 'Close notifications' }).click();
  await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeHidden();

  const touchTargetsAreUsable = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')].filter(button => {
      const style = getComputedStyle(button);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    return buttons.every(button => {
      const rect = button.getBoundingClientRect();
      return rect.width >= 32 && rect.height >= 32;
    });
  });
  expect(touchTargetsAreUsable).toBe(true);
});
