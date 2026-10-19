/**
 * 空间模型与物品分布。
 *
 * 契约见 `docs/CONTRACT-v2.md` §1 §2。
 * 本文件是纯函数：不碰 DOM、不碰 Pixi、不碰 localStorage。
 *
 * ⚠️ T0 只冻结签名，实现由 T5 完成。调用方可以照着写，不要改签名。
 */
import { ITEM_MAP } from './items';
import { AREA_POOLS, AREA_UNLOCK_STAGE } from './stages';
import { missingForBag } from './search';
import type { AreaId, Progress, Tag } from './types';

export const WORLD = {
  size: 1440,
  center: { x: 720, y: 720 },
  planetRadius: 640,
  walkableRadius: 600,
  itemRadius: 560,
  edgeMargin: 80,
  minSpacing: 32,
  maxItems: 18,
  minItems: 12,
  pickupRadius: 40,
  focusRadius: 80,
} as const;

export interface Vec2 {
  x: number;
  y: number;
}

/** 地面上的一个物品点 */
export interface PlacedItem {
  /** 稳定唯一 id，格式 `d{day}-{seq}-{itemId}` */
  uid: string;
  /** 物品 id，指向 ITEM_MAP */
  id: string;
  x: number;
  y: number;
  /** 来源区域池，坐标必须落在该扇区内 */
  area: AreaId;
  spawnedDay: number;
}

export interface DistributeOptions {
  progress: Progress;
  bag: Record<string, number>;
  day: number;
  /** 唯一随机源。同 rng 序列 + 同入参 => 同输出 */
  rng: () => number;
  /** 上一次分布。未拾取的项原样保留，只补空缺 */
  prev?: PlacedItem[];
  /** 角色当前位置，用于保底点距离约束 */
  player?: Vec2;
  /** 保底点与角色的最大距离（世界单位），默认 400 */
  maxDist?: number;
  /** 已解锁区域，缺省按 progress.stage 推导 */
  unlocked?: AreaId[];
}

// ───────────────────────── 几何常量 ─────────────────────────

/** 固定顺序，用于确定性地遍历区域 */
const AREA_ORDER: readonly AreaId[] = ['crash', 'junkyard', 'market', 'cave'];

/** 各扇区的中心角（度，+x 为 0，+y 为 90） */
const SECTOR_DEG: Readonly<Record<AreaId, number>> = {
  crash: 0,
  junkyard: 0,
  market: -90,
  cave: 180,
};

/** 扇区半角宽度 */
const SECTOR_HALF_DEG = 45;
/** 扇区内径 */
const SECTOR_INNER = 300;
/** 扇区外径（与 WORLD.itemRadius 一致，显式写出便于阅读） */
const SECTOR_OUTER = 560;
/** 坠毁点圆盘半径 */
const CRASH_RADIUS = 200;
/** 扇区中心点半径 */
const SECTOR_MID_RADIUS = 430;
/** 保底点默认最大距角色距离 */
const DEFAULT_MAX_DIST = 400;

const EPS = 1e-9;

// ───────────────────────── 几何 ─────────────────────────

