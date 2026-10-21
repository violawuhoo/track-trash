/**
 * QW2 验证：开始屏空闲预热是否让 Pixi 渲染器 chunk 在点击前就发起请求。
 *
 * 用法：node scripts/perf-qw2-check.mjs [baseUrl]
 * 判定：点击「开始游戏」前，7 个渲染器 chunk（WebGLRenderer / RenderTargetSystem /
 * browserAll / webworkerAll / getTexelRangeRects / canvasUtils / CanvasPool）
 * 应已全部出现过网络请求；点击后新增的 Pixi 请求应为 0。
 */
import { chromium } from 'playwright-core';

const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] ?? 'http://127.0.0.1:4184/track-trash/';

const PIXI_CHUNKS = [
  'WebGLRenderer',
  'RenderTargetSystem',
  'browserAll',
  'webworkerAll',
  'getTexelRangeRects',
  'canvasUtils',
  'CanvasPool',
];

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const requested = [];
page.on('request', (r) => requested.push(r.url()));

await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
// 等开始屏渲染 + requestIdleCallback 触发（timeout 5s 上限，留足余量）
await page.waitForTimeout(4000);

const beforeClick = requested.slice();
const hitBefore = PIXI_CHUNKS.filter((c) => beforeClick.some((u) => u.includes(c)));
console.log(`点击前已请求的 Pixi chunk：${hitBefore.length}/${PIXI_CHUNKS.length}`);
for (const c of PIXI_CHUNKS) {
  const hit = beforeClick.find((u) => u.includes(c));
  console.log(`  ${hit ? '✓' : '✗'} ${c}${hit ? ` → ${hit.split('/').pop()}` : ''}`);
}

// 点开始游戏，看点击后有没有新的 Pixi 请求
const mark = requested.length;
await page.getByRole('button', { name: /开始游戏|重新开始/ }).click();
await page.waitForTimeout(2500);
const afterClick = requested.slice(mark);
const pixiAfter = afterClick.filter((u) => PIXI_CHUNKS.some((c) => u.includes(c)));
console.log(`\n点击后新增 Pixi chunk 请求：${pixiAfter.length}（期望 0）`);
if (pixiAfter.length) console.log('  ', pixiAfter.map((u) => u.split('/').pop()).join(', '));

const canvasAt = await page.evaluate(() => document.querySelectorAll('canvas').length);
console.log(`\ncanvas 已创建：${canvasAt > 0}`);
console.log(`\n判定：${hitBefore.length === PIXI_CHUNKS.length && pixiAfter.length === 0 ? 'PASS — 7 个 chunk 均在点击前发起，点击后零新增' : 'CHECK — 见上方明细'}`);

await browser.close();
