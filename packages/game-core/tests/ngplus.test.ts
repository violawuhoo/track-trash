/**
 * 二周目（New Game+）核心状态机（C2 批次）。
 *
 * 这个文件守的是「二周目这条流程到底成不成立」：
 *
 * | 组 | 守的是什么 |
 * |---|---|
 * | A | `normalizeNgPlus` 三形态归一化（老存档不崩、布尔迁移点正确、幂等）|
 * | B | `startNextCycle` 的保留 / 重置清单（GDD §7.1）|
 * | C | `continueAfterEnding`（「留在这里继续」不清档）|
 * | D | 入口条件 `ngPlusUnlocked`（结局页「开始新的周目」只在完成过结局后可见）|
 * | E | 三处记账（结局 / 已读日志 / 走过支线）幂等且只记合法 id |
 * | F | G2 配对示例（阶段 1 的示例物品在坠毁点捡得到）|
 * | G | 缺口 A：**二周目里 8 条载体配方仍然可达**（材料是基础物品，能重新捡）|
 */
import { describe, expect, it } from 'vitest';
import {
  AREA_POOLS,
  BRANCH_IDS,
  ENDING_IDS,
  LOGS,
  RECIPES,
  createInitialState,
  createNgPlus,
  continueAfterEnding,
  getItem,
  ngPlusUnlocked,
  normalizeNgPlus,
  pairingExample,
  recordBranch,
  recordEnding,
  recordReadLog,
  stage1ExampleItemsInCrash,
  startNextCycle,
  type NgPlusState,
  type SaveState,
} from '../src/index';

describe('A. ngPlus 归一化（三形态）', () => {
  it('A1 缺字段 / null → 一周目空档案', () => {
    const expected = { cycle: 1, endings: [], readLogs: [], branchesHistory: [] };
    expect(normalizeNgPlus(undefined)).toEqual(expected);
    expect(normalizeNgPlus(null)).toEqual(expected);
  });

  it('A2 布尔 true → cycle=2 的空档案（A2 语义位「二周目已解锁」的迁移点）', () => {
    // 布尔位本身不携带任何结局 / 日志 / 支线信息 → 三个集合必须是空的，不能凭空造。
    expect(normalizeNgPlus(true)).toEqual({
      cycle: 2,
      endings: [],
      readLogs: [],
      branchesHistory: [],
    });
  });

  it('A3 布尔 false → 一周目空档案', () => {
    expect(normalizeNgPlus(false)).toEqual({
      cycle: 1,
      endings: [],
      readLogs: [],
      branchesHistory: [],
    });
  });

  it('A4 对象形态：逐键防御性归一化（脏 id 过滤 + 去重）', () => {
    const np = normalizeNgPlus({
      cycle: 3,
      endings: ['leave', 'leave', '不存在的结局', 'stay'],
      readLogs: ['L1', 'L1', 'L99'],
      branchesHistory: ['ship', 'ship', 'nope'],
    });
    expect(np.cycle).toBe(3);
    expect(np.endings).toEqual(['leave', 'stay']);
    expect(np.readLogs).toEqual(['L1']);
    expect(np.branchesHistory).toEqual(['ship']);
  });

  it('A5 非法 cycle → 1（0 / 负数 / NaN / Infinity / 字符串 / 小数向下取整）', () => {
    expect(normalizeNgPlus({ cycle: 0 }).cycle).toBe(1);
    expect(normalizeNgPlus({ cycle: -3 }).cycle).toBe(1);
    expect(normalizeNgPlus({ cycle: Number.NaN }).cycle).toBe(1);
    expect(normalizeNgPlus({ cycle: Number.POSITIVE_INFINITY }).cycle).toBe(1);
    expect(normalizeNgPlus({ cycle: 'x' }).cycle).toBe(1);
    expect(normalizeNgPlus({ cycle: 2.9 }).cycle).toBe(2);
    expect(normalizeNgPlus({ cycle: 7 }).cycle).toBe(7);
  });

  it('A6 非对象（数字 / 字符串）→ 一周目空档案，不崩', () => {
    expect(normalizeNgPlus(42)).toEqual(createNgPlus());
    expect(normalizeNgPlus('nonsense')).toEqual(createNgPlus());
  });

  it('A7 幂等：归一化后再归一化，结果不变', () => {
    const once = normalizeNgPlus({
      cycle: 2,
      endings: ['stay'],
      readLogs: ['L2'],
      branchesHistory: ['stay'],
    });
    expect(normalizeNgPlus(once)).toEqual(once);
    // 布尔形态也幂等
    expect(normalizeNgPlus(normalizeNgPlus(true))).toEqual(normalizeNgPlus(true));
  });
});

