import { ITEM_MAP } from './items';
import { AREA_POOLS } from './stages';
import { getStage, missingForStep } from './resolve';
import type { AreaId, Progress, Tag } from './types';

export interface SearchOptions {
  progress: Progress;
  bag: Record<string, number>;
  areaId: AreaId;
  /** 注入随机源，便于测试复现 */
  rng?: () => number;
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
 * 阶段 3 及以后没有标签目标，返回空数组。
 */
export function missingForBag(
  progress: Progress,
  bag: Record<string, number>,
): Tag[] {
  if (progress.stage !== 1 && progress.stage !== 2) return [];
  const stage = getStage(progress.stage);
  if (!stage) return [];
  const step = stage.steps[progress.stepIndex];
  if (!step) return [];
  return missingForStep(step.requires, []).filter((t) => !bagHasTag(bag, t));
}

/**
 * 搜索一个区域，返回 1~2 个物品 id。
 *
 * 硬保底：当前步骤缺的标签，只要该区域池里存在对应物品，就必定刷出来。
 * 这不是「提高概率」—— 概率保底迟早会被玩家撞上死路，这里是确定性补齐。
 * 上限 2 个：一次搜索最多给两个，否则节奏会被保底拖垮。
 */
export function pickSearch(opts: SearchOptions): string[] {
  const pool = AREA_POOLS[opts.areaId] ?? [];
  if (pool.length === 0) return [];

  const rng = opts.rng ?? Math.random;
  const needs = missingForBag(opts.progress, opts.bag);

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

  const result = [...forced];
  while (result.length < count) {
    result.push(pool[Math.floor(rng() * pool.length)]!);
  }
  return result;
}
