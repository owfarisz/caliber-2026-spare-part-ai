import { test, expect } from '@playwright/test';

test('overview shows measured case and model evidence', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /five materials/i })).toBeVisible();
  await expect(page.getByLabel('Case snapshot').getByText('7,481', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic case data', { exact: true })).toBeVisible();
  await expect(page.getByText('Five representative case stories')).toBeVisible();
  await page.screenshot({ path: 'output/qa/overview-desktop.png', fullPage: true });
});

test('scenario changes on-hand stock and recomputes risk', async ({ page }) => {
  await page.goto('/#/scenario');
  await expect(page.getByRole('heading', { name: /predictive monitoring/i })).toBeVisible();
  const onHand = page.getByLabel(/on-hand stock/i);
  await onHand.fill('0');
  await expect(page.getByText(/reorder now/i).first()).toBeVisible();
  await expect(page.getByText(/lead-time stockout risk/i)).toBeVisible();
  await expect(page.getByText('AI decision brief')).toBeVisible();
  await expect(page.getByText(/Policy conflict:/)).toBeVisible();
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
  await expect(page.getByRole('heading', { name: /five materials/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /predictive monitoring/i }).first()).toBeVisible();
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

test('technician sends a model-backed PR draft to inventory', async ({ page }) => {
  await page.goto('/#/scenario');
  await expect(page.getByText('AI decision brief')).toBeVisible();
  const quantity = page.getByLabel('Material request quantity');
  await expect(quantity).not.toHaveValue('');
  await quantity.fill('2500');
  await page.getByRole('button', { name: /send pr draft to inventory/i }).click();
  await expect(page.getByRole('heading', { name: 'Inventory review' })).toBeVisible();
  await expect(page.getByText('Technician what-if simulation')).toBeVisible();
  await expect(page.getByText('2,500 KG', { exact: true })).toBeVisible();
  await expect(page.getByText('Demo vendor rating')).toBeVisible();
  await expect(page.getByText(/suggested unit-price negotiation band/i)).toBeVisible();
  await expect(page.getByText(/Policy review required:/)).toBeVisible();
  await page.getByRole('button', { name: /mark ready for procurement check/i }).click();
  await expect(page.locator('.draft-item small').getByText('Ready for procurement check')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'output/qa/inventory-desktop.png', fullPage: true });
});

test('five stories include cold-start assumptions and overstock hold', async ({ page }) => {
  await page.goto('/#/scenario');
  await page.getByRole('button', { name: /overstock review/i }).click();
  await expect(page.getByText('Review above existing maximum').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /send pr draft to inventory/i })).toBeDisabled();
  await page.getByRole('button', { name: /cold start/i }).click();
  await expect(page.getByText('User estimates')).toBeVisible();
  await expect(page.getByLabel(/estimated 30-day demand/i)).toHaveValue('2');
});

test('continuity exposes source anomalies and insight graph can pause', async ({ page }) => {
  await page.goto('/#/continuity');
  await expect(page.getByRole('heading', { name: 'Data continuity' })).toBeVisible();
  await expect(page.getByText('Flagged source records')).toBeVisible();
  await expect(page.getByText('Promised date before PR').first()).toBeVisible();
  await page.screenshot({ path: 'output/qa/continuity-desktop.png', fullPage: true });
  await page.goto('/#/graph');
  await expect(page.getByRole('heading', { name: 'How data becomes a decision' })).toBeVisible();
  await expect(page.getByText('STEP 2 / 5')).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: 'Pause flow' }).click();
  await expect(page.getByRole('button', { name: 'Play flow' })).toBeVisible();
  await page.screenshot({ path: 'output/qa/graph-desktop.png', fullPage: true });
});
