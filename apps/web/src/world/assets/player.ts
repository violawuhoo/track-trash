/**
 * 小人（玩家）—— **批 2 真图**，替换批 0 的占位墨块。
 *
 * ## 尺寸与朝向
 * 24 × 36 世界单位（`--player-w` / `--player-h`）。这是个非常小的尺寸：
 * 能表达的只有「头巾 + 躯干 + 迈步 + 手臂张合」，**画不了五官和手指**，
 * 强行加细节只会糊成一坨墨。世界是俯视 3/4 视角，所以：
 *
 * - `down`  朝向镜头 —— 露脸（两只纸白眼睛）
 * - `up`    背朝镜头 —— 不露脸，头巾压低盖住脸的位置（这条是 `up` 与 `down`
 *           唯一的形体差别，只靠「有没有眼睛」在 24px 下不够）
 * - `left` / `right` 侧向 —— 只露朝侧那一只眼，躯干朝该侧微倾
 *
 * ## 步态：6 帧循环
 * 一个完整循环 = **接触 → 下沉 → 通过 → 接触 → 下沉 → 通过**，左右腿交替。
 * 每帧靠四件事区分，缺一个就会读成"复制粘贴"：
 * 1. 支撑脚位置（`ax`）
 * 2. 摆动脚位置 + 抬起高度（`bx` / `by`：34 落地 → 32 离地 → 29 抬最高）
 * 3. 身体下沉量 `bob`（接触 0 最高，下沉 1.5 最低，通过 0.5 回升）
 * 4. 手臂张合 `arm` 与躯干侧倾 `tilt`
 *
 * **第 2 帧是站立帧**：`WorldCanvas` 的 `PLAYER_STAND_STEP = 2`（停止移动与
 * reduced-motion 都定格在这里），所以这一帧必须是双脚落地、不歪不抬的中正站姿。
 * 改 CYCLE 顺序前先看这条，否则静止时角色会歪着一条腿。
 *
 * ⚠️ 签名 `(dir, step, px?)` 被 T3 的 `sprites.ts` 调用且已提交，
 * **不要改**（`step` 保持 `number`，不要收紧成 `0|1|2|3|4|5`）。
 */
import { PALETTE } from './palette';

export type PlayerDir = 'up' | 'down' | 'left' | 'right';

/** 世界单位：宽 24 / 高 36（--player-w / --player-h） */
export const PLAYER_W = 24;
export const PLAYER_H = 36;

/** 步态帧数。T3 的 `walkPhase % 6` 依赖这个数，改了要同步改 `WorldCanvas` */
export const PLAYER_FRAMES = 6;

/** 世界层描边：2 单位（3px 在 24 宽的形体上会把内部全吃掉） */
const STROKE = 2;

/** 站立/静止时用的帧。与 `WorldCanvas` 的 `PLAYER_STAND_STEP` 必须一致 */
export const PLAYER_STAND_STEP = 2;

interface CycleFrame {
  /** 支撑脚落点（贴地） */
  ax: number;
  /** 摆动脚落点 */
  bx: number;
  /** 摆动脚高度：34 落地 / 32 后跟离地 / 29 抬最高 */
  by: number;
  /** 身体下沉量：0 最高，1.5 最低 */
  bob: number;
  /** 手臂张合 0.5–3 */
  arm: number;
  /** 躯干侧倾（±0.8），让镜像帧可辨 */
  tilt: number;
}

/**
 * 6 帧步态表。顺序 = 播放顺序，第 2 帧是站立帧。
 * 左右腿交替：`0–2` 是右腿支撑，`3–5` 是左腿支撑。
 */
const CYCLE: readonly CycleFrame[] = [
  // 0 下沉（右腿在后抬起）
  { ax: 9.5, bx: 14.5, by: 32, bob: 1.5, arm: 1.5, tilt: -0.8 },
  // 1 通过（右腿摆到身下，抬最高）
  { ax: 9.5, bx: 12.0, by: 29, bob: 0.5, arm: 0.5, tilt: -0.4 },
  // 2 接触（双脚落地）—— 站立帧，必须中正不倾斜（静止时定格在这）
  { ax: 16.5, bx: 7.5, by: 34, bob: 0, arm: 3, tilt: 0 },
  // 3 下沉（左腿在后抬起）
  { ax: 14.5, bx: 9.5, by: 32, bob: 1.5, arm: 1.5, tilt: 0.8 },
  // 4 通过（左腿摆到身下）
  { ax: 14.5, bx: 12.0, by: 29, bob: 0.5, arm: 0.5, tilt: 0.4 },
  // 5 接触（换脚，后跟离地）
  { ax: 7.5, bx: 16.5, by: 33, bob: 0, arm: 3, tilt: -0.6 },
];

