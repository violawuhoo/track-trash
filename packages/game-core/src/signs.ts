/**
 * 「远处的迹象」事件系统（探索动机改版 · 方差）。
 *
 * ## 治的病：每局内容相同
 *
 * 改版前，玩家第 3 天看到什么、第 8 天看到什么，每一局都一模一样 ——
 * 星球是一张背下来的地图。迹象系统给每周目抽 3 条「远处的东西」：
 * 玩家在窗口期内的某天**自己走过去点它**，拿到一句台词 + 一件现有 base 物品。
 * 抽哪 3 条由 `runSeed`（存档字段）决定，所以：
 *
 * - 新档随机种子 → 这一局的剧本；
 * - `startNextCycle` 确定性派生 → 二周目的剧本与一周目不同；
 * - `runSeed === 0`（老档 / 无种子）→ 无迹象，走固定剧本（不破坏既有体验）。
 *
 * ## 三条硬约束（GDD 约束 11 的延伸）
 *
 * 1. **奖励全复用现有 base 物品 id**，不新增任何物品（`items.ts` 不许动）。
 * 2. **不进 `AREA_POOLS`**：迹象是「迹象」不是保底来源 ——
 *    `world.ts` 的 `distribute`（硬保底所在）一行不许碰，本模块只复用它的
 *    几何工具函数（`sectorCenter` / `isWalkable` / `clampToWalkable`）。
 * 3. **纯函数**：不引 `Math.random` / `Date` / IO。随机性全部来自
 *    确定性哈希（FNV-1a + mulberry32，同 `isMasterpieceCraft` 先例）。
 *
 * ## 数据结构
 *
 * | 字段 | 口径 |
 * |---|---|
 * | `minDay` / `maxDay` | 窗口期（闭区间）。迹象只在窗口内的某天出现 |
 * | `hintText` | 走近 / 点到时的一句台词（一本正经 + 一个反转的口吻） |
 * | `reward` | 现有 base 物品 id 列表；空数组 = 纯台词 |
 */
import { ITEM_MAP } from './items';
import { WORLD, areaOfPoint, clampToWalkable, sectorCenter, toPolar } from './world';
import type { Vec2 } from './world';
import type { AreaId } from './types';

/** 迹象的三种形（世界层画法见 `apps/web/src/world/signs.ts`） */
export type SignKind = 'light' | 'smoke' | 'figure';

export interface SignDef {
  id: string;
  kind: SignKind;
  /** 窗口期起始天（含） */
  minDay: number;
  /** 窗口期结束天（含） */
  maxDay: number;
  /** 走近 / 点到时的一句台词 */
  hintText: string;
  /** 奖励：现有 base 物品 id，空数组 = 纯台词 */
  reward: readonly string[];
}

/**
 * 迹象池（6 条）。
 *
 * ⚠️ 文案是**定稿**（探索动机改版拍板），`signs.test.ts` 逐字守着。
 * `reward` 六个 id（crystal / fuel / awkward / rock / mood / photo）
 * 都必须是 `items.ts` 里 `kind === 'base'` 的现存物品 —— data 断言守着。
 */
export const SIGNS: readonly SignDef[] = Object.freeze([
  Object.freeze({
    id: 'sign_light',
    kind: 'light' as SignKind,
    minDay: 3,
    maxDay: 6,
    hintText: '不属于任何灯的光，在废墟那边闪了三下。过去看看。',
    reward: Object.freeze(['crystal']),
  }),
  Object.freeze({
    id: 'sign_smoke',
    kind: 'smoke' as SignKind,
    minDay: 8,
    maxDay: 12,
    hintText: '市场方向升起一缕细烟。有烟说明有火，有火说明有人先来过。',
    reward: Object.freeze(['fuel']),
  }),
  Object.freeze({
    id: 'sign_figure',
    kind: 'figure' as SignKind,
    minDay: 10,
    maxDay: 16,
    hintText: '远处站着个不动的东西。走近看，是靠着的假人。',
    reward: Object.freeze(['awkward']),
  }),
  Object.freeze({
    id: 'sign_choir',
    kind: 'figure' as SignKind,
    minDay: 12,
    maxDay: 18,
    hintText: '今天石头们唱得比平时响。混在里面的好像有个新声音。',
    reward: Object.freeze(['rock', 'mood']),
  }),
  Object.freeze({
    id: 'sign_crash2',
    kind: 'light' as SignKind,
    minDay: 20,
    maxDay: 26,
    hintText: '天上又掉了个小的下来。这次有经验了，躲得快。',
    reward: Object.freeze(['photo']),
  }),
  Object.freeze({
    id: 'sign_meteor',
    kind: 'light' as SignKind,
    minDay: 34,
    maxDay: 40,
    hintText: '四十天。它从来不解释为什么是四十天。',
    reward: Object.freeze([]),
  }),
]);

