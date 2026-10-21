/**
 * 阶段 3「建设期」目标链（A1b 内容批次）。
 *
 * A1a 打通了机制（阶段闸门放宽、buildDone、ks_build 发放点），
 * A1b 把三步正式内容落地：
 *
 * | 步骤     | requires         | output      | 同构精确配方        |
 * |----------|------------------|-------------|---------------------|
 * | `s3-1`   | 粘 + 知识        | `notice`    | `tape` + `manual`   |
 * | `s3-2`   | 金属 + 能烧      | `generator` | `crowbar` + `fuel`  |
 * | `s3-3`   | 能推 + 抽象      | `hourglass` | `echo` + `broom`    |
 *
 * 本文件守 8 条断言，核心是第 ⑧ 条：
 * **阶段 3 目标链不得截胡支线产物配方** —— 阶段目标优先级高于精确配方，
 * 一旦某条支线产物的原料标签并集覆盖了某一步的 requires，
 * 玩家就永远做不出那条支线的候选品，整条支线直接死掉。
 */
import { describe, expect, it } from 'vitest';
import {
  AREA_POOLS,
  BRANCHES,
  ITEMS,
  ITEM_MAP,
  LOGS,
  RECIPES,
  STAGES,
  createInitialState,
  craft,
  getItem,
  missingAreaHints,
  resolveMix,
  unionTags,
} from '../src/index';
import type { Progress, SaveState, Tag } from '../src/index';

const at = (stage: 1 | 2 | 3, stepIndex: number): Progress => ({ stage, stepIndex });

/** 阶段 3 的三步（正式内容） */
const S3 = STAGES[2]!;
const S3_STEPS = S3.steps;

/** 一个处在阶段 3 第 1 步的存档 */
function stage3State(bag: Record<string, number> = {}): SaveState {
  return {
    ...createInitialState(),
    stage: 3,
    stepIndex: 0,
    bag: { ...bag },
  };
}

