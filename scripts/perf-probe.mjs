/**
 * 性能实测探针（T10-R2）：本地 dev server + CDP，测首屏加载与帧率。
 *
 * 用法：
 *   node scripts/perf-probe.mjs [--label=L] [--url=http://127.0.0.1:5176/]
 *                                 [--throttle=1] [--idle=10] [--move=60]
 *                                 [--out=shots/perf-probe-L.json]
 *
 * 测什么：
 *   A. 首屏（开始页冷启动）：navigation / FCP / LCP / TBT / CLS / 资源传输量
 *   B. 进入游戏：点击「开始游戏」→ canvas 出现 / 世界循环跑起来 的耗时
 *   C. 空闲场景（默认 10s）：Pixi ticker 空转时的帧率（回答「空闲是否仍在重绘」）
 *   D. 连续移动场景（默认 60s）：轮换 WASD 保持角色持续走动，测帧率分布
 *      --throttle=4 时同时开 CDP Emulation.setCPUThrottlingRate(4) 模拟中端安卓
 *   D2. UI 交互场景：反复开关背包抽屉（React 重渲染叠加在跑着的世界层上）
 *
 * 方法说明（写进报告的依据）：
 *   - 帧率：注入 rAF 钩子记录每帧时间戳，按场景分段统计帧间隔分位数。
 *     rAF 回调与浏览器 vsync 对齐，测的是「画面实际产出节奏」。
 *   - 主线程占用：CDP Performance.getMetrics 的 TaskDuration 增量 / 场景时长。
 *   - 环境：headless Chrome + SwiftShader（软件 GL）时帧时间含光栅化开销，
 *     与真机 GPU 不同 —— 报告必须注明这一点，只用同一环境内的对比做结论。
 *
 * 依赖：playwright-core（仓库根已装，scripts/ 现有脚本同款）。不装新包。
 */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// ── 参数 ──
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
const OUT = arg('out', `shots/perf-probe-${LABEL}.json`);

mkdirSync('shots', { recursive: true });

// 中端安卓 UA（Galaxy A54 一级，Android 13 + Chrome 126）
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

// ── 页面内探针（导航前注入，从第一帧就开始记）──
const PROBE = () => {
  const w = window;
  w.__perf = { frames: [], scene: 'boot', marks: {}, sceneLog: [['boot', performance.now()]] };
  const raf = w.requestAnimationFrame.bind(w);
  w.requestAnimationFrame = (cb) =>
    raf((ts) => {
      // 场景边界：scene 变了就记一笔，用于把长任务归到具体场景
      const log = w.__perf.sceneLog;
      if (log[log.length - 1][0] !== w.__perf.scene) log.push([w.__perf.scene, ts]);
      w.__perf.frames.push([ts, w.__perf.scene]);
      cb(ts);
    });

  const mark = (name, value) => {
    w.__perf.marks[name] = value;
  };

  // LCP / longtask / CLS 观察器
  const longTasks = [];
  let cls = 0;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) mark('lcp', e.startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longTasks.push([e.startTime, e.duration]);
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) cls += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
  w.__perf.readLongTasks = () => longTasks.slice();
  w.__perf.cls = () => cls;
  w.__perf.mark = mark;
};

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--hide-scrollbars',
    // --gpu：让 headless Chrome 走 ANGLE/GL 真实 GPU（默认 SwiftShader 软件光栅）。
    // 用来分辨「帧停顿是软件光栅伪影还是真问题」。
    ...(args.includes('--gpu') ? ['--use-angle=gl', '--ignore-gpu-blocklist'] : []),
  ],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: MOBILE_UA,
});

// CPU 降速必须在导航前挂上，否则解析/执行不受影响
const cdp = await page.context().newCDPSession(page);
// Performance.getMetrics 不 enable 会返回空；冷启动要禁 HTTP 缓存才有意义
await cdp.send('Performance.enable');
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
if (THROTTLE > 1) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  console.log(`CPU 降速 x${THROTTLE}（CDP Emulation.setCPUThrottlingRate）`);
}

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message ?? e)));

await page.addInitScript(PROBE);

// ── A. 冷启动首屏（开始页）：先落户同一源，清档后再 reload，量的是冷启动那次 ──
await page.goto(URL, { waitUntil: 'commit', timeout: 60000 });
await page.evaluate(() => localStorage.clear());
const tNav = Date.now();
await page.reload({ waitUntil: 'load', timeout: 60000 });
// 等开始按钮真的可交互（dev server 模块多，load 之后还在解析执行）
await page
  .getByRole('button', { name: /开始游戏|重新开始/ })
  .waitFor({ state: 'visible', timeout: 30000 })
  .catch(() => {});
