/**
 * 地形资产 —— 地面斑块 / 山 / 石 / 坑，共 **17 张**。
 *
 * 契约：`docs/CONTRACT-v2.md` §5.1（纯函数 → SVG 字符串）、
 * `docs/REDESIGN.md` §3.2（形状语言）、`docs/design/DESIGN-SYSTEM.md` §2（描边与投影）。
 *
 * ## 三条不能破的约束
 *
 * 1. **viewBox 单位 = 世界单位**：`viewBox="0 0 s s"` 且 `width = height = s`，
 *    所以 `stroke-width="2"` 在任何 size 下都恰好是 2 世界单位。
 *    禁止写成「按比例缩放的描边」——那样 20 单位的石头会细成 0.4，180 的斑块会粗成 7。
 * 2. **颜色只走 `PALETTE`**：CSS 变量在「SVG 字符串 → Image → 纹理」路径上不解析。
 * 3. **不写 `<defs>` / `id`**：同一个 sprite 会在场上出现几十份，id 一定撞。
 *
 * ## 尺寸与锚点
 *
 * 斑块满幅（无描边，可以出血到 viewBox 边缘）；山 / 石 / 坑内缩 1 单位，
 * 让 2 单位描边完整落在 viewBox 内（贴边会给纹理切出半个像素的锯齿）。
 *
 * 山与石用「归一化坐标 + 内缩」而不是绝对坐标：同一份点位表在 20/28/40 或 72/96
 * 下都成立，不需要每个 size 维护一套路径。
 *
 * ## 17 张的分工（为什么它们不会看成一坨）
 *
 * | 导出 | 数 | size | 轮廓差别 |
 * |---|---|---|---|
 * | `patchSvg` | 6 | 64 / 96 / 128 / 180 | 边数 6→9、横扁 / 竖长 / 凹口 / 斜楔 / 拖尾 / 近方 |
 * | `hillSvg` | 4 | 72 / 96 | 单峰 / 双峰 / 平顶台地 / 锯齿三峰 |
 * | `rockSvg` | 4 | 20 / 28 / 40 | 矮胖五边 / 立石 / 双峰圆石 / 带缺口石板 |
 * | `pitSvg` | 3 | 40 / 56 | 宽浅坑 / 深坑（带内壁）/ 破损坑口 |
 */
import { ALPHA, PALETTE } from './palette';

/** 世界层描边 = `--stroke-thin` 的世界等价。**不随 size 缩放。** */
export const TERRAIN_STROKE = 2;

/** 世界层内部细节 = `--stroke-hair`。只用于石头折面、坑内壁这类「看一眼就够」的线。 */
const TERRAIN_HAIR = 1;

/** viewBox 内缩：描边的一半 + 半像素余量，保证 2 单位墨线完整落在纹理内 */
const INSET = 1;

/** size 钳制区间。世界层最小可辨形是 20 单位，最大地标 180，上限留足余量。 */
const SIZE_MIN = 12;
const SIZE_MAX = 512;

/** 归一化坐标点（0..1），映射时乘以 size */
type Pt = readonly [number, number];

/** 极坐标点：[角度(度), 半径(size 的比例)]。0° = 右，90° = 下（y 向下的屏幕坐标） */
type Polar = readonly [number, number];

// ───────────────────────────── 工具 ─────────────────────────────

/** 数值输出：两位小数，去掉尾随零（`120` 而不是 `120.00`），避免路径字符串膨胀 */
function num(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/** size 钳制：非有限值退回下限，其余取整并夹在 [SIZE_MIN, SIZE_MAX] */
function boxOf(size: number): number {
  if (!Number.isFinite(size)) return SIZE_MIN;
  return Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(size)));
}

/** 变体取模：越界 / 负数 / 小数都落到合法下标，调用方不必先校验 */
function variantIndex(variant: number, count: number): number {
  if (!Number.isFinite(variant)) return 0;
  return ((Math.trunc(variant) % count) + count) % count;
}

/** 从列表里取变体 */
function pick<T>(list: readonly T[], variant: number): T {
  return list[variantIndex(variant, list.length)] as T;
}

interface PathOpts {
  /** 内缩（世界单位）。0 = 满幅（无描边的斑块），1 = 给 2 单位描边留位 */
  inset?: number;
  /** 绕 viewBox 中心的旋转（度） */
  rotate?: number;
}

