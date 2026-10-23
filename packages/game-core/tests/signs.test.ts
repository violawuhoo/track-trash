/**
 * 「远处的迹象」系统（探索动机改版 · 方差）。
 *
 * 守四组断言：
 *
 * | 组 | 守什么 |
 * |---|---|
 * | A | 池子口径：6 条、窗口合法、奖励全是现存 base 物品（不新增物品 id） |
 * | B | `drawSigns`：确定性 + 三条约束（不相交 / 早配额 / 晚配额）+ 方差 |
 * | C | `signsForDay`：窗口内过滤正确；种子 0 = 老档无迹象 |
 * | D | `layoutSigns`：点全部可走且落在给定扇区内；确定性；种子 0 = 空 |
 *
 * 另附 B3（用户批准的日志载体双通道）：`pickFromScene` 对载体写 `logsFound`。
 */
import { describe, expect, it } from 'vitest';
import {
  ITEMS,
  SIGNS,
  SIGNS_PER_RUN,
  areaOfPoint,
  createInitialState,
  drawSigns,
  getItem,
  isWalkable,
  layoutSigns,
  pickFromScene,
  signsForDay,
} from '../src/index';
import type { AreaId, SignDef } from '../src/index';

/** 已解锁区域的各种组合（阶段 1 只有坠毁点，阶段 3 全开） */
const AREA_SETS: readonly (readonly AreaId[])[] = [
  ['crash'],
  ['crash', 'junkyard'],
  ['crash', 'junkyard', 'market', 'cave'],
  ['junkyard', 'market'],
];

/** 300 个种子：约束断言要覆盖足够大的样本，不能只挑几个顺眼的 */
const SEEDS: readonly number[] = Array.from({ length: 300 }, (_, i) => i + 1);

/** 集合键（顺序无关） */
function keyOf(signs: readonly SignDef[]): string {
  return signs
    .map((s) => s.id)
    .sort()
    .join('+');
}

/** 两两日期区间不相交 */
function pairwiseDisjoint(signs: readonly SignDef[]): boolean {
  return signs.every((a, i) =>
    signs.slice(i + 1).every((b) => a.maxDay < b.minDay || b.maxDay < a.minDay),
  );
}

describe('A. 迹象池口径', () => {
  it('A1 池子 6 条，id 唯一，窗口合法（1 ≤ minDay ≤ maxDay）', () => {
    expect(SIGNS).toHaveLength(6);
    expect(new Set(SIGNS.map((s) => s.id)).size).toBe(6);
    for (const s of SIGNS) {
      expect(s.minDay, s.id).toBeGreaterThanOrEqual(1);
      expect(s.maxDay, s.id).toBeGreaterThanOrEqual(s.minDay);
      expect(s.hintText.length, s.id).toBeGreaterThan(0);
      expect(['light', 'smoke', 'figure']).toContain(s.kind);
    }
  });

  it('A2 奖励全是现存 base 物品（不得新增物品 id；不进 AREA_POOLS 由 world.test 守）', () => {
    const baseIds = new Set(ITEMS.filter((i) => i.kind === 'base').map((i) => i.id));
    for (const s of SIGNS) {
      for (const id of s.reward) {
        expect(baseIds.has(id), `${s.id} 的奖励 ${id} 不是现存 base 物品`).toBe(true);
        expect(getItem(id).kind).toBe('base');
      }
    }
    // 六件奖励 id 与任务书钉死的一致（choir 两件：rock + mood；meteor 纯台词）
    expect(SIGNS.flatMap((s) => s.reward).sort()).toEqual([
      'awkward',
      'crystal',
      'fuel',
      'mood',
      'photo',
      'rock',
    ].sort());
  });

  it('A3 SIGNS_PER_RUN = 3', () => {
    expect(SIGNS_PER_RUN).toBe(3);
  });
});

describe('B. drawSigns（确定性 + 约束 + 方差）', () => {
  it('B1 确定性：同 seed 永远同结果', () => {
    for (const seed of [1, 42, 999, 0x7fffffff]) {
      expect(drawSigns(seed)).toEqual(drawSigns(seed));
      expect(keyOf(drawSigns(seed))).toBe(keyOf(drawSigns(seed)));
    }
  });

  it('B2 三条约束：300 个种子全部满足「3 条 + 两两不相交 + 一早一晚」', () => {
    for (const seed of SEEDS) {
      const signs = drawSigns(seed);
      expect(signs, `seed ${seed}`).toHaveLength(SIGNS_PER_RUN);
      expect(new Set(signs.map((s) => s.id)).size, `seed ${seed} 有重复`).toBe(3);
      expect(pairwiseDisjoint(signs), `seed ${seed} 有日期重叠`).toBe(true);
      expect(
        signs.some((s) => s.maxDay <= 14),
        `seed ${seed} 缺早期迹象`,
      ).toBe(true);
      expect(
        signs.some((s) => s.minDay >= 20),
        `seed ${seed} 缺晚期迹象`,
      ).toBe(true);
      // 输出按窗口期排序（稳定顺序，便于 UI 与快照）
      const windows = signs.map((s) => s.minDay);
      expect([...windows].sort((a, b) => a - b)).toEqual(windows);
    }
  });

  it('B3 方差：不同 seed 大多不同剧本（不塌缩成固定组合）', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) seen.add(keyOf(drawSigns(seed)));
    // 本池共有 8 个合法三元组；要求至少 6 种出现（防「塌缩到 5 种」回归）
    expect(seen.size).toBeGreaterThanOrEqual(6);
    // 两个不同 seed 同剧本的概率要低：抽 100 对，相同不超过 25 对
    let same = 0;
    for (let i = 1; i <= 100; i++) {
      if (keyOf(drawSigns(i)) === keyOf(drawSigns(i * 7919 + 13))) same++;
    }
    expect(same).toBeLessThanOrEqual(25);
  });

  it('B4 runSeed = 0（老档 / 无种子）→ 无迹象；坏形状同样空', () => {
    expect(drawSigns(0)).toEqual([]);
    expect(drawSigns(-1)).toEqual([]);
    expect(drawSigns(Number.NaN)).toEqual([]);
    expect(drawSigns(Number.POSITIVE_INFINITY)).toEqual([]);
  });
});