// 按钮可见 ≠ 已绘制：playwright 的可见性检查可能跑在首次提交之前，
// 这里显式等 FCP 落盘，否则 getEntriesByType('paint') 可能还是空的
{
  const tFcp = Date.now();
  while (Date.now() - tFcp < 10000) {
    const has = await page.evaluate(() =>
      performance.getEntriesByType('paint').some((p) => p.name === 'first-contentful-paint'),
    );
    if (has) break;
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(400); // LCP 可能还会刷新一次，取稳
}
const navWallMs = Date.now() - tNav;

const loadMetrics = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0] ?? {};
  const paints = {};
  for (const p of performance.getEntriesByType('paint')) paints[p.name] = p.startTime;
  const res = performance.getEntriesByType('resource');
  let transfer = 0;
  let decoded = 0;
  const byType = {};
  const biggest = [];
  for (const r of res) {
    transfer += r.transferSize ?? 0;
    decoded += r.decodedBodySize ?? 0;
    const t = r.initiatorType || 'other';
    byType[t] = byType[t] || { n: 0, bytes: 0 };
    byType[t].n++;
    byType[t].bytes += r.transferSize ?? 0;
    biggest.push({ name: r.name, type: t, bytes: r.transferSize ?? 0, ms: Math.round(r.duration) });
  }
  biggest.sort((a, b) => b.bytes - a.bytes);
  return {
    ttfbMs: Math.round(nav.responseStart ?? -1),
    dclMs: Math.round(nav.domContentLoadedEventEnd ?? -1),
    loadMs: Math.round(nav.loadEventEnd ?? -1),
    fcpMs: Math.round(paints['first-contentful-paint'] ?? -1),
    lcpMs: Math.round(window.__perf.marks.lcp ?? -1),
    cls: Number(window.__perf.cls().toFixed(4)),
    tbtMs: Math.round(
      window.__perf
        .readLongTasks()
        .filter(([, d]) => d > 50)
        .reduce((a, [, d]) => a + d - 50, 0),
    ),
    longTaskCount: window.__perf.readLongTasks().filter(([, d]) => d > 50).length,
    requests: res.length,
    transferBytes: transfer,
    decodedBytes: decoded,
    byType,
    biggest: biggest.slice(0, 15),
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
    screen: window.__haola?.getState?.().screen,
    label: document.querySelector('[data-world="pixi"]')?.getAttribute('aria-label') ?? '',
    world: window.__haola?.getState?.().world?.length ?? 0,
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
  // WebGL renderer：区分 SwiftShader（软件）与真实 GPU，帧停顿归因要用
  glRenderer: await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return 'no-canvas';
    try {
      const gl = c.getContext('webgl2') ?? c.getContext('webgl');
      if (!gl) return 'no-gl';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    } catch (e) {
      return `err:${e.message}`;
    }
  }),
};

// ── C. 空闲场景 ──
const perfMetrics = async () => {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const out = {};
  for (const m of metrics) out[m.name] = m.value;
  return out;
};
const before = await perfMetrics();
await page.evaluate(() => {
  window.__perf.scene = 'idle';
});
await page.waitForTimeout(IDLE_S * 1000);
const afterIdle = await perfMetrics();

// ── D. 连续移动 60s：轮换方向键，保证角色不停 ──
await page.evaluate(() => {
  window.__perf.scene = 'move';
});
const DIRS = ['w', 'd', 's', 'a'];
const tMove = Date.now();
let dirIdx = 0;
await page.keyboard.down(DIRS[dirIdx]);
while (Date.now() - tMove < MOVE_S * 1000) {
  await page.waitForTimeout(1200);
  await page.keyboard.up(DIRS[dirIdx]);
  dirIdx = (dirIdx + 1) % DIRS.length;
  await page.keyboard.down(DIRS[dirIdx]);
}
await page.keyboard.up(DIRS[dirIdx]);
const afterMove = await perfMetrics();

// ── D2. UI 交互场景：反复开关背包（React 重渲染叠加在跑着的世界层上）──
await page.evaluate(() => {
  window.__perf.scene = 'ui';
});
const tUi = Date.now();
for (let i = 0; i < 10 && Date.now() - tUi < 15000; i++) {
  const btn = page.getByRole('button', { name: /背包/ });
  if ((await btn.count()) > 0) await btn.click();
  await page.waitForTimeout(350);
  // 点遮罩 / 空白处关抽屉
  await page.mouse.click(195, 120);
  await page.waitForTimeout(250);
}
const afterUi = await perfMetrics();