/** 躯干：x 6.5–17.5，y 11–26 */
const TORSO = { x: 6.5, y: 11, w: 11, h: 15, rx: 5 } as const;
/** 头：圆心 (12, 6.5)，半径 5.4 */
const HEAD = { cx: 12, cy: 6.5, r: 5.4 } as const;
/** 髋关节高度（躯干内，跟着 bob 走） */
const HIP_Y = 24;
/** 手臂：肩 — 手 */
const SHOULDER_Y = 14.5;
const HAND_Y = 20.5;

/**
 * 小人贴纸。
 *
 * @param dir  朝向
 * @param step 步态帧，任意整数（内部取 `% 6`）
 * @param px   渲染尺寸（纹理分辨率），默认 36 = `PLAYER_H`
 */
export function playerSvg(dir: PlayerDir, step: number, px: number = PLAYER_H): string {
  const f = CYCLE[((step % PLAYER_FRAMES) + PLAYER_FRAMES) % PLAYER_FRAMES];

  // 腿：按落点 x 排序分配给左右髋，避免两腿交叉成 X
  const [nearX, nearY] = f.ax <= f.bx ? [f.ax, 34] : [f.bx, f.by];
  const [farX, farY] = f.ax <= f.bx ? [f.bx, f.by] : [f.ax, 34];
  const hipY = HIP_Y + f.bob;

  // 头巾：`up` 压低盖住脸的位置，其余方向戴在头顶
  const bandY = dir === 'up' ? 5.2 : 3.2;
  const bandH = dir === 'up' ? 4.0 : 3.6;

  // 眼睛：背朝镜头不露脸，侧向只露朝侧那只
  const eyes =
    dir === 'up'
      ? ''
      : dir === 'left'
        ? dot(9.4)
        : dir === 'right'
          ? dot(14.6)
          : dot(9.6) + dot(14.4);

  // 手臂：张合对称，肩在躯干侧缘内一点，手伸出去
  const handL = 7 - 1.5 - f.arm * 0.7;
  const handR = 17 + 1.5 + f.arm * 0.7;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PLAYER_W} ${PLAYER_H}"` +
    ` width="${px}" height="${(px * PLAYER_H) / PLAYER_W}">` +
    // 腿：先画，压在躯干之下
    `<g stroke="${PALETTE.ink}" stroke-width="${STROKE}" stroke-linecap="round" fill="none">` +
    `<path d="M${(10.4).toFixed(2)} ${hipY.toFixed(2)}L${nearX.toFixed(2)} ${nearY.toFixed(2)}"/>` +
    `<path d="M${(13.6).toFixed(2)} ${hipY.toFixed(2)}L${farX.toFixed(2)} ${farY.toFixed(2)}"/>` +
    `</g>` +
    // 上半身：整体跟着 bob 下沉、跟着 tilt 侧倾
    `<g transform="translate(${f.tilt.toFixed(2)} ${f.bob.toFixed(2)})">` +
    // 躯干与头：贴纸语言里小人就是一块墨
    `<rect x="${TORSO.x}" y="${TORSO.y}" width="${TORSO.w}" height="${TORSO.h}"` +
    ` rx="${TORSO.rx}" fill="${PALETTE.ink}"/>` +
    `<circle cx="${HEAD.cx}" cy="${HEAD.cy}" r="${HEAD.r}" fill="${PALETTE.ink}"/>` +
    // 手臂
    `<g stroke="${PALETTE.ink}" stroke-width="${STROKE}" stroke-linecap="round" fill="none">` +
    `<path d="M7 ${SHOULDER_Y}L${handL.toFixed(2)} ${HAND_Y}"/>` +
    `<path d="M17 ${SHOULDER_Y}L${handR.toFixed(2)} ${HAND_Y}"/>` +
    `</g>` +
    // 头巾：唯一的橙色，用来在浅色星球上一眼找到自己
    `<rect x="6.2" y="${bandY}" width="11.6" height="${bandH}" rx="1.7"` +
    ` fill="${PALETTE.orange}"/>` +
    eyes +
    `</g></svg>`
  );
}

/** 眼睛：纸白圆点，压在墨色头上才看得见 */
function dot(cx: number): string {
  return `<circle cx="${cx}" cy="9.8" r="1.25" fill="${PALETTE.paper}"/>`;
}