describe('C. signsForDay', () => {
  it('C1 窗口内过滤正确；任何一天最多一条（窗口两两不相交）', () => {
    for (const seed of [7, 42, 2024]) {
      const drawn = drawSigns(seed);
      const union = new Set<string>();
      for (let day = 1; day <= 45; day++) {
        const active = signsForDay(seed, day);
        expect(active.length, `seed ${seed} day ${day}`).toBeLessThanOrEqual(1);
        for (const s of active) {
          expect(drawn.map((d) => d.id)).toContain(s.id);
          expect(s.minDay, `seed ${seed} day ${day}`).toBeLessThanOrEqual(day);
          expect(day).toBeLessThanOrEqual(s.maxDay);
          union.add(s.id);
        }
      }
      // 每天并集 = 抽中的 3 条（每条在自己的窗口内至少出现一天）
      expect([...union].sort()).toEqual(drawn.map((s) => s.id).sort());
    }
  });

  it('C2 seed = 0 → 任何一天都没有迹象', () => {
    for (let day = 1; day <= 45; day++) {
      expect(signsForDay(0, day)).toEqual([]);
    }
  });
});

describe('D. layoutSigns（摆放）', () => {
  it('D1 点全部可走、且落在给定扇区内；条数 = 当天迹象数', () => {
    for (const seed of [3, 42, 777]) {
      for (const areas of AREA_SETS) {
        for (let day = 1; day <= 45; day++) {
          const expected = signsForDay(seed, day).length;
          const spots = layoutSigns(seed, day, areas);
          expect(spots.length, `seed ${seed} day ${day} areas ${areas.join('/')}`).toBe(expected);
          for (const p of spots) {
            expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
            expect(isWalkable(p), `seed ${seed} day ${day} 点不可走`).toBe(true);
            expect(
              areas.includes(areaOfPoint(p)),
              `seed ${seed} day ${day} 点落在 ${areaOfPoint(p)}，不在给定扇区内`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('D2 确定性：同入参同结果（位置在整个运行周期内稳定）', () => {
    for (const seed of [42, 1000]) {
      const a = layoutSigns(seed, 12, ['crash', 'junkyard', 'market', 'cave']);
      const b = layoutSigns(seed, 12, ['crash', 'junkyard', 'market', 'cave']);
      expect(a).toEqual(b);
    }
  });

  it('D3 同一天的迹象不重叠（最小间距）', () => {
    // 窗口两两不相交 → 同一天最多一条；这条断言是「万一将来池子改了」的护栏
    for (const seed of SEEDS.slice(0, 50)) {
      for (let day = 1; day <= 45; day++) {
        const spots = layoutSigns(seed, day, ['crash', 'junkyard', 'market', 'cave']);
        for (let i = 0; i < spots.length; i++) {
          for (let j = i + 1; j < spots.length; j++) {
            const d = Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.y - spots[j]!.y);
            expect(d, `seed ${seed} day ${day} 两条迹象叠在一起`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('D4 seed = 0 / 空区域 → 空布局', () => {
    expect(layoutSigns(0, 5, ['crash'])).toEqual([]);
    expect(layoutSigns(42, 5, [])).toEqual([]);
  });
});

// ───────────────────── B3：日志载体双通道（用户批准） ─────────────────────

describe('B3. pickFromScene 对载体写 logsFound', () => {
  /** 场景里放一件前任日志载体（log_page1 → L1） */
  function sceneWith(itemId: string) {
    return { ...createInitialState(), scene: [itemId] };
  }

  it('E1 捡到载体 → logsFound 记上对应日志 id', () => {
    const res = pickFromScene(sceneWith('log_page1'), 'log_page1');
    expect(res).not.toBeNull();
    expect(res!.state.logsFound).toEqual(['L1']);
    // 物品照常入包
    expect(res!.state.bag.log_page1).toBe(1);
  });

  it('E2 捡非载体 → 不写 logsFound', () => {
    const res = pickFromScene(sceneWith('tape'), 'tape');
    expect(res!.state.logsFound).toEqual([]);
  });

  it('E3 已拥有 → 不重复记账', () => {
    const state = { ...sceneWith('log_page1'), logsFound: ['L1'] };
    const res = pickFromScene(state, 'log_page1');
    expect(res!.state.logsFound).toEqual(['L1']);
  });

  it('E4 八件载体逐条验证（与 CARRIER_TO_LOG 对齐）', () => {
    const carriers = [
      ['log_page1', 'L1'],
      ['log_map2', 'L2'],
      ['log_page2', 'L3'],
      ['log_map1', 'L4'],
      ['log_chip1', 'L5'],
      ['log_q1', 'L6'],
      ['log_b1', 'L7'],
      ['log_reel1', 'L8'],
    ] as const;
    for (const [carrier, logId] of carriers) {
      const res = pickFromScene(sceneWith(carrier), carrier);
      expect(res!.state.logsFound, carrier).toEqual([logId]);
    }
  });
});
