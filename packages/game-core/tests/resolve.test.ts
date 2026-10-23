import { describe, expect, it } from 'vitest';
import { STAGES, hintMessage, resolveMix } from '../src/index';
import type { Progress, Tag } from '../src/index';

const at = (stage: 1 | 2 | 3 | 4, stepIndex: number): Progress => ({ stage, stepIndex });

/**
 * 「没有阶段目标在生效」的上下文。
 *
 * 用 stage 3 + 超大 stepIndex：无论阶段 3 目前有几步（现在 0 步、A1b 后 3 步），
 * `stepIndex >= steps.length` 的内层守卫都会放行，回归纯配方判定。
 * 不能用 stage 4 —— 阶段 4 永远不存在，语义上不是「自由合成」。
 */
const freePlay = (): Progress => at(3, 99);

/**
 * 临时**替换**阶段 3 的步骤，测完还原。
 *
 * A1b 起 `STAGES[2].steps` 已有正式三步（s3-1/s3-2/s3-3）。
 * 这里用「替换」而不是「追加」：追加会让注入的步骤排在正式三步之后，
 * 索引全乱，A1a 时期写下的断言（命中第 1 个注入步）会全部失效。
 * 替换语义让「机制测试」与「正式内容测试」互不干扰。
 */
function withStage3Steps<T>(
  steps: { id: string; requires: Tag[]; output: string }[],
  fn: () => T,
): T {
  const stage3 = STAGES[2]!;
  const backup = stage3.steps;
  stage3.steps = steps;
  try {
    return fn();
  } finally {
    stage3.steps = backup;
  }
}

