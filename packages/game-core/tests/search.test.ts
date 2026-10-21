import { describe, expect, it } from 'vitest';
import {
  AREA_POOLS,
  STAGES,
  getItem,
  missingForBag,
  pickSearch,
  pickSearchWithHints,
  unlockedAreas,
} from '../src/index';
import type { Tag } from '../src/index';

/** 固定序列随机源 */
function seq(...vals: number[]): () => number {
  let i = 0;
  return () => vals[i++ % vals.length]!;
}

/**
 * 临时往阶段 3 塞几步，测完还原。
 *
 * A1a 只打通机制，不填 `STAGES[2].steps` 的正式内容，
 * 所以「阶段 3 能命中目标」这类断言必须临时注入步骤。
 */
function withStage3Steps<T>(steps: { id: string; requires: Tag[]; output: string }[], fn: () => T): T {
  const stage3 = STAGES[2]!;
  const backup = stage3.steps;
  stage3.steps = [...backup, ...steps];
  try {
    return fn();
  } finally {
    stage3.steps = backup;
  }
}

function tagsOf(ids: string[]): Tag[] {
  return Array.from(new Set(ids.flatMap((id) => getItem(id).tags)));
}

describe('搜索与硬保底', () => {
  it('空背包搜坠毁点，必定同时给出导电和粘', () => {
    const got = pickSearch({
      progress: { stage: 1, stepIndex: 0 },
      bag: {},
      areaId: 'crash',
      rng: seq(0.9, 0.5, 0.5, 0.5),
    });
    const tags = tagsOf(got);
    expect(tags).toContain('导电');
    expect(tags).toContain('粘');
    expect(got.length).toBeLessThanOrEqual(2);
  });

  it('已有粘时，只需要补导电', () => {
    const got = pickSearch({
      progress: { stage: 1, stepIndex: 0 },
      bag: { tape: 1 },
      areaId: 'crash',
      rng: seq(0.1, 0.5, 0.5, 0.5),
    });
    expect(tagsOf(got)).toContain('导电');
  });

  it('阶段 2 第二步缺金属时，垃圾山必定刷出带金属的螺丝', () => {
    const got = pickSearch({
      progress: { stage: 2, stepIndex: 1 },
      bag: {},
      areaId: 'junkyard',
      rng: seq(0.1, 0.5, 0.5, 0.5),
    });
    const names = got.map((id) => getItem(id).name);
    expect(names).toContain('有梦想的螺丝');
  });

  it('保底上限为 2 个，不会一次给三个', () => {
    for (let i = 0; i < 50; i++) {
      const got = pickSearch({
        progress: { stage: 1, stepIndex: 0 },
        bag: {},
        areaId: 'crash',
        rng: seq(i / 50, 0.3, 0.7, 0.2),
      });
      expect(got.length).toBeGreaterThanOrEqual(1);
      expect(got.length).toBeLessThanOrEqual(2);
    }
  });

  it('不缺口时不强制保底，可以刷出任一区域物品', () => {
    const got = pickSearch({
      progress: { stage: 1, stepIndex: 0 },
      bag: { tape: 1, battery: 2 },
      areaId: 'crash',
      rng: seq(0.1, 0.9),
    });
    for (const id of got) expect(AREA_POOLS.crash).toContain(id);
  });

  it('阶段 3 的保底会补齐 requires 标签', () => {
    withStage3Steps([{ id: 's3-tmp', requires: ['导电', '粘'], output: 'wire' }], () => {
      const got = pickSearch({
        progress: { stage: 3, stepIndex: 0 },
        bag: {},
        areaId: 'crash',
        rng: seq(0.9, 0.5, 0.5, 0.5),
      });
      const tags = tagsOf(got);
      expect(tags).toContain('导电');
      expect(tags).toContain('粘');
    });
  });

  it('阶段 3 走满三步后 missingForBag 返回空，不再保底', () => {
    withStage3Steps(
      [
        { id: 's3-1', requires: ['导电', '粘'], output: 'wire' },
        { id: 's3-2', requires: ['金属', '抽象'], output: 'bracket' },
        { id: 's3-3', requires: ['知识', '外星'], output: 'signal' },
      ],
      () => {
        expect(missingForBag({ stage: 3, stepIndex: 0 }, {})).toEqual(['导电', '粘']);
        // 第 2 步只剩金属、抽象
        expect(missingForBag({ stage: 3, stepIndex: 1 }, {})).toEqual(['金属', '抽象']);
        // 走满（stepIndex = 3 = steps.length）→ 没有当前步骤
        expect(missingForBag({ stage: 3, stepIndex: 3 }, {})).toEqual([]);
      },
    );
  });

  it('阶段 3 的缺标签会给出跨已解锁区域的提示（当前区域没有、别处有）', () => {
    // 阶段 3 需要「金属」：market 池里没有金属（金属在 crash / junkyard）。
    withStage3Steps([{ id: 's3-tmp', requires: ['金属'], output: 'bracket' }], () => {
      const out = pickSearchWithHints({
        progress: { stage: 3, stepIndex: 0 },
        bag: {},
        areaId: 'market',
        rng: seq(0.5, 0.5, 0.5),
      });
      // 当前区域（market）里没有金属 → 不往结果里塞别的区域的物品
      for (const id of out.items) {
        expect(AREA_POOLS.market).toContain(id);
        expect(getItem(id).tags).not.toContain('金属');
      }
      // 但要给出去别处拿的提示
      expect(out.hints.length).toBe(1);
      const hint = out.hints[0]!;
      expect(hint.tag).toBe('金属');
      expect(hint.areaId).not.toBe('market');
      expect(unlockedAreas({ stage: 3, stepIndex: 0 })).toContain(hint.areaId);
      expect(getItem(hint.itemId).tags).toContain('金属');
    });
  });

  it('阶段 3 时四个区域全部解锁，并集覆盖全星球', () => {
    expect(unlockedAreas({ stage: 3, stepIndex: 0 })).toEqual([
      'crash',
      'junkyard',
      'market',
      'cave',
    ]);
  });
});
