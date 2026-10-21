/**
 * A2 批次：第四支线 `stay` + 新结局 + 自由模式口径修正。
 *
 * 覆盖 5 组断言：
 * - ⑨ stay 支线定义与 GDD §3.1 一致（三槽位、具体物品 id 判定、纪念品、结局）
 * - ⑩ stay 完成判定：三个槽位各齐一件即达成；发 ks_stay；非 ship 支线完成即进结局
 * - ⑪ free 口径：stage ≥ 2 才可选；stage 1 不可选；stay 完成后 free 仍可选
 * - ⑫ ngPlus 字段：新档 false、字段进类型、老档缺失时归一化由 web 端负责
 * - ⑬ ENDINGS.stay / ENDING_LINES.stay 与 GDD §3.3 一致
 */
import { describe, expect, it } from 'vitest';
import {
  BRANCHES,
  ENDING_LINES,
  ENDINGS,
  availableEndings,
  branchStatus,
  createInitialState,
  craft,
  finishGame,
} from '../src/index';
import type { SaveState } from '../src/index';

/** 阶段 3 的存档（stage 3 才能触发支线检查） */
function stage3State(bag: Record<string, number> = {}): SaveState {
  return { ...createInitialState(), stage: 3, stepIndex: 0, bag: { ...bag } };
}

/**
 * 建设期已走满的阶段 3 存档（stepIndex = steps.length、buildDone = true）。
 *
 * 走满后 resolve.ts 的阶段目标闸门放行，合成回归纯配方判定 ——
 * 这样 P0 用例里造的物品一定是配方产物，不会被阶段目标截胡。
 */
function stage3DoneState(bag: Record<string, number> = {}): SaveState {
  return {
    ...createInitialState(),
    stage: 3,
    stepIndex: 3,
    buildDone: true,
    bag: { ...bag },
  };
}

