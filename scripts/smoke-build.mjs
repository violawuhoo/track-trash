/**
 * 生产构建冒烟测试：验证 build 产物在 /track-trash/ 子路径下能正常加载。
 * 用法：node scripts/smoke-build.mjs [url]
 */
import { chromium } from 'playwright-core';

const URL = process.argv[2] ?? 'http://127.0.0.1:5180/track-trash/';
const CHROME =
  process.env.CHROME_PATH ??
  'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--disable-gpu', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const errors = [];
const failed = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('response', (r) => {
  if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/smoke-build.png', fullPage: false });

const title = await page.title();
const hasStart = await page
  .getByRole('button', { name: /开始|开捡|出发/ })
  .count();

console.log('title:', title);
console.log('startButton:', hasStart);
console.log('httpErrors:', failed.length ? failed : 'none');
console.log('consoleErrors:', errors.length ? errors : 'none');

await browser.close();
process.exit(failed.length || errors.length ? 1 : 0);
