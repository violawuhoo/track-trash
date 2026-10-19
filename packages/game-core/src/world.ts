/**
 * 空间模型与物品分布。
 *
 * 契约见 `docs/CONTRACT-v2.md` §1 §2。
 * 本文件是纯函数：不碰 DOM、不碰 Pixi、不碰 localStorage。
 *
 * ⚠️ T0 只冻结签名，实现由 T5 完成。调用方可以照着写，不要改签名。
 */
import type { AreaId, Progress } from './types';

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

/** 点到圆心的极坐标。deg 以 +x 为 0°，+y（屏幕向下）为 90° */
export function toPolar(_p: Vec2): { r: number; deg: number } {
  throw new Error('T5 未实现：toPolar');
}

/** 点属于哪个区域；落在扇区缝隙时返回最近区域 */
export function areaOfPoint(_p: Vec2): AreaId {
  throw new Error('T5 未实现：areaOfPoint');
}

/** 区域扇区中心点 */
export function sectorCenter(_area: AreaId): Vec2 {
  throw new Error('T5 未实现：sectorCenter');
}

/** 是否在可走圆内 */
export function isWalkable(_p: Vec2): boolean {
  throw new Error('T5 未实现：isWalkable');
}

/** 把任意点夹进可走圆内 */
export function clampToWalkable(_p: Vec2): Vec2 {
  throw new Error('T5 未实现：clampToWalkable');
}

/**
 * 生成地面物品分布。
 * 参数与行为约束见 `docs/CONTRACT-v2.md` §2。
 */
export function distribute(_opts: DistributeOptions): PlacedItem[] {
  throw new Error('T5 未实现：distribute');
}