/**
 * 归一化点列 → 路径 `d`。
 *
 * 旋转在这里**烤进坐标**，不用 `transform="rotate()"`：斑块外面没有描边可用来兜底，
 * 一旦 transform 把顶点推出 viewBox 就是硬裁切；先转再算包围盒可控。
 */
function pathOf(pts: readonly Pt[], s: number, opts: PathOpts = {}): string {
  const inset = opts.inset ?? 0;
  const span = s - inset * 2;
  const deg = opts.rotate ?? 0;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const c = s / 2;
  let d = '';
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i] as Pt;
    let x = inset + p[0] * span;
    let y = inset + p[1] * span;
    if (deg !== 0) {
      const dx = x - c;
      const dy = y - c;
      x = c + dx * cos - dy * sin;
      y = c + dx * sin + dy * cos;
    }
    d += `${i === 0 ? 'M' : 'L'}${num(x)} ${num(y)}`;
  }
  return `${d}Z`;
}

/** 极坐标 → 归一化点列 */
function fromPolar(pts: readonly Polar[]): Pt[] {
  return pts.map(([deg, r]) => {
    const a = (deg * Math.PI) / 180;
    return [0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)] as const;
  });
}

/** 统一外壳。`xmlns` 是给 `Image` / `PIXI.Texture.from` 用的，缺了会静默失败。 */
function wrap(s: number, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}"` +
    ` width="${s}" height="${s}">${body}</svg>`
  );
}

// ───────────────────────────── 地面斑块 ─────────────────────────────

/**
 * 斑块形状：**6–9 边不规则多边形，实心 `--planet-shade`，无描边**（REDESIGN §3.2）。
 *
 * 每个变体预置一个非 0 的旋转角（−9°…+11°），这样即使 T3 忘了随机旋转，
 * 36 块斑块也不会排成「贴纸整齐队列」。角度全部 ≤ 11°：再大就会读成「故意的装饰图形」，
 * 而不是「地面上一块脏」。
 */
interface PatchShape {
  /** 轮廓的一句话描述，供美术审计与后续换图对照 */
  readonly note: string;
  /** 预置旋转角（度） */
  readonly rotate: number;
  /** 极坐标顶点表 */
  readonly pts: readonly Polar[];
}

/**
 * 6 个斑块的差别必须靠**可见的轮廓特征**，不是靠换角度。
 * 下表的长宽比是**实测包围盒宽/高**（`patchSvg(v, 100)` 量出来的），不是估的：
 *
 * | # | 边 | 特征 | 宽/高 |
 * |---|---|---|---|
 * | 0 | 6 | 横向水洼，左右两端各一个尖角 | 1.35（横扁） |
 * | 1 | 7 | 竖向长条，顶底各一个尖角 | 0.59（最瘦，几乎 1:2） |
 * | 2 | 8 | 近圆，**左侧一个深 V 凹口**（像两块斑要连上了） | 0.89 |
 * | 3 | 6 | 斜向尖楔：包围盒近方，但长轴清楚落在 40°→220° 对角线上 | 0.83 |
 * | 4 | 8 | 蝌蚪抹痕：粗头 + 两个细颈 + 一个尾尖（尾尖朝左） | 1.12 |
 * | 5 | 9 | 边最多的近方板块，轮廓最软、面积最大 | 0.95 |
 */
