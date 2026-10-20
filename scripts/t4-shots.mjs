/**
 * T4 界面层验收截图。
 *
 * 用法：node scripts/t4-shots.mjs [baseUrl]
 * 产物：shots/t4-mobile.png（375×667 主界面）
 *       shots/t4-bag.png（375×667 背包抽屉打开）
 *       shots/t4-desktop.png（1280×800 网页模式，合成台常驻右侧 320px）
 *
 * 同时把验收自查打在 stdout 上：
 * - 375 宽下 `scrollWidth <= 375`（无横向滚动）
 * - 所有可点元素的 `getBoundingClientRect()` ≥ 44×44
 *   （视觉可以小于热区，热区靠 ::after 补，所以这里量的是**命中盒**）
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:5175/';
const CHROME =
  process.env.CHROME_PATH ??
  'C:/Program Files/Google/Chrome/Application/chrome.exe';

mkdirSync('shots', { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--hide-scrollbars'],
});

/** 量所有可点元素的命中盒（含 ::after 撑出来的部分算不到，故单独查伪元素） */
const TAP_AUDIT = `(() => {
  const sel = 'button, [role="button"], [tabindex]:not([tabindex="-1"])';
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    // ::after 扩展的热区：取 inset 绝对值补进去
    const cs = getComputedStyle(el, '::after');
    let growX = 0;
    let growY = 0;
    if (cs.content !== 'none' && cs.position === 'absolute') {
      // inset 可能是 1/2/4 值写法，'inset: -11px' 是四边同值，
      // 只按单值处理会把横向扩张漏掉，把 45×45 的热区误报成 24×45
      const parts = cs.inset.split(' ').filter(Boolean).map(parseFloat);
      const v = Math.abs(parts[0]);
      if (parts[0] < 0) growY += v * 2; // 上下各扩 |inset|
      const h = parts.length >= 2 ? Math.abs(parts[1]) : v;
      if (h > 0 && (parts.length >= 2 ? parts[1] < 0 : parts[0] < 0)) growX += h * 2;
    }
    out.push({
      tag: el.className || el.tagName,
      w: Math.round(r.width + growX),
      h: Math.round(r.height + growY),
      right: Math.round(r.right),
    });
  }
  return out;
})()`;

async function audit(page, label) {
  const info = await page.evaluate(
    `({ scrollWidth: document.documentElement.scrollWidth, viewport: window.innerWidth, taps: ${TAP_AUDIT} })`,
  );
  const bad = info.taps.filter((t) => t.w < 44 || t.h < 44);
  const over = info.taps.filter((t) => t.right > info.viewport + 1);
  console.log(
    `[${label}] scrollWidth=${info.scrollWidth} / viewport=${info.viewport}` +
      ` · 可点元素 ${info.taps.length} 个 · <44px 的 ${bad.length} 个` +
      ` · 越过右边界 ${over.length} 个`,
  );
  if (bad.length) console.log('  ', JSON.stringify(bad));
  if (over.length) console.log('  ', JSON.stringify(over));
}

// ─────────── 手机 375×667 ───────────
const page = await browser.newPage({
  viewport: { width: 375, height: 667 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /开始游戏|重新开始/ }).click();
await page.waitForTimeout(600);

// 看完开场台词（点对话条 5 次）
for (let i = 0; i < 5; i++) {
  await page.locator('.dialogue').click();
  await page.waitForTimeout(150);
}
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/t4-mobile.png' });
console.log('saved t4-mobile');
await audit(page, 'mobile');

// 用开发调试口把地上物品真的捡进背包（走 store.collect，
// 与玩家走到拾取半径是同一条代码路径），这样背包抽屉截图里有真东西。
// 捡 4 件：T7 引导在第 4 次拾取后收尾，HintBar 才会回来——下一步才点得到 .hint__chip
await page.evaluate(() => {
  const store = window.__haola;
  const uids = store.getState().world.slice(0, 4).map((it) => it.uid);
  for (const uid of uids) store.getState().collect(uid);
});
await page.waitForTimeout(400);

// 展开左下提示条，确认面板不溢出
await page.locator('.hint__chip').click();
await page.waitForTimeout(200);
await audit(page, 'mobile+hint');
await page.screenshot({ path: 'shots/t4-mobile-hint.png' });
await page.locator('.hint__chip').click();

// ─────────── 背包抽屉 ───────────
// 先把前两件放进合成槽，证明槽位选中态真的有视觉反馈
await page.evaluate(() => {
  const store = window.__haola;
  const ids = Object.keys(store.getState().save.bag).slice(0, 2);
  for (const id of ids) store.getState().toggleSlot(id);
});
await page.getByRole('button', { name: /背包/ }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/t4-bag.png' });
console.log('saved t4-bag');
await audit(page, 'bag');
await page.locator('.drawer__toggle').click();
await page.waitForTimeout(300);

// ─────────── 网页 1280×800 ───────────
const wide = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});
wide.on('pageerror', (e) => errors.push(`desktop pageerror: ${e.message}`));
await wide.goto(BASE, { waitUntil: 'networkidle' });
await wide.getByRole('button', { name: /开始游戏|重新开始/ }).click();
await wide.waitForTimeout(600);
for (let i = 0; i < 5; i++) {
  await wide.locator('.dialogue').click();
  await wide.waitForTimeout(150);
}
await wide.waitForTimeout(900);
// 网页模式：捡几件 + 展开背包，证明「常驻侧栏 + 背包可折叠」都真的在
await wide.evaluate(() => {
  const store = window.__haola;
  const uids = store.getState().world.slice(0, 4).map((it) => it.uid);
  for (const uid of uids) store.getState().collect(uid);
  const ids = Object.keys(store.getState().save.bag).slice(0, 2);
  for (const id of ids) store.getState().toggleSlot(id);
  if (!store.getState().bagOpen) store.getState().toggleBag();
});
await wide.waitForTimeout(500);
await wide.screenshot({ path: 'shots/t4-desktop.png' });
console.log('saved t4-desktop');
await audit(wide, 'desktop');

console.log('consoleErrors:', errors.length ? errors : 'none');
await browser.close();
