/**
 * 进度评分（SPEC §8.1）。
 *
 * ⚠️ C2 批次：**公式已下沉到 `packages/game-core/src/progress.ts`**。
 * 之前这里是 `apps/web/src/lib/cloud.ts` 的手抄副本（两份实现 = R8 跨端漂移隐患），
 * C2 改公式时两份必漏一边。本文件现在只做**形状适配**：
 * 把存档里的 `ngPlus`（可能是对象 / 布尔 / 缺失）转成 core 认的 `cycle` 标量，
 * 然后调 core 的纯函数。
 *
 * 服务端权威重算，不信任客户端传来的 progressScore。
 *
 * ## 公式
 *
 * ```
 * progressScore = cycle * 1_000_000
 *               + stage * 10_000
 *               + stepIndex * 1_000
 *               + branchesDone * 200
 *               + day
 * ```
 *
 * - `cycle`：周目数。二周目 ≥ 1e6，一周目上限 ≈32800 → 二周目必赢云端旧档
 * - `branchesDone`：四条支线（ship / teashop / birthday / stay）各 200
 */
import {
  cycleOfNgPlus,
  progressScoreOf as coreProgressScoreOf,
} from '@haola/game-core';

export interface ProgressInput {
  stage: number;
  stepIndex: number;
  branches: {
    ship: boolean;
    teashop: boolean;
    birthday: boolean;
    // stay 为第四支线（A2）。可选：老存档没有这个键。
    stay?: boolean;
  };
  day: number;
  /**
   * 跨周目档案（C2）。三种形态都要容错：
   * - 对象 → 取 `cycle`
   * - `true` → A2 的「二周目已解锁」语义位 → cycle = 2
   * - `false` / 缺失 → cycle = 1
   *
   * ⚠️ 老存档里 `ngPlus` 可能是布尔（A2 落的语义位），**取不到 `.cycle`**，
   * 直接 `.cycle` 会崩或得到 undefined。`cycleOfNgPlus` 统一处理。
   */
  ngPlus?: unknown;
}

/** 进度评分。委托给 core 的唯一实现（web 侧 import 的是同一个函数）。 */
export function computeProgressScore(s: ProgressInput): number {
  return coreProgressScoreOf({
    stage: s.stage,
    stepIndex: s.stepIndex,
    branches: s.branches,
    day: s.day,
    cycle: cycleOfNgPlus(s.ngPlus),
  });
}
