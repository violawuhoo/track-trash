/**
 * 物品图标 —— **双出口，单一形状数据源**。
 *
 * 契约见 `docs/CONTRACT-v2.md` §5.2。
 *
 * | 出口 | 给谁用 | 外壳 |
 * |---|---|---|
 * | `ItemIcon`（React） | 背包卡片 / 合成槽 / 描述浮层 | `<svg>` + className/style |
 * | `itemSvgMarkup`（字符串） | T3 的 `sprites.ts` → `PIXI.Texture` | `<svg xmlns …>` |
 *
 * 两者共用同一份 `SHAPES` 与同一份 `PALETTE`，唯一差别是「要不要 `<svg>` 外壳」。
 * 禁止为 Pixi 另写一套路径，否则背包里的图标和地上的贴纸会长得不一样。
 *
 * 三条不能破的约束：
 * 1. **颜色必须走字面 hex**（`PALETTE`）。`var(--orange)` 在纹理路径上是空的。
 * 2. **60 件物品按 `item.icon` 查表**，不是按物品 id —— v1 的 93 键混了 id，
 *    导致 7 件物品落进 `?? 'blob'`。id 键现在由 `SHAPE_OF_ID` 兜底。
 * 3. **描边按「显示尺寸」换算，不按纹理分辨率换算**：同一个图标存成 96px 纹理
 *    或直接画成 40px，看起来必须一样粗。见 `strokeBoxFor()`。
 */
import { ITEMS, ITEM_MAP, type StickerColor } from '@haola/game-core';
import { PALETTE, STICKER } from '../world/assets/palette';

/** 形状坐标系的边长（所有路径都在 0–48 里画） */
export const SHAPE_VIEWBOX = 48;

/** 世界层描边目标粗细：屏幕/世界单位 px（`--stroke-thin` 的世界等价，不是 3px） */
export const WORLD_STROKE = 2;

/**
 * 贴纸在世界里的设计显示尺寸（世界单位，= `--item-world` 32）。
 * 描边用它换算成 48 格内的粗细，这样 96px 纹理缩到 32 单位后仍是 2px。
 */
export const WORLD_DISPLAY = 32;

/**
 * 显示 px → 48 格内的描边粗细。
 * 显示 32 → 3（与 v1 的 `strokeWidth={3}` 完全一致，39 个形状不用重画）；
 * 显示 40 → 2.4；显示 26 → 3.69。保留两位小数，避免属性里出现浮点垃圾。
 */
function strokeBoxFor(displaySize: number): number {
  const box = (WORLD_STROKE * SHAPE_VIEWBOX) / displaySize;
  return Math.round(box * 100) / 100;
}

/**
 * 45 个几何形状，靠配色区分 60 件物品。
 *
 * 每个形状返回 `<g>` **内部**的静态标记：`fill` 由调用方注入，
 * 描边（stroke / stroke-width / linecap / linejoin）由 `shapeMarkup()` 统一加在外层 `<g>` 上。
 * 内部需要第二/第三颜色时（纸白、墨黑、黄），直接用 `PALETTE.*` 字面值。
 */
type ShapeFn = (fill: string) => string;

export type ShapeName =
  // v1 的 39 个形状（路径原样保留，一个都没重画）
  | 'ring'
  | 'wrench'
  | 'sheet'
  | 'stack'
  | 'cell'
  | 'rod'
  | 'bolt'
  | 'cloth'
  | 'card'
  | 'arrow'
  | 'flask'
  | 'cloud'
  | 'sun'
  | 'drop'
  | 'rock'
  | 'star'
  | 'wire'
  | 'bracket'
  | 'signal'
  | 'shield'
  | 'bed'
  | 'tent'
  | 'door'
  | 'bowl'
  | 'engine'
  | 'clock'
  | 'shop'
  | 'sign'
  | 'person'
  | 'hands'
  | 'blob'
  | 'question'
  | 'scribble'
  | 'wave'
  | 'dice'
  | 'badge'
  | 'brick'
  | 'broken'
  | 'candle'
  // 批 0 新增 5 个：book / ticket 是新画，map / bar / blob2 是拆撞脸
  | 'book'
  | 'ticket'
  | 'map'
  | 'bar'
  | 'blob2'
  // 批 0 尾款：`wastepaper` 从 `sheet` 拆出来，让 D 断言凑满 60/60
  | 'page'
  // A1b：阶段 3「建设期」三步产物 + 纪念牌（几何直接取自
  // docs/design/ASSETS-v3-SHAPES-snippet.ts，一个都没重画）
  | 'placard'
  | 'coil'
  | 'sandglass'
  | 'plaque';

