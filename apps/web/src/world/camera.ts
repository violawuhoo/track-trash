/**
 * 相机：死区跟随 + 缩放钳制 + 圆形夹紧。
 *
 * 契约见 `docs/CONTRACT-v2.md` §4.3 §9。
 *
 * **纯函数，零 Pixi 依赖**：这里的每个函数都只吃数字吐数字，
 * 所以可以在 node 里直接单测，不需要 WebGL 上下文。
 *
 * 两条几何决定（都是被 §9 裁决过的）：
 * 1. **相机夹在圆里，不夹在方框里**。`clampCamera` 把相机中心约束到
 *    `walkableRadius = 600` 的圆内 —— 角色最远就到 600，相机不该比角色
 *    走得更远。用方框（`[80, 1360]`）会在四个角上把镜头推到星球外面去，
 *    与"圆形星球"的美术自相矛盾。
 * 2. **不做水平回绕**。相机 `x` 越界就直接夹住，没有取模。
 */
import { WORLD, type Vec2 } from '@haola/game-core';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface ViewportSize {
  w: number;
  h: number;
}

/** 死区占屏幕的 40%：小人在中间 40% 区域里走动时相机不动 */
export const DEAD_ZONE = 0.4;
export const ZOOM_MIN = 0.8;
export const ZOOM_MAX = 1.6;

/**
 * 相机中心允许偏离星球圆心的最大半径。
 * 等于 `walkableRadius`（600）：`planetRadius - walkableRadius` 的 40 单位
 * 才是留给"边缘留白"的视觉余量，相机不需要比角色更靠外。
 */
const CAM_RADIUS = WORLD.walkableRadius;

/** 初始相机：星球正中，zoom 1（= 1 世界单位 1 CSS px） */
export function createCamera(zoom = 1): Camera {
  return { x: WORLD.center.x, y: WORLD.center.y, zoom: clampZoom(zoom) };
}

/** 缩放钳制到 0.8–1.6；非有限值退回 1（双指缩放与滑杆都可能传进 NaN） */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/**
 * 把相机中心夹进圆形范围。**不修改入参**，返回新对象。
 */
export function clampCamera(cam: Camera): Camera {
  const zoom = clampZoom(cam.zoom);
  const dx = cam.x - WORLD.center.x;
  const dy = cam.y - WORLD.center.y;
  const r = Math.hypot(dx, dy);
  if (r <= CAM_RADIUS || r === 0) return { x: cam.x, y: cam.y, zoom };
  const k = CAM_RADIUS / r;
  return { x: WORLD.center.x + dx * k, y: WORLD.center.y + dy * k, zoom };
}

/**
 * 死区跟随：目标超出屏幕中间 `DEAD_ZONE` 区域时相机才平移，
 * 平移量正好让目标回到死区边界上（之后跟着走）。
 *
 * `viewport` 是 CSS px，除以 zoom 换算成世界单位 —— 死区的大小
 * 在屏幕上恒定，不随缩放变化。
 */
export function follow(cam: Camera, target: Vec2, viewport: ViewportSize): Camera {
  const zoom = clampZoom(cam.zoom);
  if (viewport.w <= 0 || viewport.h <= 0) {
    return { x: cam.x, y: cam.y, zoom };
  }

  const limitX = (viewport.w * DEAD_ZONE) / zoom / 2;
  const limitY = (viewport.h * DEAD_ZONE) / zoom / 2;

  let x = cam.x;
  let y = cam.y;

  const dx = target.x - x;
  if (Math.abs(dx) > limitX) x += dx - Math.sign(dx) * limitX;

  const dy = target.y - y;
  if (Math.abs(dy) > limitY) y += dy - Math.sign(dy) * limitY;

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: WORLD.center.x, y: WORLD.center.y, zoom };
  }

  return clampCamera({ x, y, zoom });
}

/**
 * 世界容器变换：把世界坐标映射到屏幕（CSS px）。
 *
 * `root.scale = zoom`，`root.position = t`，于是
 * `screen = world * zoom + t`。
 */
export function cameraTransform(
  cam: Camera,
  viewport: ViewportSize,
): { x: number; y: number; scale: number } {
  const scale = clampZoom(cam.zoom);
  return {
    x: viewport.w / 2 - cam.x * scale,
    y: viewport.h / 2 - cam.y * scale,
    scale,
  };
}

/** 可见区域在世界坐标系里的矩形（供裁剪 / 剔除用，当前未启用） */
export function visibleRect(cam: Camera, viewport: ViewportSize): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const scale = clampZoom(cam.zoom);
  const w = viewport.w / scale;
  const h = viewport.h / scale;
  return { x: cam.x - w / 2, y: cam.y - h / 2, w, h };
}
