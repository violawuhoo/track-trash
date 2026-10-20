/**
 * 世界画布挂载点：PixiJS 8 世界层 + 相机 + 点击移动。
 *
 * 契约见 `docs/CONTRACT-v2.md` §4、`REDESIGN.md` §5 §7。
 *
 * ## 分工（一遍就能记住）
 *
 * | 谁 | 负责 |
 * |---|---|
 * | 这个文件 | Application 生命周期、每帧积分位移、相机、把 props 灌进层 |
 * | `layers.ts` | 五层容器 + 星球/太空/雾障的静态绘制 |
 * | `camera.ts` | 死区跟随与圆形夹紧（纯函数） |
 * | `sprites.ts` | 物品纹理缓存、物品层增删、角色帧 |
 * | `input.ts` | 指针/键盘 → 世界坐标 |
 *
 * ## 状态归属（重要，别搞反）
 *
 * - **世界层只读业务状态**。`items` / `player` / `lockedAreas` 都是 props，
 *   这个文件不写 store、不定义 action、不 import `gameStore`。
 * - **位移由世界层积分**：它有帧循环、知道碰撞，所以位置的一阶导在这里算；
 *   每帧通过 `onPlayerPos` 上报，T4 把它接到 `store.setPlayerPos` 即可。
 *   `player` prop 只在**外部要求跳转**时生效（换档、回坠毁点）。
 * - 全部内部状态（相机、动画相位、纹理缓存）都在 `mountRuntime` 的闭包里，
 *   React 侧**零 state、零重渲染**。世界层每帧变，走 props 会让 React 每帧渲染。
 *
 * ## 生命周期
 *
 * React 18 StrictMode 会「挂载 → 卸载 → 挂载」。这里用 `disposed` 标记保证：
 * `app.init()` 还没 resolve 就被卸载时，等它 resolve 出来第一件事是销毁自己，
 * 所以画布不会重复、ticker 不会残留。
 */
import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import {
  AREAS,
  WORLD,
  areaOfPoint,
  clampToWalkable,
  type AreaId,
  type PlacedItem,
  type Vec2,
} from '@haola/game-core';

import {
  clampCamera,
  clampZoom,
  cameraTransform,
  follow,
  type ViewportSize,
} from './camera';
import { bindInput, dirVector, type DirKeys, NO_KEYS } from './input';
import {
  ItemField,
  createPlayerNode,
  prefetchPlayer,
  releaseTextures,
  retainTextures,
  updatePlayerFrame,
} from './sprites';
import {
  createFog,
  createTerrain,
  createLayers,
  createPlanetRim,
  createPlanetSurface,
  createSpace,
  cssColor,
  sectorDeg,
} from './layers';
import { FOG_SHAPE } from './assets/geometry';
import { SPACE } from './assets/palette';
import type { PlayerDir } from './assets/player';
import { WORLD_STATS } from './diagnostics';

export interface WorldCanvasProps {
  /** 只用于样式定位。**必须给这个元素一个确定的尺寸**（世界层不猜布局） */
  className?: string;
  /** 地面物品。同一次渲染内不要新建数组，否则每帧都会走一遍 sync */
  items: readonly PlacedItem[];
  /** 角色的权威位置（初次挂载 + 外部跳转）。位移由世界层积分，见文件头 */
  player: Vec2;
  /** 点击地面：世界坐标（已夹进可走圆）。接到 `store.setMoveTarget` */
  onMoveTo?: (x: number, y: number) => void;
  /** 走进 40 单位拾取半径：物品 uid。接到 `store.collect` */
  onCollect?: (uid: string) => void;
  /** 走进未解锁扇区（会被人为挡住）。接到 `store` 的 blockedArea 并出台词 */
  onAreaBlocked?: (area: AreaId) => void;
  /** 每帧上報一次位置。接到 `store.setPlayerPos`（内部不得持久化） */
  onPlayerPos?: (x: number, y: number) => void;
  /** 缩放。缺省保持上一次的值，范围 0.8–1.6 */
  zoom?: number;
  /** 未解锁区域（画雾障 + 挡住不让人进）。缺省 `[]` = 全部解锁 */
  lockedAreas?: readonly AreaId[];
}

