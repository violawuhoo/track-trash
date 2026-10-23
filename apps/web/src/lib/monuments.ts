/**
 * 落地成景（乐趣改版 ⑤）：把「你造过的东西」变成坠毁点看得见的实体。
 *
 * 设计意图：推进感 = 累积可见。火箭剪影随飞船四槽逐段生长（虚线轮廓 = 目标，
 * 实心段 = 已造）；基地物品（避难所 / 床 / 发电机 / 店面…）首次合出即落地成景，
 * **之后永远留着**（记在 `save.built`，与背包解耦——东西用掉了，痕迹还在）。
 *
 * 纯数据模块：只算「画什么、画在哪」，Pixi 绘制在 `world/monuments.ts`。
 */
import { BRANCHES } from '@haola/game-core';

/** 飞船四槽的候选 id（直接取 BRANCHES.ship.requires，保持单一真源） */
export const SHIP_SLOTS: readonly (readonly string[])[] =
  BRANCHES.find((b) => b.id === 'ship')?.requires ?? [];

export interface PropSpec {
  /** 距坠毁点中心的偏移（世界单位） */
  dx: number;
  dy: number;
  /** 绘制种类（pixi 侧按这个画） */
  kind: PropKind;
  name: string;
}

export type PropKind =
  | 'windbreak'
  | 'shelter'
  | 'bed'
  | 'generator'
  | 'hourglass'
  | 'notice'
  | 'shop'
  | 'beacon';

/** 基地纪念物：id → 摆放位置与画法。位置固定，避免重进游戏后景物跳位 */
export const BASE_PROPS: Readonly<Record<string, PropSpec>> = Object.freeze({
  windbreak: { dx: -95, dy: 55, kind: 'windbreak', name: '挡风板' },
  shelter: { dx: -130, dy: -20, kind: 'shelter', name: '临时避难所' },
  bedframe: { dx: -70, dy: -75, kind: 'bed', name: '床架' },
  generator: { dx: -25, dy: -110, kind: 'generator', name: '发电机' },
  hourglass: { dx: 60, dy: -100, kind: 'hourglass', name: '时漏' },
  notice: { dx: 120, dy: -35, kind: 'notice', name: '告示' },
  shopfront: { dx: 135, dy: 50, kind: 'shop', name: '店面' },
  beacon: { dx: 40, dy: 110, kind: 'beacon', name: '信标塔' },
});

/**
 * 合成产物入库 `built`。命中纪念物 id 或飞船槽位候选时追加（去重）。
 * 飞船槽位记为 `ship:0`…`ship:3`（槽索引），保证「部件被用掉后火箭段仍在」。
 */
export function markBuilt(built: string[], outputId: string): string[] {
  const add: string[] = [];
  if (BASE_PROPS[outputId] && !built.includes(outputId)) add.push(outputId);
  SHIP_SLOTS.forEach((options, i) => {
    if (options.includes(outputId)) {
      const marker = `ship:${i}`;
      if (!built.includes(marker)) add.push(marker);
    }
  });
  return add.length > 0 ? [...built, ...add] : built;
}

/** 火箭四槽完成情况（built 标记 或 背包现持有都算——在手的部件也画上去） */
export function rocketSlots(
  bag: Record<string, number>,
  built: string[],
): boolean[] {
  return SHIP_SLOTS.map(
    (options, i) =>
      built.includes(`ship:${i}`) || options.some((id) => (bag[id] ?? 0) > 0),
  );
}

/** 已落地成景的 prop id 列表（保持 BASE_PROPS 定义顺序，绘制稳定） */
export function builtProps(built: string[]): string[] {
  return Object.keys(BASE_PROPS).filter((id) => built.includes(id));
}
