import { describe, expect, it } from 'vitest';
import {
  AREA_POOLS,
  STAGES,
  getItem,
  missingAreaHints,
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

describe('跨区域指路（v2 活路径 · HintBar 用）', () => {
  it('缺标签 → 给出「在哪个区域、具体是哪件物品」', () => {
    // 阶段 3 第 1 步要「金属」。金属只在 crash / junkyard 的池子里。
    withStage3Steps([{ id: 's3-tmp', requires: ['金属'], output: 'bracket' }], () => {
      const hints = missingAreaHints({ stage: 3, stepIndex: 0 }, {});
      expect(hints).toHaveLength(1);
      const h = hints[0]!;
      expect(h.tag).toBe('金属');
      // 区域必须在已解锁并集里
      expect(unlockedAreas({ stage: 3, stepIndex: 0 })).toContain(h.areaId);
      // 该区域池里确实有这件物品，且它带这个标签
      expect(AREA_POOLS[h.areaId]).toContain(h.itemId);
      expect(getItem(h.itemId).tags).toContain('金属');
    });
  });

  it('多个缺标签 → 每个标签各给一条', () => {
    withStage3Steps(
      [{ id: 's3-tmp', requires: ['金属', '外星'], output: 'bracket' }],
      () => {
        const hints = missingAreaHints({ stage: 3, stepIndex: 0 }, {});
        expect(hints.map((h) => h.tag)).toEqual(['金属', '外星']);
        for (const h of hints) {
          expect(AREA_POOLS[h.areaId]).toContain(h.itemId);
          expect(getItem(h.itemId).tags).toContain(h.tag);
        }
      },
    );
  });

  it('背包里已有的标签不再提示', () => {
    withStage3Steps([{ id: 's3-tmp', requires: ['金属'], output: 'bracket' }], () => {
      // 背包里有一件带金属的东西（screw = 实体 + 金属）
      const hints = missingAreaHints({ stage: 3, stepIndex: 0 }, { screw: 1 });
      expect(hints).toEqual([]);
    });
  });

  it('走满阶段 3 后不再有缺标签，也没有提示', () => {
    withStage3Steps(
      [
        { id: 's3-1', requires: ['金属'], output: 'bracket' },
        { id: 's3-2', requires: ['外星'], output: 'signal' },
      ],
      () => {
        expect(missingAreaHints({ stage: 3, stepIndex: 2 }, {})).toEqual([]);
      },
    );
  });

  it('阶段 1 只在已解锁区域里找（junkyard 还没解锁，不能指路到垃圾山）', () => {
    // 阶段 1 第 1 步要「导电 + 粘」，两个都缺。
    const hints = missingAreaHints({ stage: 1, stepIndex: 0 }, {});
    expect(hints.map((h) => h.tag)).toEqual(['导电', '粘']);
    // 阶段 1 的已解锁区域只有 crash
    expect(unlockedAreas({ stage: 1, stepIndex: 0 })).toEqual(['crash']);
    for (const h of hints) {
      expect(h.areaId).toBe('crash');
      expect(AREA_POOLS.crash).toContain(h.itemId);
      expect(getItem(h.itemId).tags).toContain(h.tag);
    }
  });
});
