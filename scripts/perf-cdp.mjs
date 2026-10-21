/**
 * 《好垃》v2 性能实测 · CDP 探针（T10-R2，只测量不改代码）。
 *
 * 用法：
 *   node scripts/perf-cdp.mjs [--url=http://127.0.0.1:5176/] [--throttle=4]
 *                             [--idle=10] [--move=60] [--gpu]
 *                             [--label=throttle4] [--out=docs/perf/measurements/x.json]
 *
 * 与 scripts/perf-probe.mjs 的区别（并行存在的另一支探针，避免文件冲突各用各的）：
 *   1. **帧按 vsync 时间去重**：同一帧时间戳的多个 rAF 回调只算一帧。
 *      （Pixi ticker 之外还有第二个 rAF 消费者，不去重会把 60fps 记成 120fps。）
 *   2. 长任务 / JS 堆按场景切片，空闲与移动分开归因。
 *   3. 移动场景中每 5s 采样一次 store（地面物品数 / 背包总数 / 坐标），
 *      证明场景里真的在发生拾取与重渲染，不是空跑。
 *   4. 不依赖 CDP Performance.getMetrics（本机 Chrome 126 该域 metrics 多为空）。
 *
 * 方法说明（报告引用）：
 *   - 帧率：注入 rAF 钩子记录每帧时间戳，按场景分段，统计帧间隔分位数。
 *   - 主线程占用：长任务（>50ms）总和与场景时长之比 + 帧间隔分布。
 *   - 环境：headless Chrome，WebGL 默认走 SwiftShader 软渲染，
 *     与真机 GPU 有差距 —— 只用同一环境内的横向对比下结论。
 *
 * 依赖：playwright-core（仓库根已装，scripts/ 现有脚本同款）。不装新包。
 */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const URL = arg('url', 'http://127.0.0.1:5176/');
const LABEL = arg('label', 'run');
const THROTTLE = Number(arg('throttle', '1'));
const IDLE_S = Number(arg('idle', '10'));
const MOVE_S = Number(arg('move', '60'));
const OUT = arg('out', `docs/perf/measurements/perf-cdp-${LABEL}.json`);
const USE_GPU = !args.includes('--soft'); // 默认走 Chrome 默认 GL 路径；--soft 强制 SwiftShader 软渲染

// 中端安卓 UA（Galaxy A54 一级，Android 13 + Chrome 126）
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

mkdirSync(dirname(OUT), { recursive: true });
mkdirSync('shots', { recursive: true });

// ── 页内探针（导航前注入）──
const PROBE = () => {
  const w = window;
  w.__perf = { frames: [], scene: 'boot', marks: {}, longtasks: [] };
  const raf = w.requestAnimationFrame.bind(w);
  w.requestAnimationFrame = (cb) =>
    raf((ts) => {
      w.__perf.frames.push([ts, w.__perf.scene]);
      cb(ts);
    });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        w.__perf.longtasks.push([e.startTime, e.duration, w.__perf.scene]);
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__perf.marks.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') w.__perf.marks.fcp = e.startTime;
    }).observe({ type: 'paint', buffered: true });
  } catch {}
};

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  // 默认不传 --disable-gpu：headless Chrome 会走 ANGLE 默认路径（可能是真 GPU 或
  // SwiftShader）。--soft 才强制软渲染，用于拿「最坏情况」数据点。
  args: USE_GPU ? ['--hide-scrollbars'] : ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--hide-scrollbars'],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: MOBILE_UA,
});

const cdp = await page.context().newCDPSession(page);
if (THROTTLE > 1) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  console.log(`CPU 降速 x${THROTTLE}（CDP Emulation.setCPUThrottlingRate，导航前挂上）`);
}

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message ?? e)));

await page.addInitScript(PROBE);

// ── A. 冷启动首屏 ──
await page.goto(URL, { waitUntil: 'commit', timeout: 60000 });
await page.evaluate(() => localStorage.clear());
const tNav = Date.now();
await page.reload({ waitUntil: 'load', timeout: 60000 });
await page
  .getByRole('button', { name: /开始游戏|重新开始/ })
  .waitFor({ state: 'visible', timeout: 30000 })
  .catch(() => {});
const navWallMs = Date.now() - tNav;

