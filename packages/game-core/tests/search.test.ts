import { describe, expect, it } from 'vitest';
import { getItem, pickSearch } from '../src/index';
import type { Tag } from '../src/index';

/** 固定序列随机源 */
function seq(...vals: number[]): () => number {
  let i = 0;
  return () => vals[i++ % vals.length]!;
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
    const pool = ['tape', 'wrench', 'manual', 'sandwich', 'battery'];
    for (const id of got) expect(pool).toContain(id);
  });

  it('阶段 3 没有标签目标，不会触发保底', () => {
    const got = pickSearch({
      progress: { stage: 3, stepIndex: 0 },
      bag: {},
      areaId: 'cave',
      rng: seq(0.1, 0.9),
    });
    expect(got.length).toBe(1);
  });
});