const PATCHES: readonly PatchShape[] = [
  {
    note: '6 边横向水洼：左右（14°/186°）半径最大 0.46/0.45，上下（74°/246°）压到 0.33/0.31',
    rotate: -9,
    pts: [
      [14, 0.46],
      [74, 0.33],
      [132, 0.41],
      [186, 0.45],
      [246, 0.31],
      [312, 0.39],
    ],
  },
  {
    note: '7 边竖向长条：顶底（95°/268°）拉到 0.45/0.44，左右（0°/205°）收到 0.26/0.28',
    rotate: 6,
    pts: [
      [0, 0.26],
      [52, 0.31],
      [95, 0.45],
      [150, 0.29],
      [205, 0.28],
      [268, 0.44],
      [318, 0.28],
    ],
  },
  {
    note: '8 边近圆带深凹口：176° 处半径掉到 0.20（其余 0.40–0.44），形成 V 形咬痕',
    rotate: -4,
    pts: [
      [0, 0.42],
      [45, 0.4],
      [92, 0.44],
      [140, 0.41],
      [176, 0.2],
      [214, 0.4],
      [262, 0.43],
      [312, 0.41],
    ],
  },
  {
    note: '6 边斜向尖楔：40°/220° 半径 0.48/0.46 构成对角长轴，96°/276° 收到 0.26/0.25',
    rotate: 11,
    pts: [
      [40, 0.48],
      [96, 0.26],
      [150, 0.32],
      [220, 0.46],
      [276, 0.25],
      [330, 0.3],
    ],
  },
  {
    note: '8 边蝌蚪抹痕：右侧 0°–75° 是粗头（0.44–0.36），120°/220° 收到 0.16/0.14 成细颈，180° 的 0.40 是尾尖',
    rotate: -6,
    pts: [
      [300, 0.42],
      [345, 0.44],
      [30, 0.4],
      [75, 0.36],
      [120, 0.16],
      [180, 0.4],
      [220, 0.14],
      [265, 0.38],
    ],
  },
  {
    note: '9 边近方板块：9 个顶点半径都在 0.36–0.43，轮廓最软、覆盖面积最大',
    rotate: 3,
    pts: [
      [10, 0.41],
      [50, 0.38],
      [95, 0.42],
      [130, 0.36],
      [170, 0.4],
      [210, 0.37],
      [255, 0.43],
      [295, 0.38],
      [340, 0.4],
    ],
  },
];

/** 斑块四档世界尺寸（`--item-world` 之外，斑块是背景层，可以到 180） */
export const PATCH_SIZES = [64, 96, 128, 180] as const;

/**
 * 地面斑块。
 *
 * @param variant 变体（任意整数，越界自动取模）
 * @param size    世界尺寸（px == 世界单位），建议取 `PATCH_SIZES`
 *
 * 满幅绘制 —— 斑块没有描边，不需要内缩；顶点半径上限 0.48，任意旋转后仍在 viewBox 内。
 */
export function patchSvg(variant: number, size: number): string {
  const s = boxOf(size);
  const shape = pick(PATCHES, variant);
  const d = pathOf(fromPolar(shape.pts), s, { rotate: shape.rotate });
  return wrap(s, `<path d="${d}" fill="${PALETTE.planetShade}" stroke="none"/>`);
}

/** 斑块变体数（T3 随机分布时取模用） */
export const PATCH_VARIANTS = PATCHES.length;

// ───────────────────────────── 山 ─────────────────────────────

/**
 * 山：`--planet-shade` 填充 + 2 单位墨线，摆在 r∈[520,600] 形成地平线。
 *
 * ## 填充必须是 `--planet-shade`，不能是 `--paper`
 *
 * 星球表面本身就是 `--paper`（`--planet` = `--paper`）。山若也用 paper，
 * **填充等于不存在**，只剩一条 2 单位墨线浮在白面上 —— T3 实机截图里读成
 * 「△ / D / 旗子」，不是地形。改成 shade 之后山有了体块，和「同样 shade 但无描边」的
 * 斑块靠那条墨线区分开，三级明度（纸面 → 山体 → 斑块）也拉开了。
 *
 * ## 为什么必须是**闭合**山形（这一条也推翻过一次）
 *
 * 底边开口（路径从 viewBox 外侧起笔再收回，底边被裁掉）：墨线在球面上走着走着就断了，
 * 48 个实例撒下去全部读成「钩子 / 括号 / 地上的裂缝」。已否决。
 * 闭合底边才有「一块地」的语义。
 *
 * ## 三条几何决定
 *
 * 1. **峰高上限 0.5**：`ny ≥ 0.52`，峰顶永远在 viewBox 高度一半以下，不顶大气虚线环。
 * 2. **底边 `ny = 0.97`**：内缩 1 后 2 单位底描边完整可见（画在 1.0 会被纹理边切掉一半）。
 * 3. **底脚满幅 0.02 / 0.98**：底座够宽，摆在球缘时才「压得住」那条光滑的圆。
 *
 * 摆放（给 T3）：锚点取底边中点，`rotate = 方位角 + 90°`（峰朝外）。
 * 底座半径落在 **[560, 600]**（外层带）时最像地平线；落到 520 一带就变成「内陆孤山」，
 * 球缘会重新变得空空荡荡。
 * ⚠️ 朝向仍有争议：A/B 实测「直立（rotate ≈ 0）」在左右/底部球缘读得更像山，
 * 「峰朝外」在顶部球缘才对。填充换成 shade 之后两者都要重测一次再定。
 *
 * 山的包围盒实测约 **2.1 : 1（宽 : 高）** —— 这是刻意的：它是「脊」，不是「峰」。
 * 想要一段连绵的山脉，就把 2–3 座山以不同 size 压在一起，别把单座山放大。
 */