const loadMetrics = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0] ?? {};
  const paints = {};
  for (const p of performance.getEntriesByType('paint')) paints[p.name] = p.startTime;
  const res = performance.getEntriesByType('resource');
  let transfer = 0;
  let decoded = 0;
  const byType = {};
  for (const r of res) {
    transfer += r.transferSize ?? 0;
    decoded += r.decodedBodySize ?? 0;
    const t = r.initiatorType || 'other';
    byType[t] = byType[t] || { n: 0, bytes: 0 };
    byType[t].n++;
    byType[t].bytes += r.transferSize ?? 0;
  }
  return {
    ttfbMs: Math.round(nav.responseStart ?? -1),
    dclMs: Math.round(nav.domContentLoadedEventEnd ?? -1),
    loadMs: Math.round(nav.loadEventEnd ?? -1),
    fcpMs: Math.round(window.__perf.marks.fcp ?? paints['first-contentful-paint'] ?? -1),
    lcpMs: Math.round(window.__perf.marks.lcp ?? -1),
    requests: res.length,
    transferBytes: transfer,
    decodedBytes: decoded,
    byType,
    heapMb: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576),
  };
});

// ── B. 进入游戏 ──
await page.getByRole('button', { name: /开始游戏|重新开始/ }).click();
const tGame = Date.now();
let canvasAt = -1;
let loopAt = -1;
while (Date.now() - tGame < 15000) {
  const st = await page.evaluate(() => ({
    canvas: document.querySelectorAll('canvas').length,
    label: document.querySelector('[data-world="pixi"]')?.getAttribute('aria-label') ?? '',
  }));
  if (canvasAt < 0 && st.canvas > 0) canvasAt = Date.now() - tGame;
  if (loopAt < 0 && st.canvas > 0 && st.label) loopAt = Date.now() - tGame;
  if (loopAt >= 0) break;
  await page.waitForTimeout(16);
}
const gameEntry = {
  clickToCanvasMs: canvasAt,
  clickToWorldLoopMs: loopAt,
  worldItems: await page.evaluate(() => window.__haola?.getState?.().world?.length ?? -1),
  heapMb: await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576)),
  renderer: await page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return 'no-webgl';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  }),
};

// ── C. 空闲场景 ──
await page.evaluate(() => {
  window.__perf.scene = 'idle';
});
await page.waitForTimeout(IDLE_S * 1000);
const idleEnd = await page.evaluate(() => ({
  heapMb: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576),
}));

// ── D. 连续移动：轮换 WASD，并每 5s 采样一次 store ──
await page.evaluate(() => {
  window.__perf.scene = 'move';
});
const DIRS = ['w', 'd', 's', 'a'];
const tMove = Date.now();
let dirIdx = 0;
const samples = [];
await page.keyboard.down(DIRS[dirIdx]);
while (Date.now() - tMove < MOVE_S * 1000) {
  await page.waitForTimeout(1200);
  await page.keyboard.up(DIRS[dirIdx]);
  dirIdx = (dirIdx + 1) % DIRS.length;
  await page.keyboard.down(DIRS[dirIdx]);
  const t = Date.now() - tMove;
  if (t % 5000 < 1300 || samples.length === 0) {
    samples.push({
      tS: Math.round(t / 100) / 10,
      ...(await page.evaluate(() => {
        const s = window.__haola?.getState?.();
        return {
          world: s?.world?.length ?? -1,
          bag: s?.save?.bag ? Object.values(s.save.bag).reduce((a, b) => a + b, 0) : -1,
          px: Math.round(s?.player?.x ?? -1),
          py: Math.round(s?.player?.y ?? -1),
        };
      })),
    });
  }
}
await page.keyboard.up(DIRS[dirIdx]);
const moveEnd = await page.evaluate(() => ({
  heapMb: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576),
  player: window.__haola?.getState?.().player ?? null,
  screen: window.__haola?.getState?.().screen ?? null,
}));

// ── 统计：帧按 vsync 时间戳去重 ──
const perfData = await page.evaluate(() => {
  const byScene = {};
  for (const [ts, scene] of window.__perf.frames) {
    (byScene[scene] ??= []).push(ts);
  }
  const stats = (tsList) => {
    if (!tsList || tsList.length < 2) return null;
    // 同一 vsync 时间戳的多个回调只算一帧
    const uniq = [...new Set(tsList)].sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < uniq.length; i++) gaps.push(uniq[i] - uniq[i - 1]);
    gaps.sort((a, b) => a - b);
    const q = (p) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))];
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    return {
      frames: uniq.length,
      callbacks: tsList.length,
      spanS: Number(((uniq[uniq.length - 1] - uniq[0]) / 1000).toFixed(2)),
      meanFps: Number((1000 / mean).toFixed(1)),
      p50Ms: Number(q(0.5).toFixed(1)),
      p90Ms: Number(q(0.9).toFixed(1)),
      p95Ms: Number(q(0.95).toFixed(1)),
      p99Ms: Number(q(0.99).toFixed(1)),
      maxMs: Number(gaps[gaps.length - 1].toFixed(1)),
      over16: gaps.filter((g) => g > 16.7).length,
      over33: gaps.filter((g) => g > 33.3).length,
      over50: gaps.filter((g) => g > 50).length,
      over100: gaps.filter((g) => g > 100).length,
      droppedPct: Number(((gaps.filter((g) => g > 33.3).length / gaps.length) * 100).toFixed(1)),
    };
  };
  const longByScene = {};
  for (const [, d, scene] of window.__perf.longtasks) {
    longByScene[scene] = longByScene[scene] || { n: 0, ms: 0, over50: 0 };
    longByScene[scene].n++;
    longByScene[scene].ms += d;
    if (d > 50) longByScene[scene].over50++;
  }
  return {
    total: window.__perf.frames.length,
    boot: stats(byScene.boot ?? []),
    idle: stats(byScene.idle ?? []),
    move: stats(byScene.move ?? []),
    longByScene,
  };
});