describe('A2 · 第四支线 stay', () => {
  it('⑨ 支线定义与 GDD §3.1 一致', () => {
    const stay = BRANCHES.find((b) => b.id === 'stay');
    expect(stay).toBeDefined();
    if (!stay) throw new Error('unreachable');
    expect(stay.name).toBe('留下来');
    expect(stay.slots).toEqual(['落脚', '营生', '熟人']);
    expect(stay.requires).toEqual([
      ['staykey', 'landdeed'],
      ['toolstand', 'sewkit'],
      ['neighbor', 'warmchair'],
    ]);
    expect(stay.keepsake).toBe('ks_stay');
    expect(stay.ending).toBe('stay');
    // 四条支线
    expect(BRANCHES.map((b) => b.id)).toEqual(['ship', 'teashop', 'birthday', 'stay']);
  });

  it('⑩ 三个槽位各齐一件即达成；发 ks_stay；完成即进结局', () => {
    // 槽位按**具体物品 id** 判定 —— 标签对但物品不对不算
    const stay = BRANCHES.find((b) => b.id === 'stay')!;
    const first = branchStatus(stay, { staykey: 1, toolstand: 1, neighbor: 1 });
    expect(first.done).toBe(true);

    // 换一组候选（landdeed / sewkit / warmchair）同样成立
    const alt = branchStatus(stay, { landdeed: 1, sewkit: 1, warmchair: 1 });
    expect(alt.done).toBe(true);

    // 缺一件就不成立
    const partial = branchStatus(stay, { staykey: 1, toolstand: 1 });
    expect(partial.done).toBe(false);
    expect(partial.filledCount).toBe(2);

    // 走一次真实 craft：合成 staykey → 支线达成 → 发纪念品 + 进结局
    // （craft 消耗背包里的材料，故 switchpanel / fossil 要先在包里）
    const state = stage3State({ switchpanel: 1, fossil: 1, toolstand: 1, neighbor: 1 });
    expect(state.branches.stay).toBe(false);

    const res = craft(state, 'switchpanel', 'fossil'); // → staykey
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.state.bag.staykey).toBe(1);
    expect(res.state.branches.stay).toBe(true);
    expect(res.state.keepsakes).toContain('ks_stay');
    expect(res.ending).toBe('stay');
    expect(res.state.log.some((l) => l.kind === '支线')).toBe(true);
  });

  it('⑩b stay 完成不因缺 buildDone 而失效（可见性门禁不加在完成判定上，GDD §3.6）', () => {
    // buildDone = false（建设期还没走满），但 stay 仍可完成
    const state = stage3State({ switchpanel: 1, fossil: 1, toolstand: 1, neighbor: 1 });
    expect(state.buildDone).toBe(false);
    const res = craft(state, 'switchpanel', 'fossil');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.state.branches.stay).toBe(true);
  });

  it('⑪ free 口径：stage ≥ 2 才可选，stage 1 不可选', () => {
    // stage 1：没有 free
    const s1: SaveState = { ...createInitialState(), stage: 1 };
    expect(availableEndings(s1)).not.toContain('free');

    // stage 2：free 可选
    const s2: SaveState = { ...createInitialState(), stage: 2 };
    expect(availableEndings(s2)).toContain('free');

    // stage 3：free 仍可选
    const s3: SaveState = { ...createInitialState(), stage: 3 };
    expect(availableEndings(s3)).toContain('free');
  });

  it('⑪b stay 完成后 free 仍可选（两者不互斥，GDD §3.4）', () => {
    const s: SaveState = {
      ...createInitialState(),
      stage: 3,
      branches: { ship: false, teashop: false, birthday: false, stay: true },
    };
    const list = availableEndings(s);
    expect(list).toContain('stay');
    expect(list).toContain('free');
  });

  it('⑫ ngPlus 字段：新档为 false，且进 SaveState 类型', () => {
    const s = createInitialState();
    expect(s.ngPlus).toBe(false);
    // 不 bump schemaVersion（本批只加字段，老档走归一化）
    expect(s.schemaVersion).toBe(1);
    // branches 初始形状含 stay
    expect(s.branches).toEqual({ ship: false, teashop: false, birthday: false, stay: false });
  });

  it('⑬ ENDINGS.stay 与 ENDING_LINES.stay 与 GDD §3.3 一致', () => {
    expect(ENDINGS.stay.title).toBe('留下来');
    expect(ENDINGS.stay.subtitle).toBe('你没有走。石头多了一个会回来的邻居。');
    expect(ENDING_LINES.stay).toEqual([
      '没有起飞。你的行李里多了一个能住人的地方。',
      '前人把钥匙留给了这颗星球，你把它用上了。这大概是这里最像遗产的东西。',
      '石头今天唱得比平时多三遍。多出来的部分，我在你的日志里也记了。',
      '我建议你把这地方记成坐标。以后有人路过，至少知道这儿可以停。',
    ]);
  });
});

// ───────────────────── P0：支线完成时 ending 必须落盘 ─────────────────────

/**
 * 回归：支线完成时 `craft()` 只把 ending 写进**返回值字段**，没写进
 * `SaveState.ending` → web 端 `fromCore` 拿到 null → 结局页 `save.ending ?? 'free'`
 * 回退成 free → 玩家做完「留下来」看到的是「自由模式 / 没有目标了」。
 *
 * 这里**验 `res.state.ending`**（落盘的那一份），不是 `res.ending`（返回值）。
 */
