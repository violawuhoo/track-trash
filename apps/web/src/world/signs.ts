/**
 * 「远处的迹象」绘制（探索动机改版 · 方差）。
 *
 * 三种形对应 core `SIGNS` 的三种 kind，绘制规格来自 EXPLORE-ART-01（林绘澄定稿）：
 *
 * | kind | 形 | 动效 |
 * |---|---|---|
 * | light | 黄盘 + 灯丝 + 三根火花 | 三闪（1→.15×3 轮）后常亮 2.4s |
 * | smoke | 五段纯线条（底粗顶细 + 两个分叉） | 绕锚点正弦摆 ±1.5° |
 * | figure | 假人靠在杆上（投影→杆→身体，身体倾 7°） | 无 |
 *
 * 三条硬约束（与 monuments.ts 同）：
 * 1. **世界层只读**：root `eventMode='none'`，不接指针 —— 点击命中在
 *    `WorldCanvas` 的 `onTap` 里按热区判（`lib/signs.ts` 的 `SIGN_HOTZONES`）。
 * 2. **Pixi 8 路径铁律**：每条子路径前显式 `beginPath()`；同一实例里多个
 *    `fill()` 不加 `beginPath()` 会把前面的子路径吃成孔洞（见 layers.ts 雾障注释）。
 * 3. **颜色只来自 palette**：`ALPHA.*` 是 rgba 字符串，必须过 `cssColor()`
 *    拆成 `{ color, alpha }`，不许直接把字符串喂给 Pixi。
 *
 * 锚点约定：三种形都以**贴地接触点 (0,0)** 为锚点向上画（热区另按视觉包围盒
 * 中心建，见 `lib/signs.ts`）。全形无橙色 —— 橙是主角头巾专属色。
 */
import { Container, Graphics } from 'pixi.js';
import type { SignKind } from '@haola/game-core';
import { cssColor } from './layers';
import { ALPHA, INK, PALETTE, PAPER, PLANET_SHADE } from './assets/palette';

export interface SignView {
  id: string;
  x: number;
  y: number;
  kind: SignKind;
}

/** 身体倾斜角（度）。顺时针（Pixi 正旋转），顶部倒向杆所在的一侧 */
const FIGURE_TILT_DEG = 7;
/** 烟墨摆频率/幅度（rad）。约 ±1.5° */
const SMOKE_SWAY_PERIOD = 2600;
const SMOKE_SWAY_AMP = 0.026;

/** 灯火三闪：每档 140ms，7 档（[1,.15,1,.15,1,.15,1]），之后常亮 2.4s */
const FLICKER_STEP_MS = 140;
const FLICKER_STEPS: readonly number[] = Object.freeze([1, 0.15, 1, 0.15, 1, 0.15, 1]);
const FLICKER_MS = FLICKER_STEP_MS * FLICKER_STEPS.length;
const HOLD_MS = 2400;

const INK_FAINT = cssColor(ALPHA.inkFaint);
const VOID = cssColor(ALPHA.void);

// ───────────────────────── 三种形 ─────────────────────────

/** light：黄盘 r6 @(0,-14) + 灯丝 r2 + 三根火花。无贴地投影 */
function buildLight(): Container {
  const c = new Container();
  const g = new Graphics();

  // 黄盘（轮廓 1.5）
  g.beginPath();
  g.circle(0, -14, 6);
  g.fill({ color: PALETTE.yellow }).stroke({ width: 1.5, color: INK });

  // 灯丝：实心墨点
  g.beginPath();
  g.circle(0, -14, 2);
  g.fill({ color: INK });

  // 三根火花（细线 1）
  g.beginPath();
  g.moveTo(0, -22);
  g.lineTo(0, -28);
  g.moveTo(-5.7, -19.7);
  g.lineTo(-9.9, -23.9);
  g.moveTo(5.7, -19.7);
  g.lineTo(9.9, -23.9);
  g.stroke({ width: 1, color: INK });

  c.addChild(g);
  return c;
}

/** smoke：五段二次曲线，底粗顶细，两个分叉。纯线条，无填充无投影 */
function buildSmoke(): Container {
  const c = new Container();
  const g = new Graphics();

  // 底段（3，ink-faint）
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(6, -9, 2, -14);
  g.stroke({ width: 3, color: INK_FAINT.color, alpha: INK_FAINT.alpha });

  // 中段（2，ink-faint）
  g.beginPath();
  g.moveTo(2, -14);
  g.quadraticCurveTo(-1, -20, -1, -24);
  g.stroke({ width: 2, color: INK_FAINT.color, alpha: INK_FAINT.alpha });

  // 顶段（1.5，void）
  g.beginPath();
  g.moveTo(-1, -24);
  g.quadraticCurveTo(-2, -29, 0, -33);
  g.stroke({ width: 1.5, color: VOID.color, alpha: VOID.alpha });

  // 分叉·右（1，void）
  g.beginPath();
  g.moveTo(0, -33);
  g.quadraticCurveTo(2, -36, 1.5, -39.5);
  g.stroke({ width: 1, color: VOID.color, alpha: VOID.alpha });

  // 分叉·左（1，void）
  g.beginPath();
  g.moveTo(0, -33);
  g.quadraticCurveTo(-2, -36, -2.5, -38.5);
  g.stroke({ width: 1, color: VOID.color, alpha: VOID.alpha });

  c.addChild(g);
  return c;
}

