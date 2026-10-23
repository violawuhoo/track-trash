/**
 * 进度评分（SPEC §8.1 · C2 批次下沉到 core）。
 *
 * ## 为什么下沉到 core
 *
 * C2 之前，`apps/web/src/lib/cloud.ts` 的 `progressScoreOf` 与
 * `apps/api/src/lib/progress.ts` 的 `computeProgressScore` 是**两份手抄实现**，
 * 公式一样但各写各的（IMPACT 文档 R8 记的跨端漂移隐患）。
 * C2 要改公式（加入周目数 + `stay` 支线计分），两份手抄就要改两遍 ——
 * 漏一边就会出现「本地算出来的高分，存到服务端被重算成低分 → 存不上去」。
 *
 * 所以把公式下沉成**一份**纯函数，web 与 api 都 import 它。
 * core 只做纯函数输入输出，不碰 localStorage / 网络 / DB。
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
 * ### 为什么周目数要占 1_000_000
 *
 * 一周目的分数上限约 `30000 + 2000 + 600 + 200 ≈ 32800`（阶段 3 / 步位 3 /
 * 四条支线全完成 / 第 100 天），**远小于 1e6**。所以：
 *
 * - 二周目的分数（≥ 1_000_000）**必然**赢过任何一周目档
 * - 不需要「周目数占多少」这种微调 —— 权重只要压过一周目上限就够了
 *
 * 这解决了一个 C2 直接引入的严重问题（team-lead 核出的链路）：
 * 玩家完成一周目（stage 3 / day 80 → ≈32480）被云端存下，然后进二周目
 * （stage 1 / day 1 → ≈10001）→ 启动时「progressScore 高者胜」，
 * **云端那份一周目旧档会把二周目的新档整个覆盖回去**。
 * 玩家会发现「我明明点了开始二周目，回来还是一周目那套」。
 * 加上 `cycle * 1e6` 后，二周目档（≥1e6）稳赢。
 *
 * ### `stay` 也计入支线数
 *
 * 第四支线「留下来」（A2 落地的 `branches.stay`）权重与
 * `teashop` / `birthday` 相同（各 200），GDD 附录 B 第 13 条的建议。
 * C2 之前 `stay` 不计分（当时为了避免批次中间口径漂移而推迟），
 * 现在跟公式一起改。
 */

/** 支线完成集合。五条支线权重相同（各 200）。 */
export interface ProgressBranches {
  ship?: boolean;
  teashop?: boolean;
  birthday?: boolean;
  /** 第四支线「留下来」（A2）。老存档没这个键 → 视为 false */
  stay?: boolean;
  /** 第五支线「混沌线」（世界线批次）。老存档没这个键 → 视为 false */
  chaos?: boolean;
}

/**
 * 进度评分的输入。
 *
 * 刻意只收**标量**：不收整个存档，也不收 `ngPlus` 对象 ——
 * `ngPlus` 怎么归一化是调用方的责任（见 `cycleOfNgPlus`）。
 */
export interface ProgressScoreInput {
  /** 当前阶段（1 / 2 / 3） */
  stage: number;
  /** 当前步位（0 起） */
  stepIndex: number;
  /** 已完成的支线 */
  branches: ProgressBranches;
  /** 存档天数 */
  day: number;
  /** 周目数。1 = 一周目。缺省按 1 算 */
  cycle?: number;
}

/** 周目数在总分里的权重。必须压过一周目的分数上限（≈32800）。 */
export const CYCLE_SCORE_WEIGHT = 1_000_000;

/** 单条支线的权重 */
export const BRANCH_SCORE_WEIGHT = 200;

/**
 * 进度评分。**唯一的实现**（web 与 api 共用）。
 *
 * 纯函数：不碰 IO、不改入参、对同一组输入永远返回同一个数。
 */
export function progressScoreOf(s: ProgressScoreInput): number {
  const branchesDone =
    (s.branches.ship ? 1 : 0) +
    (s.branches.teashop ? 1 : 0) +
    (s.branches.birthday ? 1 : 0) +
    (s.branches.stay ? 1 : 0) +
    (s.branches.chaos ? 1 : 0);
  const cycle = normalizeCycle(s.cycle);
  return (
    cycle * CYCLE_SCORE_WEIGHT +
    s.stage * 10000 +
    s.stepIndex * 1000 +
    branchesDone * BRANCH_SCORE_WEIGHT +
    s.day
  );
}

/**
 * 周目数归一化：非有限数 / < 1 → 1。
 *
 * 老存档可能没有这个字段，也可能被手改过 —— 不能让评分崩掉。
 */
function normalizeCycle(cycle: number | undefined): number {
  if (typeof cycle !== 'number' || !Number.isFinite(cycle)) return 1;
  const c = Math.floor(cycle);
  return c >= 1 ? c : 1;
}

/**
 * 从**任意形状**的 `ngPlus` 里取周目数。
 *
 * 存档里的 `ngPlus` 有三种形态（见 `normalizeNgPlus` 的迁移说明）：
 * - `undefined` / `null` → 一周目（cycle = 1）
 * - `false` → 一周目（cycle = 1）
 * - `true` → A2 的「二周目已解锁」语义位 → **cycle = 2**
 * - 对象 → 取 `cycle`，非法值退回 1
 *
 * ⚠️ 布尔 `true` 映射到 cycle = 2 而不是 1：这是 `normalizeNgPlus` 已定的
 * 迁移行为（布尔位为 true 说明玩家完成过至少一周目），评分必须与
 * 档案归一化口径**一致** —— 否则同一份存档在 web 侧算 cycle=2、
 * 在 api 侧算 cycle=1，两端分数不等 → 云端冲突裁决会把档吃掉。
 *
 * 关键点：**布尔值取不到 `.cycle`，不能崩**。
 */
export function cycleOfNgPlus(raw: unknown): number {
  if (typeof raw === 'boolean') return raw ? 2 : 1;
  if (!raw || typeof raw !== 'object') return 1;
  const o = raw as { cycle?: unknown };
  if (typeof o.cycle !== 'number' || !Number.isFinite(o.cycle)) return 1;
  const c = Math.floor(o.cycle);
  return c >= 1 ? c : 1;
}