const report = {
  label: LABEL,
  url: URL,
  ua: MOBILE_UA,
  viewport: '390x844 @ DPR2, isMobile+hasTouch',
  cpuThrottle: THROTTLE,
  glMode: USE_GPU ? 'default-angle' : 'forced-swiftshader',
  renderer: gameEntry.renderer,
  measuredAt: new Date().toISOString(),
  load: { ...loadMetrics, navWallMs },
  gameEntry,
  scenes: {
    idle: { ...perfData.idle, heapEndMb: idleEnd.heapMb, longtasks: perfData.longByScene.idle ?? null },
    move: { ...perfData.move, heapEndMb: moveEnd.heapMb, longtasks: perfData.longByScene.move ?? null },
  },
  moveSamples: samples,
  endState: { player: moveEnd.player, screen: moveEnd.screen },
  pageErrors,
};

writeFileSync(OUT, JSON.stringify(report, null, 2));

// ── 摘要 ──
const kb = (b) => `${Math.round(b / 1024)}KB`;
console.log('\n════════ T10-R2 性能实测（perf-cdp）════════');
console.log(`环境：headless Chrome · 390×844 DPR2 · CPU throttle x${THROTTLE} · GL ${USE_GPU ? '默认路径' : '强制 SwiftShader 软渲染'}`);
console.log(`渲染后端：${gameEntry.renderer}`);
console.log('\n— 首屏（开始页冷启动，dev server）—');
console.log(`  导航墙钟 ${navWallMs}ms · TTFB ${loadMetrics.ttfbMs}ms · FCP ${loadMetrics.fcpMs}ms · LCP ${loadMetrics.lcpMs}ms`);
console.log(`  DCL ${loadMetrics.dclMs}ms · load ${loadMetrics.loadMs}ms`);
console.log(`  请求 ${loadMetrics.requests} 个 · 传输 ${kb(loadMetrics.transferBytes)}（解压 ${kb(loadMetrics.decodedBytes)}）· 堆 ${loadMetrics.heapMb}MB`);
console.log('\n— 进入游戏 —');
console.log(`  点击→canvas ${gameEntry.clickToCanvasMs}ms · →世界循环 ${gameEntry.clickToWorldLoopMs}ms · 地面 ${gameEntry.worldItems} 件 · 堆 ${gameEntry.heapMb}MB`);
console.log('\n— 帧率（按 vsync 去重）—');
for (const [name, s] of [['空闲', report.scenes.idle], ['连续移动', report.scenes.move]]) {
  if (!s || s.frames < 2) {
    console.log(`  ${name}: 样本不足`);
    continue;
  }
  console.log(
    `  ${name} ${s.frames} 帧 / ${s.spanS}s · 均 ${s.meanFps}fps · p50 ${s.p50Ms}ms · p95 ${s.p95Ms}ms · p99 ${s.p99Ms}ms · 最大 ${s.maxMs}ms`,
  );
  console.log(
    `       >16.7ms ${s.over16} · >33.3ms ${s.over33}（掉帧 ${s.droppedPct}%）· >100ms ${s.over100} · 长任务 ${s.longtasks ? `${s.longtasks.over50} 个 / ${Math.round(s.longtasks.ms)}ms` : '—'} · 堆 ${s.heapEndMb}MB`,
  );
}
console.log(`\n  移动采样 ${samples.length} 点：${samples.map((x) => `w${x.world}/b${x.bag}`).join(' ')}`);
console.log(`  角色终点 ${JSON.stringify(moveEnd.player)} · 页面错误 ${pageErrors.length}`);
console.log(`\nJSON → ${OUT}`);

await browser.close();