// ───────────────────────── 手感常量 ─────────────────────────

/** 移动速度（世界单位 / 秒，REDESIGN §3.3） */
const SPEED = 140;
/** 到点前 40 单位开始 ease-out，避免"撞墙式"急停 */
const ARRIVE = 40;
/** 距目标小于这个距离就算到了 */
const STOP_EPS = 2;
/** 走路循环帧率（6 帧一轮，T2 的真图到位后不用改） */
const WALK_FPS = 9;
/** 单帧最大步长：切标签页回来时 deltaMS 可能是几秒，不夹会把小人弹到边界 */
const MAX_DT = 0.05;
/** 同一个未解锁扇区的台词节流 */
const BLOCK_THROTTLE = 1200;
/** 同一个物品的自动拾取节流（防止 T4 还没把它从数据里移除时连环触发） */
const COLLECT_THROTTLE = 700;

const PLAYER_STAND_STEP = 2;

function nearlyEqual(a: Vec2, b: Vec2, eps = 0.5): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}

/** 位移方向 → 四向朝向（取主轴，斜走时保持上一次的朝向感） */
function dirOf(dx: number, dy: number, fallback: PlayerDir): PlayerDir {
  if (dx === 0 && dy === 0) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

export function WorldCanvas(props: WorldCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  /** 最新 props。帧循环读这个，不放进依赖数组，避免重建整个世界 */
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    WORLD_STATS.mounts++;
    let disposed = false;
    let teardown: (() => void) | null = null;
    const app = new Application();

    const boot = async () => {
      await app.init({
        // 太空底色：与 bg 层同源，视口超出世界方形时不会露出诡异的白
        background: cssColor(SPACE).color,
        antialias: true,
        // DPR 上限 2：3 倍屏上 2 倍已经看不出差别，显存却要多 2.25 倍
        resolution: Math.min(2, window.devicePixelRatio || 1),
        autoDensity: true,
        width: Math.max(1, host.clientWidth),
        height: Math.max(1, host.clientHeight),
      });

      // 卸载比 init 更快时：谁来销毁谁负责，不能留下一个游离的 WebGL 上下文
      if (disposed) {
        app.destroy({ removeView: true }, { children: true });
        return;
      }

      host.appendChild(app.canvas);
      app.canvas.style.display = 'block';

      teardown = mountRuntime(app, host, propsRef);
      WORLD_STATS.liveApps++;
    };

    void boot().catch((err: unknown) => {
      // 没有 WebGL 时不要把整个应用一起带走：世界层静默降级为空白
      console.warn('[world] Pixi 初始化失败', err);
      try {
        app.destroy({ removeView: true }, { children: true });
      } catch {
        /* 已经销毁过 */
      }
    });

    return () => {
      disposed = true;
      WORLD_STATS.teardowns++;
      if (teardown) {
        teardown();
        WORLD_STATS.liveApps--;
        teardown = null;
      }
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={props.className}
      // 世界层对读屏是一个"图片"：区域名 + 地上有几件东西（文本在 T4 的 DOM 层）
      role="img"
      aria-label="星球"
      data-world="pixi"
      // touch-action: none —— 否则移动端 pointermove 会被浏览器拿去滚页面，
      // 点击移动与双指缩放都会失效
      style={{ touchAction: 'none', width: '100%', height: '100%' }}
    />
  );
}

// ───────────────────────── 运行时 ─────────────────────────

type PropsRef = { current: WorldCanvasProps };

/**
 * 建好整个世界并启动帧循环，返回幂等的清理函数。
 *
 * 所有状态都是闭包变量：没有 `this`，没有类，没有 React state。
 */
function mountRuntime(app: Application, host: HTMLDivElement, propsRef: PropsRef): () => void {
  const first = propsRef.current;

  const layers = createLayers();
  app.stage.addChild(layers.root);

  // ── bg / ground：一次性静态绘制 ──
  // ground 的子节点顺序就是绘制顺序，**不能乱**：
  //   星球面 → 地形 → 雾障 → 星球缘（墨线 + 大气虚线）
  // 星球缘必须最后：它是画面边界，任何地面效果都不许盖住它。
  const ground = layers.layers.ground;
  layers.layers.bg.addChild(createSpace());
  ground.addChild(createPlanetSurface());
  ground.addChild(createTerrain());

  let locked: readonly AreaId[] = first.lockedAreas ?? [];
  let fog = createFog(locked);
  if (fog) ground.addChild(fog);
  const rim = createPlanetRim();
  ground.addChild(rim);

  // ── actors ──
  const playerNode = createPlayerNode();
  layers.layers.actors.addChild(playerNode.root);

  // ── items ──
  retainTextures();
  prefetchPlayer();
  const field = new ItemField(layers.layers.items, layers.layers.fx);
  let items: readonly PlacedItem[] = first.items;
  field.sync(items, performance.now());

  // ── 内部状态 ──
  const viewport: ViewportSize = {
    w: Math.max(1, app.screen.width),
    h: Math.max(1, app.screen.height),
  };
  let pos: Vec2 = clampToWalkable(first.player);
  // 相机直接落在角色身上：读档时角色可能在星球边缘，从圆心慢慢追会白走一段
  let cam = clampCamera({ x: pos.x, y: pos.y, zoom: clampZoom(first.zoom ?? 1) });
  let target: Vec2 | null = null;
  let keys: DirKeys = { ...NO_KEYS };
  let dir: PlayerDir = 'down';
  let step = PLAYER_STAND_STEP;
  let walkPhase = 0;
  /** 上一次换帧用的 (dir, step)，避免每帧重查纹理 */
  let paintedDir: PlayerDir | null = null;
  let paintedStep = -1;
  /** 我们上报过的位置。用于区分「自己的回声」和「外部要求跳转」 */
  let emitted: Vec2 = { x: pos.x, y: pos.y };
  /** 上一次看到的 player prop 对象。只在它换新对象时才考虑跳转 */
  let seenPlayerProp: Vec2 | null = first.player;
  const collected = new Map<string, number>();
  let blocked: { area: AreaId; at: number } | null = null;
  let label = '';
  let labelAt = 0;
  let reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  playerNode.root.position.set(pos.x, pos.y);

  // ── 位置合法性（圆内 + 雾障外） ──

  /** 点是否落在某个未解锁扇区的雾障里 */
  const blockedAreaAt = (p: Vec2): AreaId | null => {
    if (locked.length === 0) return null;
    const dx = p.x - WORLD.center.x;
    const dy = p.y - WORLD.center.y;
    const r = Math.hypot(dx, dy);
    // 雾障只覆盖环带（FOG_SHAPE），与视觉一致：画到哪里挡到哪里
    if (r < FOG_SHAPE.inner || r > FOG_SHAPE.outer) return null;
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    for (const area of locked) {
      if (area === 'crash') continue;
      let delta = ((((deg - sectorDeg(area) + 180) % 360) + 360) % 360) - 180;
      if (delta === -180) delta = 180;
      if (Math.abs(delta) <= FOG_SHAPE.halfDeg) return area;
    }
    return null;
  };

  /** 一次位移：先夹圆，再挡雾障；挡住时沿切向滑动而不是硬停 */
  const tryMove = (from: Vec2, to: Vec2): { pos: Vec2; blockedArea: AreaId | null } => {
    const clamped = clampToWalkable(to);
    const hit = blockedAreaAt(clamped);
    if (!hit) return { pos: clamped, blockedArea: null };
    const slideX = clampToWalkable({ x: clamped.x, y: from.y });
    if (!blockedAreaAt(slideX)) return { pos: slideX, blockedArea: hit };
    const slideY = clampToWalkable({ x: from.x, y: clamped.y });
    if (!blockedAreaAt(slideY)) return { pos: slideY, blockedArea: hit };
    return { pos: from, blockedArea: hit };
  };

  // ── 相机 / 变换 ──

  const applyTransform = () => {
    const t = cameraTransform(cam, viewport);
    layers.root.position.set(t.x, t.y);
    layers.root.scale.set(t.scale);
  };
  applyTransform();

  // ── 每帧 ──

  const frame = () => {
    const props = propsRef.current;
    const now = performance.now();
    const dt = Math.min(MAX_DT, app.ticker.deltaMS / 1000);

    // 1) props 同步（只在真的变了的时候动手）
    if (props.items !== items) {
      items = props.items;
      field.sync(items, now);
      // 已拾取的 uid 清理掉，别让 Map 无限长
      for (const uid of [...collected.keys()]) {
        if (!items.some((it) => it.uid === uid)) collected.delete(uid);
      }
    }
    if (props.lockedAreas !== undefined && props.lockedAreas !== locked) {
      const same =
        props.lockedAreas.length === locked.length &&
        props.lockedAreas.every((a, i) => a === locked[i]);
      if (!same) {
        locked = props.lockedAreas;
        if (fog) fog.destroy({ children: true });
        fog = createFog(locked);
        if (fog) ground.addChild(fog);
        // 重新挂一次缘：addChild 会把已有节点移到末尾，保证缘始终在最上面
        ground.addChild(rim);
      }
    }

    // 2) 外部要求跳转（换档 / 回坠毁点）。自己的回声不算
    if (props.player !== seenPlayerProp) {
      seenPlayerProp = props.player;
      const external = props.player;
      if (!nearlyEqual(external, pos) && !nearlyEqual(external, emitted)) {
        pos = clampToWalkable(external);
        target = null;
        emitted = { x: pos.x, y: pos.y };
      }
    }

    // 3) 位移积分
    const from = pos;
    let next: Vec2 = pos;
    const kv = dirVector(keys);
    if (kv.x !== 0 || kv.y !== 0) {
      target = null; // 键盘抢走控制权
      next = { x: pos.x + kv.x * SPEED * dt, y: pos.y + kv.y * SPEED * dt };
    } else if (target) {
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= STOP_EPS) {
        target = null;
      } else {
        const speed = SPEED * Math.max(0.25, Math.min(1, dist / ARRIVE));
        const move = Math.min(dist, speed * dt);
        next = { x: pos.x + (dx / dist) * move, y: pos.y + (dy / dist) * move };
      }
    }

    if (next !== pos) {
      const moved = tryMove(from, next);
      pos = moved.pos;
      if (moved.blockedArea) {
        // 走到雾障上：撞一次，报一次，别刷屏
        if (!blocked || blocked.area !== moved.blockedArea || now - blocked.at > BLOCK_THROTTLE) {
          blocked = { area: moved.blockedArea, at: now };
          props.onAreaBlocked?.(moved.blockedArea);
        }
      }
    }

    // 4) 上报位置（每帧，T4 内部不得持久化）
    if (!nearlyEqual(pos, emitted, 0.01)) {
      emitted = { x: pos.x, y: pos.y };
      props.onPlayerPos?.(pos.x, pos.y);
    }

    // 5) 朝向 / 走路循环
    const vx = pos.x - from.x;
    const vy = pos.y - from.y;
    const speed = dt > 0 ? Math.hypot(vx, vy) / dt : 0;
    if (speed > 4) {
      dir = dirOf(vx, vy, dir);
      walkPhase = (walkPhase + (dt * speed) / SPEED * WALK_FPS) % 6;
      step = Math.floor(walkPhase);
    } else {
      walkPhase = 0;
      step = PLAYER_STAND_STEP;
    }
    // reduced-motion：停走路循环，只保留位移（定格第 2 帧）
    if (reduced) step = PLAYER_STAND_STEP;
    // 纹理是异步栅格化的：首帧大概率还没好，`updatePlayerFrame` 会直接 return。
    // 所以这里除了 (dir, step) 变化，还要在「还没贴上第一张图」时重试 ——
    // 否则站着不动的玩家（dir/step 永远不变）会永远只剩一个贴地阴影。
    // 物品贴纸没有这个问题：ItemField.tick 每帧重试 applyTexture。
    if (dir !== paintedDir || step !== paintedStep || !playerNode.sprite.visible) {
      paintedDir = dir;
      paintedStep = step;
      updatePlayerFrame(playerNode, dir, step);
      WORLD_STATS.currentStep = step;
      WORLD_STATS.stepsSeen.add(step);
    }
    playerNode.root.position.set(pos.x, pos.y);

    // 6) 物品层 + 自动拾取 + 对焦
    field.tick(dt * 1000, now, pos, reduced);

    let focus: string | null = null;
    let focusDist: number = WORLD.focusRadius;
    for (const it of items) {
      const d = Math.hypot(it.x - pos.x, it.y - pos.y);
      if (d < focusDist) {
        focusDist = d;
        focus = it.uid;
      }
      if (d <= WORLD.pickupRadius) {
        const last = collected.get(it.uid);
        if (last === undefined || now - last > COLLECT_THROTTLE) {
          collected.set(it.uid, now);
          props.onCollect?.(it.uid);
        }
      }
    }
    field.setHighlight(focus);

    // 7) 相机（死区跟随 + 圆形夹紧）
    cam = follow({ ...cam, zoom: clampZoom(props.zoom ?? cam.zoom) }, pos, viewport);
    applyTransform();

    // 8) 无障碍标签：区域名 + 地上物品数（只在变化时写 DOM，不触发 React）
    //    每 300ms 才拼一次字符串：热路径上不做无谓的分配
    if (now - labelAt > 300) {
      labelAt = now;
      const area = areaOfPoint(pos);
      const nextLabel = `${AREAS[area].name}，地上 ${items.length} 件东西`;
      if (nextLabel !== label) {
        label = nextLabel;
        host.setAttribute('aria-label', nextLabel);
      }
    }
  };

  app.ticker.add(frame);
  WORLD_STATS.liveTickers++;

  // ── 输入 ──
  const unbindInput = bindInput(host, {
    onTap: (worldPoint) => {
      const clamped = clampToWalkable(worldPoint);
      // 点进雾障里不动 —— 看不见的地方不该能走
      const hit = blockedAreaAt(clamped);
      if (hit) {
        if (!blocked || blocked.area !== hit || performance.now() - blocked.at > BLOCK_THROTTLE) {
          blocked = { area: hit, at: performance.now() };
          propsRef.current.onAreaBlocked?.(hit);
        }
        return;
      }
      target = clamped;
      propsRef.current.onMoveTo?.(clamped.x, clamped.y);
    },
    onKeys: (next) => {
      keys = next;
    },
    view: () => ({ cam, viewport }),
  });

  // ── 尺寸：ResizeObserver 而不是 window.resize（侧栏收起来也要跟）──
  const ro = new ResizeObserver(() => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    if (w === viewport.w && h === viewport.h) return;
    app.renderer.resize(w, h);
    viewport.w = w;
    viewport.h = h;
    cam = follow(cam, pos, viewport);
    applyTransform();
  });
  ro.observe(host);

  // ── 页面隐藏时停 ticker：后台不该烧电 ──
  const onVisibility = () => {
    if (document.hidden) app.ticker.stop();
    else app.ticker.start();
  };
  document.addEventListener('visibilitychange', onVisibility);

  // ── prefers-reduced-motion ──
  const mql =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  const onMotionChange = () => {
    reduced = mql?.matches ?? false;
  };
  mql?.addEventListener('change', onMotionChange);

  // ── 清理（幂等）──
  let torndown = false;
  return () => {
    if (torndown) return;
    torndown = true;

    document.removeEventListener('visibilitychange', onVisibility);
    mql?.removeEventListener('change', onMotionChange);
    ro.disconnect();
    unbindInput();

    app.ticker.remove(frame);
    WORLD_STATS.liveTickers--;

    field.destroy();
    releaseTextures(); // 最后一个用户走的时候释放全部纹理
    app.destroy({ removeView: true }, { children: true });
  };
}
