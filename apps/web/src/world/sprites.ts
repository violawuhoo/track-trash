/**
 * 物品贴纸 → Pixi 纹理，以及「地面上的物品」这一层的增删改。
 *
 * 契约见 `docs/CONTRACT-v2.md` §4.2 §4.3 §5.2 §5.3、`REDESIGN.md` §3.2 §3.3。
 *
 * 四件事：
 * 1. **形状唯一真源**：纹理全部来自 `components/ItemIcon.tsx` 的 `itemSvgMarkup()`。
 *    这里一行 SVG 路径都不写 —— 否则背包里的图标和地上的贴纸会慢慢长成两套。
 * 2. **按 id 缓存**：同一物品 id 只光栅化一次。18 个地面物品通常只有 10 来个不同 id，
 *    剩下的是重复使用同一张纹理（Pixi 会自动合批）。
 * 3. **不生成纹理的东西**：贴地投影用 `Graphics` 椭圆现画（`ITEM_SHADOW`），
 *    高亮环用 `Graphics` 虚线现画。纹理只给"贴纸本身"。
 * 4. **异步但不错位**：SVG → `Image.decode()` 是异步的，纹理就绪前 sprite 不可见，
 *    就绪后原地换上（不重建节点，所以不会有物品跳一下）。
 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { PlacedItem, Vec2 } from '@haola/game-core';

import { WORLD_DISPLAY, itemSvgMarkup } from '../components/ItemIcon';
import { ITEM_SHADOW } from './assets/geometry';
import { PALETTE, PLANET_SHADE } from './assets/palette';
import {
  PLAYER_H,
  PLAYER_W,
  playerSvg,
  type PlayerDir,
} from './assets/player';

// ───────────────────────── 常量 ─────────────────────────

/** 地面贴纸的世界尺寸（§5.3：28–36，定案 32） */
export const ITEM_SIZE = WORLD_DISPLAY;

/** 贴纸锚点：横向居中、纵向 86% —— 让"贴在纸上"的底边落在坐标点上 */
const ITEM_ANCHOR_X = 0.5;
const ITEM_ANCHOR_Y = 0.86;

/** 纹理分辨率。96 足够 zoom 1.6 + DPR 2 时仍然清晰（32 × 1.6 × 2 = 102） */
const ITEM_TEXTURE_PX = 96;
const PLAYER_TEXTURE_PX = 96;

/** 新物品长出来的时间（§6.2「0 → 1 的缩放动画」） */
const POP_MS = 260;
/** 拾取飞入的时长（§3.3：240ms） */
const FLY_MS = 240;
/** 高亮环：r = 24（直径 48，两个相距 32 的物品环不会重叠） */
const RING_R = 24;
const RING_DASH = 4;
const RING_WIDTH = 2;
/** 高亮浮动：±2 世界单位，1.2s 一个来回 */
const RING_BOB = 2;
const RING_BOB_MS = 1200;

const TAU = Math.PI * 2;

// ───────────────────────── 纹理缓存 ─────────────────────────

const cache = new Map<string, Texture>();
const pending = new Map<string, Promise<Texture | null>>();

/**
 * 代际号。卸载时 +1，让所有在途的异步光栅化丢弃结果 ——
 * 否则 StrictMode 的第二次挂载会拿到第一次挂载遗留的已销毁纹理。
 */
let generation = 0;
/** 还有人用这些纹理吗（两个 WorldCanvas 同时存在时才 > 1） */
let users = 0;

function rasterize(key: string, svg: string): Promise<Texture | null> {
  const hit = pending.get(key);
  if (hit) return hit;

  const gen = generation;
  const job = new Promise<Texture | null>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (gen !== generation) {
        resolve(null);
        return;
      }
      // SVG 自带 width/height，尺寸在 onload 之后就是确定的
      const tex = Texture.from(img);
      cache.set(key, tex);
      resolve(tex);
    };
    img.onerror = () => resolve(null); // 单张纹理失败不能炸掉整个世界层
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }).then((tex) => {
    pending.delete(key);
    return tex;
  });

  pending.set(key, job);
  return job;
}

