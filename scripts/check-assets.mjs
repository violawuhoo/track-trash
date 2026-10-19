#!/usr/bin/env node
/**
 * 资产一致性校验 —— 零依赖，只用 node 内置模块。
 *
 *   node scripts/check-assets.mjs
 *
 * 四条断言，任一失败 `exit 1` 并打差异表：
 *
 * | 断言 | 内容 | 为什么必须有 |
 * |---|---|---|
 * | A | `PALETTE` / `ALPHA` 与 `tokens.css` 的 `:root` 逐键相等 | CSS 变量进不了 SVG 纹理，色值有第二份拷贝。不同步 = 背包图标和地面贴纸不同色 |
 * | B | `items.ts` 的每个 `icon:` 在 `SHAPE_OF` 有键 | v1 就是这条断了：93 个键里 56 个是物品 id，7 件物品落进 `blob` |
 * | C | 没有孤立形状（每个 `ShapeName` 至少被 1 件物品用到） | 孤立形状 = 画了没人用，或改表时漏改，通常是撞脸拆分的后遗症 |
 * | D | 60 件物品的 (形状, 颜色) 组合数 = 60 | 两件物品长得一样，玩家就无法用视觉区分背包 |
 *
 * 契约：`docs/CONTRACT-v2.md` §5.2。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = {
  tokens: 'apps/web/src/styles/tokens.css',
  palette: 'apps/web/src/world/assets/palette.ts',
  icon: 'apps/web/src/components/ItemIcon.tsx',
  items: 'packages/game-core/src/items.ts',
};

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// ───────────────────────────── 解析工具 ─────────────────────────────

/** 去掉 CSS 注释，避免注释里的 `--xxx` 被当成声明 */
const stripCssComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '');

/** 从 `anchor` 之后的第一个 `{` 开始做花括号配对，返回内部文本 */
function objectBody(src, anchor) {
  const at = src.indexOf(anchor);
  if (at < 0) throw new Error(`找不到锚点：${anchor}`);
  const open = src.indexOf('{', at + anchor.length - 1);
  if (open < 0) throw new Error(`锚点后没有 {：${anchor}`);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error(`花括号未闭合：${anchor}`);
}

/** `:root { --a: b; }` → Map('--a' → 'b') */
function parseRootTokens(css) {
  const body = objectBody(stripCssComments(css), ':root');
  const map = new Map();
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    map.set(m[1], m[2].trim());
  }
  return map;
}

/** TS 对象字面量 → Map（只取 `key: 'value'` 形式） */
function parseStringEntries(src, anchor) {
  const body = objectBody(src, anchor);
  const map = new Map();
  for (const m of body.matchAll(/([A-Za-z][\w]*)\s*:\s*'([^']*)'/g)) {
    map.set(m[1], m[2]);
  }
  return map;
}

const camelToKebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** #ABC → #aabbcc；rgba(26, 26, 26, .35) → rgba(26,26,26,0.35) */
function normalizeColor(raw) {
  let v = String(raw).trim().toLowerCase().replace(/\s+/g, '');
  if (/^#[0-9a-f]{3}$/.test(v)) {
    v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  v = v.replace(/^rgba?\(/, 'rgba(').replace(/,\./g, ',0.');
  return v;
}

/**
 * 一层别名解析：`var(--paper)` → `--paper` 的值。
 * 只允许一层（`--planet → --paper`、`--space → --cream-deep`）。
 * 第二层直接报错——那是"别名套别名"，改一个色会漏改另一个。
 */
function resolveToken(rawValue, tokens, trail = []) {
  const v = rawValue.trim();
  const alias = /^var\(\s*(--[a-z0-9-]+)\s*\)$/.exec(v);
  if (!alias) return { value: v, trail };
  const name = alias[1];
  if (!tokens.has(name)) throw new Error(`别名指向不存在的令牌：${name}`);
  const next = tokens.get(name);
  if (/^var\(/.test(next.trim())) {
    throw new Error(
      `疑似二层别名：${trail[0] ?? name} → ${name} → ${next.trim()}（请把中间层拍平）`,
    );
  }
  return { value: next, trail: [...trail, name] };
}

// ───────────────────────────── 摘取数据 ─────────────────────────────

const tokens = parseRootTokens(read(FILES.tokens));
const paletteTs = read(FILES.palette);
const PALETTE = parseStringEntries(paletteTs, 'export const PALETTE =');
const ALPHA = parseStringEntries(paletteTs, 'export const ALPHA =');

const iconTs = read(FILES.icon);
const SHAPES = new Set(
  [...objectBody(iconTs, 'const SHAPES: Record<ShapeName, ShapeFn> =').matchAll(
    /^\s{2}([A-Za-z][\w]*):\s*\(/gm,
  )].map((m) => m[1]),
);
const SHAPE_OF = new Map(
  [...objectBody(iconTs, 'const SHAPE_OF: Record<string, ShapeName> =').matchAll(
    /^\s{2}'?([A-Za-z][\w-]*)'?:\s*'([A-Za-z][\w]*)',\s*$/gm,
  )].map((m) => [m[1], m[2]]),
);

const ITEMS = read(FILES.items)
  .split('\n')
  .filter((line) => /\bicon:\s*'/.test(line) && /\bid:\s*'/.test(line))
  .map((line) => ({
    id: /\bid:\s*'([^']+)'/.exec(line)[1],
    color: /\bcolor:\s*'([^']+)'/.exec(line)[1],
    icon: /\bicon:\s*'([^']+)'/.exec(line)[1],
  }));

/** 物品最终落到的形状（与 ItemIcon.shapeFor 同逻辑：icon 优先，未知 → blob） */
const shapeOfItem = (item) => SHAPE_OF.get(item.icon) ?? 'blob';
const tintOfItem = (item) => item.color;

// ───────────────────────────── 断言 ─────────────────────────────

const failures = [];
const fail = (title, rows, hint) => failures.push({ title, rows, hint });

/** A：色值镜像 */
function checkColors() {
  const rows = [];
  const groups = [
    ['PALETTE', PALETTE],
    ['ALPHA', ALPHA],
  ];
  for (const [groupName, entries] of groups) {
    for (const [key, value] of entries) {
      const tokenName = `--${camelToKebab(key)}`;
      const raw = tokens.get(tokenName);
      if (raw === undefined) {
        rows.push([`${groupName}.${key}`, value, '（tokens.css 无此令牌）', tokenName]);
        continue;
      }
      let resolved;
      try {
        resolved = resolveToken(raw, tokens).value;
      } catch (err) {
        rows.push([`${groupName}.${key}`, value, `别名错误：${err.message}`, tokenName]);
        continue;
      }
      if (normalizeColor(resolved) !== normalizeColor(value)) {
        rows.push([`${groupName}.${key}`, normalizeColor(value), normalizeColor(resolved), tokenName]);
      }
    }
  }
  if (rows.length) {
    fail(
      'A · 色值镜像与 tokens.css 不一致',
      rows,
      '改色必须两边同时改：tokens.css 是唯一真源，palette.ts 是给纹理用的字面 hex 镜像。',
    );
  }
  return rows.length === 0;
}

/** B：每个 item.icon 都能查到形状；且查到的形状真实存在 */
function checkIconCoverage() {
  const rows = [];
  for (const item of ITEMS) {
    const shape = SHAPE_OF.get(item.icon);
    if (!shape) {
      rows.push([item.id, item.icon, '（SHAPE_OF 无此键）', '→ blob']);
    } else if (!SHAPES.has(shape)) {
      rows.push([item.id, item.icon, shape, '（SHAPES 里没有这个形状）']);
    }
  }
  if (rows.length) {
    fail(
      `B · ${rows.length} 件物品的 icon 查不到形状`,
      rows,
      'SHAPE_OF 的键必须是 item.icon（不是物品 id）。新增物品时两件事一起做：加 icon 名 + 加形状。',
    );
  }
  return rows.length === 0;
}

