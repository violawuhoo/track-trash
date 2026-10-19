/**
 * 输入：屏幕坐标 → 世界坐标，点击移动 + 键盘。
 *
 * 契约见 `docs/CONTRACT-v2.md` §4.3。
 * 纯函数部分（screenToWorld / keyToDir）与 Pixi 解耦，可直接单测。
 * ⚠️ 实现由 T3 完成。
 */
import type { Vec2 } from '@haola/game-core';
import type { Camera, ViewportSize } from './camera';

export type Direction = 'up' | 'down' | 'left' | 'right';

/** 屏幕坐标转世界坐标，考虑相机位移与缩放 */
export function screenToWorld(
  _point: Vec2,
  _cam: Camera,
  _viewport: ViewportSize,
): Vec2 {
  throw new Error('T3 未实现：screenToWorld');
}

/** 键盘按键映射为方向；不是方向键时返回 null */
export function keyToDir(_key: string): Direction | null {
  throw new Error('T3 未实现：keyToDir');
}

/** 绑定指针与键盘事件，返回解绑函数 */
export function bindInput(_host: HTMLElement): () => void {
  throw new Error('T3 未实现：bindInput');
}