interface HillShape {
  readonly note: string;
  readonly pts: readonly Pt[];
}

/** 4 座山：靠「脊的个数 + 肩线陡缓」区分，不靠朝向 */
const HILLS: readonly HillShape[] = [
  {
    note: '单峰土丘：脊偏左（nx 0.46），左肩略陡、右肩缓，两脚落在 0.02 / 0.98',
    pts: [
      [0.02, 0.97],
      [0.1, 0.78],
      [0.28, 0.63],
      [0.46, 0.52],
      [0.64, 0.63],
      [0.84, 0.78],
      [0.98, 0.97],
    ],
  },
  {
    note: '双峰：左峰 0.57、右峰 0.53（更高），中间 0.69 的鞍部',
    pts: [
      [0.04, 0.97],
      [0.15, 0.77],
      [0.33, 0.66],
      [0.45, 0.57],
      [0.55, 0.69],
      [0.71, 0.53],
      [0.87, 0.75],
      [0.98, 0.97],
    ],
  },
  {
    note: '平顶台地：0.23–0.67 之间是 0.55–0.57 的近水平台面，两侧近乎直壁',
    pts: [
      [0.05, 0.97],
      [0.17, 0.84],
      [0.23, 0.57],
      [0.39, 0.55],
      [0.55, 0.57],
      [0.67, 0.56],
      [0.81, 0.73],
      [0.95, 0.97],
    ],
  },
  {
    note: '锯齿三峰：峰 0.65 / 0.54 / 0.61，峰间谷 0.79 / 0.73，全是尖角',
    pts: [
      [0.02, 0.97],
      [0.13, 0.8],
      [0.25, 0.65],
      [0.33, 0.79],
      [0.47, 0.54],
      [0.59, 0.73],
      [0.71, 0.61],
      [0.85, 0.81],
      [0.98, 0.97],
    ],
  },
];

/** 山两档世界尺寸 */
export const HILL_SIZES = [72, 96] as const;

/**
 * 山。
 *
 * @param variant 变体（越界取模）
 * @param size    世界尺寸，建议取 `HILL_SIZES`
 */
export function hillSvg(variant: number, size: number): string {
  const s = boxOf(size);
  const shape = pick(HILLS, variant);
  const d = pathOf(shape.pts, s, { inset: INSET });
  return wrap(
    s,
    `<path d="${d}" fill="${PALETTE.planetShade}" stroke="${PALETTE.ink}"` +
      ` stroke-width="${TERRAIN_STROKE}" stroke-linejoin="round" stroke-linecap="round"/>`,
  );
}

/** 山变体数 */
export const HILL_VARIANTS = HILLS.length;

// ───────────────────────────── 石 ─────────────────────────────

/**
 * 石：`--paper` + 2 单位墨线，撒在 r∈[220,540]。
 *
 * 20 单位是石头的下限，这一档**只有轮廓可用**：2 单位描边占形体 10%，
 * 内部再加线就会糊成一团墨。所以：
 *
 * 1. **四个变体全靠剪影区分**（矮宽 / 立直 / 双峰 / 平片），不靠内部细节；
 * 2. **折面线在 `size < 28` 时自动不画**（见 `ROCK_DETAIL_MIN`）——
 *    不靠文档去约束调用方，让 T3 想用错都用不了；
 * 3. 双峰的鞍部、石板的崩口都做到 **≥ 3.5 单位深**，
 *    否则 20 单位下只剩 2 个描边宽，会被吃掉，读成「动物头 / 小盒子」。
 */