describe('阶段 3 三步目标链（正式内容）', () => {
  it('① 三步依次命中：tape+manual → notice，crowbar+fuel → generator，echo+broom → hourglass', () => {
    expect(S3_STEPS.map((s) => s.id)).toEqual(['s3-1', 's3-2', 's3-3']);
    expect(S3_STEPS.map((s) => s.output)).toEqual([
      'notice',
      'generator',
      'hourglass',
    ]);
    expect(S3_STEPS.map((s) => s.requires)).toEqual([
      ['粘', '知识'],
      ['金属', '能烧'],
      ['能推', '抽象'],
    ]);

    // 第 1 步
    const r1 = resolveMix('tape', 'manual', at(3, 0));
    expect(r1.result.kind).toBe('stage');
    if (r1.result.kind !== 'stage') throw new Error('unreachable');
    expect(r1.result.output).toBe('notice');
    expect(r1.result.nextStepIndex).toBe(1);
    expect(r1.result.stageCleared).toBe(false);

    // 第 2 步
    const r2 = resolveMix('crowbar', 'fuel', at(3, 1));
    expect(r2.result.kind).toBe('stage');
    if (r2.result.kind !== 'stage') throw new Error('unreachable');
    expect(r2.result.output).toBe('generator');
    expect(r2.result.nextStepIndex).toBe(2);
    expect(r2.result.stageCleared).toBe(false);

    // 第 3 步
    const r3 = resolveMix('echo', 'broom', at(3, 2));
    expect(r3.result.kind).toBe('stage');
    if (r3.result.kind !== 'stage') throw new Error('unreachable');
    expect(r3.result.output).toBe('hourglass');
    expect(r3.result.nextStepIndex).toBe(3);
    expect(r3.result.stageCleared).toBe(true);
  });

  it('② 走满三步：stage 仍是 3、stepIndex 停在 3、buildDone 为 true、发 ks_build', () => {
    let state = stage3State({
      tape: 1,
      manual: 1,
      crowbar: 1,
      fuel: 1,
      echo: 1,
      broom: 1,
    });
    expect(state.buildDone).toBe(false);

    for (const [a, b, expectStep] of [
      ['tape', 'manual', 1],
      ['crowbar', 'fuel', 2],
      ['echo', 'broom', 3],
    ] as const) {
      const res = craft(state, a, b);
      expect(res.ok, `${a}+${b}`).toBe(true);
      if (!res.ok) throw new Error('unreachable');
      state = res.state;
      expect(state.stepIndex).toBe(expectStep);
      expect(state.stage).toBe(3);
    }

    // GDD §2.4：走满不改变 stage（不进 stage 4），只置 buildDone
    expect(state.stage).toBe(3);
    expect(state.stepIndex).toBe(3);
    expect(state.buildDone).toBe(true);
    // 发放建设纪念品
    expect(state.keepsakes).toContain('ks_build');
    expect(state.keepsakes.filter((k) => k === 'ks_build')).toHaveLength(1);
    // 三件产物都进背包
    expect(state.bag.notice).toBe(1);
    expect(state.bag.generator).toBe(1);
    expect(state.bag.hourglass).toBe(1);
    // 写了一条「阶段」日志
    expect(state.log.some((l) => l.kind === '阶段')).toBe(true);
  });

  it('②b 走满时播 clear3，阶段 1 / 2 走满仍分别播 clear1 / clear2', () => {
    // 阶段 1 走满（第 3 步：知识 + 导电 → signal）
    const s1: SaveState = {
      ...createInitialState(),
      stage: 1,
      stepIndex: 2,
      bag: { bracket: 1, manual: 1 },
    };
    const r1 = craft(s1, 'bracket', 'manual');
    expect(r1.ok).toBe(true);
    if (!r1.ok) throw new Error('unreachable');
    expect(r1.dialogueKey).toBe('clear1');
    expect(r1.state.stage).toBe(2);

    // 阶段 2 走满
    const s2: SaveState = {
      ...createInitialState(),
      stage: 2,
      stepIndex: 2,
      bag: { lottery: 1, bedframe: 1 },
    };
    const r2 = craft(s2, 'lottery', 'bedframe');
    expect(r2.ok).toBe(true);
    if (!r2.ok) throw new Error('unreachable');
    expect(r2.dialogueKey).toBe('clear2');
    expect(r2.state.stage).toBe(3);

    // 阶段 3 走满：依次走完三步，最后一步的 dialogueKey 必须是 clear3
    let s3 = stage3State({
      tape: 1,
      manual: 1,
      crowbar: 1,
      fuel: 1,
      echo: 1,
      broom: 1,
    });
    let lastKey: string | null = null;
    for (const [a, b] of [
      ['tape', 'manual'],
      ['crowbar', 'fuel'],
      ['echo', 'broom'],
    ] as const) {
      const r = craft(s3, a, b);
      expect(r.ok, `${a}+${b}`).toBe(true);
      if (!r.ok) throw new Error('unreachable');
      s3 = r.state;
      lastKey = r.dialogueKey;
    }
    expect(lastKey).toBe('clear3');
    // 阶段 3 走满时 stage 不变 —— 这正是旧 web 端推断法漏播 clear3 的原因
    expect(s3.stage).toBe(3);
    expect(s3.buildDone).toBe(true);
  });

  it('③ buildDone 之后合成回归纯配方判定（阶段目标不再拦截）', () => {
    const state = stage3State({
      tape: 1,
      manual: 1,
      crowbar: 1,
      fuel: 1,
      echo: 1,
      broom: 1,
    });
    let done = state;
    for (const [a, b] of [
      ['tape', 'manual'],
      ['crowbar', 'fuel'],
      ['echo', 'broom'],
    ] as const) {
      const res = craft(done, a, b);
      if (!res.ok) throw new Error('unreachable');
      done = res.state;
    }
    expect(done.buildDone).toBe(true);

    // stepIndex = 3 = steps.length → 内层守卫放行，走精确配方
    const { result } = resolveMix('plunger', 'tape', at(3, done.stepIndex));
    expect(result.kind).toBe('recipe');
    if (result.kind !== 'recipe') throw new Error('unreachable');
    expect(result.output).toBe('joystick');
  });

  it('④ 三步 requires 的每个标签在已解锁区域池里都有 ≥2 个来源', () => {
    // 阶段 3 时 crash / junkyard / market / cave 全部解锁
    const pool = [
      ...AREA_POOLS.crash,
      ...AREA_POOLS.junkyard,
      ...AREA_POOLS.market,
      ...AREA_POOLS.cave,
    ];
    for (const step of S3_STEPS) {
      for (const tag of step.requires) {
        const sources = pool.filter((id) => getItem(id).tags.includes(tag));
        expect(sources.length, `${step.id} 的「${tag}」只有 ${sources.length} 个来源`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('⑤ missingAreaHints 对阶段 3 每个缺标签都能给出区域 + 物品', () => {
    for (const [i, step] of S3_STEPS.entries()) {
      const hints = missingAreaHints(at(3, i), {});
      expect(hints.map((h) => h.tag)).toEqual(step.requires);
      for (const h of hints) {
        expect(AREA_POOLS[h.areaId], `${h.tag} 的区域`).toContain(h.itemId);
        expect(getItem(h.itemId).tags).toContain(h.tag);
      }
    }
  });

  it('⑥ 已在背包里的标签不再提示', () => {
    // s3-1 需要 粘 + 知识。背包里给一件带「粘」的东西（tape）。
    const hints = missingAreaHints(at(3, 0), { tape: 1 });
    expect(hints.map((h) => h.tag)).toEqual(['知识']);

    // 两个都给齐 → 没有提示
    expect(missingAreaHints(at(3, 0), { tape: 1, manual: 1 })).toEqual([]);
  });

  it('⑦ R7 / R8 / R9 三条精确配方在阶段 3 之前可命中', () => {
    // 阶段 1 第 1 步要 导电 + 粘，三条配方的原料都不覆盖它 → 不会被阶段目标截胡
    const s1 = at(1, 0);
    const r7 = resolveMix('tape', 'manual', s1);
    expect(r7.result.kind).toBe('recipe');
    if (r7.result.kind !== 'recipe') throw new Error('unreachable');
    expect(r7.result.output).toBe('notice');

    const r8 = resolveMix('crowbar', 'fuel', s1);
    expect(r8.result.kind).toBe('recipe');
    if (r8.result.kind !== 'recipe') throw new Error('unreachable');
    expect(r8.result.output).toBe('generator');

    const r9 = resolveMix('echo', 'broom', s1);
    expect(r9.result.kind).toBe('recipe');
    if (r9.result.kind !== 'recipe') throw new Error('unreachable');
    expect(r9.result.output).toBe('hourglass');
  });

  it('⑧ 阶段 3 目标链不截胡支线产物配方（各槽位候选品逐条验证）', () => {
    // 收集所有能产出某个支线候选品的配方
    const branchTargets = new Set<string>();
    for (const branch of BRANCHES) {
      for (const options of branch.requires) {
        for (const id of options) branchTargets.add(id);
      }
    }

    const checked: string[] = [];
    for (const r of RECIPES) {
      if (!branchTargets.has(r.out)) continue;
      checked.push(`${r.a}+${r.b}→${r.out}`);
      // 三个步骤位置都要试：阶段目标优先级高于精确配方，
      // 原料标签并集一旦覆盖某一步的 requires，这条支线就废了。
      for (let stepIndex = 0; stepIndex < S3_STEPS.length; stepIndex++) {
        const { result } = resolveMix(r.a, r.b, at(3, stepIndex));
        expect(result.kind, `${r.a}+${r.b} 在 s3-${stepIndex + 1} 被阶段目标截胡`).toBe('recipe');
        if (result.kind !== 'recipe') throw new Error('unreachable');
        expect(result.output).toBe(r.out);
      }
    }

    // 覆盖面：四条支线共 23 个候选品全部有配方且被验证过
    // （前三条 17 个 + 第四支线 stay 的 6 个）
    expect(branchTargets.size).toBe(23);
    expect(checked.length).toBeGreaterThanOrEqual(23);
  });

  it('⑧b 阶段 3 的每一步 requires 都不能被任何支线产物的原料标签并集覆盖', () => {
    // 这是 ⑧ 的「反向」写法：不依赖 resolveMix，直接比标签并集。
    // 覆盖 = requires.every(r => union.includes(r))。
    const branchTargets = new Set<string>();
    for (const branch of BRANCHES) {
      for (const options of branch.requires) {
        for (const id of options) branchTargets.add(id);
      }
    }

    const culprits: string[] = [];
    for (const r of RECIPES) {
      if (!branchTargets.has(r.out)) continue;
      const tags = unionTags(getItem(r.a).tags, getItem(r.b).tags);
      for (const step of S3_STEPS) {
        if (step.requires.every((t: Tag) => tags.includes(t))) {
          culprits.push(`${r.a}+${r.b}→${r.out} 覆盖了 ${step.id}`);
        }
      }
    }
    expect(culprits).toEqual([]);
  });

  it('⑧c 支线候选品的「材料配方」也不被阶段目标截胡（闭包护栏）', () => {
    // ⑧ / ⑧b 只验「直接产出候选品的那条配方」。
    // 但候选品的材料本身可能也是合成产物（如 toolstand ← valvework ← mirror+tape），
    // 若中间层被阶段目标截胡，支线照样做不出来 —— 所以要按依赖闭包逐层验。
    //
    // ⚠️ C1 批次扩展：护栏的「目标集合」从「支线候选品」扩到
    // 「支线候选品 ∪ 前任日志载体」。理由：日志载体也是玩家必须做得出来的东西，
    // 同样的截胡会把 8 篇日志变成拿不到的内容。闭包逻辑不变，只是多了一批种子。
    const branchTargets = new Set<string>();
    for (const branch of BRANCHES) {
      for (const options of branch.requires) {
        for (const id of options) branchTargets.add(id);
      }
    }
    // 日志载体也是必须可达的目标（C1 批次新增）
    for (const log of LOGS) branchTargets.add(log.carrierId);

    // 反查：能产出某 id 的配方。
    //
    // ⚠️ C1 批次修一个既有缺陷：这里原来用「无序对 `${a}|${b}`」做键，
    // 却用**物品 id** 去查（`producersOf.get(id)`）—— 键和查询对不上，
    // 查出来永远是 undefined，闭包恒为空 → 护栏是**空跑**的（vacuous pass）。
    // 现在改成按**产物**建键。
    const producersOf = new Map<string, { a: string; b: string }>();
    for (const r of RECIPES) {
      if (!producersOf.has(r.out)) producersOf.set(r.out, { a: r.a, b: r.b });
    }

    // 闭包：从候选品往下找材料，直到全是可捡的 base 物品
    const closure = new Map<string, { a: string; b: string }>();
    const queue = [...branchTargets];
    const seen = new Set<string>(branchTargets);
    while (queue.length) {
      const id = queue.shift()!;
      const hit = producersOf.get(id);
      if (!hit) continue; // base 物品，没有上游配方
      closure.set(id, hit);
      for (const m of [hit.a, hit.b]) {
        if (!seen.has(m)) {
          seen.add(m);
          queue.push(m);
        }
      }
    }

    // 闭包里每条配方，在阶段 3 的三个步骤位上都必须得到**同一个产物**。
    //
    // ⚠️ C1 批次修判定口径：原来要求 `result.kind === 'recipe'`，
    // 但 R8 `crowbar+fuel→generator` 与 s3-2、R9 `echo+broom→hourglass` 与 s3-3
    // 是**同构**的 —— 它们在阶段 3 被阶段目标命中时，产物跟精确配方**完全一样**，
    // 玩家拿到的就是想要的东西，不构成截胡。
    // 所以判据统一为「产物是否相同」，不再看 kind。
    const culprits: string[] = [];
    for (const [out, r] of closure) {
      for (let stepIndex = 0; stepIndex < S3_STEPS.length; stepIndex++) {
        const { result } = resolveMix(r.a, r.b, at(3, stepIndex));
        if (result.output !== out) {
          culprits.push(`${r.a}+${r.b}→${out} 在 s3-${stepIndex + 1} 被截胡（${result.kind}→${result.output}）`);
        }
      }
    }
    expect(culprits).toEqual([]);
  });

  it('⑧d 前任日志载体不被阶段 1 / 2 的目标链**永久**截胡（8 件逐条验证）', () => {
    // ⑧c 只验阶段 3，且只验「阶段 3 三步都安全」。日志载体 R16–R23 分别在
    // 阶段 1 / 2 / 3 才有材料，所以还要验阶段 1、2。
    //
    // ⚠️ C1 批次修断言口径：原来要求「每个步位都不能被阶段目标吞掉」——
    // 这**过严**。阶段 2 的 s2-1（实体+实体）/ s2-3（风险+实体）门槛极宽，
    // 30+ 条既有配方（theoryfuel / menu / landdeed / toolstand / warmchair …）
    // 都在这些步位被阶段目标优先命中 —— 这是「阶段目标 > 精确配方」的**正常设计**，
    // 不是缺陷（阶段目标本身就是玩家要推进的主线）。
    //
    // 真正的护栏是：**每件载体在每个阶段，至少存在一个步位能命中精确配方**，
    // 也就是「不会被永久截胡、永远有一条路能走」。
    // 顺带把安全步位写进断言消息，失败时能直接看出该在第几步做。
    const logCarriers = LOGS.map((l) => l.carrierId);
    expect(logCarriers).toHaveLength(8);

    const culprits: string[] = [];
    for (const log of LOGS) {
      // 找出产出该载体的配方
      const r = RECIPES.find((x) => x.out === log.carrierId);
      if (!r) {
        culprits.push(`${log.carrierId} 没有配方`);
        continue;
      }
      for (const stage of [1, 2, 3] as const) {
        const steps = STAGES[stage - 1]!.steps;
        const safe: number[] = [];
        for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
          const { result } = resolveMix(r.a, r.b, at(stage, stepIndex));
          if (result.output === log.carrierId) safe.push(stepIndex + 1);
        }
        if (safe.length === 0) {
          culprits.push(
            `${r.a}+${r.b}→${log.carrierId} 在阶段 ${stage} 的所有步位都被截胡（无任何可命中步位）`,
          );
        }
      }
    }
    expect(culprits).toEqual([]);
  });

  it('⑧f 载体的完整依赖链：每层非 base 节点都可合成，且每阶段都有可命中步位', () => {
    // ⚠️ C2 批次补 QA 提的断言缺口。
    //
    // 原来的 ⑧d 只验「载体自身的直接配方」（`r.a + r.b → carrier`）。
    // 但载体往往**不是**一步做出来的 —— 它的材料本身可能是合成产物：
    //   log_q1  ← hourglass ← echo + broom ← base
    // 中间层如果被阶段目标截胡，玩家就**永远拿不到材料**，
    // 载体那条配方再安全也没用 —— ⑧d 会漏掉这一层。
    //
    // 所以这里把断言扩到「载体的完整依赖链」：
    // 对每件载体的每层节点，断言「每个阶段至少存在一个步位能命中它」。
    //
    // ## ⚠️ 判定口径（两个必须写准的简化，别让后来人误读）
    //
    // **简化一：「查不到产出处」不等于「这是 base 物品」。**
    // ⚠️ 初版这里用 `if (!producers) continue;` 来跳过叶子 ——
    // 那等于把「这条产出处不存在」当成「这是基础物品可以直接捡」。
    // 于是**任何"某层材料彻底无法合成"的回归，都让那一层直接从断言视野里消失**，
    // 断言恒过（team-lead 变异测试证实的盲区：
    // 删掉 `recipes.ts` 里 `crowbar + fuel → generator` 这条产出处后，
    // `generator` 查不到产出处 → 被当成 base 跳过 → ⑧f 不红）。
    //
    // 现在改成用 **`items.ts` 的 `kind`** 判定「这是不是可直接捡的基础物品」：
    // `kind === 'base'` → 叶子（可直接捡），但仍要验它**真的在某个区域的地面池里**
    // （不在地面池 = 捡不到 = 同样不可达）；
    // `kind !== 'base'` → 必须**有产出处**，没有就是缺陷（永远做不出来），
    // red。载体自身的**直接材料**也在链上，同样受这两条约束。
    //
    // **简化二：只要求「每个阶段至少一个步位能命中」，不要求步位顺序可达。**
    // 真实玩法里玩家是**按步位顺序推进**的 —— 阶段 1 的第 1 步和第 3 步不是随便选的，
    // 玩家在第 1 步时只能用第 1 步能命中的配方。
    // 所以「阶段 1 第 1 步能命中 X、阶段 1 第 3 步也能命中 X」和
    // 「阶段 1 第 1 步就能命中 X」在**实际可达性上是不同的**：
    // 后者玩家一定能做到，前者玩家如果在前面的步位把材料用掉了，可能就做不成。
    //
    // 本断言**接受这个简化**：材料消耗后可以重新捡（地面分布每次合成后会重刷，
    // base 物品会重新铺到地上），且 `world.test.ts` 的「10 万次随机游玩模拟」
    // 已经从**整体**上覆盖了可达性。这里守的是**更细的维度**：
    // 「某层材料在某个阶段被阶段目标**完全**截胡」——那种情况下连重新捡都救不了，
    // 因为该阶段的每一个步位都会把材料吃掉。
    //
    // 「命中」的口径：一个产物可能有多条配方（`RECIPES` 里同产物多条）。
    // 只要**任意一条配方**在某个步位能产出它，就算可达 ——
    // 玩家可以换配方做，硬绑某一条配方会误报。
    const producersOf = new Map<string, { a: string; b: string }[]>();
    for (const r of RECIPES) {
      const list = producersOf.get(r.out) ?? [];
      list.push({ a: r.a, b: r.b });
      producersOf.set(r.out, list);
    }

    /** 某产物在指定阶段是否可达（任意配方 × 任意步位命中） */
    const reachableInStage = (out: string, stage: 1 | 2 | 3): number[] => {
      const steps = STAGES[stage - 1]!.steps;
      const safe: number[] = [];
      for (const r of producersOf.get(out) ?? []) {
        for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
          const { result } = resolveMix(r.a, r.b, at(stage, stepIndex));
          if (result.output === out) {
            safe.push(stepIndex + 1);
            break; // 该配方在此阶段可用即可
          }
        }
      }
      return [...new Set(safe)].sort((x, y) => x - y);
    };

    // 可捡的物品 = 某个区域地面池里的成员（`world.ts` 的 distribute 只铺这些）
    const pickable = new Set<string>(Object.values(AREA_POOLS).flat());

    const culprits: string[] = [];
    for (const log of LOGS) {
      // 从载体往下 BFS，逐层展开依赖链（**载体的直接材料也在链上**）
      const seen = new Set<string>([log.carrierId]);
      const queue: string[] = [log.carrierId];
      const chain: string[] = [];
      while (queue.length) {
        const id = queue.shift()!;
        chain.push(id);
        for (const r of producersOf.get(id) ?? []) {
          for (const m of [r.a, r.b]) {
            if (!seen.has(m)) {
              seen.add(m);
              queue.push(m);
            }
          }
        }
      }

      for (const id of chain) {
        const item = ITEM_MAP[id];
        if (!item) {
          culprits.push(`${log.carrierId} 的依赖链上 ${id} 不是存在的物品`);
          continue;
        }

        if (item.kind === 'base') {
          // 叶子：可直接捡。但必须真的在某个区域的地面池里 ——
          // 不在地面池 = 玩家永远捡不到 = 同样不可达。
          if (!pickable.has(id)) {
            culprits.push(`${log.carrierId} 的基础材料 ${id} 不在任何区域的地面池里（捡不到）`);
          }
          continue; // base 不需要合成，不受「被截胡」影响
        }

        // 非 base：必须有产出处。没有 = 永远做不出来 = 缺陷（不能跳过！）
        const producers = producersOf.get(id) ?? [];
        if (producers.length === 0) {
          culprits.push(
            `${log.carrierId} 的依赖链上 ${id}（kind=${item.kind}）没有任何产出处 —— 永远做不出来`,
          );
          continue;
        }

        // 有产出处：每个阶段至少一个可命中步位（不被阶段目标完全截胡）
        for (const stage of [1, 2, 3] as const) {
          const safe = reachableInStage(id, stage);
          if (safe.length === 0) {
            culprits.push(
              `${log.carrierId} 的中间产物 ${id} 在阶段 ${stage} 的所有步位都被截胡（无任何可命中步位）`,
            );
          }
        }
      }
    }
    expect(culprits).toEqual([]);
  });

  it('⑧g 正向可达性：每件载体都能从可捡的基础物品有限次合成得到（闭包证明）', () => {
    // ⑧f 是**反向**走（从载体往下找材料），它能发现「中间产物在某阶段被完全截胡」。
    // 但反向走有一个结构性盲区：**正向可达性**（base → … → 载体）证明不了。
    //
    // 这条用**正向闭包**补上：
    // 1. 起点集合 = 所有 `kind === 'base'` 且在某个区域地面池里的物品（可直接捡）
    // 2. 不动点迭代：某条配方 `a + b → out` 的 a、b 都在集合里 → out 也进集合
    // 3. 断言每件载体都在闭包里
    //
    // 「不动点」这一步是关键：闭包里的物品**互相依赖**也能被推出来
    // （`valvework ← mirror + tape`、`toolstand ← valvework + tire`），
    // 单趟扫描推不出来。
    //
    // ⚠️ 这条与 `playthrough.test.ts` 的「所有配方产物都能从基础物品经过有限次合成得到」
    // 覆盖范围不同：那条验的是**全部配方产物**，这条验的是**8 件日志载体**
    // （载体的直接材料 + 中间产物必须同时可合成），
    // 并且**故意不要求中间产物在某个阶段不被截胡** —— 那是 ⑧f 的维度。
    //
    // 变异测试（删掉 `recipes.ts` 里 `crowbar + fuel → generator`）：
    // `generator` 推不进闭包 → `log_reel1`（= generator + note）推不进 → **本条变红**。
    const pickableBase = ITEMS.filter(
      (i) => i.kind === 'base' && Object.values(AREA_POOLS).flat().includes(i.id),
    ).map((i) => i.id);

    const derivable = new Set<string>(pickableBase);
    let changed = true;
    while (changed) {
      changed = false;
      for (const r of RECIPES) {
        if (derivable.has(r.out)) continue;
        if (derivable.has(r.a) && derivable.has(r.b)) {
          derivable.add(r.out);
          changed = true;
        }
      }
    }

    const culprits = LOGS.filter((l) => !derivable.has(l.carrierId)).map(
      (l) => `${l.carrierId} 无法从可捡的基础物品有限次合成得到`,
    );
    expect(culprits).toEqual([]);
  });

  it('⑧e 阶段 3 走完后回归纯配方判定，8 件日志载体仍可合成', () => {
    // buildDone 之后 stepIndex = 3 = steps.length → 内层守卫放行。
    // 这条是「建设期完成后还能不能补合日志载体」的保证：
    // 玩家在建设期完成前可能错过了 L1–L5 的材料，完成后必须还有路可走。
    const state: SaveState = {
      ...createInitialState(),
      stage: 3,
      stepIndex: 3,
      buildDone: true,
    };
    const culprits: string[] = [];
    for (const log of LOGS) {
      const r = RECIPES.find((x) => x.out === log.carrierId);
      if (!r) continue;
      const { result } = resolveMix(r.a, r.b, at(3, state.stepIndex));
      if (result.output !== log.carrierId) {
        culprits.push(`${log.carrierId} 在建设期完成后被截胡（${result.kind}→${result.output}）`);
      }
    }
    expect(culprits).toEqual([]);
  });
});
