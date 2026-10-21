/**
 * 长任务归因（T10-R2 配套）：4× CPU 降速 + 连续移动下抓一段 CDP trace，
 * 回答「perf-probe 看到的 50–70ms 长任务到底是什么」。
 *
 * 用法：node scripts/perf-trace.mjs [--seconds=30] [--throttle=4] [--out=shots/perf-trace.json]
 *
 * 只抓 devtools.timeline 一个域：RunTask / TimerFire / RasterTask / ImageDecode /
 * EvaluateScript 都在里面，体积可控。跑完按 dur 降序打印主线程上的大块，
 * 并把 trace 原件留下供深挖。
 */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const args = process.argv.slice(2);
const arg = (n, d) => {
  const hit = args.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const SECONDS = Number(arg('seconds', '30'));
const THROTTLE = Number(arg('throttle', '4'));
const OUT = arg('out', 'shots/perf-trace.json');
mkdirSync('shots', { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--hide-scrollbars'],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 13; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
});
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });

await page.goto('http://127.0.0.1:5176/', { waitUntil: 'commit' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.getByRole('button', { name: /开始游戏|重新开始/ }).click();
await page.waitForTimeout(1500); // 等世界层起来、纹理就绪，不抓启动噪声

// 订阅 store：每次 collect / world 变化都记时间戳，用来和 trace 事件对齐。
// console.timeStamp 会在 trace 里落一个 TimeStamp 事件（ts 在 trace 时钟上），
// 它就是 page 时钟与 trace 时钟之间的桥。
await page.evaluate(() => {
  window.__evlog = [];
  window.__bridge = performance.now();
  console.timeStamp('__bridge');
  const bagTotal = (s) => Object.values(s.save.bag).reduce((a, b) => a + (b ?? 0), 0);
  let lastBag = -1;
  let lastWorld = -1;
  window.__haola.subscribe((s) => {
    const bag = bagTotal(s);
    const world = s.world.length;
    if (bag !== lastBag || world !== lastWorld) {
      window.__evlog.push([performance.now(), bag, world, s.save.log.length]);
      lastBag = bag;
      lastWorld = world;
    }
  });
});

await cdp.send('Tracing.start', { categories: 'devtools.timeline,blink.console,blink.user_timing' });
const traceEvents = [];
const onEvent = (params) => traceEvents.push(...params.value);
cdp.on('Tracing.dataCollected', onEvent);

const DIRS = ['w', 'd', 's', 'a'];
let dirIdx = 0;
await page.keyboard.down(DIRS[dirIdx]);
const t0 = Date.now();
while (Date.now() - t0 < SECONDS * 1000) {
  await page.waitForTimeout(1200);
  await page.keyboard.up(DIRS[dirIdx]);
  dirIdx = (dirIdx + 1) % DIRS.length;
  await page.keyboard.down(DIRS[dirIdx]);
}
await page.keyboard.up(DIRS[dirIdx]);

// store 事件日志（page 时钟，稍后用 console.timeStamp 桥换算到 trace 时钟）
const evlog = await page.evaluate(() => window.__evlog.slice());
const bridge = await page.evaluate(() => window.__bridge);

const done = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
await cdp.send('Tracing.end');
await done;
cdp.off('Tracing.dataCollected', onEvent);

writeFileSync(OUT, JSON.stringify(traceEvents));

// ── 分析：主线程上 dur > 30ms 的事件，按 dur 降序 ──
const big = traceEvents
  .filter((e) => e.ph === 'X' && e.dur && e.dur > 30000)
  .map((e) => ({
    name: e.name,
    durMs: Math.round(e.dur / 10) / 100,
    ts: e.ts,
    args: e.args
      ? Object.fromEntries(
          Object.entries(e.args)
            .filter(([k]) => ['fileName', 'lineNumber', 'functionName', 'timerId', 'stackTrace', 'beginData', 'endData', 'data'].includes(k))
            .map(([k, v]) => [k, typeof v === 'object' && v ? JSON.stringify(v).slice(0, 200) : String(v).slice(0, 120)]),
        )
      : {},
  }))
  .sort((a, b) => b.durMs - a.durMs);

const byName = {};
for (const e of traceEvents) {
  if (e.ph === 'X' && e.dur) {
    byName[e.name] = byName[e.name] || { n: 0, totalMs: 0, maxMs: 0 };
    byName[e.name].n++;
    byName[e.name].totalMs += e.dur / 1000;
    byName[e.name].maxMs = Math.max(byName[e.name].maxMs, e.dur / 1000);
  }
}

console.log(`\ntrace：${traceEvents.length} 个事件 · ${SECONDS}s 移动 · throttle x${THROTTLE}`);
console.log('\n按类型汇总（总耗时 top 12）：');
for (const [name, s] of Object.entries(byName).sort((a, b) => b[1].totalMs - a[1].totalMs).slice(0, 12)) {
  console.log(`  ${name.padEnd(28)} n=${String(s.n).padStart(5)}  总 ${s.totalMs.toFixed(0)}ms  最大 ${s.maxMs.toFixed(1)}ms`);
}
console.log(`\n主线程 > 30ms 的事件（top 15，共 ${big.length} 个）：`);
for (const e of big.slice(0, 15)) {
  const a = Object.entries(e.args).map(([k, v]) => `${k}=${v}`).join(' ');
  console.log(`  ${String(e.durMs).padStart(8)}ms  ${e.name}${a ? `  ${a}` : ''}`);
}

// ── store 事件 × Layout 事件对齐（console.timeStamp 桥接两个时钟）──
const X = traceEvents.filter((e) => e.ph === 'X' && e.dur);
const bridgeEvent = traceEvents.find(
  (e) => e.name === '__bridge' || (e.args?.data?.name === '__bridge'),
);
const offset = bridgeEvent ? bridgeEvent.ts - bridge * 1000 : 0; // page µs → trace µs
const toTrace = (pageMs) => pageMs * 1000 + offset;
const toPage = (traceUs) => (traceUs - offset) / 1000;
console.log(`\n时钟桥：bridge=${bridge.toFixed(1)}ms traceTs=${bridgeEvent?.ts ?? 'N/A'} offset=${(offset / 1000).toFixed(0)}ms`);
console.log('store 变化事件（bag 总量 / world 数 / log 条数，page 时钟 ms）：');
for (const [t, bag, world, log] of evlog) console.log(`  t=${t.toFixed(0)}ms  bag=${bag} world=${world} log=${log}`);
const bigLayouts = X.filter((e) => e.name === 'Layout' && e.dur > 40000);
console.log('\n大 Layout 与最近一次 store 变化的间隔：');
for (const L of bigLayouts) {
  const before = evlog.filter(([t]) => toTrace(t) <= L.ts);
  const last = before[before.length - 1];
  console.log(
    `  Layout ${(L.dur / 1000).toFixed(1)}ms @t=${toPage(L.ts).toFixed(0)}ms → 距上次 store 变化 ${last ? ((L.ts - toTrace(last[0])) / 1000).toFixed(1) : 'N/A'}ms（bag=${last?.[1]} world=${last?.[2]}）`,
  );
}
console.log(`\ntrace 原件 → ${OUT}`);

await browser.close();
