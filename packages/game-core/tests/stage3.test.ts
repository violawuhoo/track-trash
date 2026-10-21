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