describe('合成判定优先级', () => {
  it('阶段目标压过精确配方：扳手 + 胶带产出临时导线，不是门', () => {
    const { result } = resolveMix('wrench', 'tape', at(1, 0));
    expect(result.kind).toBe('stage');
    if (result.kind !== 'stage') throw new Error('unreachable');
    expect(result.output).toBe('wire');
    expect(result.nextStepIndex).toBe(1);
  });

  it('同一组材料换个组合也能过第 1 步：电池 + 胶带', () => {
    const { result } = resolveMix('battery', 'tape', at(1, 0));
    expect(result.kind).toBe('stage');
    if (result.kind !== 'stage') throw new Error('unreachable');
    expect(result.output).toBe('wire');
  });

  it('不满足当前步骤时不会被阶段吞掉，按顺序落到意外', () => {
    const { result, hint } = resolveMix('battery', 'wrench', at(1, 0));
    // 电池带风险，所以走风险分支
    expect(result.kind).toBe('accident');
    if (result.kind !== 'accident') throw new Error('unreachable');
    expect(result.output).toBe('failedtaste');
    expect(hint?.missing).toEqual(['粘']);
  });

  it('第 2 步：导线 + 扳手 → 信号器支架（导电 + 金属）', () => {
    const { result } = resolveMix('wire', 'wrench', at(1, 1));
    expect(result.kind).toBe('stage');
    if (result.kind !== 'stage') throw new Error('unreachable');
    expect(result.output).toBe('bracket');
  });

  it('第 3 步：手册 + 支架 → 修好的信号器（知识 + 导电）', () => {
    const { result } = resolveMix('bracket', 'manual', at(1, 2));
    expect(result.kind).toBe('stage');
    if (result.kind !== 'stage') throw new Error('unreachable');
    expect(result.output).toBe('signal');
    expect(result.stageCleared).toBe(true);
  });

  it('阶段 2 第 1 步：搋子 + 袜子 → 挡风板', () => {
    const { result } = resolveMix('plunger', 'sock', at(2, 0));
    expect(result.kind).toBe('stage');
    if (result.kind !== 'stage') throw new Error('unreachable');
    expect(result.output).toBe('windbreak');
  });

  it('阶段 2 第 2 步：螺丝 + 挡风板 → 床架（金属 + 实体）', () => {
    const { result } = resolveMix('screw', 'windbreak', at(2, 1));
    expect(result.kind).toBe('stage');
    if (result.kind !== 'stage') throw new Error('unreachable');
    expect(result.output).toBe('bedframe');
  });

  it('阶段目标压过风险标签：彩票 + 床架 → 避难所', () => {
    const { result } = resolveMix('lottery', 'bedframe', at(2, 2));
    expect(result.kind).toBe('stage');
    if (result.kind !== 'stage') throw new Error('unreachable');
    expect(result.output).toBe('shelter');
  });

  it('精确配方压过风险标签：扑克牌 + 昨天的味道 → 输掉的下午', () => {
    const { result } = resolveMix('poker', 'taste', freePlay());
    expect(result.kind).toBe('recipe');
    if (result.kind !== 'recipe') throw new Error('unreachable');
    expect(result.output).toBe('lostafternoon');
  });

  it('精确配方命中：搋子 + 胶带 → 应急操纵杆', () => {
    const { result } = resolveMix('plunger', 'tape', freePlay());
    expect(result.kind).toBe('recipe');
    if (result.kind !== 'recipe') throw new Error('unreachable');
    expect(result.output).toBe('joystick');
  });

  it('风险物品没有配方时产出失败的味道', () => {
    const { result } = resolveMix('lottery', 'sock', freePlay());
    expect(result.kind).toBe('accident');
    if (result.kind !== 'accident') throw new Error('unreachable');
    expect(result.output).toBe('failedtaste');
  });

  it('意外配对：三明治 + 袜子 → 说不清的东西', () => {
    const { result } = resolveMix('sandwich', 'sock', freePlay());
    expect(result.kind).toBe('accident');
    if (result.kind !== 'accident') throw new Error('unreachable');
    expect(result.output).toBe('unclear');
  });

  it('兜底：两个中间产物没有基础标签时给说不清的东西', () => {
    const { result } = resolveMix('wire', 'bracket', freePlay());
    expect(result.kind).toBe('fallback');
    if (result.kind !== 'fallback') throw new Error('unreachable');
    expect(result.output).toBe('unclear');
  });

  it('提前满足后面步骤时给出中性双路提示（A5 提示降噪定稿）', () => {
    const outcome = resolveMix('manual', 'battery', at(1, 0));
    expect(outcome.result.kind).toBe('accident'); // 电池带风险
    expect(outcome.hint?.laterStep?.index).toBe(2);
    // 定稿文案：不再命令「先把前面那步做完」，两条路都摆出来、顺序交给玩家
    expect(hintMessage(outcome)).toBe(
      '这个组合像是后面要用的东西。先做前面的也行，先造它也行。',
    );
  });

  it('同一种物品可以自合', () => {
    const { result } = resolveMix('sandwich', 'sandwich', freePlay());
    expect(result.kind).toBe('accident');
    if (result.kind !== 'accident') throw new Error('unreachable');
    expect(result.output).toBe('unclear');
  });

  // ── 阶段 3 目标链（A1a 机制）──

  it('阶段 3 有步骤时，第 1 步能被命中并产出 step.output', () => {
    withStage3Steps(
      [
        { id: 's3-tmp', requires: ['金属', '抽象'], output: 'bracket' },
        { id: 's3-tmp-2', requires: ['知识', '外星'], output: 'signal' },
      ],
      () => {
        const { result } = resolveMix('screw', 'mood', at(3, 0));
        expect(result.kind).toBe('stage');
        if (result.kind !== 'stage') throw new Error('unreachable');
        expect(result.output).toBe('bracket');
        expect(result.nextStepIndex).toBe(1);
        expect(result.stageCleared).toBe(false);
      },
    );
  });

  it('阶段 3 三步走满后不再拦截配方，回归纯配方判定', () => {
    withStage3Steps(
      [
        { id: 's3-1', requires: ['金属', '抽象'], output: 'bracket' },
        { id: 's3-2', requires: ['知识', '外星'], output: 'signal' },
        { id: 's3-3', requires: ['能烧', '粘'], output: 'joystick' },
      ],
      () => {
        // stepIndex = 3 = steps.length → 内层守卫放行
        const { result } = resolveMix('plunger', 'tape', at(3, 3));
        expect(result.kind).toBe('recipe');
        if (result.kind !== 'recipe') throw new Error('unreachable');
        expect(result.output).toBe('joystick');
      },
    );
  });
});
