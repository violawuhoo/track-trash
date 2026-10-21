/**
 * UI 场景归因实验（T10-QW1 验证配套）：复刻 perf-probe 的 D2 场景
 * （10 次开关背包），可选注入 CSS 覆盖关闭态 content-visibility，
 * 用来单变量归因「UI 场景掉帧是否为 content-visibility 引入」。
 *
 * 用法：node scripts/perf-ui-scene.mjs [--cv=on|off] [--rounds=2]
 * 判据：cv=off（等效 QW1 前布局行为）与 cv=on 的掉帧数差。
 */
import { chromium } from 'playwright-core';

const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const args = process.argv.slice(2);
const arg = (n, d) => {
  const hit = args.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const CV = arg('cv', 'on'); // on = 现状（content-visibility 生效）；off = 覆盖为 visible
const ROUNDS = Number(arg('rounds', 2));
const URL = arg('url', 'http://127.0.0.1:5176/');

const PROBE = () => {
  const w = window;
  w.__perf = { frames: [], scene: 'boot', sceneLog: [['boot', performance.now()]] };
  const raf = w.requestAnimationFrame.bind(w);
  w.requestAnimationFrame = (cb) =>
    raf((ts) => {
      const log = w.__perf.sceneLog;
      if (log[log.length - 1][0] !== w.__perf.scene) log.push([w.__perf.scene, ts]);
      w.__perf.frames.push([ts, w.__perf.scene]);
      cb(ts);
    });
};

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--hide-scrollbars'],
});

for (let round = 1; round <= ROUNDS; round++) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  });
  await page.addInitScript(PROBE);
  if (CV === 'off') {
    // !important 作者规则压过 React 写的内联 content-visibility:hidden
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const st = document.createElement('style');
        st.textContent =
          '.drawer__body[style*="content-visibility"] { content-visibility: visible !important; }';
        document.head.appendChild(st);
      });
    });
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  await page.goto(URL, { waitUntil: 'commit' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: /开始游戏|重新开始/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0, { timeout: 20000 });
  await page.waitForTimeout(2500); // 等热身/首帧稳定

  await page.evaluate(() => {
    window.__perf.scene = 'ui';
  });
  const tUi = Date.now();
  for (let i = 0; i < 10 && Date.now() - tUi < 15000; i++) {
    const btn = page.getByRole('button', { name: /背包/ });
    if ((await btn.count()) > 0) await btn.click();
    await page.waitForTimeout(350);
    await page.mouse.click(195, 120);
    await page.waitForTimeout(250);
  }

  const stats = await page.evaluate(() => {
    const frames = window.__perf.frames.filter(([, s]) => s === 'ui').map(([ts]) => ts);
    const uniq = [...new Set(frames)].sort((a, b) => a - b); // Pixi 双 rAF 链去重
    const gaps = [];
    for (let i = 1; i < uniq.length; i++) gaps.push(uniq[i] - uniq[i - 1]);
    gaps.sort((a, b) => a - b);
    return {
      frames: uniq.length,
      spanS: Number(((uniq[uniq.length - 1] - uniq[0]) / 1000).toFixed(2)),
      over33: gaps.filter((g) => g > 33.3).length,
      maxMs: Number(gaps[gaps.length - 1].toFixed(1)),
      worst: gaps.slice(-5).map((g) => Math.round(g)),
    };
  });
  console.log(
    `cv=${CV} 第${round}轮: ${stats.frames}帧/${stats.spanS}s · 掉帧 ${stats.over33} · 最差 ${stats.maxMs}ms · top5 ${stats.worst.join('/')}`,
  );
  await page.close();
}
await browser.close();
