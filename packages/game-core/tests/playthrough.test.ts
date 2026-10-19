import { describe, expect, it } from 'vitest';
import {
  BRANCHES,
  ITEMS,
  RECIPES,
  craft,
  createInitialState,
  getItem,
  getStage,
  pickFromScene,
  searchArea,
  unionTags,
} from '../src/index';
import type { SaveState, Tag } from '../src/index';

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 在背包里找一对能覆盖 requires 的物品 */
function findPair(
  bag: Record<string, number>,
  requires: Tag[],
): [string, string] | null {
  const ids = Object.keys(bag).filter((id) => (bag[id] ?? 0) > 0);

  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue;
      const tags = unionTags(getItem(a).tags, getItem(b).tags);
      if (requires.every((r) => tags.includes(r))) return [a, b];
    }
  }
  for (const a of ids) {
    if ((bag[a] ?? 0) < 2) continue;
    const tags = getItem(a).tags;
    if (requires.every((r) => tags.includes(r))) return [a, a];
  }
  return null;
}

interface PlayResult {
  state: SaveState;
  actions: number;
}

/**
 * 贪心策略通关模拟：
 * 1. 有能推进一步的材料就合成
 * 2. 场景里有东西就捡
 * 3. 都没有就搜索
 */
function play(seed: number, maxActions = 400): PlayResult {
  const rng = mulberry32(seed);
  let state = createInitialState();
  let actions = 0;

  while (state.stage < 3 && actions < maxActions) {
    actions++;

    if (state.stage === 1 || state.stage === 2) {
      const stage = getStage(state.stage);
      const step = stage?.steps[state.stepIndex];
      if (step) {
        const pair = findPair(state.bag, step.requires);
        if (pair) {
          const res = craft(state, pair[0], pair[1]);
          if (!res.ok) throw new Error(`合成失败: ${res.reason}`);
          state = res.state;
          continue;
        }
      }
    }

    if (state.scene.length > 0) {
      const picked = pickFromScene(state, state.scene[0]!);
      if (picked) {
        state = picked.state;
        continue;
      }
    }

    state = searchArea(state, rng);
  }

  return { state, actions };
}

describe('阶段 1 / 2 稳定性', () => {
  it('1000 个随机种子全部能通关到阶段 3', () => {
    const failures: number[] = [];
    for (let seed = 1; seed <= 1000; seed++) {
      const { state } = play(seed);
      if (state.stage < 3) failures.push(seed);
    }
    expect(failures).toEqual([]);
  });

  it('通关所需操作次数有上界，不会无限刷', () => {
    let max = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const { state, actions } = play(seed);
      expect(state.stage, `seed ${seed}`).toBe(3);
      max = Math.max(max, actions);
    }
    // 三个阶段共 6 步，加上拾取与搜索，正常不会超过 60 次操作
    expect(max).toBeLessThan(60);
  });

  it('阶段 1 通关后天数合理（不会因为刷保底而爆天数）', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { state } = play(seed);
      expect(state.day, `seed ${seed}`).toBeLessThan(60);
    }
  });

  it('阶段推进时解锁对应区域并发放纪念品', () => {
    const { state } = play(42);
    expect(state.stage).toBe(3);
    expect(state.keepsakes).toContain('ks_signal');
    expect(state.keepsakes).toContain('ks_shelter');
  });
});

describe('配方可达性', () => {
  it('所有配方产物都能从基础物品经过有限次合成得到', () => {
    const reachable = new Set(
      ITEMS.filter((i) => i.kind === 'base').map((i) => i.id),
    );

    let changed = true;
    while (changed) {
      changed = false;
      for (const r of RECIPES) {
        if (reachable.has(r.a) && reachable.has(r.b) && !reachable.has(r.out)) {
          reachable.add(r.out);
          changed = true;
        }
      }
    }

    for (const r of RECIPES) {
      expect(reachable.has(r.out), `${r.a}+${r.b} → ${r.out}`).toBe(true);
    }
  });

  it('三条支线的每个槽位都有可达候选', () => {
    const reachable = new Set(
      ITEMS.filter((i) => i.kind === 'base').map((i) => i.id),
    );
    let changed = true;
    while (changed) {
      changed = false;
      for (const r of RECIPES) {
        if (reachable.has(r.a) && reachable.has(r.b) && !reachable.has(r.out)) {
          reachable.add(r.out);
          changed = true;
        }
      }
    }

    for (const branch of BRANCHES) {
      for (const options of branch.requires) {
        expect(
          options.some((id) => reachable.has(id)),
          `${branch.name} 的槽位无解`,
        ).toBe(true);
      }
    }
  });
});