describe('P0 · 支线完成时 ending 落盘', () => {
  /** 合成到指定的一对材料，返回 craft 结果 */
  function mix(state: SaveState, a: string, b: string) {
    const res = craft(state, a, b);
    expect(res.ok, `${a}+${b}`).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    return res;
  }

  it('stay 支线完成 → res.state.ending === "stay"，且有一条「结局」日志', () => {
    // 背包里已有 落脚 / 营生 两件，只缺 熟人 —— 再合成一个 neighbor 就齐了
    const state = stage3DoneState({
      staykey: 1,
      toolstand: 1,
      awkward: 1,
      mirror: 1,
    });
    expect(state.ending).toBeNull();

    const res = mix(state, 'awkward', 'mirror'); // → neighbor
    expect(res.state.branches.stay).toBe(true);
    // 落盘的那一份 —— 这是结局页真正读的值
    expect(res.state.ending).toBe('stay');
    // 返回值与落盘一致
    expect(res.ending).toBe(res.state.ending);
    // 结局日志存在
    expect(res.state.log.some((l) => l.kind === '结局')).toBe(true);
    expect(res.state.log.some((l) => l.text === '进入结局：stay')).toBe(true);
  });

  it('teashop 支线完成 → res.state.ending === "teashop"', () => {
    // 奶茶店三槽位：shopfront / menu / fakecustomer
    const state = stage3DoneState({
      shopfront: 1,
      menu: 1,
      awkward: 1,
      sock: 1,
    });
    const res = mix(state, 'awkward', 'sock'); // → fakecustomer
    expect(res.state.branches.teashop).toBe(true);
    expect(res.state.ending).toBe('teashop');
    expect(res.ending).toBe('teashop');
    expect(res.state.log.some((l) => l.text === '进入结局：teashop')).toBe(true);
  });

  it('birthday 支线完成 → res.state.ending === "birthday"', () => {
    // 生日三槽位：birthproof / cakerepl / clapper
    const state = stage3DoneState({
      birthproof: 1,
      cakerepl: 1,
      mood: 1,
      tape: 1,
    });
    const res = mix(state, 'mood', 'tape'); // → clapper
    expect(res.state.branches.birthday).toBe(true);
    expect(res.state.ending).toBe('birthday');
    expect(res.ending).toBe('birthday');
    expect(res.state.log.some((l) => l.text === '进入结局：birthday')).toBe(true);
  });

  it('ship 支线完成不自动进结局（玩家自己决定何时起飞）', () => {
    // 飞船三件套：optimistic / doorthing / ration
    const state = stage3DoneState({
      optimistic: 1,
      doorthing: 1,
      ration: 1,
      mood: 1,
      poker: 1,
    });
    const res = mix(state, 'mood', 'poker'); // 无关的一次合成，只为触发支线检查
    expect(res.state.branches.ship).toBe(true);
    // ship 不写 ending
    expect(res.state.ending).toBeNull();
    expect(res.ending).toBeUndefined();
  });

  it('幂等：支线已完成后再合成不会重复触发结局', () => {
    const state = stage3DoneState({
      staykey: 1,
      toolstand: 1,
      awkward: 1,
      mirror: 1,
      mood: 1,
      tape: 1,
    });
    const first = mix(state, 'awkward', 'mirror'); // → neighbor，触发 stay
    expect(first.state.ending).toBe('stay');

    // 再合成一次无关的东西：stay 已 true，不应重复写结局日志
    const before = first.state.log.filter((l) => l.text === '进入结局：stay').length;
    const second = mix(first.state, 'mood', 'tape');
    expect(second.state.ending).toBe('stay');
    expect(
      second.state.log.filter((l) => l.text === '进入结局：stay').length,
    ).toBe(before);
  });

  it('craft 落盘的结局日志与 finishGame 的口径一致', () => {
    // finishGame 是 web 端 chooseEnding 走的正规路径
    const viaCraft = mix(
      stage3DoneState({ staykey: 1, toolstand: 1, awkward: 1, mirror: 1 }),
      'awkward',
      'mirror',
    ).state.log.find((l) => l.text === '进入结局：stay')!;

    const viaFinish = finishGame(
      { ...createInitialState(), stage: 3 },
      'stay',
    ).log.find((l) => l.text === '进入结局：stay')!;

    expect(viaCraft.kind).toBe('结局');
    expect(viaCraft.kind).toBe(viaFinish.kind);
    expect(viaCraft.text).toBe(viaFinish.text);
  });
});
