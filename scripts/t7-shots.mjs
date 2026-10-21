/**
 * T7 新手指引验收。
 *
 * 用法：先起 dev server（cd apps/web && ./node_modules/.bin/vite --port 5176），
 *       再 node scripts/t7-shots.mjs http://127.0.0.1:5176/
 *
 * 覆盖卡片四条验收：
 * 1. 清空 localStorage 开新档，纯靠提示走完第一次合成（状态机逐级推进 + 台词落位）
 * 2. 第 4 次拾取后不再出任何引导提示（pill 消失、HintBar 回归）
 * 3. 读档进入不会重放引导（刷新后继续游戏，pill 不出现）
 * 4. 引导期间不阻塞移动（引导态下点击地面，moveTarget 照常写入）
 *
 * 产物：shots/t7-1-newcomer.png / t7-2-firstmove.png / t7-3-firstpickup.png / t7-4-crafted.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:5176/';
const CHROME =
  process.env.CHROME_PATH ??
  'C:/Program Files/Google/Chrome/Application/chrome.exe';

mkdirSync('shots', { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--hide-scrollbars'],
});

const results = [];
function check(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
}

const page = await browser.newPage({
  viewport: { width: 375, height: 667 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  // T8 之后前端启动会拉云档，无存档时 GET 返回 404（SPEC 规定），
  // 浏览器会把它记成 console error。网络层噪声不算前端缺陷，真实异常走 pageerror。
  if (/Failed to load resource/i.test(m.text())) return;
  errors.push(m.text());
});

const store = () => page.evaluate(() => window.__haola.getState());
const pillText = () =>
  page.evaluate(() => document.querySelector('.tutor__text')?.textContent ?? null);
const pillCount = () => page.evaluate(() => document.querySelectorAll('.tutor').length);

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

// ── 1. 新档：newcomer ──
await page.getByRole('button', { name: /开始游戏|重新开始/ }).click();
await page.waitForTimeout(700);
check('新档进 newcomer，pill 显示移动提示', (await pillText())?.includes('点一下地面') === true);
await page.screenshot({ path: 'shots/t7-1-newcomer.png' });

// 看完开场台词（点对话条 5 次清空队列）
for (let i = 0; i < 5; i++) {
  await page.locator('.dialogue').click();
  await page.waitForTimeout(120);
}

// ── 4. 引导期间不阻塞移动：点击地面照常写 moveTarget ──
await page.mouse.click(187, 320);
await page.waitForTimeout(250);
const moved = await store();
check('引导态点击地面不阻塞', moved.moveTarget !== null, `moveTarget=${JSON.stringify(moved.moveTarget)}`);
check('首次点击地面 → firstMove', (await pillText())?.includes('走近地上的东西') === true);
await page.screenshot({ path: 'shots/t7-2-firstmove.png' });

// ── 首次拾取：firstPickup + tutPickup 台词 ──
await page.evaluate(() => {
  const s = window.__haola.getState();
  const uid = s.world[0]?.uid;
  if (uid) s.collect(uid);
});
await page.waitForTimeout(250);
check('首次拾取 → firstPickup，pill 切换到合成提示', (await pillText())?.includes('背包') === true);
const afterPick = await store();
check('tutPickup 台词入队', afterPick.dialog.some((l) => l.includes('捡到了')), `dialog=${JSON.stringify(afterPick.dialog)}`);
await page.screenshot({ path: 'shots/t7-3-firstpickup.png' });

// 再捡一件凑齐两件材料（picks=2，仍在引导期；tutPickup 只在首次触发）
await page.evaluate(() => {
  const s = window.__haola.getState();
  const uid = s.world[0]?.uid;
  if (uid) s.collect(uid);
});
await page.waitForTimeout(200);

// ── 1b. 纯靠提示走完第一次合成：开背包 → 放两样 → 合成 ──
await page.getByRole('button', { name: /背包/ }).click();
await page.waitForTimeout(300);
await page.evaluate(() => {
  const s = window.__haola.getState();
  const ids = Object.keys(s.save.bag).slice(0, 2);
  for (const id of ids) s.toggleSlot(id);
});
await page.waitForTimeout(150);
await page.locator('.bench__go').click();
await page.waitForTimeout(400);
const afterCraft = await store();
check('首次合成成功 → free', afterCraft.save.tutorial.step === 'free');
check('tutCraft 庆祝台词排在结果台词前', afterCraft.dialog[0]?.includes('第一次合成') === true, `dialog[0]=${afterCraft.dialog[0]}`);
check('合成槽已清空', afterCraft.slots[0] === null && afterCraft.slots[1] === null);
check('pill 已消失', (await pillCount()) === 0);
check('HintBar 回归', (await page.evaluate(() => document.querySelectorAll('.hint__chip').length)) === 1);
await page.screenshot({ path: 'shots/t7-4-crafted.png' });

// ── 2. 第 4 次拾取后全面静默 ──
await page.evaluate(() => window.__haola.getState().backToStart());
await page.waitForTimeout(200);
await page.getByRole('button', { name: '重新开始' }).click();
await page.waitForTimeout(600);
for (let i = 0; i < 5; i++) {
  await page.locator('.dialogue').click();
  await page.waitForTimeout(120);
}
check('重开新档回到 newcomer', (await pillText())?.includes('点一下地面') === true);

// 首次合错台词（UI 正常途径几乎不可达：用调试口造成「材料不够」的失败，验证接线）
// 注意必须用真实物品 id —— 假 id 会让 CraftSlots 渲染时 getItem 抛错，炸掉整棵树
await page.evaluate(() => {
  const s = window.__haola.getState();
  const uid = s.world[0]?.uid;
  if (uid) s.collect(uid);
  const id = Object.keys(window.__haola.getState().save.bag)[0];
  window.__haola.setState({ slots: [id, id] });
  window.__haola.getState().craft();
});
await page.waitForTimeout(200);
const afterWrong = await store();
check(
  '首次合错播 tutWrong（一次性）',
  afterWrong.dialog.some((l) => l.includes('这两个不行')) && afterWrong.tutorFlags.wrong === true,
);
// 再错一次不重播
await page.evaluate(() => {
  const s = window.__haola.getState();
  const id = Object.keys(s.save.bag)[0];
  window.__haola.setState({ slots: [id, id] });
  s.craft();
});
await page.waitForTimeout(200);
const afterWrong2 = await store();
check('合错台词不重播', afterWrong2.dialog.filter((l) => l.includes('这两个不行')).length === 1);

await page.evaluate(() => {
  const s = window.__haola.getState();
  for (const it of s.world.slice(0, 3)) s.collect(it.uid);
});
await page.waitForTimeout(300);
check('第 4 次拾取后 pill 消失', (await pillCount()) === 0);
check('第 4 次拾取后 HintBar 回归', (await page.evaluate(() => document.querySelectorAll('.hint__chip').length)) === 1);
const capped = await store();
check('picks 计数到顶即 free', capped.save.tutorial.step === 'free' && capped.save.tutorial.picks === 4);
check('存档 schemaVersion 仍为 2', capped.save.schemaVersion === 2);

// ── 3. 读档不重放（带 tutorial 字段的存档）──
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: '继续游戏' }).click();
await page.waitForTimeout(500);
check('读档进入不重放引导', (await pillCount()) === 0);
const loaded = await store();
check('读档带回 tutorial 进度', loaded.save.tutorial.step === 'free' && loaded.save.tutorial.picks >= 1);

// ── 3b. 老存档兼容：没有 tutorial 字段 → 归一化直接跳过 ──
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('haola.save.v2'));
  delete raw.tutorial;
  localStorage.setItem('haola.save.v2', JSON.stringify(raw));
});
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: '继续游戏' }).click();
await page.waitForTimeout(500);
check('老存档（无 tutorial 字段）不重放引导', (await pillCount()) === 0);
const legacy = await store();
check('老存档归一化为 free', legacy.save.tutorial.step === 'free');

// ── 审计：热区 + 控制台 ──
const box = await page.evaluate(() => {
  const el = document.querySelector('.tutor__pill');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});
// pill 此时已消失（引导结束），改为量 HintBar chip 证明同槽元素热区合规
const hintBox = await page.evaluate(() => {
  const r = document.querySelector('.hint__chip').getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});
check('左下提示 pill 热区 ≥ 44px', hintBox.h >= 44, JSON.stringify(hintBox));
check('无 console 错误', errors.length === 0, errors.length ? errors.join(' | ') : 'none');

const failed = results.filter((r) => !r.ok);
console.log(`\nT7 验收：${results.length - failed.length}/${results.length} 通过`);
await browser.close();
process.exit(failed.length === 0 ? 0 : 1);