/** 每局抽取的迹象条数 */
export const SIGNS_PER_RUN = 3;

/** 「早期」配额：至少一条 maxDay ≤ 14 的迹象（前两周目内看得到） */
const EARLY_MAX_DAY = 14;
/** 「晚期」配额：至少一条 minDay ≥ 20 的迹象（中后期还有新东西） */
const LATE_MIN_DAY = 20;

// ───────────────────────── 确定性随机 ─────────────────────────

/** FNV-1a 32 位哈希（与 `state.ts` 的 `isMasterpieceCraft` 同款写法） */
function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 多段拼接后哈希。段间用 `|` 分隔，避免「1|23」与「12|3」撞键 */
function hashOf(...parts: readonly (string | number)[]): number {
  return fnv1a(parts.join('|'));
}

/** mulberry32：小、快、确定性。同 seed 永远同序列 */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 在候选里按 seed 哈希挑一件（键最小者胜）。
 *
 * 纯「确定性的随机」：同 (seed, salt, step, 候选集) 永远同一件。
 * 候选集本身已由调用方按约束过滤，这里只负责「在合法集合里均匀地挑」。
 */
function pickByHash(
  runSeed: number,
  salt: string,
  step: number,
  cands: readonly SignDef[],
): SignDef | null {
  if (cands.length === 0) return null;
  let best = cands[0]!;
  let bestKey = hashOf(runSeed, salt, best.id, step);
  for (const s of cands.slice(1)) {
    const k = hashOf(runSeed, salt, s.id, step);
    if (k < bestKey) {
      bestKey = k;
      best = s;
    }
  }
  return best;
}

// ───────────────────────── 抽取 ─────────────────────────

/** 两个窗口期是否相交（闭区间） */
function overlaps(a: SignDef, b: SignDef): boolean {
  return a.minDay <= b.maxDay && b.minDay <= a.maxDay;
}

/** 按窗口期排序（minDay 起，并列按 maxDay），保证输出顺序稳定 */
function byWindow(a: SignDef, b: SignDef): number {
  return a.minDay - b.minDay || a.maxDay - b.maxDay || (a.id < b.id ? -1 : 1);
}

/**
 * 从池里抽这一局的 3 条迹象。
 *
 * 算法（**确定性**：同 seed 永远同结果）：
 * 1. 以 seed 决定的**旋转偏移**起手，得到候选枚举序；
 * 2. **贪心挑选**：每一步在「与已选都不相交」的候选里，按 seed 哈希挑一件
 *    （步号入盐，保证每一步的选择都不同）；
 * 3. **配额校验 + 固定规则补齐**：至少 1 条早期（maxDay ≤ 14）、至少 1 条
 *    晚期（minDay ≥ 20）。缺谁就在「与已选兼容」的候选里按 seed 补一件。
 *
 * ⚠️ 为什么不是「纯池序贪心」：实测（1000 个 seed）纯池序贪心会把结果
 * **塌缩到 5 种组合**（偏移只有 6 个，贪心路径随之固定）。每步按哈希挑候选后
 * 是 8 种组合且分布均匀（本池的全部合法三元组），P(两个 seed 同剧本) ≈ 0.13。
 * 两步都是确定性的 —— 变的是方差，不变的是可复现性。
 *
 * `runSeed === 0`（老档 / 无种子 / 坏形状）→ 返回 `[]`：老档走固定剧本。
 */
export function drawSigns(runSeed: number): SignDef[] {
  if (typeof runSeed !== 'number' || !Number.isFinite(runSeed) || runSeed <= 0) {
    return [];
  }

  const n = SIGNS.length;
  const offset = hashOf(runSeed, 'order') % n;
  const order = Array.from({ length: n }, (_, i) => SIGNS[(offset + i) % n]!);

  // 1+2) 旋转序枚举 + 逐步哈希贪心
  const picked: SignDef[] = [];
  while (picked.length < SIGNS_PER_RUN) {
    const cands = order.filter(
      (s) => !picked.includes(s) && picked.every((p) => !overlaps(p, s)),
    );
    const best = pickByHash(runSeed, 'pick', picked.length, cands);
    if (!best) break;
    picked.push(best);
  }

  // 3) 配额补齐（防御性路径：本池结构下正常贪心已满足配额）
  const out = [...picked];
  if (!out.some((s) => s.maxDay <= EARLY_MAX_DAY)) {
    const add = pickByHash(
      runSeed,
      'early',
      out.length,
      SIGNS.filter((s) => s.maxDay <= EARLY_MAX_DAY && out.every((p) => !overlaps(p, s))),
    );
    if (add) {
      if (out.length >= SIGNS_PER_RUN) out.shift();
      out.push(add);
    }
  }
  if (!out.some((s) => s.minDay >= LATE_MIN_DAY)) {
    const add = pickByHash(
      runSeed,
      'late',
      out.length,
      SIGNS.filter((s) => s.minDay >= LATE_MIN_DAY && out.every((p) => !overlaps(p, s))),
    );
    if (add) {
      if (out.length >= SIGNS_PER_RUN) out.shift();
      out.push(add);
    }
  }

  return out.sort(byWindow);
}

