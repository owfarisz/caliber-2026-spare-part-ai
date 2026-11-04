import { test, expect } from '@playwright/test';

test('overview shows measured case and model evidence', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /inventory decisions/i })).toBeVisible();
  await expect(page.getByText('7,481', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic case data', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'output/qa/overview-desktop.png', fullPage: true });
});

test('scenario changes on-hand stock and recomputes risk', async ({ page }) => {
  await page.goto('/#/scenario');
  await expect(page.getByRole('heading', { name: /scenario studio/i })).toBeVisible();
  const onHand = page.getByLabel(/on-hand stock/i);
  await onHand.fill('0');
  await expect(page.getByText(/reorder now/i).first()).toBeVisible();
  await expect(page.getByText(/lead-time stockout risk/i)).toBeVisible();
  await page.screenshot({ path: 'output/qa/scenario-desktop.png', fullPage: true });
});

test('methodology discloses test metrics and temporal split', async ({ page }) => {
  await page.goto('/#/method');
  await expect(page.getByRole('heading', { name: /model and evidence/i })).toBeVisible();
  await expect(page.getByText(/0\.250/).first()).toBeVisible();
  await expect(page.getByText('August – September 2026', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'output/qa/evidence-desktop.png', fullPage: true });
});

test('mobile overview remains navigable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /inventory decisions/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /scenario studio/i }).first()).toBeVisible();
  await page.screenshot({ path: 'output/qa/overview-mobile.png', fullPage: true });
});

test('mobile scenario exposes inputs and recommendation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/scenario');
  const onHand = page.getByLabel(/on-hand stock/i);
  await expect(onHand).toBeVisible();
  await onHand.fill('0');
  await expect(page.getByText(/reorder now/i).first()).toBeVisible();
  await page.screenshot({ path: 'output/qa/scenario-mobile.png', fullPage: true });
});
