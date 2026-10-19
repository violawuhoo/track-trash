/**
 * 世界层色板 —— `tokens.css` 的 TS 镜像。
 *
 * 为什么需要这一份：SVG 字符串被转成 `Image` / Pixi 纹理时，
 * `var(--orange)` 不会解析（CSS 变量只存在于 DOM 样式树里），
 * 所以世界层必须拿到**字面 hex**。React 出口也用这一份，
 * 保证「背包里的图标」和「地上的贴纸」是同一种颜色。
 *
 * 铁律：
 * 1. 本文件是 `tokens.css` 的**只读镜像**，唯一真源仍是 `tokens.css`。
 *    改色必须两边同时改，由 `scripts/check-assets.mjs` 的断言 A 强制比对。
 * 2. 任何绘制代码都不许再写 hex 字面量，一律 `PALETTE.x` / `STICKER[color]`。
 * 3. 单值别名（`INK` / `PAPER`）必须由 `PALETTE` 派生，不许各写一次 hex。
 * 4. 带 alpha 的颜色只能写 `rgba()`：CSS 里的 `var()` 无法给颜色补透明度，
 *    所以 `ALPHA` 不是 `PALETTE` 的派生，而是与 `tokens.css` 同名令牌一一对应。
 */
import type { StickerColor } from '@haola/game-core';

/** 与 `tokens.css` §1–§2 的一一对应（camelCase ↔ kebab-case） */
export const PALETTE = {
  /** --ink */ ink: '#1a1a1a',
  /** --paper */ paper: '#fffdf7',
  /** --cream */ cream: '#f7f0e0',
  /** --cream-deep */ creamDeep: '#ece1c9',
  /** --orange */ orange: '#ff6b35',
  /** --mint */ mint: '#4ecdc4',
  /** --purple */ purple: '#9b6bff',
  /** --pink */ pink: '#ff8fab',
  /** --yellow */ yellow: '#ffd166',
  /** --planet（= --paper，一层别名） */ planet: '#fffdf7',
  /** --planet-shade：地面斑块 / 山体暗面 / 贴地投影 */ planetShade: '#f1e6d0',
  /** --space（= --cream-deep，一层别名） */ space: '#ece1c9',
} as const;

/**
 * 带 alpha 的令牌。通道值恒等于 ink(26,26,26) 或 paper(255,253,247)，
 * 与 `tokens.css` §3 逐字相同。
 */
export const ALPHA = {
  /** --void：未解锁扇区雾障（ink 35%） */ void: 'rgba(26,26,26,0.35)',
  /** --ink-soft：4.7:1，可承载 16px 正文 */ inkSoft: 'rgba(26,26,26,0.62)',
  /** --ink-faint：3.2:1，仅 ≥19px 粗体 / 图标 / 非文本边框 */ inkFaint: 'rgba(26,26,26,0.5)',
  /** --rule：2px 分隔线与虚线 */ rule: 'rgba(26,26,26,0.15)',
  /** --scrim：浮层遮罩 */ scrim: 'rgba(26,26,26,0.55)',
} as const;

/**
 * 五个荧光色 → 贴纸填充色。
 * 只允许墨黑描边，荧光色一律当底（ink on orange 6.1:1，paper on orange 只有 2.8:1）。
 */
export const STICKER: Record<StickerColor, string> = {
  orange: PALETTE.orange,
  mint: PALETTE.mint,
  purple: PALETTE.purple,
  pink: PALETTE.pink,
  yellow: PALETTE.yellow,
};

/** 单值别名：由 PALETTE 派生，不重复写 hex */
export const INK = PALETTE.ink;
export const PAPER = PALETTE.paper;
/** 世界层次级面（太空底 / 星球外的纸） */
export const SPACE = PALETTE.space;
/** 世界层第四阶：只用于「贴地」的暗面与投影，不用来画卡片 */
export const PLANET_SHADE = PALETTE.planetShade;

export type PaletteKey = keyof typeof PALETTE;
export type AlphaKey = keyof typeof ALPHA;
