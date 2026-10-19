/**
 * 逐区块截 docs/design/preview.html（375 宽），便于人工核对。
 * 用法：node scripts/shot-preview-sections.mjs
 */
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const url = pathToFileURL(resolve('docs/design/preview.html')).href;

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--disable-gpu', '--hide-scrollbars'],
});
const page = await browser.newPage({
  viewport: { width: 375, height: 900 },
  deviceScaleFactor: 2,
});
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(500);

const sections = await page.$$('section.card');
console.log('sections', sections.length);
for (let i = 0; i < sections.length; i++) {
  await sections[i].screenshot({ path: `shots/t1-sec-${String(i + 1).padStart(2, '0')}.png` });
}

await browser.close();