const SHAPES: Record<ShapeName, ShapeFn> = {
  // ───────── v1 原样保留 ─────────
  ring: (fill) =>
    `<circle cx="24" cy="24" r="13" fill="${fill}"/>` +
    `<circle cx="24" cy="24" r="5" fill="${PALETTE.paper}"/>`,
  wrench: (fill) =>
    `<path d="M14 34 30 18"/>` +
    `<path d="M27 15a7 7 0 1 0 9 9l-4-4 4-4z" fill="${fill}"/>` +
    `<circle cx="13" cy="35" r="4" fill="${fill}"/>`,
  sheet: (fill) =>
    `<path d="M12 10h17l7 7v21H12z" fill="${fill}"/>` +
    `<path d="M29 10v7h7"/>` +
    `<path d="M18 24h12M18 30h9"/>`,
  stack: (fill) =>
    `<path d="M10 19h28l-3 14H13z" fill="${fill}"/>` +
    `<path d="M13 19c4-7 18-7 22 0"/>` +
    `<path d="M17 26h14"/>`,
  cell: (fill) =>
    `<rect x="13" y="9" width="22" height="30" rx="5" fill="${fill}"/>` +
    `<path d="M20 9V6h8v3"/>` +
    `<path d="M20 20l4 4-4 6"/>`,
  rod: (fill) =>
    `<path d="M14 36 32 14"/>` +
    `<circle cx="35" cy="11" r="6" fill="${fill}"/>` +
    `<path d="M10 32l6 6"/>`,
  bolt: (fill) =>
    `<path d="M24 8l12 7v18l-12 7-12-7V15z" fill="${fill}"/>` + `<path d="M19 24h10M24 19v10"/>`,
  cloth: (fill) =>
    `<path d="M14 12h10l-2 12 10 4-2 8H13z" fill="${fill}"/>` + `<path d="M20 12v8"/>`,
  card: (fill) =>
    `<rect x="10" y="14" width="20" height="26" rx="3" fill="${fill}" transform="rotate(-8 20 27)"/>` +
    `<rect x="20" y="10" width="20" height="26" rx="3" fill="${PALETTE.paper}"/>` +
    `<path d="M26 17l4 5-4 5"/>`,
  arrow: (fill) => `<path d="M24 40V14"/>` + `<path d="M14 24l10-11 10 11" fill="${fill}"/>`,
  flask: (fill) =>
    `<path d="M18 8h12v10l7 18a5 5 0 0 1-5 6H16a5 5 0 0 1-5-6l7-18z" fill="${fill}"/>` +
    `<path d="M14 28h20"/>`,
  cloud: (fill) =>
    `<path d="M12 30a7 7 0 0 1 2-13 9 9 0 0 1 17 2 6 6 0 0 1 1 11z" fill="${fill}"/>` +
    `<path d="M18 36h4M28 36h4"/>`,
  sun: (fill) =>
    `<circle cx="24" cy="24" r="9" fill="${fill}"/>` +
    `<path d="M24 7v5M24 36v5M7 24h5M36 24h5M12 12l4 4M32 32l4 4M36 12l-4 4M16 32l-4 4"/>`,
  drop: (fill) =>
    `<path d="M24 8c7 9 11 14 11 20a11 11 0 0 1-22 0c0-6 4-11 11-20z" fill="${fill}"/>` +
    `<path d="M20 31a4 4 0 0 0 4 4"/>`,
  rock: (fill) =>
    `<path d="M11 30l5-13 9-6 12 7 3 12-9 8H18z" fill="${fill}"/>` + `<path d="M20 19l4 7-3 5"/>`,
  star: (fill) =>
    `<path d="M24 8l4.6 9.6 10.4 1.4-7.6 7.4 1.9 10.6L24 32l-9.3 5 1.9-10.6L9 19l10.4-1.4z" fill="${fill}"/>`,
  wire: (fill) =>
    `<path d="M10 18c6 0 6 12 12 12s6-12 12-12"/>` +
    `<circle cx="10" cy="18" r="3" fill="${fill}"/>` +
    `<circle cx="34" cy="18" r="3" fill="${fill}"/>`,
  /** 纯线条形状：不吃 fill，只靠描边成形（所以参数是 _fill） */
  bracket: (_fill) => `<path d="M14 12v24h22"/>` + `<path d="M14 24h12"/>`,
  signal: (fill) =>
    `<circle cx="24" cy="34" r="4" fill="${fill}"/>` +
    `<path d="M15 27a13 13 0 0 1 18 0M9 20a22 22 0 0 1 30 0"/>`,
  shield: (fill) =>
    `<path d="M24 8l13 5v12c0 9-6 13-13 16-7-3-13-7-13-16V13z" fill="${fill}"/>` +
    `<path d="M18 24l4 4 8-9"/>`,
  bed: (fill) =>
    `<path d="M9 34V18M9 28h30v6M9 22h13v6"/>` +
    `<rect x="12" y="12" width="9" height="6" rx="3" fill="${fill}"/>`,
  tent: (fill) => `<path d="M24 9 44 39H4z" fill="${fill}"/>` + `<path d="M24 24l7 15M24 24l-7 15"/>`,
  door: (fill) =>
    `<rect x="13" y="8" width="22" height="33" rx="2" fill="${fill}"/>` +
    `<circle cx="29" cy="25" r="2.5" fill="${PALETTE.ink}"/>`,
  bowl: (fill) =>
    `<path d="M8 24h32a16 16 0 0 1-32 0z" fill="${fill}"/>` +
    `<path d="M18 18c0-4 3-4 3-8M27 18c0-4 3-4 3-8"/>`,
  engine: (fill) =>
    `<circle cx="24" cy="24" r="13" fill="${fill}"/>` +
    `<circle cx="24" cy="24" r="4"/>` +
    `<path d="M24 11v4M24 33v4M11 24h4M33 24h4"/>`,
  clock: (fill) => `<circle cx="24" cy="24" r="15" fill="${fill}"/>` + `<path d="M24 15v10l7 4"/>`,
  shop: (fill) =>
    `<path d="M8 20l4-10h24l4 10z" fill="${fill}"/>` +
    `<path d="M11 20v20h26V20"/>` +
    `<path d="M20 40V28h8v12"/>`,
  sign: (fill) =>
    `<rect x="8" y="12" width="32" height="16" rx="3" fill="${fill}"/>` + `<path d="M16 32v10M32 32v10"/>`,
  person: (fill) =>
    `<circle cx="24" cy="16" r="7" fill="${fill}"/>` +
    `<path d="M10 40c2-9 8-13 14-13s12 4 14 13" fill="${fill}"/>`,
  hands: (fill) =>
    `<path d="M10 30l6-12M38 30l-6-12"/>` +
    `<circle cx="12" cy="35" r="5" fill="${fill}"/>` +
    `<circle cx="36" cy="35" r="5" fill="${fill}"/>`,
  blob: (fill) =>
    `<path d="M14 20c0-8 8-12 15-9s9 12 6 19-13 9-18 4-6-8-3-14z" fill="${fill}"/>` +
    `<circle cx="21" cy="23" r="1.6" fill="${PALETTE.ink}"/>` +
    `<circle cx="29" cy="25" r="1.6" fill="${PALETTE.ink}"/>`,
  question: (fill) =>
    `<path d="M16 17a8 8 0 1 1 10 8c-2 1-2 3-2 5"/>` +
    `<circle cx="24" cy="37" r="2.6" fill="${fill}"/>`,
  /** 纯线条形状：不吃 fill，只靠描边成形（所以参数是 _fill） */
  scribble: (_fill) =>
    `<path d="M10 20c6-10 8 10 14 0s8 10 14 0"/>` + `<path d="M10 32c6-10 8 10 14 0s8 10 14 0"/>`,
  wave: (fill) =>
    `<path d="M8 28c5-10 9 10 14 0s9 10 14 0" stroke="${fill}"/>` +
    `<path d="M8 20c5-10 9 10 14 0s9 10 14 0"/>`,
  dice: (fill) =>
    `<rect x="10" y="10" width="28" height="28" rx="6" fill="${fill}"/>` +
    `<circle cx="18" cy="18" r="2.2" fill="${PALETTE.ink}"/>` +
    `<circle cx="30" cy="30" r="2.2" fill="${PALETTE.ink}"/>` +
    `<circle cx="24" cy="24" r="2.2" fill="${PALETTE.ink}"/>`,
  badge: (fill) =>
    `<circle cx="24" cy="21" r="12" fill="${fill}"/>` + `<path d="M18 31l-3 11 9-4 9 4-3-11"/>`,
  brick: (fill) =>
    `<rect x="8" y="16" width="32" height="18" rx="3" fill="${fill}"/>` +
    `<path d="M8 25h32M20 16v9M28 25v9"/>`,
  broken: (fill) =>
    `<circle cx="24" cy="22" r="12" fill="${fill}"/>` +
    `<path d="M24 12l-5 9 7 3-5 8" stroke="${PALETTE.paper}"/>` +
    `<path d="M18 33l-3 9 9-4 9 4-3-9"/>`,
  candle: (fill) =>
    `<path d="M18 22h12v18H18z" fill="${fill}"/>` +
    `<path d="M24 22V14"/>` +
    `<path d="M24 6c3 4 3 6 0 8-3-2-3-4 0-8z" fill="${PALETTE.yellow}"/>`,

  // ───────── 批 0 新增 ─────────
  /** 手册 / 书：方册 + 书脊 + 两条正文 + 纸白书签带 */
  book: (fill) =>
    `<rect x="11" y="8" width="26" height="32" rx="3" fill="${fill}"/>` +
    `<path d="M18 8v32"/>` +
    `<path d="M24 20h8M24 27h6"/>` +
    `<path d="M31 8v11l-3-3-3 3V8" fill="${PALETTE.paper}"/>`,
  /**
   * 彩票：右边是**细密撕口**（2.5 格的锯齿，看起来是纸被撕开而不是箭头），
   * 中间一条虚线是撕线本身 —— "半张"的语义靠这条线，不靠留白。
   */
  ticket: (fill) =>
    `<path d="M9 14h30l-3 2.5 3 2.5-3 2.5 3 2.5-3 2.5 3 2.5-3 2.5 3 2.5H9z" fill="${fill}"/>` +
    `<path d="M25 16v16" stroke-dasharray="3 3"/>` +
    `<path d="M13 21h8M13 27h6"/>`,
  /**
   * 地图：三折面 + 折线 + 路径。整体斜 10° —— 不斜的话和「书」几乎同形，
   * 斜角是地图在 32 单位下唯一能一眼分辨的特征（和 `card` 用 rotate(-8) 同理）。
   */
  map: (fill) =>
    `<g transform="rotate(-10 24 24)">` +
    `<path d="M8 14l11-4 10 4 11-4v24l-11 4-10-4-11 4z" fill="${fill}"/>` +
    `<path d="M19 10v24M29 14v24"/>` +
    `<path d="M12 30c4-2 3-7 7-6"/>` +
    `</g>`,
  /** 口粮：压缩块 + 两端封口（区别于 brick 的错缝砖） */
  bar: (fill) =>
    `<rect x="9" y="16" width="30" height="16" rx="4" fill="${fill}"/>` +
    `<path d="M17 16v16M31 16v16"/>` +
    `<path d="M21 24h6"/>`,
  /** 更说不清的东西：blob 多一个把手 + 第二张脸的偏移 */
  blob2: (fill) =>
    `<path d="M11 22c0-8 8-13 15-10s10 12 7 19-14 9-19 4-6-8-3-13z" fill="${fill}"/>` +
    `<path d="M33 20h8v9h-8"/>` +
    `<circle cx="19" cy="24" r="1.6" fill="${PALETTE.ink}"/>` +
    `<circle cx="27" cy="26" r="1.6" fill="${PALETTE.ink}"/>`,

  // ───────── 批 0 尾款 ─────────
  /**
   * 一页纸（`wastepaper`）：**空白正面 + 背面那段话透印 + 右下角折起露出背面**。
   *
   * 与 `sheet`（外星小孩的作业）是同一件形状家族里必须分开的两张，靠三处反着画：
   * ① 页面是**纸白**（sheet 是满色贴纸）；
   * ② 更窄更高、折角在**右下**（sheet 的折角在右上，且只画折线不填色）；
   * ③ 字是**右对齐的透印**（sheet 是左对齐正读）。
   * 「两面印着同一段话」= ②（折起露出背面，背面是本件物品的颜色）+ ③（同一段话透过来）。
   * 上半页留空 —— 那句「内容不重要，重要的是它很干净」就画在这里。
   *
   * 32 世界单位下描边占 2px，所以折角三角和透印线都必须 ≥ 6 格，否则被描边吃掉。
   */
  page: (fill) =>
    `<path d="M14 5h20v25l-12 12H14z" fill="${PALETTE.paper}"/>` +
    // 折起的那一角在**裁角外侧**：两条直角边正好落在纸的外轮廓上，
    // 只剩斜边（= 折痕）与纸身共用一条描边，所以这 12×12 的三角是干净的色块，
    // 不会被描边吃成一块墨点（画在内侧就会）。
    `<path d="M34 30v12H22z" fill="${fill}"/>` +
    `<path d="M29 15H19M29 22h-6M29 29H20" stroke="${fill}"/>`,

  // ───────── A1b · 阶段 3「建设期」产物（4 个）─────────
  // 几何直接取自 docs/design/ASSETS-v3-SHAPES-snippet.ts，一个路径都没重画。
  // 铁律：内部不写 stroke-width；开放 path 上的 fill 是空操作，要上色一律用 stroke="…"；
  // 要挖洞必须用闭合路径。

  /** 线圈 / 缠绕的导电线圈 —— generator 手摇发电机（mid / yellow） */
  // 5 条不等长横线，横向条纹块
  coil: (_fill) => `
    <path d="M13 12h22M10 18h28M12 24h24M10 30h28M13 36h22"/>
  `,

  /** 计时瓶 / 沙漏 —— hourglass 时漏（mid / mint） */
  // 上下对顶双三角（腰身细）；落沙点是闭合圆，fill 才有效
  sandglass: (_fill) => `
    <path d="M11 7h26l-13 17zM11 41h26L24 24z" fill="none"/>
    <circle cx="24" cy="34" r="3" fill="${PALETTE.paper}"/>
    <path d="M18 13h12"/>
  `,

  /** 告示板 / 立杆公告牌 —— notice 手写告示（mid / orange） */
  // 竖杆 + 矩形板；板上两行墨痕长度递减，模拟手写字迹
  placard: (fill) => `
    <path d="M16 42V16"/>
    <path d="M16 16h22v18H16z" fill="${fill}"/>
    <path d="M20 22h14M20 28h9"/>
  `,

  /** 铭牌 / 纪念牌 —— ks_build 建设纪念牌（keepsake / pink） */
  // 竖长牌身 + 宽底座（上窄下宽的「碑」形）
  plaque: (fill) => `
    <path d="M18 40V13h12v27z" fill="${fill}"/>
    <path d="M20 19h8M20 25h8M20 31h6"/>
    <path d="M14 40h20v6H14z" fill="${fill}"/>
  `,
};

