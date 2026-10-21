import { ITEM_MAP } from './items';
import { AREA_POOLS, AREA_UNLOCK_STAGE } from './stages';
import { getStage, missingForStep } from './resolve';
import type { AreaId, Progress, Tag } from './types';

export interface SearchOptions {
  progress: Progress;
  bag: Record<string, number>;
  areaId: AreaId;
  /** 注入随机源，便于测试复现 */
  rng?: () => number;
}

/**
 * 跨区域并集提示。
 *
 * 当当前步骤缺的标签在**当前区域池**里没有，但在**其他已解锁区域**的池子里有，
 * 就给出提示：去那个区域找那件东西。
 *
 * 为什么不直接把别的区域的物品塞进当前区域的搜索结果：
 * 物品的 `area` 字段是内容事实（这件东西本来就在垃圾山），
 * 保底机制不应该篡改它。所以这里只做「指路」，不做「凭空变出来」。
 */
export interface SearchHint {
  /** 还缺的标签 */
  tag: Tag;
  /** 该标签所在的已解锁区域（不含当前区域） */
  areaId: AreaId;
  /** 该区域里带这个标签的物品 id */
  itemId: string;
}

/** 一次搜索的完整结果 */
export interface SearchOutcome {
  /** 本次搜索得到的物品 id（全部属于当前区域池） */
  items: string[];
  /** 跨区域并集提示：当前区域没有、但已解锁区域里有的目标标签 */
  hints: SearchHint[];
}

/** 区域遍历顺序（与 world.ts 保持一致） */
const AREA_ORDER: readonly AreaId[] = ['crash', 'junkyard', 'market', 'cave'];

/**
 * 已解锁区域。
 *
 * 规则与 `world.ts` 的 `resolveUnlocked` 一致：`AREA_UNLOCK_STAGE[a] < progress.stage`
 * （完成该阶段后解锁）。阶段 3 时四个区域全部解锁 → 并集 = 全星球。
 */
export function unlockedAreas(progress: Progress): AreaId[] {
  return AREA_ORDER.filter((a) => AREA_UNLOCK_STAGE[a] < progress.stage);
}

/** 背包里是否有带该标签的物品（数量 > 0） */
export function bagHasTag(
  bag: Record<string, number>,
  tag: Tag,
): boolean {
  return Object.keys(bag).some((id) => {
    const n = bag[id] ?? 0;
    const item = ITEM_MAP[id];
    return n > 0 && !!item && item.tags.includes(tag);
  });
}

/**
 * 当前阶段这一步，背包里还缺哪些标签。
 *
 * 阶段 1 / 2 / 3 都可能带标签目标；阶段 3 走满三步后没有当前步骤，返回空数组。
 */
export function missingForBag(
  progress: Progress,
  bag: Record<string, number>,
): Tag[] {
  if (progress.stage !== 1 && progress.stage !== 2 && progress.stage !== 3) {
    return [];
  }
  const stage = getStage(progress.stage);
  if (!stage) return [];
  const step = stage.steps[progress.stepIndex];
  if (!step) return [];
  return missingForStep(step.requires, []).filter((t) => !bagHasTag(bag, t));
}

/**
 * 搜索一个区域，返回 1~2 个物品 id + 跨区域提示。
 *
 * 硬保底：当前步骤缺的标签，只要该区域池里存在对应物品，就必定刷出来。
 * 这不是「提高概率」—— 概率保底迟早会被玩家撞上死路，这里是确定性补齐。
 * 上限 2 个：一次搜索最多给两个，否则节奏会被保底拖垮。
 *
 * 跨区域并集：当前区域凑不齐的标签，会在**已解锁区域并集**里找，
 * 找到就作为提示返回（去那个区域拿），而不是把别的区域的东西搬过来。
 */
export function pickSearchWithHints(opts: SearchOptions): SearchOutcome {
  const pool = AREA_POOLS[opts.areaId] ?? [];
  const rng = opts.rng ?? Math.random;
  const needs = missingForBag(opts.progress, opts.bag);

  if (pool.length === 0) {
    return { items: [], hints: hintsForMissing(needs, opts, rng) };
  }

  const forced: string[] = [];
  for (const tag of needs) {
    if (forced.length >= 2) break;
    const candidates = pool.filter(
      (id) => ITEM_MAP[id]?.tags.includes(tag) && !forced.includes(id),
    );
    if (candidates.length === 0) continue;
    forced.push(candidates[Math.floor(rng() * candidates.length)]!);
  }

  let count = rng() < 0.7 ? 1 : 2;
  count = Math.min(2, Math.max(count, forced.length));

  const items = [...forced];
  while (items.length < count) {
    items.push(pool[Math.floor(rng() * pool.length)]!);
  }

  return { items, hints: hintsForMissing(needs, opts, rng) };
}

/**
 * 跨区域并集提示。
 *
 * 对每个还缺的标签：当前区域池里没有 → 在其他已解锁区域里找一个带该标签的物品，
 * 返回「去 X 区域找 Y」。全星球都没有该标签 → 不给提示（内容配置错误，由
 * `check-content.mjs` 断言 B 兜住）。
 */
function hintsForMissing(
  needs: Tag[],
  opts: SearchOptions,
  rng: () => number,
): SearchHint[] {
  const pool = AREA_POOLS[opts.areaId] ?? [];
  const hints: SearchHint[] = [];
  for (const tag of needs) {
    if (pool.some((id) => ITEM_MAP[id]?.tags.includes(tag))) continue;
    for (const area of unlockedAreas(opts.progress)) {
      if (area === opts.areaId) continue;
      const ids = (AREA_POOLS[area] ?? []).filter((id) =>
        ITEM_MAP[id]?.tags.includes(tag),
      );
      if (ids.length === 0) continue;
      hints.push({
        tag,
        areaId: area,
        itemId: ids[Math.floor(rng() * ids.length)]!,
      });
      break;
    }
  }
  return hints;
}

/**
 * 搜索一个区域，返回 1~2 个物品 id。
 *
 * 只看当前区域池；跨区域提示用 {@link pickSearchWithHints} 取。
 */
export function pickSearch(opts: SearchOptions): string[] {
  return pickSearchWithHints(opts).items;
}