describe('B. startNextCycle（保留 / 重置清单，GDD §7.1）', () => {
  /** 一个「玩过一阵」的存档：有背包、有纪念品、有结局、读过日志、走过支线 */
  function playedState(): SaveState {
    const base = createInitialState();
    return {
      ...base,
      day: 42,
      stage: 3,
      stepIndex: 2,
      buildDone: true,
      crafts: 37,
      bag: { tape: 2, manual: 1 },
      discovered: { tape: true },
      keepsakes: ['ks_ship', 'ks_stay'],
      branches: { ship: true, teashop: false, birthday: true, stay: true },
      logsFound: ['L1', 'L3'],
      accidents: 5,
      ending: 'stay',
      launchAttempts: 2,
      launchFailures: 1,
      ngPlus: {
        cycle: 1,
        endings: ['leave', 'stay'],
        readLogs: ['L1'],
        branchesHistory: ['ship', 'stay'],
      },
      log: [
        { day: 1, kind: '系统', text: '开局。' },
        { day: 42, kind: '结局', text: '留下来。' },
      ],
    };
  }

  it('B1 保留：keepsakes / endings / readLogs / branchesHistory 全部留着', () => {
    const next = startNextCycle(playedState());
    expect(next.keepsakes).toEqual(['ks_ship', 'ks_stay']);
    expect(next.ngPlus.endings).toEqual(['leave', 'stay']);
    expect(next.ngPlus.readLogs).toEqual(['L1']);
    expect(next.ngPlus.branchesHistory).toEqual(['ship', 'stay']);
  });

  it('B2 cycle += 1', () => {
    expect(startNextCycle(playedState()).ngPlus.cycle).toBe(2);
    // 二周目再开一次 → 3
    expect(startNextCycle(startNextCycle(playedState())).ngPlus.cycle).toBe(3);
  });

  it('B3 重置：本周目状态全部归零', () => {
    const next = startNextCycle(playedState());
    expect(next.day).toBe(1);
    expect(next.stage).toBe(1);
    expect(next.stepIndex).toBe(0);
    expect(next.buildDone).toBe(false);
    expect(next.crafts).toBe(0);
    expect(next.logsFound).toEqual([]);
    expect(next.bag).toEqual({});
    expect(next.discovered).toEqual({});
    expect(next.branches).toEqual({
      ship: false,
      teashop: false,
      birthday: false,
      stay: false,
    });
    expect(next.accidents).toBe(0);
    expect(next.ending).toBeNull();
    expect(next.launchAttempts).toBe(0);
    expect(next.launchFailures).toBe(0);
    // 新周目的第一条日志说明这是第几周目
    expect(next.log[0]!.text).toContain('第 2 周目');
  });

  it('B4 不 bump schemaVersion（二周目绝不允许让现存存档作废）', () => {
    expect(startNextCycle(playedState()).schemaVersion).toBe(createInitialState().schemaVersion);
  });
});

describe('C. continueAfterEnding（留在这里继续 = 不清档）', () => {
  it('C1 清掉 ending，其余全留', () => {
    const state: SaveState = {
      ...createInitialState(),
      ending: 'stay',
      keepsakes: ['ks_stay'],
      logsFound: ['L2'],
      branches: { ship: false, teashop: false, birthday: false, stay: true },
      day: 30,
      bag: { tape: 1 },
      ngPlus: {
        cycle: 1,
        endings: ['stay'],
        readLogs: ['L2'],
        branchesHistory: ['stay'],
      },
    };
    const next = continueAfterEnding(state);
    expect(next.ending).toBeNull();
    expect(next.keepsakes).toEqual(['ks_stay']);
    expect(next.ngPlus).toEqual(state.ngPlus);
    expect(next.logsFound).toEqual(['L2']);
    expect(next.branches).toEqual(state.branches);
    expect(next.day).toBe(30);
    expect(next.bag).toEqual({ tape: 1 });
  });

  it('C2 幂等：已经没 ending 时原样返回', () => {
    const state = { ...createInitialState(), ending: null };
    expect(continueAfterEnding(state)).toBe(state);
  });
});

describe('D. 二周目入口条件（ngPlusUnlocked）', () => {
  it('D1 没有任何结局 → 不可见', () => {
    expect(ngPlusUnlocked(createNgPlus())).toBe(false);
  });

  it('D2 至少一个结局 → 可见', () => {
    const np: NgPlusState = { cycle: 1, endings: ['leave'], readLogs: [], branchesHistory: [] };
    expect(ngPlusUnlocked(np)).toBe(true);
  });

  it('D3 布尔迁移出来的空档案（cycle=2 但没结局）→ 不可见', () => {
    // 这是 normalizeNgPlus(true) 的已知副作用：布尔位不携带结局信息，
    // 所以玩家需要在新周目里再完成一个结局，入口才会重新出现。
    expect(ngPlusUnlocked(normalizeNgPlus(true))).toBe(false);
  });
});