/**
 * 通用 SVG 纹理入口（地形贴片用）。同一 key 只光栅化一次。
 * 未就绪返回 null，并在后台加载。
 */
export function svgTexture(key: string, svg: string): Texture | null {
  const hit = cache.get(key);
  if (hit) return hit;
  if (!pending.has(key)) void rasterize(key, svg);
  return null;
}

/** 通用 SVG 纹理 + Promise：给"静态一层、只建一次"的地形用 */
export function loadSvgTexture(key: string, svg: string): Promise<Texture | null> {
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  return rasterize(key, svg);
}

/**
 * 同步取物品纹理。**未就绪返回 null 并在后台加载** ——
 * 调用方下一帧再问一次即可。这样热路径永远不 await。
 */
export function textureFor(itemId: string): Texture | null {
  const key = `item:${itemId}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (!pending.has(key)) void rasterize(key, itemSvgMarkup(itemId, ITEM_TEXTURE_PX));
  return null;
}

/** 角色纹理。key 带 step，所以 T2 补 6 帧步态后这里零改动 */
export function playerTexture(dir: PlayerDir, step: number): Texture | null {
  const key = `player:${dir}:${step}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (!pending.has(key)) {
    void rasterize(key, playerSvg(dir, step, PLAYER_TEXTURE_PX));
  }
  return null;
}

/** 预热：4 向 × 6 帧，24 张小图，挂载时一次性发出去，避免走路时逐帧卡顿 */
export function prefetchPlayer(): void {
  const dirs: PlayerDir[] = ['down', 'up', 'left', 'right'];
  for (const dir of dirs) {
    for (let step = 0; step < 6; step++) playerTexture(dir, step);
  }
}

/** 引用计数 +1。每个 WorldCanvas 挂载时调一次 */
export function retainTextures(): void {
  users++;
}

/** 引用计数 -1；归零才真正释放显存 */
export function releaseTextures(): void {
  users = Math.max(0, users - 1);
  if (users === 0) disposeTextures();
}

/** 卸载时释放全部纹理，避免 WebGL 显存泄漏 */
export function disposeTextures(): void {
  generation++;
  for (const tex of cache.values()) tex.destroy(true);
  cache.clear();
  pending.clear();
}

/** 当前缓存里的纹理数（开发期验证用：卸载后必须是 0） */
export function textureCount(): number {
  return cache.size;
}

// ───────────────────────── 物品节点 ─────────────────────────