interface RockShape {
  readonly note: string;
  readonly outline: readonly Pt[];
  /** 折面线，每条是一条独立折线（可以有多条）。`size < 28` 时整组丢弃 */
  readonly crease?: readonly (readonly Pt[])[];
}

/** 折面线的最小尺寸：1 单位细节线在 20 单位（zoom 0.8 → 0.8px）下会灰掉 */
const ROCK_DETAIL_MIN = 28;

const ROCKS: readonly RockShape[] = [
  {
    note: '矮胖五边：底宽 0.94，顶面偏右，左肩陡右肩缓',
    outline: [
      [0.04, 0.94],
      [0.03, 0.6],
      [0.27, 0.3],
      [0.63, 0.26],
      [0.93, 0.54],
      [0.97, 0.94],
    ],
    crease: [
      [
        [0.3, 0.34],
        [0.44, 0.62],
        [0.52, 0.92],
      ],
    ],
  },
  {
    note: '立石：峰在 (0.45, 0.20)，左边线近乎垂直，整体向左倾',
    outline: [
      [0.14, 0.94],
      [0.32, 0.42],
      [0.45, 0.2],
      [0.57, 0.46],
      [0.74, 0.94],
    ],
    crease: [
      [
        [0.45, 0.22],
        [0.4, 0.58],
        [0.46, 0.92],
      ],
    ],
  },
  {
    note: '双峰圆石：驼峰 0.36 / 0.31，鞍部压到 0.62（深 0.26 ≈ 5 单位，20 单位下也裂得开）',
    outline: [
      [0.04, 0.92],
      [0.1, 0.56],
      [0.25, 0.36],
      [0.45, 0.62],
      [0.58, 0.31],
      [0.77, 0.5],
      [0.95, 0.92],
    ],
    crease: [
      [
        [0.25, 0.38],
        [0.29, 0.64],
      ],
      [
        [0.58, 0.33],
        [0.61, 0.6],
      ],
    ],
  },
  {
    note: '带缺口石板：顶面 0.38–0.42，0.62 处 V 形崩口深到 0.6（≈4 单位）',
    outline: [
      [0.02, 0.9],
      [0.08, 0.44],
      [0.44, 0.38],
      [0.62, 0.6],
      [0.8, 0.42],
      [0.96, 0.5],
      [0.98, 0.9],
    ],
    crease: [
      [
        [0.44, 0.4],
        [0.42, 0.88],
      ],
      [
        [0.8, 0.44],
        [0.82, 0.88],
      ],
    ],
  },
];

/**
 * 石三档世界尺寸。
 * **20 只画剪影**：`rockSvg` 在 `size < 28` 时自动丢掉折面线，四个变体都靠轮廓成立。
 */
export const ROCK_SIZES = [20, 28, 40] as const;

/**
 * 石。
 *
 * @param variant 变体（越界取模）
 * @param size    世界尺寸，建议取 `ROCK_SIZES`；**`< ROCK_DETAIL_MIN`（28）时自动只画剪影**
 */
export function rockSvg(variant: number, size: number): string {
  const s = boxOf(size);
  const shape = pick(ROCKS, variant);
  const body = shape.outline;
  const creases =
    s < ROCK_DETAIL_MIN
      ? ''
      : (shape.crease ?? [])
          .map(
            (line) =>
              `<path d="${pathOf(line, s, { inset: INSET })}" fill="none" stroke="${PALETTE.ink}"` +
              ` stroke-width="${TERRAIN_HAIR}" stroke-linecap="round" stroke-linejoin="round"/>`,
          )
          .join('');
  return wrap(
    s,
    `<path d="${pathOf(body, s, { inset: INSET })}" fill="${PALETTE.cream}"` +
      ` stroke="${PALETTE.ink}" stroke-width="${TERRAIN_STROKE}"` +
      ` stroke-linejoin="round" stroke-linecap="round"/>${creases}`,
  );
}

/** 石变体数 */
export const ROCK_VARIANTS = ROCKS.length;

// ───────────────────────────── 坑 ─────────────────────────────

