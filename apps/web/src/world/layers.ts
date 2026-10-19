/**
 * 五层容器：bg / ground / items / actors / fx，以及世界层的静态绘制。
 *
 * 契约见 `docs/CONTRACT-v2.md` §4.2、`REDESIGN.md` §3.2。
 *
 * 三条不能被推翻的决定：
 *
 * 1. **层顺序固定且不可合并**（bg → ground → items → actors → fx）。
 *    物品永远在人脚下，飞入特效永远在最上面。合并层会在加一个特效时立刻翻车。
 *
 * 2. **星球不出纹理**。`planetRadius = 640` 的圆，在 DPR 2 + zoom 1.6 下
 *    要 2048×2048 的纹理 ≈ 16MB 显存，而它只是一个圆盘 + 一圈虚线。
 *    用 `Graphics` 现画，GPU 侧只有几十个顶点。
 *
 * 3. **所有颜色来自 `assets/palette.ts`**。渲染代码里不出现 hex 字面量，
 *    也不出现 `var(--*)`（CSS 变量在 canvas 里根本不存在）。
 *    带 alpha 的令牌（`ALPHA.*`）是 `rgba(...)` 字符串，所以下面有一个
 *    最小解析器把它拆成 Pixi 要的 `{ color, alpha }`。
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import { WORLD, sectorCenter, type AreaId } from '@haola/game-core';

import { ATMOSPHERE_DASH, FOG_SHAPE, PLANET } from './assets/geometry';
import { ALPHA, INK, PALETTE, SPACE } from './assets/palette';
import {
  HILL_SIZES,
  HILL_VARIANTS,
  PATCH_SIZES,
  PATCH_VARIANTS,
  PIT_SIZES,
  PIT_VARIANTS,
  ROCK_SIZES,
  ROCK_VARIANTS,
  TERRAIN_ANCHOR,
  hillSvg,
  patchSvg,
  pitSvg,
  rockSvg,
} from './assets/terrain';
import { loadSvgTexture } from './sprites';

export type LayerName = 'bg' | 'ground' | 'items' | 'actors' | 'fx';

/** 顺序即绘制顺序：下标越大越靠前。**不要重排** */
export const LAYER_ORDER: readonly LayerName[] = [
  'bg',
  'ground',
  'items',
  'actors',
  'fx',
] as const;

export interface LayerSet {
  /** 世界容器（受相机变换）。五层都是它的直接子节点 */
  root: Container;
  layers: Record<LayerName, Container>;
}

/** 创建五层并挂到同一个根容器；返回句柄，供 update / destroy 使用 */
export function createLayers(): LayerSet {
  const root = new Container();
  const layers = {} as Record<LayerName, Container>;
  for (const name of LAYER_ORDER) {
    const layer = new Container();
    layers[name] = layer;
    root.addChild(layer);
  }
  return { root, layers };
}

export function destroyLayers(set: LayerSet): void {
  set.root.destroy({ children: true });
}

// ───────────────────────── 颜色桥 ─────────────────────────

/**
 * `#rrggbb` / `#rgb` / `rgba(r,g,b,a)` → Pixi 的 `{ color, alpha }`。
 *
 * 存在的唯一理由：`palette.ts` 里的 `ALPHA.*` 是 CSS 字符串，
 * 而 Pixi 要一个 0xRRGGBB 数字 + 独立 alpha。
 * 解析失败直接抛 —— 颜色写错应该在挂载时就炸，不是静默画成黑色。
 */
export function cssColor(css: string): { color: number; alpha: number } {
  const text = css.trim();

  if (text.startsWith('#')) {
    const hex = text.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((c) => c + c)
            .join('')
        : hex;
    const value = Number.parseInt(full, 16);
    if (!Number.isFinite(value)) throw new Error(`[world] 颜色无法解析：${css}`);
    return { color: value, alpha: 1 };
  }

  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(
    text,
  );
  if (!m) throw new Error(`[world] 颜色无法解析：${css}`);
  const r = Math.round(Number(m[1]));
  const g = Math.round(Number(m[2]));
  const b = Math.round(Number(m[3]));
  const a = m[4] === undefined ? 1 : Number(m[4]);
  return { color: (r << 16) | (g << 8) | b, alpha: a };
}

/** `ALPHA.void` 的 Pixi 形态（雾障 / 大气虚线共用） */
const VOID = cssColor(ALPHA.void);

// ───────────────────────── bg ─────────────────────────

/**
 * 太空底：世界方形整块铺 `SPACE`。
 *
 * 只画一次，尺寸按世界边长 —— 相机被夹在星球圆内，视口最多能看到世界方形的
 * 边角，再外面的部分由渲染器的背景色兜底（`WorldCanvas` 里设成同一个色）。
 */
