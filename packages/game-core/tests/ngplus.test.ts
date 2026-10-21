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
  NEXT_CYCLE_KEPT,
  NEXT_CYCLE_RESET,
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
  STAGES,
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
      // ⚠️ `areaId` / `scene` 必须填成**非重置值**：
      // B5 断言用「前后是否变化」来判断字段属于「重置」还是「保留」，
      // 如果 before 已经等于重置目标（areaId='crash' / scene=[]），
      // 前后相同 → 会被误判成「保留」→ 断言红。
      areaId: 'junkyard',
      scene: ['旧场景'],
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

  /**
   * B5（2026 QA 复审新增）：**清单与实现不得漂移**。
   *
   * QA 抓到过一个真实缺陷：确认页给玩家看的「重置」清单漏了 `crafts` 与 `logsFound`，
   * 而 `crafts` 归零**直接卡住 L1（需合成 3 次）与 L5（需合成 14 次）的解锁** ——
   * 玩家看完清单以为二周目能直接重读 L1–L5，实际上要重新攒次数。
   *
   * 漏字段的根因是清单靠人手抄。这条断言把
   * `NEXT_CYCLE_KEPT` / `NEXT_CYCLE_RESET` 里出现的字段并集，
   * 与 `startNextCycle()` **实际改动/保留的字段集合**逐一比对：
   * - core 加了字段却没加清单 → 少字段 → 红
   * - 清单列了却实现没动 → 多字段 → 红
   *
   * 这样清单的完整性由机器守，不再依赖 code review 记得住。
   */
  it('B5 确认页清单（NEXT_CYCLE_KEPT / NEXT_CYCLE_RESET）与 startNextCycle 实现一致', () => {
    const before = playedState();
    const after = startNextCycle(before);

    // 实现层：逐字段对比，得出「被重置」与「原样保留」的字段集合。
    //
    // ⚠️ `ngPlus` 拆到**子字段**粒度（`ngPlus.endings` / `ngPlus.readLogs` /
    // `ngPlus.branchesHistory` / `ngPlus.cycle`）：
    // core 往 `NgPlusState` 里加第五个字段时，守恒断言要能看出
    // 「多了一份跨周目档案没被告知玩家」→ 漏字段复发路径被堵死。
    //
    // `ngPlus.cycle` 虽然数值 +1，但它是**跨周目累加**的档案（保留），
    // 不是「被清零的进度」→ 归入保留。
    const resetByImpl = new Set<string>();
    const keptByImpl = new Set<string>();
    for (const k of Object.keys(before) as (keyof SaveState)[]) {
      if (k === 'schemaVersion') continue; // 存档格式版本，与周目无关
      if (k === 'ngPlus') {
        for (const sub of Object.keys(before.ngPlus)) {
          keptByImpl.add(`ngPlus.${sub}`);
        }
        continue;
      }
      const a = before[k];
      const b = after[k];
      const same = JSON.stringify(a) === JSON.stringify(b);
      if (same) keptByImpl.add(k);
      else resetByImpl.add(k);
    }

    // 清单层：两个列表的 fields 并集，按「重置 / 保留」分开。
    const listedReset = new Set<string>();
    for (const b of NEXT_CYCLE_RESET) for (const f of b.fields) listedReset.add(f);
    const listedKept = new Set<string>();
    for (const b of NEXT_CYCLE_KEPT) for (const f of b.fields) listedKept.add(f);

    // 清单必须**恰好**覆盖实现改动的全部字段（不多不少）。
    const implChanged = new Set([...resetByImpl, ...keptByImpl]);
    const missing = [...implChanged].filter((f) => !listedReset.has(f) && !listedKept.has(f));
    const extra = [...listedReset, ...listedKept].filter((f) => !implChanged.has(f));
    expect(missing, `这些字段 startNextCycle 会动，但清单里没列：${missing.join(', ')}`).toEqual([]);
    expect(extra, `这些字段清单里列了，但 startNextCycle 根本不动：${extra.join(', ')}`).toEqual([]);

    // 分类也要对：清单标「重置」的，实现必须真的重置了。
    for (const f of listedReset) {
      expect(resetByImpl.has(f), `${f} 被清单标为重置，但实现里它是保留的`).toBe(true);
    }
    for (const f of listedKept) {
      expect(keptByImpl.has(f), `${f} 被清单标为保留，但实现里它被重置了`).toBe(true);
    }
  });

  /**
   * B7（2026-10-22 文案定稿）：清单文案必须**逐字等于定稿**。
   *
   * 真源：`docs/design/CONTENT-v3-NGPLUS-UI-COPY.md` §1（保留 K1–K5）/ §2（重置 R1–R8）。
   * 定稿里 `【N】` 是待插入的计数占位符，`note` 是「——」之后的后果说明。
   *
   * 为什么要逐字断言：这一页的**全部意义**就是「把你会失去什么摆出来」。
   * 措辞被改动（哪怕是标点）玩家读到的意思就变了，而改文案这件事
   * 应该走「文策渊改定稿 → 同步这里」的流程，不该由工程随手改。
   */
  it('B7 清单文案逐字等于定稿（CONTENT-v3-NGPLUS-UI-COPY §1 / §2）', () => {
    expect(
      NEXT_CYCLE_KEPT.map((b) => [b.text, b.note ?? null]),
    ).toEqual([
      ['已解锁的结局（【N】个）', '那几格不会灭'],
      ['读过的前任记录（【N】篇）', '读过的不用再读一遍'],
      ['走过的支线（【N】条）', '面板上会标出「上次走过」'],
      ['纪念品（【N】件）', '你拿到的东西不会丢'],
      ['这是你的第 【N】 周目', null],
    ]);
    expect(
      NEXT_CYCLE_RESET.map((b) => [b.text, b.note ?? null]),
    ).toEqual([
      ['背包、地面上捡到过的东西、天数', '回到坠毁点的第 1 天'],
      ['阶段进度', '回到第一个阶段的第 1 步，建设期得重新走满'],
      ['已完成的支线', '但还是得重新做一遍'],
      ['累计合成次数', '上周目没读完的那几篇记录，要重新攒次数才能读'],
      ['这一周拿到的记录载体', '载体是要用掉的，不带过去'],
      ['意外次数与这一周的世界日志', null],
      ['本周目的结局', '结局本身已经记在「已解锁的结局」里了'],
      ['起飞尝试与失败的次数', null],
    ]);
  });

  /**
   * B8（2026-10-22 定稿）：R4 / R5 不可合并，且措辞不得过度承诺。
   *
   * - R4 必须含「上周目**没读完的**那几篇」这个限定语，
   *   且**不许**写成「所有记录」——那是错的（`readLogs` 跨周目保留）。
   * - R4 必须点名「建设期得重新走满」（`buildDone` 后果，
   *   不点名玩家会发现第四支线不见了，以为是 bug）。
   */
  it('B8 R4 / R5 的措辞边界（定稿 §2.2 / §2.3）', () => {
    const crafts = NEXT_CYCLE_RESET.find((b) => b.fields.includes('crafts'))!;
    const logsFound = NEXT_CYCLE_RESET.find((b) => b.fields.includes('logsFound'))!;
    const buildDone = NEXT_CYCLE_RESET.find((b) => b.fields.includes('buildDone'))!;

    // R4
    expect(crafts.note).toContain('上周目没读完的那几篇');
    expect(crafts.note).not.toContain('所有记录');
    expect(crafts.note).not.toContain('重新攒次数才能读「所有');
    // R5
    expect(logsFound.note).toContain('载体');
    expect(logsFound.note).toContain('不带过去');
    // R4 与 R5 必须是两条（后果不同，不可合并）
    expect(crafts.text).not.toBe(logsFound.text);
    // buildDone 的后果必须被点名
    expect(buildDone.note).toContain('建设期得重新走满');
  });

  it('B6 清单必须点名 crafts / logsFound / branchesHistory（QA 指名的三个漏项）', () => {
    // 这三个字段是 2026 QA 复审点名的漏项：
    // - `crafts` 归零卡住 L1（合成 3 次）与 L5（合成 14 次）的解锁
    // - `logsFound` 归零 = 本周目拿到的记录载体要重新做
    // - `branchesHistory` 是 G3「上次走过」的数据源，漏列玩家会以为要重走
    const resetText = NEXT_CYCLE_RESET.map((b) => b.text).join(' | ');
    const keptText = NEXT_CYCLE_KEPT.map((b) => b.text).join(' | ');
    const resetFields = NEXT_CYCLE_RESET.flatMap((b) => b.fields);
    const keptFields = NEXT_CYCLE_KEPT.flatMap((b) => b.fields);
    expect(resetFields).toContain('crafts');
    expect(resetFields).toContain('logsFound');
    expect(keptFields).toContain('ngPlus.branchesHistory');
    // 文案要让玩家明白后果，不只是列字段名
    expect(resetText).toContain('合成次数');
    expect(resetText).toContain('记录载体');
    expect(keptText.length).toBeGreaterThan(0);
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

  /**
   * F4（2026 复审补）：示例里的**两件都必须各自贡献这一步 requires 的一个标签**。
   *
   * 回归的是初版 `s1-2: wrench + tape` 的缺陷 —— `wrench` 自己就带「导电 + 金属」，
   * `tape` 一个标签都贡献不上，是没有语义组合含义的凑数材料。
   */
  it('F4 每件示例材料都贡献该步的一个必需标签（没有凑数的无用材料）', () => {
    for (let i = 0; i < 3; i++) {
      const ex = pairingExample(1, i)!;
      const req = STAGES[0].steps[i]!.requires;
      const hitA = req.filter((t) => getItem(ex.a)!.tags.includes(t));
      const hitB = req.filter((t) => getItem(ex.b)!.tags.includes(t));
      expect(hitA.length, `s1-${i + 1} 的 a 不贡献任何必需标签`).toBeGreaterThan(0);
      expect(hitB.length, `s1-${i + 1} 的 b 不贡献任何必需标签`).toBeGreaterThan(0);
      // 两件合起来必须覆盖这一步的全部要求
      const union = new Set([...hitA, ...hitB]);
      expect(req.every((t) => union.has(t)), `s1-${i + 1} 覆盖不全`).toBe(true);
    }
  });

  /**
   * F5（2026 复审补 · 2026-10-22 文案定稿）：文案是**标签方向提示**，不是配方步骤。
   *
   * 口径：文案必须点名这一步要的标签，并给出「同一类里换别的也行」的余地，
   * 不得出现「照着做一定能过」这种对材料可得性的强承诺。
   *
   * 2026-10-22 文策渊定稿后的句式要求（**逐字断言**）：
   * - 标签在前、例子在后：`这一步要「<标签>」和「<标签>」——比如<物品>（<标签>）配<物品>（<标签>）。`
   * - 尾巴固定：`带这两个标签的都行，不一定是这两样。`
   */
  it('F5 文案给出标签方向而不是配方步骤（句式定稿）', () => {
    for (let i = 0; i < 3; i++) {
      const ex = pairingExample(1, i)!;
      const req = STAGES[0].steps[i]!.requires;
      for (const t of req) {
        expect(ex.text, `s1-${i + 1} 文案没提标签「${t}」`).toContain(t);
      }
      // 尾巴固定句（定稿）
      expect(ex.text).toContain('带这两个标签的都行，不一定是这两样。');
      // 标签在前、例子在后：标签句必须在例子（物品名）之前
      expect(ex.text.indexOf('这一步要「')).toBeLessThan(ex.text.indexOf('比如'));
      // 不得出现对材料可得性的强承诺
      expect(ex.text).not.toContain('一定能过');
    }
  });

  /**
   * F6（2026-10-22 定稿）：三步示例的**逐字文案**。
   *
   * 定稿三句是逐字定下来的，任何改动都要在这里红。
   */
  it('F6 三步示例文案逐字等于定稿', () => {
    expect(pairingExample(1, 0)!.text).toBe(
      '这一步要「导电」和「粘」——比如漏气电池（导电）配胶带（粘）。带这两个标签的都行，不一定是这两样。',
    );
    expect(pairingExample(1, 1)!.text).toBe(
      '这一步要「导电」和「金属」——比如生锈扳手（导电）配撬棍（金属）。带这两个标签的都行，不一定是这两样。',
    );
    expect(pairingExample(1, 2)!.text).toBe(
      '这一步要「知识」和「导电」——比如缺页火箭手册（知识）配漏气电池（导电）。带这两个标签的都行，不一定是这两样。',
    );
  });

  /**
   * F7（2026-10-22 定稿）：s1-2 的示例是 `wrench` + `crowbar`。
   *
   * 理由：`battery` 已经在 s1-1 与 s1-3 出现（首尾，跨度最大），
   * 若 s1-2 也指向它，玩家在 s1-1 把电池用掉后（`craft()` 扣材料），
   * s1-2 的例子就指向了一件手上已经没有的东西。
   * 换成 `wrench` 后：`battery` 在 s1-1 / s1-3，`wrench` 独占 s1-2。
   */
  it('F7 s1-2 的示例是 wrench + crowbar（battery 不在 s1-2）', () => {
    const ex = pairingExample(1, 1)!;
    expect(ex.a).toBe('wrench');
    expect(ex.b).toBe('crowbar');
    expect(ex.a).not.toBe('battery');
    expect(ex.b).not.toBe('battery');
    // wrench 与 crowbar 都在坠毁点池里且是 base
    expect(AREA_POOLS.crash).toContain('wrench');
    expect(getItem('wrench')!.kind).toBe('base');
    expect(getItem('crowbar')!.kind).toBe('base');
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
