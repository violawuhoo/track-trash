/**
 * 本地视觉回归脚本：用本机 Chrome 打开 dev server，走一遍关键界面并截图。
 *
 * 用法：node scripts/shots.mjs [baseUrl]
 * 产物：shots/*.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173/';
const CHROME =
  process.env.CHROME_PATH ??
  'C:/Program Files/Google/Chrome/Application/chrome.exe';

mkdirSync('shots', { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--disable-gpu', '--hide-scrollbars'],
});

const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
});

const shot = async (name, fullPage = true) => {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `shots/${name}.png`, fullPage });
  console.log('saved', name);
};

await page.goto(BASE, { waitUntil: 'networkidle' });
await shot('01-start');

// 开始游戏
await page.getByRole('button', { name: /开始游戏|重新开始/ }).click();
await page.waitForTimeout(500);
await shot('02-game-initial');

// 连点对话条看完开场
for (let i = 0; i < 4; i++) {
  await page.locator('.dialogue').click();
  await page.waitForTimeout(200);
}
await shot('03-after-intro');

// 搜索三次并拾取
for (let round = 0; round < 3; round++) {
  await page.getByRole('button', { name: /搜索这个区域/ }).click();
  await page.waitForTimeout(300);
  for (let k = 0; k < 3; k++) {
    const items = page.locator('.scene .item');
    if ((await items.count()) === 0) break;
    await items.first().click();
    await page.waitForTimeout(180);
  }
}
await shot('04-after-search');

// 打开背包
await page.getByRole('button', { name: /背包/ }).click();
await page.waitForTimeout(300);
await shot('05-bag');

// 尝试合成：把背包前两件放进槽
const bagItems = page.locator('.bag-grid .item');
const bagCount = await bagItems.count();
if (bagCount >= 2) {
  await bagItems.nth(0).click();
  await bagItems.nth(1).click();
  await page.waitForTimeout(250);
  await shot('06-bench-filled');
  await page.getByRole('button', { name: /合成这两样/ }).click();
  await page.waitForTimeout(500);
  await shot('07-after-craft');
}

// 桌面端视图
const wide = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
await wide.goto(BASE, { waitUntil: 'networkidle' });
await wide.screenshot({ path: 'shots/08-desktop.png' });
console.log('saved 08-desktop');

await browser.close();