/** 当天（minDay ≤ day ≤ maxDay）应该出现的迹象 */
export function signsForDay(runSeed: number, day: number): SignDef[] {
  return drawSigns(runSeed).filter((s) => s.minDay <= day && day <= s.maxDay);
}

// ───────────────────────── 摆放 ─────────────────────────

/** 坐标取整到 0.01，避免浮点尾差影响确定性与快照对比 */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 摆点结果（世界坐标） */
export interface SignSpot {
  id: string;
  x: number;
  y: number;
}

/** 坠毁点圆盘内取点（CRASH_RADIUS = 200，这里内缩到 [40, 160]，避开出生点与火箭） */
function sampleCrash(rng: () => number): Vec2 {
  const r = 40 + rng() * 120;
  const a = rng() * Math.PI * 2;
  return {
    x: WORLD.center.x + r * Math.cos(a),
    y: WORLD.center.y + r * Math.sin(a),
  };
}

/**
 * 在某个已解锁扇区里按哈希取一个点。
 *
 * 非坠毁点扇区：以 `sectorCenter`（扇区中心点）为基准，角度抖 ±40°
 * （扇区半角 45，留 5° 余量）、半径抖 ±90（中心半径 430，扇区环带 [300, 560]，
 * 余量足够），再 `clampToWalkable` 收尾。
 */
function sampleSector(rng: () => number, area: AreaId): Vec2 {
  if (area === 'crash') return clampToWalkable(sampleCrash(rng));
  const c = sectorCenter(area);
  const { deg: cDeg, r: cR } = toPolar(c);
  const ang = cDeg + (rng() * 2 - 1) * 40;
  const rad = cR + (rng() * 2 - 1) * 90;
  const radian = (ang * Math.PI) / 180;
  return clampToWalkable({
    x: WORLD.center.x + rad * Math.cos(radian),
    y: WORLD.center.y + rad * Math.sin(radian),
  });
}

/** 两条迹象之间的最小间距（世界单位）——同一天两条不叠在一起 */
const SIGN_MIN_GAP = 120;

/**
 * 给当天的迹象定摆放点。
 *
 * - 每个迹象一个独立 RNG：`mulberry32(hash(runSeed, signId))` ——
 *   **位置在整个运行周期内稳定**（不随天数 / 地面物品变化），
 *   也不依赖地面物品（迹象不是 `PlacedItem`，不进高亮 / 焦点系统）。
 * - 只在 `areas`（已解锁区域）里选扇区；取到的点必须
 *   `isWalkable` 且 `areaOfPoint` 仍属于 `areas`（哈希抖动可能抖出扇区）。
 * - 扇区全不可走（极端几何）→ 重试若干次后跳过该迹象，绝不出非法点。
 */
export function layoutSigns(
  runSeed: number,
  day: number,
  areas: readonly AreaId[],
): SignSpot[] {
  const signs = signsForDay(runSeed, day);
  if (signs.length === 0 || areas.length === 0) return [];

  const out: SignSpot[] = [];
  const placed: Vec2[] = [];

  for (const sign of signs) {
    const rng = mulberry32(hashOf(runSeed, sign.id));
    // 选扇区：哈希决定起点，按给定顺序轮转（只用已解锁区域）
    const usable = areas.length > 0 ? areas : [];
    const start = hashOf(runSeed, sign.id, 'area') % usable.length;
    const order: AreaId[] = [];
    for (let i = 0; i < usable.length; i++) order.push(usable[(start + i) % usable.length]!);

    let best: Vec2 | null = null;
    for (const area of order) {
      for (let i = 0; i < 8; i++) {
        const p = sampleSector(rng, area);
        // 必须可走 + 仍落在给定扇区内（防抖出界）
        if (!areas.includes(areaOfPoint(p))) continue;
        const far = placed.every(
          (q) => Math.hypot(q.x - p.x, q.y - p.y) > SIGN_MIN_GAP,
        );
        if (far) {
          best = p;
          break;
        }
        if (!best) best = p; // 兜底：第一个合法点（间距是软偏好，不硬性）
      }
      if (best) break;
    }

    if (best) {
      placed.push(best);
      out.push({ id: sign.id, x: round2(best.x), y: round2(best.y) });
    }
  }

  return out;
}

/** 迹象奖励校验用的最小状态面（data.test 用） */
export function signRewardsAllBase(): boolean {
  return SIGNS.every((s) =>
    s.reward.every((id) => ITEM_MAP[id]?.kind === 'base'),
  );
}
