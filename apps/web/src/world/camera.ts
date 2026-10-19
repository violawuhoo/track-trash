/**
 * 相机：死区跟随 + 缩放钳制。
 *
 * 契约见 `docs/CONTRACT-v2.md` §4.3。
 * 纯函数、无 Pixi 依赖，可直接单测。⚠️ 实现由 T3 完成。
 */
import type { Vec2 } from '@haola/game-core';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface ViewportSize {
  w: number;
  h: number;
}

export const DEAD_ZONE = 0.4;
export const ZOOM_MIN = 0.8;
export const ZOOM_MAX = 1.6;

export function createCamera(): Camera {
  throw new Error('T3 未实现：createCamera');
}

export function follow(_cam: Camera, _target: Vec2, _viewport: ViewportSize): Camera {
  throw new Error('T3 未实现：follow');
}

export function clampCamera(_cam: Camera): Camera {
  throw new Error('T3 未实现：clampCamera');
}