// 移动结束后的位置（证明角色真的走动了，不是卡住）
const endState = await page.evaluate(() => {
  const s = window.__haola?.getState?.();
  return { player: s?.player ?? null, screen: s?.screen ?? null };
});

const perfData = await page.evaluate(() => {
  const frames = window.__perf.frames;
  const byScene = {};
  for (const [ts, scene] of frames) {
    (byScene[scene] ??= []).push(ts);
  }
  const stats = (ts, longTasks) => {
    if (ts.length < 2) return null;
    // Pixi 8 有两条每帧注册的 rAF 链（app.ticker + CanvasObserver 的 Ticker.shared，
    // autoDensity: true 时启用），同一次浏览器帧会触发两个同时间戳回调。
    // 按时间戳去重才是「浏览器实际产出了几帧」。
    const uniq = [...new Set(ts)].sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < uniq.length; i++) gaps.push(uniq[i] - uniq[i - 1]);
    const worst = gaps
      .map((g, i) => ({ atMs: Math.round(uniq[i + 1]), gapMs: Math.round(g * 10) / 10 }))
      .sort((a, b) => b.gapMs - a.gapMs)
      .slice(0, 5);
    gaps.sort((a, b) => a - b);
    const q = (p) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))];
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    return {
      rafCallbacks: ts.length,
      frames: uniq.length,
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
      droppedPct: Number(
        ((gaps.filter((g) => g > 33.3).length / gaps.length) * 100).toFixed(1),
      ),
      worstGaps: worst,
      // 场景窗口内的长任务（>50ms），startTime 与帧时间戳同一时钟，可对齐
      longTasks: longTasks.map(([at, d]) => ({ atMs: Math.round(at), ms: Math.round(d) })),
    };
  };
  // 场景窗口 [start, end)，从 sceneLog 推
  const windows = {};
  const log = window.__perf.sceneLog;
  for (let i = 0; i < log.length; i++) {
    const end = i + 1 < log.length ? log[i + 1][1] : Infinity;
    const w0 = windows[log[i][0]] ?? { from: -Infinity, to: -Infinity };
    windows[log[i][0]] = { from: Math.min(w0.from === -Infinity ? Infinity : w0.from, log[i][1]), to: Math.max(w0.to, end === Infinity ? Infinity : end) };
  }
  const tasksIn = (scene) => {
    const wnd = windows[scene];
    if (!wnd) return [];
    return window.__perf.readLongTasks().filter(([at]) => at >= wnd.from && at < wnd.to);
  };
  return {
    total: frames.length,
    idle: stats(byScene.idle ?? [], tasksIn('idle')),
    move: stats(byScene.move ?? [], tasksIn('move')),
    ui: stats(byScene.ui ?? [], tasksIn('ui')),
    boot: stats(byScene.boot ?? [], tasksIn('boot')),
  };
});

const delta = (a, b) => Math.round((b - a) * 1000) / 1000;
const scenarios = {
  idle: {
    ...perfData.idle,
    taskS: delta(before.TaskDuration, afterIdle.TaskDuration),
    scriptS: delta(before.ScriptDuration, afterIdle.ScriptDuration),
    layoutS: delta(before.LayoutDuration, afterIdle.LayoutDuration),
    styleS: delta(before.RecalcStyleDuration, afterIdle.RecalcStyleDuration),
    mainThreadBusyPct: perfData.idle
      ? Number(((delta(before.TaskDuration, afterIdle.TaskDuration) / perfData.idle.spanS) * 100).toFixed(1))
      : null,
    heapEndMB: Math.round((afterIdle.JSHeapUsedSize ?? 0) / 1048576),
  },
  move: {
    ...perfData.move,
    taskS: delta(afterIdle.TaskDuration, afterMove.TaskDuration),
    scriptS: delta(afterIdle.ScriptDuration, afterMove.ScriptDuration),
    layoutS: delta(afterIdle.LayoutDuration, afterMove.LayoutDuration),
    styleS: delta(afterIdle.RecalcStyleDuration, afterMove.RecalcStyleDuration),
    mainThreadBusyPct: perfData.move
      ? Number(
          ((delta(afterIdle.TaskDuration, afterMove.TaskDuration) / perfData.move.spanS) * 100).toFixed(1),
        )
      : null,
    heapEndMB: Math.round((afterMove.JSHeapUsedSize ?? 0) / 1048576),
  },
  ui: {
    ...perfData.ui,
    taskS: delta(afterMove.TaskDuration, afterUi.TaskDuration),
    scriptS: delta(afterMove.ScriptDuration, afterUi.ScriptDuration),
    layoutS: delta(afterMove.LayoutDuration, afterUi.LayoutDuration),
    styleS: delta(afterMove.RecalcStyleDuration, afterUi.RecalcStyleDuration),
    mainThreadBusyPct: perfData.ui
      ? Number(
          ((delta(afterMove.TaskDuration, afterUi.TaskDuration) / perfData.ui.spanS) * 100).toFixed(1),
        )
      : null,
    heapEndMB: Math.round((afterUi.JSHeapUsedSize ?? 0) / 1048576),
  },
};

