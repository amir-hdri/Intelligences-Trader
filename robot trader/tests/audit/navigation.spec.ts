import { test, expect } from '@playwright/test';

test('every navigation item renders its own terminal destination', async ({ page }) => {
  await page.goto('/');

  await page.keyboard.press('Control+K');
  const search = page.getByRole('textbox', { name: 'Search navigation' });
  await expect(search).toBeVisible();
  const palette = page.getByRole('dialog', { name: 'Command palette' });

  const labels = await palette.getByRole('button').evaluateAll(buttons =>
    buttons
      .map(button => (button.getAttribute('aria-label') || button.textContent || '').replace(/↵/g, '').trim())
      .filter(text => text.length > 0 && text !== 'ESC'),
  );
  expect(labels.length).toBeGreaterThan(0);
  await search.press('Escape');

  for (const label of labels) {
    await page.keyboard.press('Control+K');
    await page.getByRole('textbox', { name: 'Search navigation' }).fill(label);
    await page.keyboard.press('Enter');

    const content = page.getByRole('region', { name: 'Terminal content' });
    await expect(content).toBeVisible();
    const destination = content.getByRole('region', { name: label });
    await expect(destination).toBeVisible();
    expect((await destination.innerText()).trim().length).toBeGreaterThan(0);
  }
});