/** 椭圆参数（归一化：cx / cy / rx / ry 都是 size 的比例） */
interface Rim {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

/** 归一化浮点坐标（坑专用：先算浮点，最后才乘 size） */
interface RimPt {
  readonly x: number;
  readonly y: number;
}

/** 坑沿崩口：在 `deg` 附近把半径压到 `k`，向两侧 `span` 度内线性回正 */
interface Notch {
  readonly deg: number;
  readonly k: number;
  readonly span: number;
}

/** 一段坑沿：沿椭圆从 from 扫到 to（度，屏幕坐标：0=右 90=下） */
interface Arc {
  readonly rim: Rim;
  readonly from: number;
  readonly to: number;
  readonly notch?: Notch;
}

/**
 * 坑的三层，**顺序即画序**：
 *
 * 1. `fill`  —— 闭合椭圆，`--planet-shade`（坑底土色）
 * 2. `sink`  —— 同一个闭合椭圆，`--rule`（ink 15%）叠上去 → 合成 ≈ 28% 墨，读作「沉下去」
 * 3. `lip`   —— 只描 **240° 上弧**，2 单位墨线（下缘不描 = 近侧敞开）
 *
 * ## 为什么是「闭合椭圆 + 上弧」，不是「月牙」
 *
 * 月牙（内缘朝弦线压缩）画了三版，40 单位下全部读成**月亮 / 微笑线 / 杯子**：
 * 月牙两端必然收成尖，尖 = 一笔带过的线，而「洞」需要一块**有面积的、闭合的**暗面。
 * 反过来，只要暗面足够暗（1.12:1 → 1.6:1），闭合椭圆立刻从「鼓包」翻成「凹陷」——
 * 决定读法的是**明度**，不是轮廓。这一条是拿 4 种构造在 1:1 下并排比出来的。
 *
 * ## 为什么「贴边一条暗带」也不行
 *
 * 把 `--rule` 做成贴着坑口的一条窄带时，暗部在**边缘**、坑心是浅的，
 * 眼睛把这读成「一圈口沿」= 杯子。暗部必须在**中间**（整坑压暗），
 * 边缘只留那条 2 单位墨线。
 */
interface PitShape {
  readonly note: string;
  /** 坑口椭圆 */
  readonly rim: Rim;
  /** 上弧（墨线）的起止角，必须 ≥ 230° */
  readonly from: number;
  readonly to: number;
  /** 崩口，可选 */
  readonly notch?: Notch;
  /** 内壁亮边（`--paper` 细弧），给「深坑」一层台阶感，可选 */
  readonly ledge?: Arc;
}

/** 一段坑沿采样成点列。12° 一采样：40 单位下肉眼看是曲线，不是折线。 */
function rimArc(arc: Arc): RimPt[] {
  const span = arc.to - arc.from;
  const steps = Math.max(4, Math.ceil(Math.abs(span) / 12));
  const pts: RimPt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const deg = arc.from + (span * i) / steps;
    let k = 1;
    if (arc.notch) {
      const fade = Math.max(0, 1 - Math.abs(deg - arc.notch.deg) / arc.notch.span);
      k = 1 - (1 - arc.notch.k) * fade;
    }
    const a = (deg * Math.PI) / 180;
    pts.push({
      x: arc.rim.cx + arc.rim.rx * k * Math.cos(a),
      y: arc.rim.cy + arc.rim.ry * k * Math.sin(a),
    });
  }
  return pts;
}

/** 归一化点列 → 路径 `d`（`close` = false 时画开放折线） */
function polyD(pts: readonly RimPt[], s: number, close = true): string {
  let d = '';
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i] as RimPt;
    d += `${i === 0 ? 'M' : 'L'}${num(p.x * s)} ${num(p.y * s)}`;
  }
  return close ? `${d}Z` : d;
}

/** 坑口墨线。**唯一一处 3 单位的世界层描边** —— 见 `pitSvg` 上方的说明。 */
const PIT_LIP_STROKE = 3;

/**
 * 3 个坑：
 *
 * | # | 坑口 | 墨线 | 读作 |
 * |---|---|---|---|
 * | 0 | 扁 0.44 / 0.27 | 240° 上弧 | 宽浅的洼 |
 * | 1 | 近圆 0.34 / 0.29 | 250° 上弧 + `--paper` 内壁亮边 | 深坑，有一级台阶 |
 * | 2 | 扁 0.43 / 0.24，250° 上弧**带崩口** | 崩口同时作用在填充上 | 坑沿崩了一块 |
 *
 * 坑口 `rx ≤ 0.44`：留 0.06·s 余量给描边，40 单位下也不会被纹理边切掉。
 * `ry ≥ 0.24`：再扁坑心就只剩 3–4 单位，暗面立不起来。
 */
