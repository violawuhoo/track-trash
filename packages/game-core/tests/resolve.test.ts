import { describe, expect, it } from 'vitest';
import { resolveMix } from '../src/index';
import type { Progress } from '../src/index';

const at = (stage: 1 | 2 | 3 | 4, stepIndex: number): Progress => ({ stage, stepIndex });

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
    const { result } = resolveMix('poker', 'taste', at(3, 0));
    expect(result.kind).toBe('recipe');
    if (result.kind !== 'recipe') throw new Error('unreachable');
    expect(result.output).toBe('lostafternoon');
  });

  it('精确配方命中：搋子 + 胶带 → 应急操纵杆', () => {
    const { result } = resolveMix('plunger', 'tape', at(3, 0));
    expect(result.kind).toBe('recipe');
    if (result.kind !== 'recipe') throw new Error('unreachable');
    expect(result.output).toBe('joystick');
  });

  it('风险物品没有配方时产出失败的味道', () => {
    const { result } = resolveMix('lottery', 'sock', at(3, 0));
    expect(result.kind).toBe('accident');
    if (result.kind !== 'accident') throw new Error('unreachable');
    expect(result.output).toBe('failedtaste');
  });

  it('意外配对：三明治 + 袜子 → 说不清的东西', () => {
    const { result } = resolveMix('sandwich', 'sock', at(3, 0));
    expect(result.kind).toBe('accident');
    if (result.kind !== 'accident') throw new Error('unreachable');
    expect(result.output).toBe('unclear');
  });

  it('兜底：两个中间产物没有基础标签时给说不清的东西', () => {
    const { result } = resolveMix('wire', 'bracket', at(3, 0));
    expect(result.kind).toBe('fallback');
    if (result.kind !== 'fallback') throw new Error('unreachable');
    expect(result.output).toBe('unclear');
  });

  it('提前满足后面步骤时给出「先做前面」的提示', () => {
    const { result, hint } = resolveMix('manual', 'battery', at(1, 0));
    expect(result.kind).toBe('accident'); // 电池带风险
    expect(hint?.laterStep?.index).toBe(2);
  });

  it('同一种物品可以自合', () => {
    const { result } = resolveMix('sandwich', 'sandwich', at(3, 0));
    expect(result.kind).toBe('accident');
    if (result.kind !== 'accident') throw new Error('unreachable');
    expect(result.output).toBe('unclear');
  });
});
