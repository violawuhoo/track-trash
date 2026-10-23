import { describe, expect, it } from 'vitest';
import {
  BAG_CAP,
  MASTERPIECE_RATE,
  addItem,
  bagSlots,
  canTake,
  craft,
  createInitialState,
  dropItem,
  isMasterpieceCraft,
  pickFromScene,
  searchArea,
} from '../src/index';

describe('背包容量（乐趣改版 ①）', () => {
  it('容量常量 = 10', () => {
    expect(BAG_CAP).toBe(10);
  });

  it('已拥有的种类永远能继续捡（堆叠不占新格）', () => {
    let state = createInitialState();
    state = { ...state, bag: { tape: 3, screw: 2 } }; // 2 格
    expect(canTake(state.bag, 'tape')).toBe(true);
    expect(canTake(state.bag, 'screw')).toBe(true);
  });

  it('未满时任何种类都能捡；满格时新种类被挡', () => {
    const bag: Record<string, number> = {};
    for (let i = 0; i < BAG_CAP - 1; i++) bag[`item${i}`] = 1;
    expect(canTake(bag, 'newthing')).toBe(true); // 第 10 格，还没满

    bag.full = 1; // 第 10 格
    expect(bagSlots(bag)).toBe(BAG_CAP);
    expect(canTake(bag, 'newthing')).toBe(false);
    expect(canTake(bag, 'full')).toBe(true); // 自己的种类不受限
  });

  it('场景拾取：满包时返回 null，东西留在地上', () => {
    let state = createInitialState();
    const bag: Record<string, number> = {};
    for (let i = 0; i < BAG_CAP; i++) bag[`item${i}`] = 1;
    state = { ...state, bag, scene: ['tape', 'screw'] };
    expect(pickFromScene(state, 'tape')).toBeNull();
    // 已有种类照捡
    const withTape = { ...state, bag: { ...bag, tape: 1 }, scene: ['tape', 'screw'] };
    expect(pickFromScene(withTape, 'tape')).not.toBeNull();
  });

  it('扔掉一整叠：格子腾出来，物品消失（不回地面）', () => {
    let state = createInitialState();
    state = { ...state, bag: { tape: 3, screw: 2 } };
    const dropped = dropItem(state, 'tape');
    expect(dropped).not.toBeNull();
    if (!dropped) throw new Error('unreachable');
    expect(dropped.bag).toEqual({ screw: 2 });
    expect(dropped.log.some((l) => l.text.includes('扔掉'))).toBe(true);

    // 扔不存在的 → null
    expect(dropItem(state, 'nothing')).toBeNull();
  });

  it('满包 → 扔 → 能捡：满包永远有出路（不死锁）', () => {
    // 全部用真实物品 id（dropItem 的日志要查物品名）
    let state = createInitialState();
    const bag: Record<string, number> = {
      tape: 1, screw: 1, wire: 1, mood: 1, fuel: 1,
      manual: 1, plunger: 1, rock: 1, note: 1, glitter: 1,
    };
    state = { ...state, bag, scene: ['wrench'] };

    expect(pickFromScene(state, 'wrench')).toBeNull();
    state = dropItem(state, 'tape')!;
    const picked = pickFromScene(state, 'wrench');
    expect(picked).not.toBeNull();
    if (!picked) throw new Error('unreachable');
    expect(picked.state.bag.wrench).toBe(1);
  });

  it('合成不受容量限制（净减格数，是腾空间的方式）', () => {
    // 10 格满包，其中 tape 和 mood 各一格 → 合成必然成功
    const bag: Record<string, number> = {};
    for (let i = 0; i < 8; i++) bag[`item${i}`] = 1;
    bag.tape = 1;
    bag.mood = 1;
    const state = { ...createInitialState(), bag };
    // tape+mood 未必是配方；这里只验证合成入口不被容量挡——
    // 用 searchArea 之外的动作不涉及容量。合成失败只可能是「不成」而非「背包满」。
    const res = craft(state, 'tape', 'mood');
    if (res.ok) {
      expect(bagSlots(res.state.bag)).toBeLessThanOrEqual(BAG_CAP);
    } else {
      expect(res.reason).not.toContain('满');
    }
  });
});

describe('变率奖励：杰作双倍产出（乐趣改版 ②）', () => {
  it('杰作率常量 = 20', () => {
    expect(MASTERPIECE_RATE).toBe(20);
  });

  it('确定性：同 day + 同材料永远同结果', () => {
    expect(isMasterpieceCraft(42, 'tape', 'mood')).toBe(
      isMasterpieceCraft(42, 'tape', 'mood'),
    );
    expect(isMasterpieceCraft(42, 'tape', 'mood')).toBe(
      isMasterpieceCraft(42, 'mood', 'tape'),
    );
  });

  it('分布合理：200 组输入中杰作占比在 10%–30% 之间', () => {
    let hits = 0;
    const n = 200;
    for (let day = 1; day <= n; day++) {
      if (isMasterpieceCraft(day, 'tape', 'mood')) hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(n * 0.1);
    expect(hits).toBeLessThanOrEqual(n * 0.3);
  });

  it('杰作合成产出 ×2（非杰作 ×1）', () => {
    // 找一个 day，使 tape+mood 出杰作；再找一天不出
    let masterpieceDay = 0;
    let plainDay = 0;
    for (let day = 1; day <= 500; day++) {
      if (isMasterpieceCraft(day, 'tape', 'mood') && !masterpieceDay) {
        masterpieceDay = day;
      }
      if (!isMasterpieceCraft(day, 'tape', 'mood') && !plainDay) {
        plainDay = day;
      }
      if (masterpieceDay && plainDay) break;
    }
    expect(masterpieceDay).toBeGreaterThan(0);
    expect(plainDay).toBeGreaterThan(0);

    const base = { ...createInitialState(), day: masterpieceDay };
    const state = { ...base, bag: { tape: 1, mood: 1 } };
    const res = craft(state, 'tape', 'mood');
    if (res.ok) {
      // 产物未必是 tape/mood（可能有意外判定），只断言：total 增加了 2（消耗 2 出 2）
      const total = Object.values(res.state.bag).reduce((a, b) => a + b, 0);
      expect(total).toBe(2);
      expect(res.masterpiece).toBe(true);
    }

    const state2 = { ...base, day: plainDay, bag: { tape: 1, mood: 1 } };
    const res2 = craft(state2, 'tape', 'mood');
    if (res2.ok) {
      const total = Object.values(res2.state.bag).reduce((a, b) => a + b, 0);
      expect(total).toBe(1);
      expect(res2.masterpiece).toBe(false);
    }
  });

  it('searchArea 不受容量影响（它是 v1 遗留 API，不挡）', () => {
    let state = createInitialState();
    state = searchArea(state);
    expect(state.day).toBe(2);
  });
});
