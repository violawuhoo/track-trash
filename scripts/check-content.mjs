/**
 * 内容健康检查 —— T6 的验收工具。
 *
 * 用途：手算「有没有孤立物品」「某个标签是不是只有一个来源」很容易漏，
 * 尤其在批量新增 25 件物品之后。这个脚本一次说清三件事：
 *
 *   A. **孤立物品**：既不在任何区域池（捡不到），又没有任何配方/阶段目标用到（用不上）
 *   B. **单来源标签**：某个标签在「捡得到的物品」里只有 1 件 —— 这会触发硬保底，
 *      保底点刷出来就等于"只有一条命"，玩家用掉之后必然卡住
 *   C. **分布统计**：物品按区域/按 kind/按颜色的分布，扩容后要人工看一眼是否失衡
 *
 * 零依赖（只用 node 内置模块），与 `check-assets.mjs` 同一套做法：正则读 TS 源码。
 * **不要改成 import game-core** —— 那是 TS，没有 .ts 运行时，加 esbuild 会破坏零依赖约定。
 *
 * 用法：`node scripts/check-content.mjs`
 * 任一断言失败 `exit 1`。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/**
 * 把 `{ id: 'x', ... }` 字面量抠出来。
 * 只处理本项目实际用到的单行/多行对象写法，不求通用 TS 解析。
 *
 * @param key 靠这个字段定位对象。物品用 `id`，配方没有 `id`
 *            （写法是 `{ a, b, out }`），所以配方用 `a` 定位。
 */
function objects(src, startMarker, key = 'id') {
  const from = src.indexOf(startMarker);
  if (from < 0) return [];
  const body = src.slice(from);
  const out = [];
  const re = new RegExp(`\\{\\s*${key}:\\s*'([^']+)'(.*?)\\}`, 'gs');
  let m;
  while ((m = re.exec(body)) !== null) {
    out.push({ id: m[1], rest: m[2] });
  }
  return out;
}

const str = (rest, key) => {
  const m = new RegExp(`${key}:\\s*'([^']*)'`).exec(rest);
  return m ? m[1] : undefined;
};
const arr = (rest, key) => {
  const m = new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`).exec(rest);
  if (!m) return [];
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
};

// ───────────────────────── 读数据 ─────────────────────────
const items = objects(read('packages/game-core/src/items.ts'), 'export const ITEMS').map((o) => ({
  id: o.id,
  name: str(o.rest, 'name'),
  kind: str(o.rest, 'kind'),
  area: str(o.rest, 'area'),
  color: str(o.rest, 'color'),
  tags: arr(o.rest, 'tags'),
}));

/** 配方没有 `id` 字段，靠 `a` 定位对象，`a` 本身也作为第一件材料 */
const recipes = objects(read('packages/game-core/src/recipes.ts'), 'export const RECIPES', 'a').map((o) => ({
  a: o.id,
  b: str(o.rest, 'b'),
  out: str(o.rest, 'out'),
}));

const fail = [];
const ok = [];

// ───────────────────────── A. 孤立物品 ─────────────────────────
const used = new Set();
for (const r of recipes) for (const id of [r.a, r.b, r.out]) if (id) used.add(id);

/** 区域池直接由 `i.area` 推导（`AREA_POOLS` 就是 filter 出来的），不必再解析一次 */
const inPool = new Set(items.filter((i) => i.area).map((i) => i.id));

/**
 * 「孤立」只对**可参与合成的物品**成立，下面三类是设计上就允许无去处的：
 *  - `accident`  没有精确配方时的兜底产物，拿去继续合成（属于可再生的意外产物）
 *  - `keepsake` 纪念品，只陈列不参与合成
 *  - `mid`/`ship`/`commission` 由阶段目标或支线消费，它们若既不在池里也没被用到才是真问题
 *
 * 真正要抓的是：`base`（基础物品，本该能在区域里捡到）和任何无 kind 的条目。
 */
const mayBeUnreferenced = new Set(['accident', 'keepsake']);
const orphans = items.filter(
  (i) => !inPool.has(i.id) && !used.has(i.id) && !mayBeUnreferenced.has(i.kind),
);
if (orphans.length === 0) ok.push('A 无孤立物品');
else fail.push(`A 孤立物品 ${orphans.length} 件：${orphans.map((i) => `${i.id}(${i.name})`).join(', ')}`);

// ───────────────────────── B. 单来源标签 ─────────────────────────
/** 只统计捡得到的物品：硬保底只看区域池，池外的标签再多也不算数 */
const byTag = new Map();
for (const i of items) {
  if (!inPool.has(i.id)) continue;
  for (const t of i.tags) byTag.set(t, (byTag.get(t) ?? 0) + 1);
}
const single = [...byTag.entries()].filter(([, n]) => n < 2);
if (single.length === 0) ok.push('B 每个标签至少 2 个来源');
else fail.push(`B 单来源标签 ${single.length} 个：${single.map(([t, n]) => `${t}×${n}`).join(', ')}`);

// ───────────────────────── C. 分布统计 ─────────────────────────
const tally = (key) =>
  items.reduce((m, i) => (i[key] ? ((m[i[key]] = (m[i[key]] ?? 0) + 1), m) : m), {});

console.log(`\n内容检查 · ${items.length} 件物品 / ${recipes.length} 条配方 / ${byTag.size} 个标签\n`);
for (const l of ok) console.log(`  ✓ ${l}`);
for (const l of fail) console.log(`  ✗ ${l}`);
console.log('\n  区域分布:', tally('area'));
console.log('  kind 分布:', tally('kind'));
console.log('  颜色分布:', tally('color'));
console.log('  来源最少的标签:', [...byTag].sort((a, b) => a[1] - b[1]).slice(0, 8));

if (fail.length) {
  console.log(`\n✗ ${fail.length} 项不达标\n`);
  process.exit(1);
}
console.log('\n✓ 全部通过\n');