const PITS: readonly PitShape[] = [
  {
    note: '宽浅坑：扁椭圆 0.44 / 0.27，上弧 150°–390°（下缘 120° 敞开）',
    rim: { cx: 0.5, cy: 0.56, rx: 0.44, ry: 0.27 },
    from: 150,
    to: 390,
  },
  {
    note: '深坑：近圆 0.34 / 0.29，上弧 145°–395° + 内壁亮边（0.62 倍椭圆，整体下移 0.05）',
    rim: { cx: 0.5, cy: 0.54, rx: 0.34, ry: 0.29 },
    from: 145,
    to: 395,
    ledge: { rim: { cx: 0.5, cy: 0.59, rx: 0.21, ry: 0.17 }, from: 168, to: 372 },
  },
  {
    note: '破损坑口：扁椭圆 0.43 / 0.24，坑沿 250° 处崩掉 10% 半径（填充与墨线同步）',
    rim: { cx: 0.5, cy: 0.57, rx: 0.43, ry: 0.24 },
    from: 150,
    to: 390,
    notch: { deg: 250, k: 0.9, span: 46 },
  },
];

/** 坑两档世界尺寸 */
export const PIT_SIZES = [40, 56] as const;

/**
 * 坑。签名与另外三个一致（`(variant, size)`）：坑没有 size 变体，
 * 但绝不允许出现第二套调用约定 —— 那会让 T3 的 sprite 工厂长出分支。
 *
 * **坑口墨线 3 单位**，是世界层「描边 2 单位」的唯一例外（主理人批准）：
 * 40 单位 + zoom 0.8 时，2 单位的坑口和「一颗石头」的轮廓权重一样，
 * 眼睛分不出「凹」和「凸」；3 单位让上沿明显重于下缘，凹陷才立住。
 * 只作用在坑口上弧，不作用在任何其他地形。
 *
 * @param variant 变体（越界取模）
 * @param size    世界尺寸，建议取 `PIT_SIZES`；超出 [SIZE_MIN, SIZE_MAX] 会被钳制
 */
export function pitSvg(variant: number, size: number): string {
  const s = boxOf(size);
  const shape = pick(PITS, variant);
  const body = polyD(rimArc({ rim: shape.rim, from: 0, to: 360, notch: shape.notch }), s);
  const lip = polyD(rimArc({ rim: shape.rim, from: shape.from, to: shape.to, notch: shape.notch }), s, false);
  const ledge = shape.ledge
    ? `<path d="${polyD(rimArc(shape.ledge), s, false)}" fill="none" stroke="${PALETTE.paper}"` +
      ` stroke-width="${TERRAIN_HAIR}" stroke-linecap="round" stroke-linejoin="round"/>`
    : '';
  return wrap(
    s,
    // 两层同形：土色坑底 + 15% 墨叠加 ≈ 28% 墨（合成值 ≈ 1.6:1，坑才立得住）
    `<path d="${body}" fill="${PALETTE.planetShade}"/>` +
      `<path d="${body}" fill="${ALPHA.rule}"/>` +
      `<path d="${lip}" fill="none" stroke="${PALETTE.ink}" stroke-width="${PIT_LIP_STROKE}"` +
      ` stroke-linecap="round" stroke-linejoin="round"/>` +
      ledge,
  );
}

/** 坑变体数 */
export const PIT_VARIANTS = PITS.length;

/**
 * 建议锚点（Pixi `Sprite.anchor`）。
 *
 * 斑块 / 坑中心对齐；山以**底边中点**对齐（底边在 `s - 1` 处，底座踩在地面点上）；
 * 石 0.9 而不是 1：石头是踩在地上的块，锚在 1 会让整块浮在落点上方一个身位。
 * T3 若另有分布算法可以覆盖，这里只给默认值，避免四处硬编码 0.5 / 1。
 */
export const TERRAIN_ANCHOR = {
  patch: { x: 0.5, y: 0.5 },
  hill: { x: 0.5, y: 1 },
  rock: { x: 0.5, y: 0.9 },
  pit: { x: 0.5, y: 0.5 },
} as const;
