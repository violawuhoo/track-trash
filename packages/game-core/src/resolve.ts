import { getItem } from './items';
import {
  FALLBACK_ITEM,
  RECIPE_MAP,
  RISK_ITEM,
  matchAccident,
  recipeKey,
} from './recipes';
import { STAGES } from './stages';
import type {
  MixHint,
  MixOutcome,
  MixResult,
  Progress,
  StageDef,
  Tag,
} from './types';

/** 取阶段定义 */
export function getStage(id: 1 | 2 | 3): StageDef | undefined {
  return STAGES.find((s) => s.id === id);
}

/** 两个标签集合的并集（去重） */
export function unionTags(a: Tag[], b: Tag[]): Tag[] {
  return Array.from(new Set([...a, ...b]));
}

/** 这两个物品离某个阶段目标还差哪些标签 */
export function missingForStep(requires: Tag[], tags: Tag[]): Tag[] {
  return requires.filter((r) => !tags.includes(r));
}

/**
 * 合成判定。严格按优先级：
 *
 *   1. 阶段目标（标签匹配，覆盖即通过）
 *   2. 精确配方
 *   3. 风险物品 → 失败的味道
 *   4. 意外配对表
 *   5. 兜底：说不清的东西
 *
 * 永远有产物，不会出现「合了但什么都没有」。材料不白费。
 */
export function resolveMix(
  aId: string,
  bId: string,
  progress: Progress,
): MixOutcome {
  const a = getItem(aId);
  const b = getItem(bId);
  const tags = unionTags(a.tags, b.tags);

  // ── 1. 阶段目标 ──
  // 阶段 1 / 2 / 3 都可能带标签目标链。阶段 3 走满三步后（stepIndex >= steps.length）
  // 内层守卫会放行，回归纯配方判定 —— 建设期完成后不再拦截玩家的自由合成。
  const stage =
    progress.stage === 1 || progress.stage === 2 || progress.stage === 3
      ? getStage(progress.stage)
      : undefined;

  if (stage && progress.stepIndex < stage.steps.length) {
    const step = stage.steps[progress.stepIndex];
    if (step.requires.every((r) => tags.includes(r))) {
      const nextStepIndex = progress.stepIndex + 1;
      const result: MixResult = {
        kind: 'stage',
        output: step.output,
        stepId: step.id,
        nextStepIndex,
        stageCleared: nextStepIndex >= stage.steps.length,
      };
      return { result, hint: null };
    }
  }

  const hint = buildHint(stage, progress, tags);

  // ── 2. 精确配方 ──
  const recipeOut = RECIPE_MAP[recipeKey(aId, bId)];
  if (recipeOut) {
    return { result: { kind: 'recipe', output: recipeOut }, hint };
  }

  // ── 3. 风险物品 ──
  if (a.tags.includes('风险') || b.tags.includes('风险')) {
    return {
      result: { kind: 'accident', output: RISK_ITEM, rule: ['风险', '风险'] },
      hint,
    };
  }

  // ── 4. 意外配对 ──
  const rule = matchAccident(a.tags, b.tags);
  if (rule) {
    return {
      result: { kind: 'accident', output: rule.out, rule: rule.tags },
      hint,
    };
  }

  // ── 5. 兜底 ──
  return { result: { kind: 'fallback', output: FALLBACK_ITEM }, hint };
}

/**
 * 生成提示。
 * - missing：当前步骤还缺哪些标签
 * - laterStep：这个组合其实对应更后面的一步，先做前面的
 */
function buildHint(
  stage: StageDef | undefined,
  progress: Progress,
  tags: Tag[],
): MixHint | null {
  if (!stage || progress.stepIndex >= stage.steps.length) return null;

  const step = stage.steps[progress.stepIndex];
  const missing = missingForStep(step.requires, tags);

  let laterStep: MixHint['laterStep'];
  for (let i = progress.stepIndex + 1; i < stage.steps.length; i++) {
    const later = stage.steps[i];
    if (later.requires.every((r) => tags.includes(r))) {
      laterStep = { index: i, stepId: later.id };
      break;
    }
  }

  return { missing, ...(laterStep ? { laterStep } : {}) };
}

/** 该阶段是否全部完成（阶段 3 无 steps，直接返回 false，由支线判定） */
export function stageCleared(stage: 1 | 2 | 3, stepIndex: number): boolean {
  const def = getStage(stage);
  if (!def) return false;
  return def.steps.length > 0 && stepIndex >= def.steps.length;
}
