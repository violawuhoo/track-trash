/**
 * 进度评分（C2 批次 · 公式下沉到 core）。
 *
 * 这个文件守 4 条断言，对应 team-lead 派发的 4 条硬要求：
 *
 * | # | 断言 | 守的是什么 |
 * |---|---|---|
 * | ① | 同一天数同阶段，`cycle=2` 的分数 **>** `cycle=1` | 二周目档必赢云端一周目旧档（否则二周目被覆盖回去） |
 * | ② | web 侧与 api 侧对同一组输入返回**同一个数** | R8 跨端漂移（两份手抄实现）|
 * | ③ | 四条支线全完成 vs 三条全完成，差**正好 200** | `stay` 支线计分 |
 * | ④ | 老存档（`ngPlus` 缺失 / 布尔 / `cycle` 缺失）不崩，按 cycle=1 算 | 存档兼容性 |
 */
import { describe, expect, it } from 'vitest';
import {
  BRANCH_SCORE_WEIGHT,
  CYCLE_SCORE_WEIGHT,
  cycleOfNgPlus,
  progressScoreOf,
} from '../src/index';

describe('进度评分（core 唯一实现）', () => {
  it('① 二周目分数 > 一周目分数（同天数同阶段）', () => {
    const base = {
      stage: 3,
      stepIndex: 2,
      branches: { ship: true, teashop: true, birthday: true, stay: true },
      day: 80,
    };
    const w1 = progressScoreOf({ ...base, cycle: 1 });
    const w2 = progressScoreOf({ ...base, cycle: 2 });
    expect(w2).toBeGreaterThan(w1);
    // 差值正好是一个周目权重
    expect(w2 - w1).toBe(CYCLE_SCORE_WEIGHT);
    // 一周目的**周目内**分数上限远小于一个周目权重 —— 这是权重取值的前提。
    // （注意：week1Max 里含 cycle 自身的 1e6，要比的是「扣掉周目权重后的部分」）
    const week1Max = progressScoreOf({
      stage: 3,
      stepIndex: 3,
      branches: { ship: true, teashop: true, birthday: true, stay: true },
      day: 100,
      cycle: 1,
    });
    expect(week1Max - CYCLE_SCORE_WEIGHT).toBeLessThan(CYCLE_SCORE_WEIGHT);
    // 一周目总分落在 [1e6, 2e6) 区间
    expect(week1Max).toBeGreaterThanOrEqual(CYCLE_SCORE_WEIGHT);
    expect(week1Max).toBeLessThan(2 * CYCLE_SCORE_WEIGHT);
    // 二周目即使完全归零（day 1 / stage 1），也赢过一周目的最好成绩
    const week2Floor = progressScoreOf({
      stage: 1,
      stepIndex: 0,
      branches: { ship: false, teashop: false, birthday: false, stay: false },
      day: 1,
      cycle: 2,
    });
    expect(week2Floor).toBeGreaterThan(week1Max);
  });

  it('② 公式与手算一致（web / api 共用这一份，两端必然相同）', () => {
    // web 的 `progressScoreOf` 与 api 的 `computeProgressScore` 都是
    // core 这一份的薄封装，所以「跨端一致」由「只有一份实现」保证。
    // 这里钉住公式本身，任何一端手抄改了就对不上。
    expect(
      progressScoreOf({
        stage: 1,
        stepIndex: 0,
        branches: { ship: false, teashop: false, birthday: false, stay: false },
        day: 3,
        cycle: 1,
      }),
    ).toBe(1 * CYCLE_SCORE_WEIGHT + 10000 + 0 + 0 + 3);
    expect(
      progressScoreOf({
        stage: 2,
        stepIndex: 1,
        branches: { ship: true, teashop: false, birthday: true, stay: false },
        day: 9,
        cycle: 1,
      }),
    ).toBe(1 * CYCLE_SCORE_WEIGHT + 20000 + 1000 + 2 * BRANCH_SCORE_WEIGHT + 9);
  });

  it('③ stay 支线计分：四条全完成 vs 三条全完成，差正好 200', () => {
    const three = progressScoreOf({
      stage: 3,
      stepIndex: 0,
      branches: { ship: true, teashop: true, birthday: true, stay: false },
      day: 20,
      cycle: 1,
    });
    const four = progressScoreOf({
      stage: 3,
      stepIndex: 0,
      branches: { ship: true, teashop: true, birthday: true, stay: true },
      day: 20,
      cycle: 1,
    });
    expect(four - three).toBe(200);
    expect(four - three).toBe(BRANCH_SCORE_WEIGHT);
  });

  it('④ 老存档容错：ngPlus 缺失 / 布尔 / cycle 缺失都不崩', () => {
    // 缺失 cycle → 按 cycle=1 算
    expect(
      progressScoreOf({
        stage: 1,
        stepIndex: 0,
        branches: { ship: false, teashop: false, birthday: false },
        day: 3,
      }),
    ).toBe(1 * CYCLE_SCORE_WEIGHT + 10000 + 0 + 0 + 3);

    // 非法 cycle（0 / 负数 / NaN / 字符串）→ 一律按 1 算
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        progressScoreOf({
          stage: 1,
          stepIndex: 0,
          branches: { ship: false, teashop: false, birthday: false },
          day: 3,
          cycle: bad,
        }),
      ).toBe(1 * CYCLE_SCORE_WEIGHT + 10000 + 0 + 0 + 3);
    }

    // `cycleOfNgPlus`：布尔 true → 2（与 normalizeNgPlus 的迁移一致）
    //                布尔 false / 缺失 / 非对象 → 1
    expect(cycleOfNgPlus(undefined)).toBe(1);
    expect(cycleOfNgPlus(null)).toBe(1);
    expect(cycleOfNgPlus(false)).toBe(1);
    expect(cycleOfNgPlus(true)).toBe(2);
    expect(cycleOfNgPlus({})).toBe(1);
    expect(cycleOfNgPlus({ cycle: 3 })).toBe(3);
    expect(cycleOfNgPlus({ cycle: 0 })).toBe(1);
    expect(cycleOfNgPlus({ cycle: 'x' })).toBe(1);
    expect(cycleOfNgPlus('nonsense')).toBe(1);
  });
});
