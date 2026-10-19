/**
 * 给 docs/design/preview.html 截两张图，并输出几何自检结果。
 * 用法：node scripts/shot-preview.mjs
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

for (const [name, width, height, full] of [
  ['preview-375', 375, 667, true],
  ['preview-1280', 1280, 900, true],
]) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  const report = await page.evaluate(() => {
    const de = document.documentElement;
    const overflow = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > de.clientWidth + 1;
      })
      .slice(0, 8)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className || '(no class)'}`);
    return {
      scrollWidth: de.scrollWidth,
      clientWidth: de.clientWidth,
      overflow,
    };
  });

  console.log(name, JSON.stringify(report));
  await page.screenshot({ path: `shots/${name}.png`, fullPage: full });
  await page.close();
}

await browser.close();