export function createSpace(): Graphics {
  const g = new Graphics();
  g.rect(0, 0, WORLD.size, WORLD.size).fill({ color: cssColor(SPACE).color });
  return g;
}

// ───────────────────────── ground ─────────────────────────

/** 极角（度）→ 圆周上的点。θ 以 +x 为 0°、+y 为 90°，与 `world.ts` 一致 */
function pointAt(r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return {
    x: WORLD.center.x + r * Math.cos(rad),
    y: WORLD.center.y + r * Math.sin(rad),
  };
}

/**
 * 大气层虚线环：`count` 段等角短弧（`ATMOSPHERE_DASH`）。
 *
 * 每段的角宽 = 360 / count；段内按 `len : gap` 切成实/空 ——
 * 所以改 `count` 是改密度，改 `len/gap` 是改手感，两者互不干扰。
 */
function drawAtmosphere(g: Graphics): void {
  const r = PLANET.r + PLANET.ringOffset;
  const segment = 360 / ATMOSPHERE_DASH.count;
  const sweep = (segment * ATMOSPHERE_DASH.len) / (ATMOSPHERE_DASH.len + ATMOSPHERE_DASH.gap);

  for (let i = 0; i < ATMOSPHERE_DASH.count; i++) {
    const start = (i * segment - 90) * (Math.PI / 180);
    const end = (i * segment - 90 + sweep) * (Math.PI / 180);
    g.moveTo(Math.cos(start) * r, Math.sin(start) * r);
    g.arc(0, 0, r, start, end);
  }
  g.stroke({ width: 2, color: VOID.color, alpha: VOID.alpha });
}

/**
 * 星球「面」：只有圆盘填充，**没有描边**。
 *
 * 描边单独由 `createPlanetRim()` 画，而且画在**雾层之上** ——
 * 星球轮廓与大气虚线是画面的"边界约定"，任何地面效果（雾、斑块、山）
 * 都不允许把它盖掉。ground 层的挂载顺序因此是：
 *
 *   `surface → terrain → fog → rim`
 *
 * 局部坐标原点放在星球圆心（`PLANET.cx/cy`）。
 */
export function createPlanetSurface(): Container {
  const node = new Container();
  node.position.set(PLANET.cx, PLANET.cy);
  const disk = new Graphics();
  disk.circle(0, 0, PLANET.r).fill({ color: cssColor(PALETTE.planet).color });
  node.addChild(disk);
  return node;
}

/**
 * 星球「缘」：3px 墨线 + 外侧 180 段大气虚线环。
 *
 * 必须挂在 ground 层的**最后一个**子节点位置，永远压在地形与雾障之上。
 */
export function createPlanetRim(): Container {
  const node = new Container();
  node.position.set(PLANET.cx, PLANET.cy);

  const rim = new Graphics();
  rim.circle(0, 0, PLANET.r).stroke({
    width: PLANET.ringW,
    color: cssColor(INK).color,
  });
  node.addChild(rim);

  const atmosphere = new Graphics();
  drawAtmosphere(atmosphere);
  node.addChild(atmosphere);

  return node;
}

// ───────────────────────── 雾障（未解锁扇区） ─────────────────────────

/**
 * 区域扇区中心角（度）。从 `sectorCenter()` 反推，避免复制第二份 0/-90/180。
 * `WorldCanvas` 判断"是否走进未解锁扇区"时也用它 —— 雾画在哪里就挡在哪里。
 */
export function sectorDeg(area: Exclude<AreaId, 'crash'>): number {
  const c = sectorCenter(area);
  return (Math.atan2(c.y - WORLD.center.y, c.x - WORLD.center.x) * 180) / Math.PI;
}

/** 环扇形多边形顶点（外弧正走 + 内弧倒走），局部坐标以星球圆心为原点 */
function annulusSector(
  inner: number,
  outer: number,
  centerDeg: number,
  halfDeg: number,
  steps = 24,
): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const deg = centerDeg - halfDeg + (2 * halfDeg * i) / steps;
    const p = pointAt(outer, deg);
    pts.push(p.x - WORLD.center.x, p.y - WORLD.center.y);
  }
  for (let i = steps; i >= 0; i--) {
    const deg = centerDeg - halfDeg + (2 * halfDeg * i) / steps;
    const p = pointAt(inner, deg);
    pts.push(p.x - WORLD.center.x, p.y - WORLD.center.y);
  }
  return pts;
}