/** figure：假人靠在杆上。子节点顺序 投影→杆→身体（身体压住杆，读作「靠着」） */
function buildFigure(): Container {
  const c = new Container();

  // 贴地投影（planet-shade 椭圆）
  const shadow = new Graphics();
  shadow.beginPath();
  shadow.ellipse(0, 3, 7.6, 2.9);
  shadow.fill({ color: PLANET_SHADE });
  c.addChild(shadow);

  // 杆（2，从地面到 -44）
  const pole = new Graphics();
  pole.beginPath();
  pole.moveTo(11, 0);
  pole.lineTo(11, -44);
  pole.stroke({ width: 2, color: INK });
  c.addChild(pole);

  // 身体：绕锚点倾 7°（顺时针，顶部倒向杆）。远侧脚角离地约 1.1 单位，
  // 纸色对纸色，游戏尺度下不可见（ART-01 口径，不做补偿位移）。
  const body = new Container();
  body.rotation = (FIGURE_TILT_DEG * Math.PI) / 180;
  const g = new Graphics();

  // 左腿 / 右腿 / 躯干 / 头：同一组填充（四者互不重叠，无孔洞风险）
  g.beginPath();
  g.roundRect(-9, -16, 7, 16, 2);
  g.roundRect(2, -16, 7, 16, 2);
  g.roundRect(-10, -32, 20, 16, 3);
  g.arc(0, -38, 5, 0, Math.PI * 2);
  g.fill({ color: PAPER }).stroke({ width: 1.5, color: INK });

  // 胸前 X 绑带（1.5）
  g.beginPath();
  g.moveTo(-6, -30);
  g.lineTo(6, -24);
  g.moveTo(-6, -24);
  g.lineTo(6, -30);
  g.stroke({ width: 1.5, color: INK });

  // 粉补丁（细线 1）
  g.beginPath();
  g.roundRect(-9, -22, 5, 4, 1);
  g.fill({ color: PALETTE.pink }).stroke({ width: 1, color: INK });

  body.addChild(g);
  c.addChild(body);
  return c;
}

function buildSign(kind: SignKind): Container {
  switch (kind) {
    case 'light':
      return buildLight();
    case 'smoke':
      return buildSmoke();
    case 'figure':
      return buildFigure();
  }
}

// ───────────────────────── 层 ─────────────────────────

interface SignEntry {
  node: Container;
  kind: SignKind;
  /** light 用：节点诞生时刻（performance.now()），三闪相位从这里起算 */
  bornAt: number;
}

export function createSignsLayer(): {
  root: Container;
  sync: (view: readonly SignView[]) => void;
  tick: (reduced: boolean) => void;
} {
  const root = new Container();
  root.eventMode = 'none';

  const entries = new Map<string, SignEntry>();
  let lastKey = '';

  function sync(view: readonly SignView[]) {
    // 内容 key 不变 → 不动（迹象一天内稳定；跨天换批才重建）
    const key = view.map((s) => `${s.id}:${s.kind}`).join('|');
    if (key === lastKey) return;
    lastKey = key;

    // 全量重建：最多 3 个节点，比 diff 便宜，也不会漏销毁
    for (const e of entries.values()) {
      root.removeChild(e.node);
      e.node.destroy({ children: true });
    }
    entries.clear();

    const now = performance.now();
    for (const s of view) {
      const node = buildSign(s.kind);
      node.position.set(s.x, s.y);
      root.addChild(node);
      entries.set(s.id, { node, kind: s.kind, bornAt: now });
    }
  }

  function tick(reduced: boolean) {
    if (entries.size === 0) return;
    const now = performance.now();
    for (const e of entries.values()) {
      if (e.kind === 'light') {
        if (reduced) {
          e.node.alpha = 1;
          continue;
        }
        const t = (now - e.bornAt) % (FLICKER_MS + HOLD_MS);
        e.node.alpha =
          t < FLICKER_MS ? FLICKER_STEPS[Math.floor(t / FLICKER_STEP_MS)]! : 1;
      } else if (e.kind === 'smoke') {
        // 只改 rotation，不重画路径
        e.node.rotation = reduced ? 0 : Math.sin(now / SMOKE_SWAY_PERIOD) * SMOKE_SWAY_AMP;
      }
    }
  }

  return { root, sync, tick };
}
