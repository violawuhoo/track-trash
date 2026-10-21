import { describe, expect, it } from 'vitest';
import {
  BRANCHES,
  ITEMS,
  RECIPES,
  STAGES,
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

describe('阶段 3 建设期（A1a 机制）', () => {
  /**
   * A1a 只打通机制、不填 `STAGES[2].steps` 的正式内容。
   * 这里临时注入三步，验证「走满 → buildDone / ks_build / stage 不变 / 幂等」。
   */
  const S3_STEPS = [
    { id: 's3-t1', requires: ['金属', '抽象'] as Tag[], output: 'bracket' },
    { id: 's3-t2', requires: ['知识', '外星'] as Tag[], output: 'signal' },
    { id: 's3-t3', requires: ['能烧', '粘'] as Tag[], output: 'joystick' },
  ];

  function withStage3Steps<T>(fn: () => T): T {
    const stage3 = STAGES[2]!;
    const backup = stage3.steps;
    stage3.steps = [...backup, ...S3_STEPS];
    try {
      return fn();
    } finally {
      stage3.steps = backup;
    }
  }

  /** 一个能走满阶段 3 三步的初始状态 */
  function stage3State(): SaveState {
    return {
      ...createInitialState(),
      stage: 3,
      stepIndex: 0,
      bag: {
        screw: 2, // 金属
        mood: 2, // 抽象
        manual: 1, // 知识
        homework: 1, // 外星
        fuel: 1, // 能烧
        tape: 1, // 粘
      },
    };
  }

  it('走满三步后：stage 仍是 3、stepIndex 停在 3、buildDone 为 true', () => {
    withStage3Steps(() => {
      let state = stage3State();

      const r1 = craft(state, 'screw', 'mood');
      expect(r1.ok).toBe(true);
      if (!r1.ok) throw new Error('unreachable');
      state = r1.state;
      expect(state.stage).toBe(3);
      expect(state.stepIndex).toBe(1);
      expect(state.buildDone).toBe(false);

      const r2 = craft(state, 'manual', 'homework');
      if (!r2.ok) throw new Error('unreachable');
      state = r2.state;
      expect(state.stage).toBe(3);
      expect(state.stepIndex).toBe(2);
      expect(state.buildDone).toBe(false);

      const r3 = craft(state, 'fuel', 'tape');
      if (!r3.ok) throw new Error('unreachable');
      state = r3.state;

      // GDD §2.4：stage 保持 3，不进 stage 4
      expect(state.stage).toBe(3);
      expect(state.stepIndex).toBe(3);
      expect(state.buildDone).toBe(true);
      // 发放建设纪念品
      expect(state.keepsakes).toContain('ks_build');
      // 写了一条「阶段」日志
      expect(state.log.some((l) => l.kind === '阶段')).toBe(true);
    });
  });

  it('走满后 ks_build 不重复发放（幂等）', () => {
    withStage3Steps(() => {
      let state = stage3State();
      for (const [a, b] of [
        ['screw', 'mood'],
        ['manual', 'homework'],
        ['fuel', 'tape'],
      ] as const) {
        const r = craft(state, a, b);
        if (!r.ok) throw new Error('unreachable');
        state = r.state;
      }
      expect(state.keepsakes.filter((k) => k === 'ks_build')).toHaveLength(1);

      // 走满后再合成：不再被阶段目标拦截，也不重复发纪念品
      const again = craft(state, 'screw', 'mood');
      if (!again.ok) throw new Error('unreachable');
      expect(again.state.keepsakes.filter((k) => k === 'ks_build')).toHaveLength(1);
      expect(again.state.stage).toBe(3);
      expect(again.state.buildDone).toBe(true);
    });
  });
});
