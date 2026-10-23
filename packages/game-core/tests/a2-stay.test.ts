/**
 * A2 批次：第四支线 `stay` + 新结局 + 自由模式口径修正。
 *
 * 覆盖 6 组断言：
 * - ⑨ stay 支线定义与 GDD §3.1 一致（三槽位、具体物品 id 判定、纪念品、结局）
 * - ⑩ stay 完成判定：三个槽位各齐一件即达成；发 ks_stay；非 ship 支线完成即进结局
 * - ⑪ free 口径：stage ≥ 2 才可选；stage 1 不可选；stay 完成后 free 仍可选
 * - ⑫ ngPlus 字段：新档 false、字段进类型、老档缺失时归一化由 web 端负责
 * - ⑬ ENDINGS.stay / ENDING_LINES.stay 与 GDD §3.3 一致
 * - ⑭–⑯ A3 B-soft（探索动机改版）：非 ship 支线 stage ≥ 2 可达成；
 *   ship 仍锁 stage 3；leave 入口 stage ≥ 3 门
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

/**
 * 阶段 3 的存档。
 *
 * ⚠️ A3 改版前「stage 3 才能触发支线检查」；B-soft 后非 ship 支线
 * **stage ≥ 2** 即可达成（ship 仍锁 stage 3，见文末「A3 B-soft」组）。
 * 这里沿用 stage 3 是给既有用例一个稳定的达成环境，不是口径本身。
 */
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
    expect(BRANCHES.map((b) => b.id)).toEqual(['ship', 'teashop', 'birthday', 'stay', 'chaos']);
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
      branches: { ship: false, teashop: false, birthday: false, stay: true, chaos: false },
    };
    const list = availableEndings(s);
    expect(list).toContain('stay');
    expect(list).toContain('free');
  });

  it('⑫ ngPlus 字段：新档为一周目空档案，且进 SaveState 类型', () => {
    const s = createInitialState();
    // ⚠️ C2 批次：`ngPlus` 从布尔语义位扩成**对象容器**（cycle / endings /
    // readLogs / branchesHistory）。这里断言**完整的期望对象**而不是单个字段 ——
    // 只断言 `cycle` 会漏掉「三个集合被误初始化」这类回归。
    expect(s.ngPlus).toEqual({
      cycle: 1,
      endings: [],
      readLogs: [],
      branchesHistory: [],
    });
    // 不 bump schemaVersion（本批只加字段，老档走归一化）
    expect(s.schemaVersion).toBe(1);
    // branches 初始形状含 stay / chaos
    expect(s.branches).toEqual({ ship: false, teashop: false, birthday: false, stay: false, chaos: false });
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
    // 飞船四件套：动力 optimistic / 导航 joystick / 外壳 doorthing / 生命维持 ration
    const state = stage3DoneState({
      optimistic: 1,
      joystick: 1,
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

// ───────────────────── A3 B-soft：支线达成时机（探索动机改版） ─────────────────────

/**
 * 改版前口径：支线完成检查 `stage === 3` 才跑 —— 探索期（阶段 2）就攒齐
 * 槽位的玩家被一直挡到建设期走满，「流程被预先回答」。
 *
 * B-soft 拍板口径（用户批准）：
 * - **非 ship 支线**：`stage >= 2` 即可达成（探索期攒齐就算数）；
 * - **ship 仍锁 stage 3**：阶段 2 攒齐飞船四件套不触发、不进结局 ——
 *   防速通主导策略（探索期速攒四件套直接决定「回家」）；
 * - `availableEndings` 的 **leave 入口**同步加 `stage >= 3` 门。
 *
 * 阶段目标截胡注意：阶段 2 每步有标签目标（s2-1 实体+实体 / s2-2 金属+实体 /
 * s2-3 风险+实体），当前步位会优先吞掉覆盖它的合成。所以每条用例都挑了
 * 「标签不覆盖当前步 requires」的材料对，确保走的是精确配方。
 */
describe('A3 B-soft · 支线达成时机与 leave 入口门', () => {
  /** 阶段 2 指定步位的存档 */
  function stage2State(bag: Record<string, number> = {}, stepIndex = 0): SaveState {
    return { ...createInitialState(), stage: 2, stepIndex, bag: { ...bag } };
  }

  it('⑭ stay（非 ship）在阶段 2 即可达成：awkward + mirror → neighbor', () => {
    // s2-1 要「实体+实体」；awkward(抽象) + mirror(外星/抽象) 不覆盖 → 精确配方
    const state = stage2State({ staykey: 1, toolstand: 1, awkward: 1, mirror: 1 });
    expect(state.stage).toBe(2);
    const res = craft(state, 'awkward', 'mirror');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.state.bag.neighbor).toBe(1);
    expect(res.state.stage).toBe(2); // 配方合成不推进阶段
    expect(res.state.branches.stay).toBe(true);
    expect(res.state.ending).toBe('stay');
  });

  it('⑭b teashop / birthday 同样在阶段 2 可达成（换步位避开阶段目标）', () => {
    // teashop：awkward(抽象) + sock(实体) 在 s2-2（金属+实体）不被截胡
    const tea = craft(
      stage2State({ shopfront: 1, menu: 1, awkward: 1, sock: 1 }, 1),
      'awkward',
      'sock',
    );
    expect(tea.ok).toBe(true);
    if (!tea.ok) throw new Error('unreachable');
    expect(tea.state.bag.fakecustomer).toBe(1);
    expect(tea.state.branches.teashop).toBe(true);
    expect(tea.state.ending).toBe('teashop');

    // birthday：mood(抽象) + tape(实体/粘) 在 s2-3（风险+实体）不被截胡
    const birth = craft(
      stage2State({ birthproof: 1, cakerepl: 1, mood: 1, tape: 1 }, 2),
      'mood',
      'tape',
    );
    expect(birth.ok).toBe(true);
    if (!birth.ok) throw new Error('unreachable');
    expect(birth.state.bag.clapper).toBe(1);
    expect(birth.state.branches.birthday).toBe(true);
    expect(birth.state.ending).toBe('birthday');
  });

  it('⑮ 护栏：阶段 2 攒齐飞船四件套不触发 ship、不出 leave 入口', () => {
    const state = stage2State({
      optimistic: 1,
      joystick: 1,
      doorthing: 1,
      ration: 1,
      awkward: 1,
      mirror: 1,
    });
    const res = craft(state, 'awkward', 'mirror'); // → neighbor，只为触发支线检查
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    // 四件套在包里，但阶段 2 不判定 ship
    expect(res.state.branches.ship).toBe(false);
    expect(res.state.ending).toBeNull();
    expect(availableEndings(res.state)).not.toContain('leave');
    expect(availableEndings(res.state)).toContain('free'); // stage ≥ 2 自由模式照常
  });

  it('⑮b 对照组：ship 在阶段 3 判定（四件套 + 阶段 3 → 达成）', () => {
    const state: SaveState = {
      ...createInitialState(),
      stage: 3,
      stepIndex: 3,
      buildDone: true,
      bag: {
        optimistic: 1,
        joystick: 1,
        doorthing: 1,
        ration: 1,
        awkward: 1,
        mirror: 1,
      },
    };
    const res = craft(state, 'awkward', 'mirror');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.state.branches.ship).toBe(true);
  });

  it('⑯ leave 入口门：stage 2 全飞船不给、stage 3 空飞船不给、stage 3 有件才给', () => {
    const shipBag = { optimistic: 1, joystick: 1, doorthing: 1, ration: 1 };
    // 阶段 2 + 四件套：没有 leave（防速通主导策略）
    expect(
      availableEndings({ ...createInitialState(), stage: 2, bag: shipBag }),
    ).not.toContain('leave');
    // 阶段 3 + 空飞船：没有 leave
    expect(availableEndings({ ...createInitialState(), stage: 3 })).not.toContain('leave');
    // 阶段 3 + 一件飞船部件：leave 出现（launchCheck = forced）
    expect(
      availableEndings({ ...createInitialState(), stage: 3, bag: { joystick: 1 } }),
    ).toContain('leave');
  });
});