/**
 * 键 = **`item.icon`**（运行时真源）。60 件物品共 59 个 icon，全部在这里。
 *
 * v1 这张表混了 56 个**物品 id**，而运行时查的是 `item.icon`，
 * 结果 `manual / lottery / antigrav / fuel / mood / poker / theoryfuel` 7 件落进 `blob`。
 * 现在 id 键由下面的 `SHAPE_OF_ID` 派生兜底，本表只放 icon 名 —— 一个键一份语义。
 */
const SHAPE_OF: Record<string, ShapeName> = {
  tape: 'ring',
  tape2: 'ring',
  wrench: 'wrench',
  book: 'book',
  sandwich: 'stack',
  battery: 'cell',
  battery2: 'cell',
  plunger: 'rod',
  joystick: 'rod',
  screw: 'bolt',
  sock: 'cloth',
  ticket: 'ticket',
  cards: 'card',
  'arrow-up': 'arrow',
  canister: 'flask',
  flame: 'flask',
  cloud: 'cloud',
  smoke: 'cloud',
  paper: 'sheet',
  cert: 'sheet',
  page: 'page',
  sun: 'sun',
  sweat: 'drop',
  rock: 'rock',
  note: 'scribble',
  sparkle: 'star',
  wire: 'wire',
  bracket: 'bracket',
  signal: 'signal',
  shield: 'shield',
  bed: 'bed',
  tent: 'tent',
  door: 'door',
  doorway: 'door',
  bowl: 'bowl',
  engine: 'engine',
  clock: 'clock',
  speaker: 'engine',
  spiral: 'engine',
  menu: 'sign',
  cake: 'stack',
  person: 'person',
  hands: 'hands',
  blob: 'blob',
  blob2: 'blob2',
  map: 'map',
  gum: 'blob',
  scribble: 'scribble',
  question: 'question',
  aura: 'wave',
  wave: 'wave',
  dice: 'dice',
  badge: 'badge',
  medal: 'badge',
  brick: 'brick',
  broken: 'broken',
  sign: 'sign',
  candle: 'candle',
  bar: 'bar',
  shop: 'shop',
  // A1b：阶段 3 建设期产物 + 建设纪念牌
  placard: 'placard',
  coil: 'coil',
  sandglass: 'sandglass',
  plaque: 'plaque',
};