const report = {
  label: LABEL,
  url: URL,
  ua: MOBILE_UA,
  viewport: '390x844 @ DPR2, isMobile+hasTouch',
  cpuThrottle: THROTTLE,
  measuredAt: new Date().toISOString(),
  load: { ...loadMetrics, navWallMs },
  gameEntry,
  scenarios,
  endState,
  pageErrors,
  framesTotal: perfData.total,
  framesBoot: perfData.boot,
};

writeFileSync(OUT, JSON.stringify(report, null, 2));

// ── 摘要 ──
const kb = (b) => `${Math.round(b / 1024)}KB`;
console.log('\n════════ T10-R2 性能实测 ════════');
console.log(`环境：headless Chrome · 390×844 DPR2 · CPU throttle x${THROTTLE}`);
console.log('\n— 首屏（开始页冷启动）—');
console.log(`  导航墙钟        ${navWallMs}ms（reload → 按钮可见 + FCP 落盘）`);
console.log(`  TTFB            ${loadMetrics.ttfbMs}ms`);
console.log(`  FCP             ${loadMetrics.fcpMs}ms`);
console.log(`  LCP             ${loadMetrics.lcpMs}ms`);
console.log(`  DCL / load      ${loadMetrics.dclMs}ms / ${loadMetrics.loadMs}ms`);
console.log(`  TBT             ${loadMetrics.tbtMs}ms（${loadMetrics.longTaskCount} 个长任务）`);
console.log(`  CLS             ${loadMetrics.cls}`);
console.log(`  请求            ${loadMetrics.requests} 个，传输 ${kb(loadMetrics.transferBytes)}（解压后 ${kb(loadMetrics.decodedBytes)}）`);
console.log('\n— 进入游戏 —');
console.log(`  点击 → canvas   ${gameEntry.clickToCanvasMs}ms`);
console.log(`  点击 → 世界循环 ${gameEntry.clickToWorldLoopMs}ms（aria-label 首次更新）`);
console.log(`  地面物品        ${gameEntry.worldItems} 件 · GL renderer: ${gameEntry.glRenderer}`);
console.log('\n— 帧率 —');
for (const [name, s] of [
  ['空闲', scenarios.idle],
  ['连续移动', scenarios.move],
  ['UI 开关背包', scenarios.ui],
]) {
  if (!s || s.frames < 2) {
    console.log(`  ${name}: 样本不足`);
    continue;
  }
  console.log(
    `  ${name}  ${s.frames} 帧 / ${s.spanS}s（rAF 回调 ${s.rafCallbacks}）· 均 ${s.meanFps}fps · p50 ${s.p50Ms}ms · p95 ${s.p95Ms}ms · p99 ${s.p99Ms}ms · 最大 ${s.maxMs}ms`,
  );
  console.log(
    `          >16.7ms ${s.over16} 帧 · >33.3ms ${s.over33} 帧（掉帧率 ${s.droppedPct}%） · >100ms ${s.over100} 帧 · 主线程占用 ${s.mainThreadBusyPct}% · 堆 ${s.heapEndMB}MB`,
  );
  if (s.worstGaps?.length) {
    console.log(
      `          最差帧: ${s.worstGaps.map((g) => `${g.gapMs}ms@${g.atMs}`).join(' · ')}`,
    );
  }
  if (s.longTasks?.length) {
    console.log(
      `          场景内长任务: ${s.longTasks.map((t) => `${t.ms}ms@${t.atMs}`).join(' · ')}`,
    );
  }
}
console.log(`\n  角色终点 ${JSON.stringify(endState.player)} · 页面错误 ${pageErrors.length}`);
console.log(`\nJSON → ${OUT}`);

await browser.close();
