/**
 * 世界层几何常量 —— 供 T3（Pixi 层）直接引用，本轮**不生成任何纹理**。
 *
 * 单位统一为**世界单位**：世界坐标系是 `WORLD.size = 1440` 的正方形，
 * 星球圆心在正中（720, 720）。这些数字全部是 `viewBox 0 0 1440 1440`
 * 里的绝对坐标，**不是屏幕像素**——相机缩放（0.8–1.6）由相机负责。
 *
 * 与 `packages/game-core/src/world.ts` 的 `WORLD` 对齐：
 * 星球几何只有一处真源，这里从 `WORLD` 派生，避免第二份 720/640。
 */
import { WORLD } from '@haola/game-core';

/**
 * 星球圆盘。
 * - `r = 640`：`WORLD.planetRadius`，比可行走半径（600）大 40，留出边缘视觉余量。
 * - `ringOffset = 12`：星球外圈的感知环，画在 `r + 12` 处（不参与碰撞）。
 * - `ringDash = [6, 8]`：虚线节奏（6 实 8 空），与 UI 的 2px 虚线同源。
 * - `ringW = 3`：环宽，是**世界层的例外**：唯一允许接近 UI 3px 描边的世界元素，
 *   因为它代表"星球边界"这个 UI 级语义。
 */
export const PLANET = {
  cx: WORLD.center.x,
  cy: WORLD.center.y,
  r: WORLD.planetRadius,
  ringOffset: 12,
  ringDash: [6, 8] as const,
  ringW: 3,
} as const;

/**
 * 大气层虚线：环绕星球的一圈短划。
 * `count = 180` 段沿周长**均分角度**（2π / 180 = 2°），`len : gap = 6 : 8` 是段内
 * 实/空比例。要调密度改 `count`，要调手感改 `len/gap`，两者不要同时动。
 */
export const ATMOSPHERE_DASH = {
  count: 180,
  len: 6,
  gap: 8,
} as const;

/**
 * 贴纸贴地投影：**不是**卡片阴影，是"放在纸上"的接触阴影。
 *
 * 尺寸按贴纸尺寸等比：`rx = 0.33 × size`、`ry = 0.125 × size`，
 * 中心下移 `dy = 3`（世界单位）。32 的贴纸 → 10.6 × 4 的椭圆，压在下缘。
 * 颜色只能用 `PALETTE.planetShade`，用墨黑会立刻变成"卡片"而不是"贴纸"。
 */
export const ITEM_SHADOW = {
  rx: 0.33,
  ry: 0.125,
  dy: 3,
} as const;

/**
 * 未解锁扇区的雾障几何。
 *
 * 以星球圆心为极点：
 * - `inner = 300` / `outer = 560`：只覆盖环带，圆心区域与星球外都不画
 *   （圆心是出生点，不能糊住；`outer` 比 `itemRadius = 560` 齐平）。
 * - `halfDeg = 45`：每块扇区半角 45°（共 8 个扇区），**覆盖面积上限 45%**：
 *   任何时刻锁住超过这个比例，玩家就看不到路了。
 * - `fadeBand = 20`：内缘渐隐带宽度（世界单位），用三层叠加而非滤镜。
 * - `steps = [0.12, 0.24, 0.35]`：三层叠色的 alpha，峰值即 `ALPHA.void` 的 0.35。
 *   禁止用 `filter: blur`——世界层不允许模糊，只能叠半透明实心层。
 */
export const FOG_SHAPE = {
  inner: 300,
  outer: 560,
  halfDeg: 45,
  fadeBand: 20,
  steps: [0.12, 0.24, 0.35] as const,
} as const;

export type PlanetGeometry = typeof PLANET;
export type AtmosphereGeometry = typeof ATMOSPHERE_DASH;
export type ItemShadowGeometry = typeof ITEM_SHADOW;
export type FogGeometry = typeof FOG_SHAPE;