/**
 * 向后兼容兜底：v1 有调用方把**物品 id** 当 icon 传。
 * 直接由 `ITEMS` 派生而不是手抄一份，所以永远不可能与 icon 表漂移。
 */
const SHAPE_OF_ID: Record<string, ShapeName> = Object.fromEntries(
  ITEMS.map((it) => [it.id, SHAPE_OF[it.icon] ?? 'blob'] as const),
);

/** 未知键统一退回 `blob`：说不清的东西本来就该模糊 */
function shapeFor(key: string | undefined): ShapeName {
  if (!key) return 'blob';
  return SHAPE_OF[key] ?? SHAPE_OF_ID[key] ?? 'blob';
}

/**
 * 唯一的形状 → 标记函数。两个出口都必须走这里，
 * 这样「背包里的图标」和「地上的贴纸」在几何上逐字节相同。
 *
 * 结果按 (shape, fill, strokeBox) 缓存：背包网格每次 collect 都会重渲染，
 * 不缓存的话每张卡片都要重新拼一遍 SVG 字符串（T10-QW1）。
 * 缓存只影响性能，不影响输出——同一个 key 的返回值与不缓存时逐字节相同。
 */
const markupCache = new Map<string, string>();

function shapeMarkup(shape: ShapeName, fill: string, strokeBox: number): string {
  const key = `${shape}\u0000${fill}\u0000${strokeBox}`;
  const hit = markupCache.get(key);
  if (hit !== undefined) return hit;
  const inner = (SHAPES[shape] ?? SHAPES.blob)(fill);
  const markup =
    `<g fill="none" stroke="${PALETTE.ink}" stroke-width="${strokeBox}"` +
    ` stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
  markupCache.set(key, markup);
  return markup;
}

export interface ItemIconProps {
  /** 物品 id。给了就优先，icon/color 从 `ITEM_MAP` 派生 */
  id?: string;
  /** 物品的 `icon` 字段（现网三处调用用的是这个） */
  icon?: string;
  /** 物品的 `color` 字段 */
  color?: StickerColor;
  /** 显示尺寸 px。描边按它等比换算，视觉粗细恒定 2px */
  size?: number;
  className?: string;
}

/**
 * React 出口。颜色是字面 hex（不是 `var()`）——与 `itemSvgMarkup` 同源，
 * `dangerouslySetInnerHTML` 的内容是本模块内的静态字符串，没有任何用户输入。
 */
export function ItemIcon({ id, icon, color, size = 40, className }: ItemIconProps) {
  const item = id ? ITEM_MAP[id] : undefined;
  const shape = shapeFor(item?.icon ?? icon);
  const tint = STICKER[item?.color ?? color ?? 'orange'];
  const markup = shapeMarkup(shape, tint, strokeBoxFor(size));
  const cls = className ? `item__icon ${className}` : 'item__icon';
  return (
    <svg
      className={cls}
      viewBox={`0 0 ${SHAPE_VIEWBOX} ${SHAPE_VIEWBOX}`}
      width={size}
      height={size}
      aria-hidden="true"
      style={{ width: size, height: size, flex: '0 0 auto' }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

/**
 * Pixi 出口：完整 `<svg>` 字符串，交给 `sprites.ts` 转纹理。
 *
 * `px` 只是**纹理分辨率**，不参与描边换算 —— 否则同一个图标存成 96px 纹理
 * 会比 40px 的背包图标细一倍。描边恒按 `WORLD_DISPLAY`（32 世界单位）换算。
 */
export function itemSvgMarkup(id: string, px = 96): string {
  const item = ITEM_MAP[id];
  const shape = shapeFor(item?.icon);
  const tint = item ? STICKER[item.color] : PALETTE.ink;
  const body = shapeMarkup(shape, tint, strokeBoxFor(WORLD_DISPLAY));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHAPE_VIEWBOX} ${SHAPE_VIEWBOX}"` +
    ` width="${px}" height="${px}">${body}</svg>`
  );
}
