/**
 * T8 云存档端到端验收（真浏览器 + 真 API + 真 SQLite）。
 *
 * 用法：
 *   1. 起 API：cd apps/api && PORT=8799 pnpm dev
 *   2. 起 web：cd apps/web && ./node_modules/.bin/vite --port 5176
 *   3. node scripts/t8-shots.mjs http://127.0.0.1:5176/ http://127.0.0.1:8799/api
 *
 * 覆盖：
 * A. 玩两下 → 防抖推送真的落到服务端（PUT 200，且 GET 回来进度分 > 0）
 * B. 换设备/丢本地档 → 启动自动从云端拉回，「继续游戏」出现且进度一致
 * C. 云端进度更高 → 启动时采纳云端（progressScore 高者胜）
 * D. 断网 → 前端完全不受影响（不报错、可读档、可游玩）
 * E. 开始页「重新开始」→ 云端旧档不再复活（高分不败规则下的必要处理）
 *
 * 产物：shots/t8-1-synced.png / t8-2-adopted.png / t8-3-offline.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:5176/';
const API = process.argv[3] ?? 'http://127.0.0.1:8799/api';
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

mkdirSync('shots', { recursive: true });

const results = [];
function check(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--hide-scrollbars'],
});

const page = await browser.newPage({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 1 });
const errors = [];
let collectNetErrors = true;
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  // HTTP 层失败由 apiCalls 单独断言（GET 无存档的 404 是 SPEC 规定的正常应答，
  // 浏览器仍会把它记成 console error）。这里只放行网络层噪声，
  // 真正的 JS 异常走 pageerror，不受影响。
  if (/Failed to load resource/i.test(t)) return;
  if (!collectNetErrors && /ERR_FAILED|net::|Failed to fetch/i.test(t)) return;
  errors.push(t);
});

const apiCalls = [];
page.on('response', (r) => {
  const u = r.url();
  if (u.includes('/api/')) apiCalls.push({ method: r.request().method(), url: u, status: r.status() });
});

const store = () => page.evaluate(() => window.__haola.getState());
const deviceId = () => page.evaluate(() => localStorage.getItem('haola.device'));
const hasLocalSave = () => page.evaluate(() => localStorage.getItem('haola.save.v2') !== null);
const hasContinueBtn = () => page.getByRole('button', { name: '继续游戏' }).count().then((n) => n > 0);

async function cloudGet(id) {
  const res = await fetch(`${API}/saves/me`, { headers: { 'X-Device-Id': id } });
  if (!res.ok) return { status: res.status, body: null };
  return { status: res.status, body: await res.json() };
}

async function cloudPut(id, state) {
  const res = await fetch(`${API}/saves/me`, {
    method: 'PUT',
    headers: { 'X-Device-Id': id, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state,
      schemaVersion: state.schemaVersion,
      clientUpdatedAt: new Date().toISOString(),
    }),
  });
  return { status: res.status, body: await res.json() };
}

// ── 0. 干净开局 ──
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
apiCalls.length = 0;
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
check('干净环境：无「继续游戏」按钮', (await hasContinueBtn()) === false);
check('启动即拉取云端（GET /saves/me 打到服务端）',
  apiCalls.some((c) => c.method === 'GET' && c.url.includes('/api/saves/me')),
  JSON.stringify(apiCalls.filter((c) => c.url.includes('/api/')).slice(0, 3)));

// ── A. 玩两下 → 推送落地 ──
await page.getByRole('button', { name: /开始游戏|重新开始/ }).click();
await page.waitForTimeout(700);
await page.evaluate(() => {
  const s = window.__haola.getState();
  for (const it of s.world.slice(0, 3)) s.collect(it.uid);
});
await page.waitForTimeout(3000); // 防抖 1.5s + 网络往返

const id = await deviceId();
check('本地生成并持久化匿名设备 ID', typeof id === 'string' && id.length >= 32, String(id).slice(0, 8) + '…');
const local = await store();
const putCalls = apiCalls.filter((c) => c.method === 'PUT' && c.url.includes('/api/saves/me'));
check('拾取触发 PUT /saves/me 且 200', putCalls.length > 0 && putCalls.every((c) => c.status === 200),
  putCalls.map((c) => c.status).join(','));

const c1 = await cloudGet(id);
check('云端确有存档（GET 200）', c1.status === 200 && !!c1.body, `status=${c1.status}`);
check('云端进度分 > 0 且与本地一致',
  c1.body?.progressScore > 0 && c1.body?.progressScore === local.save.stage * 10000 + local.save.stepIndex * 1000 + local.save.day,
  `cloud=${c1.body?.progressScore} local.day=${local.save.day} bag=${JSON.stringify(local.save.bag)}`);
await page.screenshot({ path: 'shots/t8-1-synced.png' });

// ── B. 丢本地档（模拟换设备/清缓存）→ 启动拉回 ──
await page.evaluate(() => localStorage.removeItem('haola.save.v2'));
check('已清掉本地存档（仅保留 deviceId）', (await hasLocalSave()) === false);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
check('启动后本地档被云端补回', (await hasLocalSave()) === true);
check('「继续游戏」按钮出现（云端档被采纳）', (await hasContinueBtn()) === true);
await page.getByRole('button', { name: '继续游戏' }).click();
await page.waitForTimeout(700);
const adopted = await store();
check('读回进度与云端一致',
  adopted.save.day === c1.body.state.day && adopted.save.bag.tape === c1.body.state.bag.tape,
  `day=${adopted.save.day} bag=${JSON.stringify(adopted.save.bag)}`);
check('引导状态随云档一起还原（老档不重放）', adopted.save.tutorial.step === c1.body.state.tutorial.step);

// ── C. 云端进度更高 → 启动采纳云端 ──
const higher = JSON.parse(JSON.stringify(c1.body.state));
higher.stage = 2;
higher.day = 9;
const put = await cloudPut(id, higher);
check('服务端接受更高进度（PUT 200）', put.status === 200 && put.body.state.stage === 2, `score=${put.body?.progressScore}`);
await page.evaluate(() => localStorage.removeItem('haola.save.v2'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const merged = await store();
check('本地进度低 → 启动采纳云端（stage=2）', merged.save.stage === 2, `stage=${merged.save.stage} day=${merged.save.day} day`);
check('采纳后 Toast 提示已同步', merged.toast?.title === '已从云端同步', JSON.stringify(merged.toast));
await page.screenshot({ path: 'shots/t8-2-adopted.png' });

// ── D. 断网 → 前端不受影响 ──
collectNetErrors = false;
await page.route('**/api/**', (route) => route.abort());
await page.evaluate(() => localStorage.removeItem('haola.save.v2'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1800);
check('断网时开始页正常渲染', (await page.locator('.start__title').textContent()) === '好垃');
// 本地档已被清，云端又拉不到 → 应该还能正常开新档
await page.getByRole('button', { name: /开始游戏|重新开始/ }).click();
await page.waitForTimeout(800);
const offlineState = await store();
check('断网仍可开局并游玩', offlineState.screen === 'game' && offlineState.world.length > 0,
  `world=${offlineState.world.length}`);
await page.evaluate(() => {
  const s = window.__haola.getState();
  const it = s.world[0];
  if (it) s.collect(it.uid);
});
await page.waitForTimeout(400);
const afterOffline = await store();
check('断网时拾取照常入包', Object.values(afterOffline.save.bag).reduce((a, b) => a + b, 0) >= 1);
await page.screenshot({ path: 'shots/t8-3-offline.png' });
await page.unroute('**/api/**');
collectNetErrors = true;

// ── E. 重新开始 → 云端旧档不复活 ──
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: /重新开始|开始游戏/ }).click();
await page.waitForTimeout(2500);
const c2 = await cloudGet(id);
check('「重新开始」后云端进度归零（不复活旧档）',
  c2.status === 404 || (c2.body?.state.stage === 1 && c2.body?.state.day === 1),
  `status=${c2.status} stage=${c2.body?.state.stage} day=${c2.body?.state.day}`);

// ── 收尾 ──
check('全程无前端运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} 通过`);
if (passed !== results.length) process.exitCode = 1;
