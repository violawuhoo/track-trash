/**
 * QW1 收尾验证：背包抽屉的 content-visibility 护栏三连。
 *
 * 背景：BagDrawer 关抽屉后延时 200ms（DRAWER_SLIDE_MS）才给 .drawer__body 加
 * `content-visibility: hidden`，让滑出动画（--dur-2 = 180ms）先播完。
 * 本脚本验证四条（三条护栏 + 桌面契约）：
 *   A. 收起时间线：点「收起」后 180ms 动画窗内 content-visibility 保持 visible，
 *      动画播完（~200ms）后才 hidden；重开立即恢复。
 *   B. 重开动画起点：跳过态面板被压成标题栏高，CSS translateY(105%) 会只剩 ~85px，
 *      重开就从 85px 处滑入（塌）。护栏③把收起目标覆盖成 100dvh，重开应从
 *      屏幕外（top ≥ 视口中段以下）完整滑入。采样 commit 后 +30/+80ms 的面板 top。
 *   C. 桌面契约（§10.6）：≥1024 常驻侧栏折叠态合成台必须始终可见——
 *      桌面永不跳过 body 布局（护栏②）。
 *   D. 视觉存档：打开态 / 收起中段截图留档人工核对。
 *
 * 注意：抽屉关着时整块面板 visibility:hidden，`.drawer__toggle` 点不到——
 * 开门要走 HUD 的「背包」按钮（与 t4-shots 同路径）。
 *
 * 用法：node scripts/perf-drawer-check.mjs [url]
 * 依赖：playwright-core（仓库根已装，scripts/ 现有脚本同款）。不装新包。
 */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] ?? 'http://127.0.0.1:5176/';

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--hide-scrollbars'],
});
mkdirSync('shots', { recursive: true });

const report = { url: URL, steps: [], screenshots: [] };
const log = (step, data) => {
  report.steps.push({ step, ...data });
  console.log(`[drawer-check] ${step}: ${JSON.stringify(data)}`);
};

/** 开局到「能开背包」的公共路径：开始游戏 → 看完开场台词 → 捡 4 件 */
async function enterGame(page) {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /开始游戏|重新开始/ }).click();
  await page.waitForSelector('canvas', { timeout: 20000 });
  for (let i = 0; i < 5; i++) {
    if ((await page.locator('.dialogue').count()) === 0) break;
    await page.locator('.dialogue').click().catch(() => {});
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => {
    const store = window.__haola;
    const uids = store.getState().world.slice(0, 4).map((it) => it.uid);
    for (const uid of uids) store.getState().collect(uid);
  });
  await page.waitForTimeout(300);
}

const cvOf = (page) =>
  page.locator('.drawer__body').evaluate((el) => getComputedStyle(el).contentVisibility);
const rectTopOf = (page) =>
  page.locator('.drawer').evaluate((el) => Math.round(el.getBoundingClientRect().top));

// ─────────── A + B + D：移动 390×844 ───────────
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await enterGame(page);

await page.getByRole('button', { name: /背包/ }).click();
await page.waitForTimeout(400);
log('open', { contentVisibility: await cvOf(page) });
await page.screenshot({ path: 'shots/drawer-open.png' });
report.screenshots.push('shots/drawer-open.png');

// A：收起时间线
await page.locator('.drawer__toggle').click();
const samples = [];
const t0 = Date.now();
for (let i = 0; i < 30; i++) {
  samples.push({ t: Date.now() - t0, cv: await cvOf(page) });
  if (samples.at(-1).cv === 'hidden' && samples.length > 3) break;
  await page.waitForTimeout(20);
}
await page.waitForTimeout(400); // 跳过态稳定
log('closed-settled', { contentVisibility: await cvOf(page), transform: await page.locator('.drawer').evaluate((el) => getComputedStyle(el).transform) });

