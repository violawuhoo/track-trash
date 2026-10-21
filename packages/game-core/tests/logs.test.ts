/**
 * 前任日志（C1 批次）。
 *
 * 守四组断言：
 * 1. **内容完整性**：8 篇日志 ↔ 8 个载体，一条不落；正文非空、载体有配方。
 * 2. **可达性**：每篇日志的载体，其依赖闭包能终止于**可捡的 base 物品**（不卡死）。
 * 3. **解锁条件**：天数 / 合成次数 / 阶段 / 建设期完成，四种条件各自的行为。
 * 4. **记账**：`craft()` 产出载体时写进 `logsFound`，去重；载体重复合出不重复记账。
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AREA_POOLS,
  CARRIER_TO_LOG,
  ITEM_MAP,
  LOGS,
  LOG_BY_ID,
  RECIPES,
  createInitialState,
  craft,
  carrierFound,
  getItem,
  logUnlocked,
  pendingLogs,
  readableLogs,
  waitingLogs,
} from '../src/index';
import type { LogProgress, SaveState } from '../src/index';

/** 一个满足所有解锁条件的进度面（除了 logsFound 由调用方定） */
const maxProgress = (logsFound: string[] = []): LogProgress => ({
  day: 99,
  crafts: 99,
  stage: 3,
  buildDone: true,
  logsFound,
});

