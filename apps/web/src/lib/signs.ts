/**
 * 「远处的迹象」热区规格（探索动机改版）。
 *
 * 纯数据模块：只算「点了算不算命中」，Pixi 绘制在 `world/signs.ts`，
 * 位置由 core 的 `layoutSigns` 定（`SignSpot`）。
 *
 * ## 为什么热区要单独一份数据
 *
 * 三种迹象的绘制锚点都是**贴地接触点 (0,0)**，图形向上长 ——
 * 热区如果跟着锚点建，玩家得点地面上的一个点，而视觉主体在 20–40 单位高的空中。
 * 所以热区按**视觉包围盒中心**建（ART-01 交接项 ①），与绘制锚点解耦：
 *
 * | kind | 热区 | 中心（相对锚点） |
 * |---|---|---|
 * | light | r=22 圆 | (0, -14) |
 * | smoke | 24×48 矩形 | (0, -20) |
 * | figure | 28×46 矩形 | (0, -21) |
 *
 * 三者包围盒都 < `ITEM_TAP_RADIUS`(44)，点迹象和点物品的手感宽容度同档。
 */
import type { SignKind } from '@haola/game-core';

/** 热区形状。circle 用 r，rect 用 w/h */
export type SignHotzone =
  | { shape: 'circle'; cx: number; cy: number; r: number }
  | { shape: 'rect'; cx: number; cy: number; w: number; h: number };

/** 三种迹象的热区（相对「贴地锚点」，y 向上为负） */
export const SIGN_HOTZONES: Readonly<Record<SignKind, SignHotzone>> = Object.freeze({
  light: { shape: 'circle', cx: 0, cy: -14, r: 22 },
  smoke: { shape: 'rect', cx: 0, cy: -20, w: 24, h: 48 },
  figure: { shape: 'rect', cx: 0, cy: -21, w: 28, h: 46 },
});

/**
 * 点击命中判定：`(dx, dy)` = 点击世界坐标 − 迹象摆放点。
 *
 * 纯函数（无 Pixi 依赖）—— 放 lib 而不是 world，就是为了能单测。
 */
export function signHit(hot: SignHotzone, dx: number, dy: number): boolean {
  if (hot.shape === 'circle') {
    return Math.hypot(dx - hot.cx, dy - hot.cy) <= hot.r;
  }
  return Math.abs(dx - hot.cx) <= hot.w / 2 && Math.abs(dy - hot.cy) <= hot.h / 2;
}
