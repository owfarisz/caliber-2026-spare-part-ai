import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const url = process.argv[2] || 'https://caliber-spare-part-intelligence.vercel.app';
const output = 'output/qa';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  if (!response?.ok()) throw new Error(`Dashboard returned ${response?.status()}`);
  await page.getByRole('heading', { name: /inventory decisions/i }).waitFor();
  await page.getByText('7,481', { exact: true }).waitFor();
  await page.screenshot({ path: `${output}/live-overview-raw.png`, fullPage: true });
  await page.goto(`${url}/#/scenario`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.getByRole('heading', { name: /scenario studio/i }).waitFor();
  await page.getByText(/lead-time stockout risk/i).waitFor();
  await page.screenshot({ path: `${output}/live-scenario-raw.png`, fullPage: true });
  await fs.writeFile(`${output}/live-capture.json`, JSON.stringify({ url, captured_at_utc: new Date().toISOString(), page_title: await page.title(), dashboard_status: response.status() }, null, 2));
} finally {
  await browser.close();
}