describe('C1 · 前任日志内容', () => {
  it('① 8 篇日志，id / 载体 / 标题一一对应，一条不落', () => {
    expect(LOGS).toHaveLength(8);
    expect(LOGS.map((l) => l.id)).toEqual([
      'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8',
    ]);

    // 载体 id 唯一
    const carriers = LOGS.map((l) => l.carrierId);
    expect(new Set(carriers).size).toBe(8);

    // 每个载体都有对应物品本体（getItem 对未知 id 会 throw）
    for (const id of carriers) {
      expect(ITEM_MAP[id], id).toBeDefined();
    }

    // 每个载体都有精确配方
    for (const id of carriers) {
      const r = RECIPES.find((x) => x.out === id);
      expect(r, `${id} 没有配方`).toBeDefined();
    }

    // CARRIER_TO_LOG 是完整的反向索引
    expect(Object.keys(CARRIER_TO_LOG).sort()).toEqual([...carriers].sort());
    for (const log of LOGS) {
      expect(CARRIER_TO_LOG[log.carrierId]).toBe(log.id);
      expect(LOG_BY_ID[log.id]).toBe(log);
    }
  });

  it('② 每篇正文非空、每篇至少 4 段、每段有内容', () => {
    for (const log of LOGS) {
      expect(log.paragraphs.length, log.id).toBeGreaterThanOrEqual(4);
      for (const p of log.paragraphs) {
        expect(p.trim().length, `${log.id} 有一段是空的`).toBeGreaterThan(0);
      }
      // 标题 = 载体物品名（面板上显示的就是它）
      expect(log.title).toBe(getItem(log.carrierId).name);
    }
  });

  it('③ 拼合点只出现在 L4 / L6 / L8（GDD §6.4：P1 已取消）', () => {
    // 拼合点的判据（GDD §6.4，方案 B）：
    // 1. 必须**跨篇** —— 结论不能被任一单篇独立支撑；
    // 2. 必须**有增量** —— 读到本篇之前，玩家无法完整说出这条结论；
    // 3. **触发篇必须是提供新端的那一篇**。
    //
    // 按这三条，8 篇里成立的只有 P2 / P3 / P4（即 L4 / L6 / L8）。
    // P1 不成立：它的两端都在 L1 之内（「船上原本两个人。我在这儿。」/
    // 「如果你读到这段，说明我是那个没走的。」），而 L2 是燃料消耗表、
    // 不提供任何相关新信息 —— 它是复述，不是揭示。
    const withPuzzle = LOGS.filter((l) => l.puzzle).map((l) => l.id);
    expect(withPuzzle).toHaveLength(3);
    expect(withPuzzle).toEqual(['L4', 'L6', 'L8']);

    // L2 明确没有拼合点（GDD §6.4：P1 已取消）。
    // 单独点名断言，防止有人把它挪回 L2。
    expect(LOG_BY_ID.L2, 'L2 不得有拼合点（P1 已取消）').toBeDefined();
    expect('puzzle' in LOG_BY_ID.L2!, 'L2 不得有 puzzle 字段（P1 已取消）').toBe(false);
    expect(LOG_BY_ID.L2!.puzzle).toBeUndefined();

    // L7 的末段必须断在「如果它会死——」，不能给答案
    const l7 = LOG_BY_ID.L7!;
    expect(l7.paragraphs[l7.paragraphs.length - 1]).toBe('如果它会死——');
  });

  /**
   * ③c 内容层断言：**拼合点必须是正文没直说的新结论，而不是正文的复述。**
   *
   * 上面那条「只有 L4/L6/L8 有」是**列表断言**，防不住「换个篇号再挂一个复述上去」。
   * 这一条从**内容**上守 GDD §6.4 的三条判据：
   *
   * - **判据 1（跨篇）**：拼合点的结论必须由**至少两篇**正文共同支撑。
   *   「一篇正文就能把它说全」→ 那不是拼合点。
   * - **判据 3（触发篇提供新端）**：拼合点**自己所在的那一篇**必须对这条结论有实质贡献
   *   （它是新端的来源）。否则它是「别处结论的搬运」，不是拼合点。
   *
   * 度量方式：把文本归一化（去空白与标点）后切 3-gram，算「拼合点的 3-gram 有多少比例
   * 出现在某篇正文里」。**为什么用 3-gram 而不是逐字包含**：
   * 逐字包含只能抓住「原句照抄」，抓不住「同一件事换个说法」；
   * 3-gram 覆盖率能抓住「说法不同但内容重合」。
   *
   * 阈值 0.05 是**实测校准**出来的（不是拍的）：
   * L4 = 0.100 / L6 = 0.118 / L8 = 0.214（触发篇自身覆盖率，全部 ≥ 0.05）；
   * 而被删掉的 P1 文本若挂回 L2，L2 自身覆盖率 = 0.000 —— **低于阈值，断言红**。
   * 所以这条断言对「把 P1 挪回去」这个具体变异**有真实杀伤力**。
   */
  it('③c 拼合点必须跨篇、且由它自己所在的那一篇提供新端（防复述回流）', () => {
    /** 归一化：去空白与中英文标点，只留实义字符 */
    const norm = (t: string): string =>
      t.replace(/[\s，。；：、！？「」『』（）()《》〈〉—…,.;:!?"'·]/g, '');

    /** 3-gram 列表 */
    const grams = (t: string): string[] => {
      const s = norm(t);
      const out: string[] = [];
      for (let i = 0; i + 3 <= s.length; i += 1) out.push(s.slice(i, i + 3));
      return out;
    };

    /** 「拼合点的 3-gram 有多少比例出现在 body 里」 */
    const coverage = (puzzle: string, body: string): number => {
      const g = grams(puzzle);
      if (g.length === 0) return 1;
      const bodyGrams = new Set(grams(body));
      return g.filter((x) => bodyGrams.has(x)).length / g.length;
    };

    /** 一篇正文里是否**逐字**包含整条拼合点 */
    const containsVerbatim = (puzzle: string, body: string): boolean =>
      body.includes(puzzle);

    const THRESHOLD = 0.05;

    for (const log of LOGS) {
      const puzzle = log.puzzle;
      if (!puzzle) continue;

      const own = coverage(puzzle, log.paragraphs.join(''));
      const perLog = LOGS.map((l) => ({
        id: l.id,
        c: coverage(puzzle, l.paragraphs.join('')),
      }));

      // 判据 3：触发篇必须是提供新端的那一篇。
      expect(
        own,
        `${log.id} 的拼合点在自己这篇正文里几乎没有支撑（${own.toFixed(3)} < ${THRESHOLD}）` +
          `—— 它是别处结论的搬运，不是拼合点`,
      ).toBeGreaterThanOrEqual(THRESHOLD);

      // 判据 1：必须跨篇 —— 至少两篇正文对它有实质支撑。
      const supporters = perLog.filter((x) => x.c >= THRESHOLD).map((x) => x.id);
      expect(
        supporters.length,
        `${log.id} 的拼合点只被 ${supporters.join(',') || '（无）'} 支撑` +
          `—— 结论不能被任一单篇独立支撑，它必须跨篇`,
      ).toBeGreaterThanOrEqual(2);

      // 逐字复述检查：拼合点不能是**任何**一篇正文里某一段的原文。
      // （覆盖度检查抓「换个说法」，这条抓「原句照抄」。）
      for (const l of LOGS) {
        for (const para of l.paragraphs) {
          expect(
            containsVerbatim(puzzle, para),
            `${log.id} 的拼合点在 ${l.id} 的正文里被逐字复述了`,
          ).toBe(false);
        }
      }
    }
  });

  it('③b 正文逐字来自 GDD §6.3（唯一真源，改 GDD 必须同步改这里）', () => {
    // 锁住「正文一字不改地来自 GDD」这条契约：
    // 把 GDD §6.3 的引用块拆成段落，逐段与 `LOGS` 对齐。
    // 文件不在仓库里时跳过（不因为环境问题红），但正常 CI 下必须真跑。
    const gddPath = new URL('../../../docs/design/CONTENT-v3-GDD.md', import.meta.url);
    if (!existsSync(gddPath)) return;
    const gdd = readFileSync(gddPath, 'utf8');

    // 抽出 §6.3 区块
    const start = gdd.indexOf('### 6.3');
    const end = gdd.indexOf('### 6.4');
    expect(start, 'GDD 里找不到 §6.3').toBeGreaterThan(-1);
    expect(end, 'GDD 里找不到 §6.4').toBeGreaterThan(-1);
    const section = gdd.slice(start, end);

    // 把 GDD 段落按「遇到下一个 `**L` 标题行」分组
    const gddByLog: Record<string, string[]> = {};
    let current: string | null = null;
    for (const line of section.split('\n')) {
      const title = /^\*\*(L\d)\s/.exec(line);
      if (title) {
        current = title[1]!;
        gddByLog[current] = [];
        continue;
      }
      if (current && line.startsWith('>')) {
        const text = line.replace(/^>\s?/, '').trimEnd();
        if (text.length > 0) gddByLog[current]!.push(text);
      }
    }

    expect(Object.keys(gddByLog).sort()).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8']);
    for (const log of LOGS) {
      expect(log.paragraphs, `${log.id} 正文与 GDD §6.3 不一致`).toEqual(gddByLog[log.id]);
    }
    // GDD 里分好组的正文行数与实际段落数一致（防止漏掉一整段）。
    // 注意：§6.3 开头那句「语气：…」也是引用块，但它不是正文段落，所以只数分组内的。
    const gddParas = Object.values(gddByLog).flat();
    expect(gddParas.length).toBe(LOGS.reduce((n, l) => n + l.paragraphs.length, 0));
  });
});

describe('C1 · 日志载体可达性', () => {
  it('④ 载体的依赖闭包终止于可捡的 base 物品（不卡死）', () => {
    // 反查：能产出某 id 的配方。
    // ⚠️ 按**产物**建键 —— 原来用「无序对 a|b」建键却按物品 id 查，永远查不到，
    // 导致闭包恒为空、断言恒过（空跑护栏）。C1 批次修正。
    const producersOf = new Map<string, { a: string; b: string }>();
    for (const r of RECIPES) {
      if (!producersOf.has(r.out)) producersOf.set(r.out, { a: r.a, b: r.b });
    }

    // 全部可捡的 base 物品 id
    const pickable = new Set(
      [...AREA_POOLS.crash, ...AREA_POOLS.junkyard, ...AREA_POOLS.market, ...AREA_POOLS.cave],
    );

    for (const log of LOGS) {
      // 闭包：从载体往下找材料
      const queue = [log.carrierId];
      const seen = new Set<string>([log.carrierId]);
      const deadEnds: string[] = [];

      while (queue.length) {
        const id = queue.shift()!;
        const hit = producersOf.get(id);
        if (!hit) {
          // 没有上游配方 → 必须是可捡的 base 物品
          if (!pickable.has(id)) deadEnds.push(id);
          continue;
        }
        for (const m of [hit.a, hit.b]) {
          if (!seen.has(m)) {
            seen.add(m);
            queue.push(m);
          }
        }
      }

      expect(deadEnds, `${log.carrierId} 的依赖闭包里有拿不到的东西`).toEqual([]);
    }
  });

  it('⑤ 载体的材料本身在对应阶段已解锁的区域里可捡', () => {
    // 阶段 1：crash；阶段 2：crash + junkyard；阶段 3：四区全解锁
    const stage1 = new Set(AREA_POOLS.crash);
    const stage2 = new Set([...AREA_POOLS.crash, ...AREA_POOLS.junkyard]);
    const stage3 = new Set([
      ...AREA_POOLS.crash,
      ...AREA_POOLS.junkyard,
      ...AREA_POOLS.market,
      ...AREA_POOLS.cave,
    ]);

    // GDD §5.3「最早可造」列
    const earliest: Record<string, 1 | 2 | 3> = {
      log_page1: 1,
      log_map2: 2,
      log_page2: 2,
      log_map1: 3,
      log_chip1: 3,
      log_q1: 3,
      log_b1: 3,
      log_reel1: 3,
    };

    for (const log of LOGS) {
      const r = RECIPES.find((x) => x.out === log.carrierId)!;
      const stage = earliest[log.carrierId]!;
      const pool = stage === 1 ? stage1 : stage === 2 ? stage2 : stage3;
      for (const m of [r.a, r.b]) {
        // 材料要么是可捡的 base，要么是 mid（合成产物，不需要在池里）
        if (getItem(m).kind === 'base') {
          expect(pool.has(m), `${log.carrierId} 的材料 ${m} 在阶段 ${stage} 拿不到`).toBe(true);
        }
      }
    }
  });
});

describe('C1 · 解锁条件', () => {
  it('⑥ L1 需要「天数 ≥ 5 且 合成次数 ≥ 3」两个条件都满足', () => {
    const l1 = LOG_BY_ID.L1!;
    const base: LogProgress = { day: 5, crafts: 3, stage: 3, buildDone: true, logsFound: [] };

    expect(logUnlocked(l1, base)).toBe(true);
    // 天数不够
    expect(logUnlocked(l1, { ...base, day: 4 })).toBe(false);
    // 合成次数不够
    expect(logUnlocked(l1, { ...base, crafts: 2 })).toBe(false);
    // 两个都不够
    expect(logUnlocked(l1, { ...base, day: 1, crafts: 0 })).toBe(false);
  });

  it('⑦ L2 / L3 / L6 / L7 按天数解锁', () => {
    const cases: [string, number][] = [
      ['L2', 9],
      ['L3', 12],
      ['L6', 18],
      ['L7', 20],
    ];
    for (const [id, need] of cases) {
      const log = LOG_BY_ID[id]!;
      expect(log.unlock.day).toBe(need);
      expect(logUnlocked(log, { ...maxProgress(), day: need })).toBe(true);
      expect(logUnlocked(log, { ...maxProgress(), day: need - 1 })).toBe(false);
    }
  });

  it('⑧ L4 需要完成阶段 2（= stage 变成 3），L5 需要合成次数 ≥ 14', () => {
    const l4 = LOG_BY_ID.L4!;
    expect(l4.unlock.stage).toBe(3);
    expect(logUnlocked(l4, { ...maxProgress(), stage: 3 })).toBe(true);
    expect(logUnlocked(l4, { ...maxProgress(), stage: 2 })).toBe(false);

    const l5 = LOG_BY_ID.L5!;
    expect(l5.unlock.crafts).toBe(14);
    expect(logUnlocked(l5, { ...maxProgress(), crafts: 14 })).toBe(true);
    expect(logUnlocked(l5, { ...maxProgress(), crafts: 13 })).toBe(false);
  });

  it('⑨ L8 需要建设期三步走满（buildDone）', () => {
    const l8 = LOG_BY_ID.L8!;
    expect(l8.unlock.buildDone).toBe(true);
    expect(logUnlocked(l8, { ...maxProgress(), buildDone: true })).toBe(true);
    expect(logUnlocked(l8, { ...maxProgress(), buildDone: false })).toBe(false);
  });

  it('⑩ 可读 = 条件满足 **且** 载体已获得（两个条件都要满足）', () => {
    // 条件满足但没载体 → 读不到
    expect(readableLogs(maxProgress([]))).toEqual([]);
    // 有载体但条件不满足 → 也读不到
    expect(readableLogs({ ...maxProgress(['L1']), day: 1, crafts: 0 })).toEqual([]);
    // 两个都满足 → 读得到
    const readable = readableLogs(maxProgress(['L1']));
    expect(readable).toHaveLength(1);
    expect(readable[0]!.id).toBe('L1');
  });

  it('⑪ pendingLogs 列出「解锁条件还没满足」的篇目', () => {
    // pendingLogs = locked 三态（条件没到）。
    // 条件全满足时 → 空数组。
    expect(pendingLogs(maxProgress(['L1', 'L2']))).toEqual([]);
    // 条件全不满足时 → 8 篇全在
    const none: LogProgress = {
      day: 0,
      crafts: 0,
      stage: 1,
      buildDone: false,
      logsFound: [],
    };
    expect(pendingLogs(none).map((l) => l.id)).toEqual([
      'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8',
    ]);
    // 天数不够 → 只有 L1 掉出 pending（它的条件里 day ≥ 5 是最松的）
    const mid: LogProgress = { ...none, day: 5, crafts: 3 };
    expect(pendingLogs(mid).map((l) => l.id)).toEqual([
      'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8',
    ]);
  });

  it('⑪b waitingLogs 列出「条件到了但载体还没合出来」的篇目', () => {
    // 三态划分：readable / waiting / locked 三者互斥且并起来 = 全部 8 篇。
    const state = maxProgress([]);
    expect(waitingLogs(state).map((l) => l.id)).toEqual([
      'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8',
    ]);
    expect(readableLogs(state)).toEqual([]);

    // 拿到 L1 载体后 → L1 变成 readable，其余还是 waiting
    const withL1 = maxProgress(['L1']);
    expect(readableLogs(withL1).map((l) => l.id)).toEqual(['L1']);
    expect(waitingLogs(withL1).map((l) => l.id)).toEqual([
      'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8',
    ]);

    // 三态并集 = 全部 8 篇，一条不落
    const all = [...readableLogs(withL1), ...waitingLogs(withL1), ...pendingLogs(withL1)];
    expect(all.map((l) => l.id).sort()).toEqual([
      'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8',
    ]);
  });
});

describe('C1 · 载体记账', () => {
  /** 一个能直接合出 log_page1（manual + photo）的存档 */
  function page1State(): SaveState {
    return {
      ...createInitialState(),
      stage: 3,
      stepIndex: 3,
      buildDone: true,
      bag: { manual: 1, photo: 1 },
    };
  }

  it('⑫ 合出载体时把日志 id 写进 logsFound', () => {
    const res = craft(page1State(), 'manual', 'photo');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    // ⚠️ 断言 res.state.X 而不是 res.X —— 返回值字段与存档字段是两条路
    expect(res.state.logsFound).toEqual(['L1']);
    expect(carrierFound(LOG_BY_ID.L1!, res.state)).toBe(true);
  });

  it('⑬ 合成次数每次 +1（解锁条件要用）', () => {
    const before = page1State();
    expect(before.crafts).toBe(0);
    const res = craft(before, 'manual', 'photo');
    if (!res.ok) throw new Error('unreachable');
    expect(res.state.crafts).toBe(1);
  });

  it('⑭ 同一篇重复合出不重复记账（去重）', () => {
    let state = page1State();
    // 备两份材料
    state = { ...state, bag: { manual: 2, photo: 2 } };
    const r1 = craft(state, 'manual', 'photo');
    if (!r1.ok) throw new Error('unreachable');
    expect(r1.state.logsFound).toEqual(['L1']);

    const r2 = craft(r1.state, 'manual', 'photo');
    if (!r2.ok) throw new Error('unreachable');
    expect(r2.state.logsFound).toEqual(['L1']); // 仍然只有一条
    expect(r2.state.crafts).toBe(2);
  });

  it('⑮ 载体被消耗掉也不收回记账（读过就记得）', () => {
    const state = page1State();
    const res = craft(state, 'manual', 'photo');
    if (!res.ok) throw new Error('unreachable');
    // 载体现在在背包里；就算之后被别的合成吃掉，logsFound 也不该变
    expect(res.state.bag.log_page1).toBe(1);
    const eaten = craft(
      { ...res.state, bag: { ...res.state.bag, tape: 1 } },
      'log_page1',
      'tape',
    );
    if (!eaten.ok) throw new Error('unreachable');
    expect(eaten.state.logsFound).toEqual(['L1']);
  });

  it('⑯ 非载体产物不写 logsFound', () => {
    const state: SaveState = {
      ...createInitialState(),
      stage: 3,
      stepIndex: 3,
      buildDone: true,
      bag: { manual: 1, sandwich: 1 },
    };
    const res = craft(state, 'manual', 'sandwich');
    if (!res.ok) throw new Error('unreachable');
    expect(res.state.logsFound).toEqual([]);
  });
});