/** C：无孤立形状 */
function checkNoOrphanShape() {
  const used = new Set(ITEMS.map(shapeOfItem));
  const orphans = [...SHAPES].filter((s) => !used.has(s)).sort();
  if (orphans.length) {
    fail(
      `C · ${orphans.length} 个形状没有任何物品使用`,
      orphans.map((s) => [s, '—', '—', '孤立形状']),
      '要么把它分给某件物品，要么删掉路径。孤立形状会让后来的人以为它还被用着。',
    );
  }
  return orphans.length === 0;
}

/** D：60 件物品 → 60 个 (形状, 颜色) 组合 */
function checkDistinctLook() {
  const byCombo = new Map();
  for (const item of ITEMS) {
    const combo = `${shapeOfItem(item)} / ${tintOfItem(item)}`;
    if (!byCombo.has(combo)) byCombo.set(combo, []);
    byCombo.get(combo).push(item.id);
  }
  const clashes = [...byCombo.entries()].filter(([, ids]) => ids.length > 1);
  const unique = byCombo.size;
  if (unique !== ITEMS.length) {
    const rows = clashes.flatMap(([combo, ids]) => [
      [combo, `${ids.length} 件`, ids.join(' / '), '撞脸'],
    ]);
    fail(
      `D · 组合数 ${unique}/${ITEMS.length}，${clashes.length} 组撞脸`,
      rows,
      '同形状 + 同颜色 = 玩家看不出区别。拆法：给其中一件换形状（优先）或换色（要经文策渊）。' +
        '如果两件物品的 icon 和 color 完全相同，在 SHAPE_OF 里无解——必须改 items.ts 的 icon。',
    );
  }
  return unique === ITEMS.length;
}

// ───────────────────────────── 输出 ─────────────────────────────

const PAD = (s, n) => String(s).padEnd(n, ' ');
function printTable(rows) {
  const widths = [0, 1, 2, 3].map((i) => Math.max(...rows.map((r) => String(r[i] ?? '').length)));
  for (const r of rows) {
    console.log('    ' + r.map((cell, i) => PAD(cell ?? '', widths[i])).join('  '));
  }
}

function main() {
  // 解析自检：数据都没读到就不用往下比了
  const guard = [
    ['tokens.css 的 :root 令牌', tokens.size, 90],
    ['palette.ts PALETTE 项', PALETTE.size, 12],
    ['palette.ts ALPHA 项', ALPHA.size, 4],
    ['ItemIcon SHAPES 形状', SHAPES.size, 39],
    ['ItemIcon SHAPE_OF 键', SHAPE_OF.size, 59],
    ['items.ts 物品', ITEMS.length, 60],
  ];
  const thin = guard.filter(([, got, min]) => got < min);
  if (thin.length) {
    console.error('\n✗ 解析失败：源文件格式变了，正则读不到。下面这些数量不足：');
    for (const [name, got, min] of thin) console.error(`    ${name}: ${got}（至少 ${min}）`);
    process.exit(1);
  }

  console.log(
    `\n资产校验 · ${ITEMS.length} 件物品 / ${SHAPES.size} 个形状 / ${SHAPE_OF.size} 个 icon 键 / ${tokens.size} 个令牌\n`,
  );

  const results = [checkColors(), checkIconCoverage(), checkNoOrphanShape(), checkDistinctLook()];
  const labels = ['A 色值镜像', 'B icon 覆盖', 'C 无孤立形状', 'D 视觉可区分'];

  results.forEach((ok, i) => console.log(`  ${ok ? '✓' : '✗'} ${labels[i]}`));

  if (failures.length) {
    for (const { title, rows, hint } of failures) {
      console.error(`\n✗ ${title}\n`);
      printTable(rows);
      console.error(`\n  → ${hint}`);
    }
    console.error(`\n✗ 校验未通过（${failures.length} 项）\n`);
    process.exit(1);
  }

  console.log(`\n✓ 全部通过：色值同源、${ITEMS.length} 件物品形状齐全且互不撞脸\n`);
}

main();