/**
 * 未解锁扇区的雾障。
 *
 * ## 三条硬约束（每条都被返工过一次）
 *
 * 1. **裁剪在 `planetRadius` 圆内**：雾绝不能画到太空里。数学上
 *    `FOG_SHAPE.outer = 560 < 640` 已经保证了，这里仍加一个圆形 mask ——
 *    以后调 `outer` 或换 T2 的雾纹理时，不必重新推导一次边界。
 * 2. **绝不允许盖住星球墨线与大气虚线**：雾在 ground 层里排在
 *    `createPlanetRim()` **之前**（见 `WorldCanvas` 的挂载顺序）。
 * 3. **三档等宽阶梯、硬切换、越靠外越浓**（`FOG_SHAPE.steps = [.12,.24,.35]`）：
 *    内缘 0.12 起步，平均 0.24，纸感还在；35% 平涂会把奶油底压成灰。
 *    世界层禁止渐变与模糊，所以是阶梯而不是 ramp。
 *
 * 圆心圆盘（crash，r ≤ 200）本来就不在 `inner = 300` 之内，天然无雾。
 *
 * ⚠️ **一个 `Graphics` 只放一条环带**。Pixi 8 的 `Graphics` 是"路径构建器"，
 * 同一实例里连续 `poly().fill()` 会把先前的子路径当成后一次填充的孔洞。
 * 每条环带一个独立 `Graphics`（最多 9 个，静态，只建一次）。
 *
 * 传空数组就是"全部解锁"，返回 null（调用方不必挂一个空节点）。
 */
export function createFog(locked: readonly AreaId[]): Container | null {
  const sectors = locked.filter((a): a is Exclude<AreaId, 'crash'> => a !== 'crash');
  if (sectors.length === 0) return null;

  const node = new Container();
  node.position.set(WORLD.center.x, WORLD.center.y);

  // 三条等宽环带：300–386.7 / 386.7–473.3 / 473.3–560
  const { inner, outer, steps } = FOG_SHAPE;
  const span = (outer - inner) / 3;
  const bands: Array<[number, number, number]> = [
    [inner, inner + span, steps[0]],
    [inner + span, inner + span * 2, steps[1]],
    [inner + span * 2, outer, steps[2]],
  ];

  for (const area of sectors) {
    const deg = sectorDeg(area);
    for (const [r0, r1, alpha] of bands) {
      const bandShape = new Graphics();
      bandShape.poly(annulusSector(r0, r1, deg, FOG_SHAPE.halfDeg)).fill({
        color: VOID.color,
        alpha,
      });
      node.addChild(bandShape);
    }
  }

  // 圆形裁剪：雾只可能出现在星球圆盘之内
  const clip = new Graphics();
  clip.circle(0, 0, PLANET.r).fill({ color: 0xffffff });
  node.addChild(clip);
  node.mask = clip;

  return node;
}

// ───────────────────────── 地形（T2 的 17 张 SVG） ─────────────────────────

/**
 * 地面装饰：斑块 / 山 / 石 / 坑。资产来自 `assets/terrain.ts`（T2），
 * **这里只负责摆放**，三条规则全部照 T2 给的约定（`shots/t2-terrain-context.png` 是对图基准）：
 *
 * 1. **山必须「峰朝外」**：`anchor = (0.5, 1)`（底边中点）+
 *    `rotation = 方位角 + 90°`。山形是闭合山脊 + 平底边，底座切向球缘、
 *    峰朝外，才能沿球缘串成一条地平线。随手给个角度会让底座弦线指向随机方向，
 *    整排山立刻变成散落的三角形贴纸 —— 这是唯一「不照做就会难看」的一条。
 * 2. **斑块不能出血**：它没有描边，填充是 `--planet-shade`，
 *    中心半径必须 ≤ `planetRadius - size / 2`，否则纸色会溢到球外的 `--space` 上。
 * 3. **撒点用黄金角螺旋**（137.5°），不用纯随机（会结块成大陆 + 大片空白），
 *    也不用规则网格（会读成马赛克）。半径用 `sqrt` 采样才是面积均匀。
 *
 * 位置全部**确定性**（黄金角 + 哈希抖动，不用 Math.random）：截图必须可复现。
 */

/** 黄金角：2.399963 rad ≈ 137.5° */
const GOLDEN = 2.399963;