describe('E. 三处记账（幂等 + 只记合法 id）', () => {
  it('E1 recordEnding：去重，非法 id 不记', () => {
    const np = createNgPlus();
    const a = recordEnding(np, 'leave');
    expect(a.endings).toEqual(['leave']);
    expect(recordEnding(a, 'leave')).toBe(a); // 幂等：返回原引用
    const bad = recordEnding(a, 'nope' as never);
    expect(bad).toBe(a);
    expect(bad.endings).toEqual(['leave']);
  });

  it('E2 recordReadLog：去重，非法 id 不记', () => {
    const np = createNgPlus();
    const a = recordReadLog(np, 'L1');
    expect(a.readLogs).toEqual(['L1']);
    expect(recordReadLog(a, 'L1')).toBe(a);
    expect(recordReadLog(a, 'L999')).toBe(a);
  });

  it('E3 recordBranch：去重，非法 id 不记', () => {
    const np = createNgPlus();
    const a = recordBranch(np, 'ship');
    expect(a.branchesHistory).toEqual(['ship']);
    expect(recordBranch(a, 'ship')).toBe(a);
    expect(recordBranch(a, 'nope' as never)).toBe(a);
  });

  it('E4 合法 id 集合与图鉴 / 支线定义一致', () => {
    expect([...ENDING_IDS].sort()).toEqual(['birthday', 'free', 'leave', 'stay', 'teashop']);
    expect([...BRANCH_IDS].sort()).toEqual(['birthday', 'ship', 'stay', 'teashop']);
  });
});

describe('F. G2 配对示例（阶段 1）', () => {
  it('F1 三个阶段 1 步位都有示例', () => {
    for (let i = 0; i < 3; i++) {
      const ex = pairingExample(1, i);
      expect(ex).not.toBeNull();
      expect(ex!.text).toContain('比如');
    }
  });

  it('F2 阶段 2 / 3 没有示例（保守实现，避免误导）', () => {
    expect(pairingExample(2, 0)).toBeNull();
    expect(pairingExample(3, 0)).toBeNull();
  });

  it('F3 示例里的物品都在坠毁点能捡到（二周目第 1 天只有坠毁点）', () => {
    expect(stage1ExampleItemsInCrash()).toBe(true);
    // 逐条钉住
    for (const ex of [pairingExample(1, 0)!, pairingExample(1, 1)!, pairingExample(1, 2)!]) {
      expect(AREA_POOLS.crash).toContain(ex.a);
      expect(AREA_POOLS.crash).toContain(ex.b);
      expect(getItem(ex.a)!.kind).toBe('base');
      expect(getItem(ex.b)!.kind).toBe('base');
    }
  });
});

describe('G. 缺口 A：二周目里 8 条载体配方仍然可达', () => {
  /**
   * 二周目开始时 `logsFound` 清零 —— 如果玩家在**本周目合出载体但没点开正文**
   * 就进了二周目，这篇日志在新周目里既没「已获得」也没「已读」。
   *
   * 这不是软锁 —— 载体配方本身还在，材料是基础物品，重新捡一遍就能再合。
   * 这条断言就是守住这个前提：
   * **每件载体的配方链，最终都落在「地面能捡到的基础物品」上。**
   */
  it('G1 每件载体的依赖链末端都是可捡的基础物品（二周目可重新合成）', () => {
    const producersOf = new Map<string, { a: string; b: string }[]>();
    for (const r of RECIPES) {
      const list = producersOf.get(r.out) ?? [];
      list.push({ a: r.a, b: r.b });
      producersOf.set(r.out, list);
    }

    const pickable = new Set<string>(Object.values(AREA_POOLS).flat());

    for (const log of LOGS) {
      const producers = producersOf.get(log.carrierId);
      expect(producers, `${log.carrierId} 必须有配方`).toBeTruthy();

      // 沿依赖链往下走，收集所有叶子（没有上游配方 = 可直接捡）
      const seen = new Set<string>();
      const queue = [log.carrierId];
      const leaves: string[] = [];
      while (queue.length) {
        const id = queue.shift()!;
        if (seen.has(id)) continue;
        seen.add(id);
        const up = producersOf.get(id);
        if (!up || up.length === 0) {
          leaves.push(id);
          continue;
        }
        for (const r of up) {
          queue.push(r.a, r.b);
        }
      }

      // 每个叶子都必须是地面能捡到的基础物品
      for (const leaf of leaves) {
        const item = getItem(leaf);
        expect(item, `${log.carrierId} 的叶子 ${leaf} 必须是存在的物品`).toBeTruthy();
        expect(item!.kind, `${log.carrierId} 的叶子 ${leaf} 必须是 base`).toBe('base');
        expect(pickable.has(leaf), `${log.carrierId} 的叶子 ${leaf} 必须在某个区域的地面池里`).toBe(
          true,
        );
      }
    }
  });

  it('G2 载体配方用的是**真实存在**的物品（不会因为改配方而失效）', () => {
    for (const log of LOGS) {
      const r = RECIPES.find((x) => x.out === log.carrierId);
      expect(r, `${log.carrierId} 必须有配方`).toBeTruthy();
      expect(getItem(r!.a)).toBeTruthy();
      expect(getItem(r!.b)).toBeTruthy();
    }
  });
});