// B：重开动画起点（commit 对齐 + 采样面板 top）
await page.evaluate(() => {
  const drawer = document.querySelector('.drawer');
  window.__commitAt = null;
  new MutationObserver(() => {
    if (drawer.className.includes('drawer--open') && window.__commitAt === null) {
      window.__commitAt = performance.now();
    }
  }).observe(drawer, { attributes: true, attributeFilter: ['class'] });
});
await page.getByRole('button', { name: /背包/ }).click();
await page.waitForFunction(() => window.__commitAt !== null, null, { timeout: 3000 });
const rise = [];
for (const dt of [30, 80, 160]) {
  const target = await page.evaluate(() => window.__commitAt);
  const wait = Math.max(0, target + dt - (await page.evaluate(() => performance.now())));
  if (wait > 0) await page.waitForTimeout(wait);
  rise.push({ dt, top: await rectTopOf(page) });
}
log('reopen-rise', { viewportH: 844, rise });
await page.waitForTimeout(400);
log('reopened', { contentVisibility: await cvOf(page) });
await page.screenshot({ path: 'shots/drawer-reopened.png' });
report.screenshots.push('shots/drawer-reopened.png');

// D：收起中段截图（commit 对齐 ~90ms，180ms 动画过半）
await page.evaluate(() => {
  const drawer = document.querySelector('.drawer');
  window.__commitAt = null;
  new MutationObserver(() => {
    if (!drawer.className.includes('drawer--open') && window.__commitAt === null) {
      window.__commitAt = performance.now();
    }
  }).observe(drawer, { attributes: true, attributeFilter: ['class'] });
});
await page.locator('.drawer__toggle').click();
await page.waitForFunction(() => window.__commitAt !== null, null, { timeout: 3000 });
const cdp = await page.context().newCDPSession(page);
const target = await page.evaluate(() => window.__commitAt);
const wait = Math.max(0, target + 90 - (await page.evaluate(() => performance.now())));
if (wait > 0) await page.waitForTimeout(wait);
const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('shots/drawer-midclose.png', Buffer.from(data, 'base64'));
report.screenshots.push('shots/drawer-midclose.png');
log('midclose-90ms', { saved: 'shots/drawer-midclose.png' });

// ─────────── C：桌面 1280×800 折叠态契约 ───────────
const wide = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await enterGame(wide);
await wide.waitForTimeout(500); // 跳过态早该生效（如果错了的话）
const desktop = await wide.evaluate(() => {
  const body = document.querySelector('.drawer__body');
  const craft = document.querySelector('.drawer__body .bench');
  return {
    bodyCV: getComputedStyle(body).contentVisibility,
    bagGridDisplay: getComputedStyle(document.querySelector('.drawer__bag')).display,
    craftRendered: craft ? craft.checkVisibility({ contentVisibilityAuto: true }) : null,
    craftFound: !!craft,
  };
});
log('desktop-folded', desktop);
await wide.screenshot({ path: 'shots/drawer-desktop-folded.png' });
report.screenshots.push('shots/drawer-desktop-folded.png');

// ─────────── 判定 ───────────
const firstHidden = samples.find((s) => s.cv === 'hidden');
const animWindowVisible = samples.filter((s) => s.t <= 180 && s.cv === 'visible').length;
report.verdict = {
  A_animWindowVisible: animWindowVisible > 0,
  A_hiddenAfterAnim: !!firstHidden && firstHidden.t >= 180,
  A_firstHiddenAtMs: firstHidden?.t ?? null,
  B_riseStartsOffscreen: rise[0].top >= 700 && rise[1].top >= 400,
  rise,
  C_desktopCraftVisible: desktop.craftRendered === true,
  C_desktopBodyNotSkipped: desktop.bodyCV !== 'hidden',
};
console.log(`[drawer-check] verdict: ${JSON.stringify(report.verdict)}`);
writeFileSync('shots/perf-drawer-check.json', JSON.stringify(report, null, 2));

await browser.close();
const ok =
  report.verdict.A_animWindowVisible &&
  report.verdict.A_hiddenAfterAnim &&
  report.verdict.B_riseStartsOffscreen &&
  report.verdict.C_desktopCraftVisible &&
  report.verdict.C_desktopBodyNotSkipped;
console.log(ok ? 'DRAWER-CHECK PASS' : 'DRAWER-CHECK FAIL');
process.exit(ok ? 0 : 1);