interface Tracked {
  uid: string;
  id: string;
  node: Container;
  sprite: Sprite;
  shadow: Graphics;
  /** 出生时刻，用于 0 → 1 的"长出来"动画 */
  bornAt: number;
  /** 已经进入飞入动画（被拾取了，等动画跑完就销毁） */
  flying: boolean;
  flyT: number;
  flyFrom: Vec2;
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

/** 贴地投影：实心椭圆，不是卡片阴影（用墨黑会立刻变成"卡片"） */
function createShadow(): Graphics {
  const g = new Graphics();
  g.ellipse(
    0,
    ITEM_SHADOW.dy,
    ITEM_SIZE * ITEM_SHADOW.rx,
    ITEM_SIZE * ITEM_SHADOW.ry,
  ).fill({ color: PLANET_SHADE });
  return g;
}

function createItemNode(item: PlacedItem, nowMs: number): Tracked {
  const node = new Container();
  node.position.set(item.x, item.y);

  // 投影在下、贴纸在上：所有坐标都在世界单位里，跟随 items 层一起被相机缩放
  const shadow = createShadow();
  node.addChild(shadow);

  const sprite = new Sprite();
  sprite.anchor.set(ITEM_ANCHOR_X, ITEM_ANCHOR_Y);
  sprite.width = ITEM_SIZE;
  sprite.height = ITEM_SIZE;
  node.addChild(sprite);

  const tracked: Tracked = {
    uid: item.uid,
    id: item.id,
    node,
    sprite,
    shadow,
    bornAt: nowMs,
    flying: false,
    flyT: 0,
    flyFrom: { x: item.x, y: item.y },
  };
  applyTexture(tracked);
  return tracked;
}

/** 纹理可能还没就绪：就绪后原地换上，不重建节点 */
function applyTexture(tracked: Tracked): void {
  const tex = textureFor(tracked.id);
  if (!tex) {
    tracked.sprite.visible = false;
    return;
  }
  tracked.sprite.texture = tex;
  tracked.sprite.visible = true;
  // 换纹理会重置尺寸，必须重设
  tracked.sprite.width = ITEM_SIZE;
  tracked.sprite.height = ITEM_SIZE;
}

/**
 * 高亮环：橙色虚线圆，`stroke-dasharray: 4 4` 的等价物。
 * Pixi 8 的 `Graphics` 没有虚线，所以按 4:4 的节奏拆成 22.5° 的短弧。
 */
function createRing(): Graphics {
  const g = new Graphics();
  const segment = Math.PI / 8; // 22.5° 一段
  // dash 4 / gap 4 → 每段实线占一半角度
  const half = segment * (RING_DASH / (RING_DASH * 2));
  for (let i = 0; i < 16; i++) {
    const a0 = i * segment;
    g.moveTo(Math.cos(a0) * RING_R, Math.sin(a0) * RING_R);
    g.arc(0, 0, RING_R, a0, a0 + half);
  }
  g.stroke({ width: RING_WIDTH, color: PALETTE.orange });
  return g;
}

/**
 * 地面物品层。**唯一改 `items` / `fx` 两个容器内容的类。**
 *
 * `sync()` 是幂等的：传同一份 `PlacedItem[]` 两次，第二次什么也不做。
 * 卸载时 `destroy()` 会把自家节点和飞入中的残影一起清掉。
 */
export class ItemField {
  private readonly layer: Container;
  private readonly fx: Container;
  private readonly tracked = new Map<string, Tracked>();
  private readonly ring: Graphics;
  private highlightUid: string | null = null;
  /** 环的基准 y（浮动只改这之上的偏移，避免累积漂移） */
  private ringBaseY = 0;
  private dead = false;

  constructor(layer: Container, fx: Container) {
    this.layer = layer;
    this.fx = fx;
    this.ring = createRing();
    this.ring.visible = false;
    this.layer.addChild(this.ring);
  }

  /** 让 items 层与 `PlacedItem[]` 对齐：新增的冒出来，消失的飞走 */
  sync(items: readonly PlacedItem[], nowMs: number): void {
    if (this.dead) return;

    const alive = new Set<string>();
    for (const item of items) {
      alive.add(item.uid);
      const hit = this.tracked.get(item.uid);
      // 已经在飞入队列里的旧节点不算数：同一个 uid 又被数据带回来时建一个新的
      if (hit && !hit.flying) {
        // 未拾取的物品刷新时保留原位，但坐标仍以数据为准
        if (hit.node.position.x !== item.x || hit.node.position.y !== item.y) {
          hit.node.position.set(item.x, item.y);
        }
        hit.flyFrom = { x: item.x, y: item.y };
        // 纹理是异步的，没就绪的每帧问一次
        if (!hit.sprite.visible) applyTexture(hit);
        continue;
      }
      const created = createItemNode(item, nowMs);
      created.node.scale.set(0);
      this.layer.addChild(created.node);
      this.tracked.set(item.uid, created);
    }

    for (const [uid, node] of this.tracked) {
      if (alive.has(uid) || node.flying) continue;
      node.flying = true;
      node.flyT = 0;
      node.flyFrom = { x: node.node.position.x, y: node.node.position.y };
      // 交给 fx 层演飞入，跑完自毁
      this.fx.addChild(node.node);
    }

    if (this.highlightUid && !alive.has(this.highlightUid)) {
      this.setHighlight(null);
    }
  }

