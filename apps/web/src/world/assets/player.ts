/**
 * 小人（玩家）占位 sprite —— **批 0 占位版**，批 4 换真图。
 *
 * 目的不是好看，是让 T3 今天就能把「角色在星球上走」跑通：
 * 签名 `(dir, step, px?)` 与最终版一致，换图时 T3 **零改动**。
 *
 * 尺寸硬约束：24 × 36 世界单位（`--player-w` / `--player-h`，`contract §5.3`）。
 * 描边 2px（世界层不用 3px：3px 在 24 宽的形体上会把内部全部吃掉）。
 *
 * ⚠️ 与 `CONTRACT-v2.md` §5.1 的 `playerSvg(frame: PlayerFrame, size)` 有出入：
 * 本文件按主理人派单实现 `(dir, step, px?)`。批 4 落地 6 帧步态时统一签名，
 * 届时契约与实现一起改（`step` 会从 `number` 收紧成 `0|1|2|3|4|5`）。
 */
import { PALETTE } from './palette';

export type PlayerDir = 'up' | 'down' | 'left' | 'right';

/** 世界单位：宽 24 / 高 36（--player-w / --player-h） */
export const PLAYER_W = 24;
export const PLAYER_H = 36;

/** 世界层描边（`--stroke-thin` 的世界等价） */
const PLAYER_STROKE = 2;

/**
 * 占位帧：墨黑圆角块 + 橙色头巾条 + 朝向标记。
 *
 * @param dir  朝向。`up` 不画眼睛（看不到脸），`left/right` 把眼睛推到一侧
 * @param _step 步态帧。占位版忽略（真图批 4 补 6 帧循环）
 * @param px   渲染尺寸（纹理分辨率），默认 36 = `PLAYER_H`
 */
export function playerSvg(dir: PlayerDir, _step: number, px: number = PLAYER_H): string {
  const eyeY = 13;
  const eyes =
    dir === 'up'
      ? ''
      : dir === 'left'
        ? `<circle cx="7" cy="${eyeY}" r="1.5" fill="${PALETTE.paper}"/>`
        : dir === 'right'
          ? `<circle cx="17" cy="${eyeY}" r="1.5" fill="${PALETTE.paper}"/>`
          : `<circle cx="9" cy="${eyeY}" r="1.5" fill="${PALETTE.paper}"/>` +
            `<circle cx="15" cy="${eyeY}" r="1.5" fill="${PALETTE.paper}"/>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PLAYER_W} ${PLAYER_H}"` +
    ` width="${px}" height="${(px * PLAYER_H) / PLAYER_W}">` +
    `<g fill="none" stroke="${PALETTE.ink}" stroke-width="${PLAYER_STROKE}"` +
    ` stroke-linecap="round" stroke-linejoin="round">` +
    // 身体：一整块墨黑圆角，贴纸语言里小人就是一块墨
    `<rect x="4" y="6" width="16" height="27" rx="7" fill="${PALETTE.ink}"/>` +
    // 头巾条：唯一的橙色，用来在浅色太空里一眼找到自己
    `<rect x="3" y="10" width="18" height="5" rx="2" fill="${PALETTE.orange}" stroke="none"/>` +
    eyes +
    `</g></svg>`
  );
}