/** 点到圆心的极坐标。deg 以 +x 为 0°，+y（屏幕向下）为 90° */
export function toPolar(p: Vec2): { r: number; deg: number } {
  const dx = p.x - WORLD.center.x;
  const dy = p.y - WORLD.center.y;
  return {
    r: Math.hypot(dx, dy),
    deg: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

/** 角度差，归一化到 (-180, 180] */
function angleDelta(deg: number, center: number): number {
  const d = (((deg - center + 180) % 360) + 360) % 360 - 180;
  return d === -180 ? 180 : d;
}

/** 点属于哪个区域；落在扇区缝隙时返回最近区域 */
export function areaOfPoint(p: Vec2): AreaId {
  const { r, deg } = toPolar(p);
  if (r <= CRASH_RADIUS + EPS) return 'crash';

  let best: AreaId = 'junkyard';
  let bestDiff = Infinity;
  for (const area of ['junkyard', 'market', 'cave'] as const) {
    const diff = Math.abs(angleDelta(deg, SECTOR_DEG[area]));
    if (diff < bestDiff - EPS) {
      bestDiff = diff;
      best = area;
    }
  }
  return best;
}

/** 区域扇区中心点 */
export function sectorCenter(area: AreaId): Vec2 {
  if (area === 'crash') return { x: WORLD.center.x, y: WORLD.center.y };
  const rad = (SECTOR_DEG[area] * Math.PI) / 180;
  return {
    x: Math.round(WORLD.center.x + SECTOR_MID_RADIUS * Math.cos(rad)),
    y: Math.round(WORLD.center.y + SECTOR_MID_RADIUS * Math.sin(rad)),
  };
}

/** 是否在可走圆内 */
export function isWalkable(p: Vec2): boolean {
  return toPolar(p).r <= WORLD.walkableRadius + EPS;
}

/** 把任意点夹进可走圆内 */
export function clampToWalkable(p: Vec2): Vec2 {
  const dx = p.x - WORLD.center.x;
  const dy = p.y - WORLD.center.y;
  const r = Math.hypot(dx, dy);
  if (r <= WORLD.walkableRadius || r === 0) return { x: p.x, y: p.y };
  const k = WORLD.walkableRadius / r;
  return {
    x: WORLD.center.x + dx * k,
    y: WORLD.center.y + dy * k,
  };
}

// ───────────────────────── 分布 ─────────────────────────

function pickIndex(rng: () => number, n: number): number {
  if (n <= 0) return 0;
  const v = rng();
  const safe = Number.isFinite(v) ? v : 0;
  const i = Math.floor(safe * n);
  if (i < 0) return 0;
  return i >= n ? n - 1 : i;
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = pickIndex(rng, i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/** 已解锁区域，按固定顺序归一化，过滤掉空池 */
function resolveUnlocked(
  given: AreaId[] | undefined,
  progress: Progress,
): AreaId[] {
  const source =
    given ?? AREA_ORDER.filter((a) => AREA_UNLOCK_STAGE[a] < progress.stage);
  const out: AreaId[] = [];
  for (const area of AREA_ORDER) {
    if (!source.includes(area)) continue;
    if ((AREA_POOLS[area] ?? []).length === 0) continue;
    out.push(area);
  }
  return out;
}

/** 区域池里带该标签的物品 id（按 area+tag 缓存，数据是冻结的） */
const TAG_IDS_CACHE = new Map<string, string[]>();
function idsWithTag(area: AreaId, tag: Tag): string[] {
  const key = `${area}|${tag}`;
  const hit = TAG_IDS_CACHE.get(key);
  if (hit) return hit;
  const pool = AREA_POOLS[area] ?? [];
  const ids = pool.filter((id) => ITEM_MAP[id]?.tags.includes(tag));
  TAG_IDS_CACHE.set(key, ids);
  return ids;
}

/** 该标签在全星球（未过滤解锁）是否存在 */
function tagExistsAnywhere(tag: Tag): boolean {
  return AREA_ORDER.some((area) => idsWithTag(area, tag).length > 0);
}

/**
 * 生成地面物品分布。
 * 参数与行为约束见 `docs/CONTRACT-v2.md` §2。
 */
export function distribute(opts: DistributeOptions): PlacedItem[] {
  const { progress, bag, day, rng } = opts;
  const player = opts.player;
  const maxDist = opts.maxDist ?? DEFAULT_MAX_DIST;
  const unlocked = resolveUnlocked(opts.unlocked, progress);

  // 上一次的项原样保留（共享对象，不复制，纯函数只要求不改入参）
  const result: PlacedItem[] = opts.prev ? opts.prev.slice() : [];

  // ── 间距索引：网格，避免 O(n²) ──
  const cell = WORLD.minSpacing;
  const bucketKey = (x: number, y: number) =>
    (Math.floor(x / cell) + 64) * 4096 + (Math.floor(y / cell) + 64);

  const grid = new Map<number, Vec2[]>();
  const index = (p: Vec2) => {
    const key = bucketKey(p.x, p.y);
    const bucket = grid.get(key);
    if (bucket) bucket.push(p);
    else grid.set(key, [p]);
  };
  for (const it of result) index(it);

  const minSpacingSq = WORLD.minSpacing * WORLD.minSpacing;
  const spacingOk = (x: number, y: number): boolean => {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      for (let iy = cy - 1; iy <= cy + 1; iy++) {
        const bucket = grid.get((ix + 64) * 4096 + (iy + 64));
        if (!bucket) continue;
        for (const q of bucket) {
          const dx = q.x - x;
          const dy = q.y - y;
          if (dx * dx + dy * dy < minSpacingSq - EPS) return false;
        }
      }
    }
    return true;
  };

  const playerClear = WORLD.pickupRadius * 2;
  const crashSq = CRASH_RADIUS * CRASH_RADIUS;
  const innerSq = SECTOR_INNER * SECTOR_INNER;
  const outerSq = SECTOR_OUTER * SECTOR_OUTER;

  /** 该点能否作为新物品点；limit 为与角色的最大距离，null 表示不限 */
  const acceptable = (
    x: number,
    y: number,
    area: AreaId,
    limit: number | null,
  ): boolean => {
    const dx = x - WORLD.center.x;
    const dy = y - WORLD.center.y;
    const rSq = dx * dx + dy * dy;

    if (area === 'crash') {
      if (rSq > crashSq + EPS) return false;
    } else {
      if (rSq < innerSq - EPS || rSq > outerSq + EPS) return false;
      const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (
        Math.abs(angleDelta(deg, SECTOR_DEG[area])) >
        SECTOR_HALF_DEG - 1e-6
      ) {
        return false;
      }
    }

    if (player) {
      const px = x - player.x;
      const py = y - player.y;
      const dSq = px * px + py * py;
      if (dSq < playerClear * playerClear - EPS) return false;
      if (limit !== null && dSq > limit * limit + EPS) return false;
    }
    return spacingOk(x, y);
  };

  const usedUid = new Set(result.map((it) => it.uid));
  let seq = 0;
  const nextUid = (itemId: string): string => {
    let uid = `d${day}-${seq}-${itemId}`;
    while (usedUid.has(uid)) {
      seq++;
      uid = `d${day}-${seq}-${itemId}`;
    }
    usedUid.add(uid);
    seq++;
    return uid;
  };

  const place = (area: AreaId, itemId: string, p: Vec2): void => {
    const item: PlacedItem = {
      uid: nextUid(itemId),
      id: itemId,
      x: p.x,
      y: p.y,
      area,
      spawnedDay: day,
    };
    result.push(item);
    index(item);
  };

  const round2 = (v: number) => Math.round(v * 100) / 100;

  /**
   * 在区域里找一个合法点。
   * 有角色时，2/3 的尝试从角色朝区域中心方向取点（保底点要够得着），
   * 剩下 1/3 纯区域均匀采样，避免总是挤在同一侧。
   * 热路径：只用标量，接受时才分配对象。
   */
  const findSpot = (
    area: AreaId,
    limit: number | null,
    tries: number,
  ): Vec2 | null => {
    let base = 0;
    if (player) {
      const anchor = sectorCenter(area);
      base = Math.atan2(anchor.y - player.y, anchor.x - player.x);
    }
    const span =
      limit === null ? WORLD.itemRadius : Math.max(0, limit - playerClear);
    const isCrash = area === 'crash';

    for (let i = 0; i < tries; i++) {
      let x: number;
      let y: number;
      // 保底（有限制）时多从角色方向取点；补数量时以区域均匀采样为主
      const aimAtPlayer =
        player !== undefined && (limit !== null ? i % 3 !== 2 : i % 3 === 0);
      if (aimAtPlayer && player) {
        const ang = base + (rng() - 0.5) * Math.PI * 0.9;
        const d = playerClear + rng() * span;
        x = player.x + Math.cos(ang) * d;
        y = player.y + Math.sin(ang) * d;
      } else if (isCrash) {
        const r = CRASH_RADIUS * Math.sqrt(rng());
        const a = rng() * Math.PI * 2;
        x = WORLD.center.x + r * Math.cos(a);
        y = WORLD.center.y + r * Math.sin(a);
      } else {
        const r = SECTOR_INNER + rng() * (SECTOR_OUTER - SECTOR_INNER);
        // 角度内缩 0.5°，避免采样正好压在扇区边界上
        const deg =
          SECTOR_DEG[area] + (rng() * 2 - 1) * (SECTOR_HALF_DEG - 0.5);
        const rad = (deg * Math.PI) / 180;
        x = WORLD.center.x + r * Math.cos(rad);
        y = WORLD.center.y + r * Math.sin(rad);
      }
      const rx = Math.round(x * 100) / 100;
      const ry = Math.round(y * 100) / 100;
      if (acceptable(rx, ry, area, limit)) return { x: rx, y: ry };
    }
    return null;
  };

  /** 确定性兜底扫描：随机采样找不到时用，保证数量下限 */
  const scanSpot = (area: AreaId, limit: number | null): Vec2 | null => {
    if (area === 'crash') {
      for (let r = CRASH_RADIUS; r >= 0; r -= 20) {
        const steps = Math.max(8, Math.ceil((2 * Math.PI * Math.max(r, 1)) / 40));
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const rx = round2(WORLD.center.x + r * Math.cos(a));
          const ry = round2(WORLD.center.y + r * Math.sin(a));
          if (acceptable(rx, ry, area, limit)) return { x: rx, y: ry };
        }
      }
      return null;
    }
    for (let r = SECTOR_INNER; r <= SECTOR_OUTER; r += 20) {
      for (let d = -SECTOR_HALF_DEG + 1; d <= SECTOR_HALF_DEG - 1; d += 4) {
        const rad = ((SECTOR_DEG[area] + d) * Math.PI) / 180;
        const rx = round2(WORLD.center.x + r * Math.cos(rad));
        const ry = round2(WORLD.center.y + r * Math.sin(rad));
        if (acceptable(rx, ry, area, limit)) return { x: rx, y: ry };
      }
    }
    return null;
  };

  // ── 1. 目标数量 12–18 ──
  const target = Math.min(
    WORLD.maxItems,
    Math.max(
      WORLD.minItems,
      WORLD.minItems +
        Math.floor(rng() * (WORLD.maxItems - WORLD.minItems + 1)),
    ),
  );

  // ── 2. 硬保底：缺的标签，地面必须至少有一个（同标签出现两次就补两个） ──
  const needs = missingForBag(progress, bag).slice(0, 2);

  const needCount = new Map<Tag, number>();
  for (const tag of needs) needCount.set(tag, (needCount.get(tag) ?? 0) + 1);

  for (const [tag, required] of needCount) {
    let have = 0;
    for (const it of result) if (ITEM_MAP[it.id]?.tags.includes(tag)) have++;

    while (have < required) {
      const areas = unlocked
        .map((area) => ({ area, ids: idsWithTag(area, tag) }))
        .filter((c) => c.ids.length > 0);

      if (areas.length === 0) {
        if (!tagExistsAnywhere(tag)) {
          throw new Error(
            `[distribute] 保底失败：没有任何区域池包含标签「${tag}」，请检查 items.ts / stages.ts 配置`,
          );
        }
        // 只存在于未解锁区域，当前阶段无法保底，交给后续阶段
        break;
      }

      const order = shuffle(areas, rng);
      let spot: Vec2 | null = null;
      let chosen: AreaId | null = null;

      // 先严格满足 maxDist
      for (const c of order) {
        const s = findSpot(c.area, maxDist, 48) ?? scanSpot(c.area, maxDist);
        if (s) {
          spot = s;
          chosen = c.area;
          break;
        }
      }

      // 几何上够不到（角色离已解锁区域太远）时放宽距离，仍然留在已解锁扇区内
      if (!spot || !chosen) {
        for (const c of order) {
          const s = findSpot(c.area, null, 48) ?? scanSpot(c.area, null);
          if (s) {
            spot = s;
            chosen = c.area;
            break;
          }
        }
      }

      if (!spot || !chosen) break;

      const ids = idsWithTag(chosen, tag);
      place(chosen, ids[pickIndex(rng, ids.length)]!, spot);
      have++;
    }
  }

  // ── 3. 补满到目标数量 ──
  while (result.length < target && unlocked.length > 0) {
    const start = pickIndex(rng, unlocked.length);
    let spot: Vec2 | null = null;
    let area: AreaId | null = null;
    for (let k = 0; k < unlocked.length; k++) {
      const cand = unlocked[(start + k) % unlocked.length]!;
      const s = findSpot(cand, null, 12);
      if (s) {
        spot = s;
        area = cand;
        break;
      }
    }
    if (!spot || !area) break;
    const pool = AREA_POOLS[area] ?? [];
    place(area, pool[pickIndex(rng, pool.length)]!, spot);
  }

  // ── 4. 数量下限兜底（确定性扫描） ──
  if (result.length < WORLD.minItems) {
    for (const area of unlocked) {
      const pool = AREA_POOLS[area] ?? [];
      if (pool.length === 0) continue;
      while (result.length < WORLD.minItems) {
        const spot = scanSpot(area, null);
        if (!spot) break;
        place(area, pool[pickIndex(rng, pool.length)]!, spot);
      }
      if (result.length >= WORLD.minItems) break;
    }
  }

  return result;
}
