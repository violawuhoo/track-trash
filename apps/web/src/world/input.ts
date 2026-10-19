/**
 * 输入：屏幕坐标 → 世界坐标，点击移动 + 键盘并行。
 *
 * 契约见 `docs/CONTRACT-v2.md` §4.3 §6.3、`REDESIGN.md` §5。
 *
 * 三条交互铁律：
 * 1. **点一下就走过去**。没有虚拟摇杆，没有寻路。
 * 2. **禁止拖拽**。手指按下去再滑开（超过 `TAP_SLOP`）不算点击 ——
 *    否则手机上每次"顺手滑一下"都会把小人扔到屏幕另一头。
 * 3. **键盘与点击并行**。按下 WASD 立即抢走控制权（清掉点击目标），
 *    松开后停在原地，不会自己接着走。
 *
 * 纯函数（`screenToWorld` / `keyToDir` / `dirVector`）与 DOM 解耦，可直接单测。
 */
import type { Vec2 } from '@haola/game-core';
import { cameraTransform, type Camera, type ViewportSize } from './camera';

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface DirKeys {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export const NO_KEYS: DirKeys = { up: false, down: false, left: false, right: false };

/** 手指移动超过这个距离（CSS px）就不是点击，是拖拽 —— 直接丢弃 */
export const TAP_SLOP = 10;
/** 按下超过这个时长（ms）不算点击（给长按查看详情让路） */
export const TAP_TIMEOUT = 700;

/** 屏幕坐标 → 世界坐标（考虑相机位移与缩放） */
export function screenToWorld(
  point: Vec2,
  cam: Camera,
  viewport: ViewportSize,
): Vec2 {
  const t = cameraTransform(cam, viewport);
  return { x: (point.x - t.x) / t.scale, y: (point.y - t.y) / t.scale };
}

/** 世界坐标 → 屏幕坐标（给"方向箭头"这类 DOM 覆盖层用） */
export function worldToScreen(
  point: Vec2,
  cam: Camera,
  viewport: ViewportSize,
): Vec2 {
  const t = cameraTransform(cam, viewport);
  return { x: point.x * t.scale + t.x, y: point.y * t.scale + t.y };
}

const KEY_DIR: Readonly<Record<string, Direction>> = {
  arrowup: 'up',
  w: 'up',
  arrowdown: 'down',
  s: 'down',
  arrowleft: 'left',
  a: 'left',
  arrowright: 'right',
  d: 'right',
};

/** 键盘按键映射为方向；不是方向键时返回 null */
export function keyToDir(key: string): Direction | null {
  return KEY_DIR[key.toLowerCase()] ?? null;
}

/**
 * 按键状态 → 单位向量。斜向归一化，
 * 所以「按住 W+D」和「只按 W」速度相同。
 */
export function dirVector(keys: DirKeys): Vec2 {
  const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  if (x === 0 && y === 0) return { x: 0, y: 0 };
  if (x !== 0 && y !== 0) {
    const k = Math.SQRT1_2;
    return { x: x * k, y: y * k };
  }
  return { x, y };
}

export function isEmptyKeys(keys: DirKeys): boolean {
  return !keys.up && !keys.down && !keys.left && !keys.right;
}

export interface InputHandlers {
  /** 轻触地面。坐标已换算成世界坐标，调用方负责夹进可走圆 */
  onTap(world: Vec2): void;
  /** 键盘方向状态变化（每次 keydown / keyup / blur 都会回调） */
  onKeys(keys: DirKeys): void;
  /** 点击那一刻的相机与视口。用函数而不是值 —— 相机每帧在动 */
  view(): { cam: Camera; viewport: ViewportSize };
}

/** 焦点在输入框里时不要抢键盘（T4 的抽屉里可能有搜索框） */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return el.isContentEditable === true;
}

/**
 * 绑定指针与键盘事件，返回解绑函数。
 *
 * 指针只用 Pointer Events（鼠标 / 触摸 / 笔同一套），
 * 只跟踪**第一根手指**：第二根手指（双指缩放）由界面层处理，这里直接忽略，
 * 避免缩放时误触发移动。
 */
export function bindInput(host: HTMLElement, handlers: InputHandlers): () => void {
  let activeId: number | null = null;
  let downX = 0;
  let downY = 0;
  let downAt = 0;
  let moved = false;

  const localPoint = (clientX: number, clientY: number): Vec2 => {
    const rect = host.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const onPointerDown = (evt: PointerEvent) => {
    if (activeId !== null) return; // 已经有手指按着，这一根是缩放用的
    if (evt.button !== 0 && evt.pointerType === 'mouse') return; // 只认左键
    activeId = evt.pointerId;
    downX = evt.clientX;
    downY = evt.clientY;
    downAt = evt.timeStamp;
    moved = false;
  };

  const onPointerMove = (evt: PointerEvent) => {
    if (activeId === null || evt.pointerId !== activeId) return;
    // 拖拽：不移动小人、不平移相机，只是把这次点击作废
    if (Math.hypot(evt.clientX - downX, evt.clientY - downY) > TAP_SLOP) {
      moved = true;
    }
  };

  const settle = (evt: PointerEvent, isUp: boolean) => {
    if (activeId === null || evt.pointerId !== activeId) return;
    activeId = null;
    if (!isUp || moved) return;
    if (evt.timeStamp - downAt > TAP_TIMEOUT) return; // 长按不是点击
    const { cam, viewport } = handlers.view();
    handlers.onTap(screenToWorld(localPoint(evt.clientX, evt.clientY), cam, viewport));
  };

  const onPointerUp = (evt: PointerEvent) => settle(evt, true);
  const onPointerCancel = (evt: PointerEvent) => settle(evt, false);

  const keys: DirKeys = { ...NO_KEYS };

  const emitKeys = () => handlers.onKeys({ ...keys });

  const onKeyDown = (evt: KeyboardEvent) => {
    if (evt.metaKey || evt.ctrlKey || evt.altKey) return;
    if (isTypingTarget(evt.target)) return;
    const dir = keyToDir(evt.key);
    if (!dir) return;
    // 方向键会滚动页面，必须吃掉默认行为
    evt.preventDefault();
    if (keys[dir]) return;
    keys[dir] = true;
    emitKeys();
  };

  const onKeyUp = (evt: KeyboardEvent) => {
    const dir = keyToDir(evt.key);
    if (!dir) return;
    if (!keys[dir]) return;
    keys[dir] = false;
    emitKeys();
  };

  /** 失焦时清空按键，否则切回来小人会一直朝一个方向走 */
  const onBlur = () => {
    if (isEmptyKeys(keys)) return;
    keys.up = false;
    keys.down = false;
    keys.left = false;
    keys.right = false;
    emitKeys();
  };

  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('pointermove', onPointerMove);
  host.addEventListener('pointerup', onPointerUp);
  host.addEventListener('pointercancel', onPointerCancel);
  host.addEventListener('pointerleave', onPointerCancel);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return () => {
    host.removeEventListener('pointerdown', onPointerDown);
    host.removeEventListener('pointermove', onPointerMove);
    host.removeEventListener('pointerup', onPointerUp);
    host.removeEventListener('pointercancel', onPointerCancel);
    host.removeEventListener('pointerleave', onPointerCancel);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}