/** 确定性抖动（0–1）。同一个 i 每次都是同一个值 */
function jitter(i: number, seed: number): number {
  const v = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** 环带内面积均匀的极坐标点：半径按 sqrt 采样，角度按黄金角 */
function spiral(i: number, count: number, rMin: number, rMax: number): { deg: number; r: number } {
  const k = (i + 0.5) / count;
  const r = Math.sqrt(rMin * rMin + (rMax * rMax - rMin * rMin) * k);
  // 半径抖 ±8%、角度抖 ±0.18 rad（≈ ±10°）
  const jr = r * (1 + (jitter(i, 1) - 0.5) * 0.16);
  const deg = ((i * GOLDEN + (jitter(i, 2) - 0.5) * 0.36) * 180) / Math.PI;
  return { deg, r: jr };
}

type PropKind = 'patch' | 'hill' | 'rock' | 'pit';

interface PropSpec {
  kind: PropKind;
  variant: number;
  size: number;
  deg: number;
  r: number;
  /** 弧度。山靠它峰朝外 */
  rotation: number;
}

/**
 * 尺寸选择，按 T2 的「已知边界」：
 * - 山取 72 / 96 两档；斑块取 128 / 180（64 会把 #2#4#5 塌成同一个圆团）；
 * - 石只有 #1 能用 20，#3 必须 40（折面线 1 单位，20 下会糊）；
 * - 坑 #3 必须 56（崩口 1.7 单位 < 2 单位描边，40 下看不见）。
 */
function specFor(kind: PropKind, i: number, count: number): PropSpec {
  switch (kind) {
    case 'patch': {
      const variant = (i + 1) % PATCH_VARIANTS;
      const size = i % 2 === 0 ? PATCH_SIZES[3] : PATCH_SIZES[2];
      // 规则 2：中心半径上限 = planetRadius - size / 2 - 4（留 4 单位余量）
      const rMax = WORLD.planetRadius - size / 2 - 4;
      const p = spiral(i, count, 230, rMax);
      return { kind, variant, size, ...p, rotation: i * 0.7 };
    }
    case 'hill': {
      // 规则 1：底座压在球缘上，峰朝外 —— 底座贴着 640 的墨线时，
      // 山才和星球轮廓连成一条地平线（贴 560 会变成漂在纸面上的旗子）
      const variant = i % HILL_VARIANTS;
      const size = HILL_SIZES[variant % 2];
      const deg = ((i * GOLDEN) * 180) / Math.PI + (jitter(i, 3) - 0.5) * 8;
      // 底座压在 640 的墨线上：base 与星球轮廓重合后，"山"才读成地平线，
      // 而不是一枚漂在纸面上的旗子（fill 是 paper，任何露在白纸上的底边都会露馅）
      const r = 628 + (i % 2) * 8;
      return {
        kind,
        variant,
        size,
        deg,
        r,
        rotation: (deg * Math.PI) / 180 + Math.PI / 2,
      };
    }
    case 'rock': {
      const variant = i % ROCK_VARIANTS;
      const size = variant === 0 ? ROCK_SIZES[0] : variant === 3 ? ROCK_SIZES[2] : ROCK_SIZES[1];
      return {
        kind,
        variant,
        size,
        ...spiral(i, count, 140, 540),
        rotation: jitter(i, 4) * Math.PI * 2,
      };
    }
    default: {
      const variant = i % PIT_VARIANTS;
      const size = variant === 2 ? PIT_SIZES[1] : PIT_SIZES[0];
      return { kind, variant, size, ...spiral(i, count, 260, 520), rotation: 0 };
    }
  }
}

function svgFor(spec: PropSpec): string {
  switch (spec.kind) {
    case 'patch':
      return patchSvg(spec.variant, spec.size);
    case 'hill':
      return hillSvg(spec.variant, spec.size);
    case 'rock':
      return rockSvg(spec.variant, spec.size);
    default:
      return pitSvg(spec.variant, spec.size);
  }
}

/** 各地形的实例数：山只沿球缘排一圈，斑块铺面，石头与坑点到为止 */
const PROP_COUNTS: Readonly<Record<PropKind, number>> = {
  patch: 10,
  hill: 18,
  rock: 14,
  pit: 5,
};

export function createTerrain(): Container {
  const node = new Container();
  // 斑块在下、山石坑在上
  const flat = new Container();
  const solid = new Container();
  node.addChild(flat, solid);

  for (const kind of ['patch', 'hill', 'rock', 'pit'] as const) {
    const count = PROP_COUNTS[kind];
    for (let i = 0; i < count; i++) {
      const spec = specFor(kind, i, count);
      const pos = pointAt(spec.r, spec.deg);
      const sprite = new Sprite();
      const anchor = TERRAIN_ANCHOR[kind];
      sprite.anchor.set(anchor.x, anchor.y);
      sprite.position.set(pos.x, pos.y);
      sprite.rotation = spec.rotation;

      // 纹理按 (kind, variant, size) 缓存，同规格的实例共用一张
      const key = `terrain:${kind}:${spec.variant}:${spec.size}`;
      void loadSvgTexture(key, svgFor(spec)).then((tex) => {
        if (!tex || sprite.destroyed) return;
        sprite.texture = tex;
        sprite.width = spec.size;
        sprite.height = spec.size;
      });

      (kind === 'patch' ? flat : solid).addChild(sprite);
    }
  }

  return node;
}