  /** 同一时刻只高亮一个目标（§3.2） */
  setHighlight(uid: string | null): void {
    if (this.highlightUid === uid) return;
    this.highlightUid = uid;
    const node = uid ? this.tracked.get(uid) : null;
    // 飞入中的节点已经交给 fx 层，不再参与对焦
    if (!node || node.flying) {
      this.highlightUid = null;
      this.ring.visible = false;
      return;
    }
    this.ring.position.set(node.node.position.x, node.node.position.y);
    this.ringBaseY = node.node.position.y;
    // 重新挂到末尾 = 画在物品贴纸之上，否则环顶会被贴纸咬掉一块
    this.layer.addChild(this.ring);
    this.ring.visible = true;
  }

  tick(
    dtMs: number,
    nowMs: number,
    player: Vec2,
    reducedMotion: boolean,
  ): void {
    if (this.dead) return;

    for (const node of this.tracked.values()) {
      if (node.flying) {
        this.stepFly(node, dtMs, player, reducedMotion);
        continue;
      }
      // 长出来：0 → 1，reduced-motion 时直接满尺寸
      const k = reducedMotion ? 1 : Math.min(1, (nowMs - node.bornAt) / POP_MS);
      if (k < 1) node.node.scale.set(easeOutCubic(k));

      // 纹理迟到：就绪后原地换上
      if (!node.sprite.visible) applyTexture(node);
    }

    if (this.ring.visible) {
      const bob = reducedMotion
        ? 0
        : Math.sin((nowMs / RING_BOB_MS) * TAU) * RING_BOB;
      this.ring.y = this.ringBaseY + bob;
    }
  }

  private stepFly(
    node: Tracked,
    dtMs: number,
    player: Vec2,
    reducedMotion: boolean,
  ): void {
    if (reducedMotion) {
      this.kill(node);
      return;
    }
    node.flyT = Math.min(1, node.flyT + dtMs / FLY_MS);
    const t = node.flyT;
    // 1 → 1.3 → 0：先弹一下再消失，同时朝小人方向收拢
    const scale = t < 0.45 ? 1 + (t / 0.45) * 0.3 : 1.3 * (1 - (t - 0.45) / 0.55);
    node.node.scale.set(Math.max(0, scale));
    node.node.alpha = Math.max(0, 1 - Math.max(0, t - 0.6) / 0.4);
    const k = easeOutCubic(t);
    node.node.position.set(
      node.flyFrom.x + (player.x - node.flyFrom.x) * k,
      node.flyFrom.y + (player.y - node.flyFrom.y) * k,
    );
    if (node.flyT >= 1) this.kill(node);
  }

  private kill(node: Tracked): void {
    // 只删自己的那条：同一个 uid 可能在飞入途中被新节点顶替
    if (this.tracked.get(node.uid) === node) this.tracked.delete(node.uid);
    node.node.destroy({ children: true });
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    for (const node of [...this.tracked.values()]) this.kill(node);
    this.tracked.clear();
    this.ring.destroy();
  }
}

// ───────────────────────── 角色节点 ─────────────────────────

/** 锚点在脚底：坐标点就是"脚踩的位置" */
const PLAYER_ANCHOR_Y = 1;

export interface PlayerNode {
  root: Container;
  sprite: Sprite;
  shadow: Graphics;
}

export function createPlayerNode(): PlayerNode {
  const root = new Container();

  const shadow = new Graphics();
  shadow
    .ellipse(0, -1, PLAYER_W * ITEM_SHADOW.rx * 0.9, PLAYER_W * ITEM_SHADOW.ry * 0.9)
    .fill({ color: PLANET_SHADE });

  const sprite = new Sprite();
  sprite.anchor.set(0.5, PLAYER_ANCHOR_Y);
  sprite.width = PLAYER_W;
  sprite.height = PLAYER_H;
  sprite.visible = false;

  root.addChild(shadow, sprite);
  return { root, sprite, shadow };
}

/** 换帧。纹理没就绪就保持上一帧，绝不闪成空白 */
export function updatePlayerFrame(
  node: PlayerNode,
  dir: PlayerDir,
  step: number,
): void {
  const tex = playerTexture(dir, step);
  if (!tex) return;
  node.sprite.texture = tex;
  node.sprite.visible = true;
  node.sprite.width = PLAYER_W;
  node.sprite.height = PLAYER_H;
}
