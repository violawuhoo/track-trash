import { ITEM_MAP, getItem } from './items';
import { ENDING_LINES, lines, missingLine, type DialogueKey } from './dialogue';
import { launchCheck, rollLaunch, allBranchStatus } from './launch';
import { CARRIER_TO_LOG } from './logs';
import { createNgPlus, recordBranch, recordEnding } from './ngplus';
import { resolveMix } from './resolve';
import { recipeWhy } from './recipes';
import { pickSearchWithHints } from './search';
import { AREAS, BRANCHES, STAGE_KEEPSAKES } from './stages';
import type {
  AreaId,
  BranchId,
  EndingId,
  LogEntry,
  MixOutcome,
  SaveState,
} from './types';

export const SCHEMA_VERSION = 1;
export const MAX_LOG = 200;

/**
 * 背包容量（按「种类格」计，同种堆叠不占新格）。
 *
 * 这是乐趣改版（2026-10-22）的核心约束：没有容量就没有取舍——
 * 「捡这个还是捡那个」「留原料还是留成品」只有在格子有限时才成立。
 * 满包时：合成照常（净减格数，是腾空间的方式），拾取被挡，扔掉可以腾格。
 */
export const BAG_CAP = 10;

/** 背包占了多少格 */
export function bagSlots(bag: Record<string, number>): number {
  let n = 0;
  for (const v of Object.values(bag)) {
    if (v > 0) n++;
  }
  return n;
}

/**
 * 能不能拿起 incoming 这件东西。
 * 已有种类不占新格（堆叠）；新种类在满格时被挡。
 */
export function canTake(
  bag: Record<string, number>,
  incomingId: string,
): boolean {
  if ((bag[incomingId] ?? 0) > 0) return true;
  return bagSlots(bag) < BAG_CAP;
}

/**
 * 杰作率：合成有 20% 概率「手感出奇地好」，产出 ×2。
 * 确定性 roll（同 day + 同材料永远同结果）——可测试、可复现、不依赖 rng 注入。
 */
export const MASTERPIECE_RATE = 20;

export function isMasterpieceCraft(
  day: number,
  a: string,
  b: string,
): boolean {
  // 合成无序（a+b 与 b+a 同一配方）→ 哈希键排序，保证对称
  const key = [a, b].sort().join('|');
  let h = 2166136261;
  const s = `${key}|${day}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100 < MASTERPIECE_RATE;
}

/**
 * 新游戏。
 *
 * `runSeed`：本局的剧本种子（迹象系统）。默认 0 = 老档 / 无种子，
 * 走固定剧本（无迹象）—— 保持既有测试与调用方的确定性不变。
 * web 的 `newGame` 传随机种子；`startNextCycle` 走 core 的确定性派生。
 */
export function createInitialState(runSeed = 0): SaveState {
  return {
    schemaVersion: SCHEMA_VERSION,
    day: 1,
    areaId: 'crash',
    scene: [],
    bag: {},
    discovered: {},
    stage: 1,
    stepIndex: 0,
    buildDone: false,
    // C2 批次：`ngPlus` 从布尔语义位扩成对象容器（GDD §7.3）。
    // 新档 = 一周目空档案。
    ngPlus: createNgPlus(),
    crafts: 0,
    logsFound: [],
    runSeed,
    // 探索动机改版：本局已触发的迹象 id。新档为空（还没有迹象可触发）；
    // `runSeed = 0`（老档）时永远为空（没有迹象）。
    signsFound: [],
    branches: { ship: false, teashop: false, birthday: false, stay: false, chaos: false },
    keepsakes: [],
    accidents: 0,
    log: [{ day: 1, kind: '系统', text: '迫降完成。信号器是坏的。' }],
    ending: null,
    launchAttempts: 0,
    launchFailures: 0,
  };
}

/** 追加日志，自动裁剪 */
export function appendLog(
  log: LogEntry[],
  entry: LogEntry,
): LogEntry[] {
  const next = [...log, entry];
  return next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next;
}

/** 背包加物品 */
export function addItem(
  bag: Record<string, number>,
  id: string,
  n = 1,
): Record<string, number> {
  return { ...bag, [id]: (bag[id] ?? 0) + n };
}

/** 背包扣物品，数量不足返回 null */
export function removeItem(
  bag: Record<string, number>,
  id: string,
  n = 1,
): Record<string, number> | null {
  const have = bag[id] ?? 0;
  if (have < n) return null;
  const next = { ...bag };
  if (have === n) delete next[id];
  else next[id] = have - n;
  return next;
}

/** 背包是否够两个物品（同一物品需要至少 2 个） */
export function hasPair(
  bag: Record<string, number>,
  a: string,
  b: string,
): boolean {
  if (a === b) return (bag[a] ?? 0) >= 2;
  return (bag[a] ?? 0) >= 1 && (bag[b] ?? 0) >= 1;
}

/**
 * 扔掉一整叠（腾出一个格子）。被扔的东西直接消失——
 * 星球不缺垃圾，不心疼；不做「扔回地面」，避免无限刷保底点的漏洞。
 */
export function dropItem(state: SaveState, id: string): SaveState | null {
  if ((state.bag[id] ?? 0) <= 0) return null;
  const bag = { ...state.bag };
  delete bag[id];
  return {
    ...state,
    bag,
    log: appendLog(state.log, {
      day: state.day,
      kind: '系统',
      text: `扔掉了「${getItem(id).name}」。背包腾出一个格子。`,
    }),
  };
}

/**
 * 搜索区域：+1 天，重刷场景。
 *
 * ⚠️ **v1 遗留 API，v2 的 web 端没有调用方**（v2 删掉了「搜索」按钮，物品固定铺在地面）。
 * 这里的跨区域 hint 日志玩家在 v2 里看不到。
 * v2 的活路径是 `missingAreaHints` → `apps/web/src/components/HintBar.tsx`。
 */
export function searchArea(
  state: SaveState,
  rng: () => number = Math.random,
): SaveState {
  const outcome = pickSearchWithHints({
    progress: { stage: state.stage, stepIndex: state.stepIndex },
    bag: state.bag,
    areaId: state.areaId,
    rng,
  });
  const scene = outcome.items;
  let log = appendLog(state.log, {
    day: state.day + 1,
    kind: '系统',
    text: `搜索了${state.areaId === 'crash' ? '坠毁点' : '附近'}，找到 ${scene.length} 样东西。`,
  });
  // 跨区域并集提示：当前区域凑不齐的标签，指路去别的已解锁区域拿。
  for (const hint of outcome.hints) {
    log = appendLog(log, {
      day: state.day + 1,
      kind: '系统',
      text: `还缺「${hint.tag}」。${AREAS[hint.areaId].name}那边有，去那边找。`,
    });
  }
  return {
    ...state,
    day: state.day + 1,
    scene,
    log,
  };
}

export interface PickResult {
  state: SaveState;
  firstTime: boolean;
}

/** 拾取场景中的物品（不耗天数）。满包拿不动新种类 → null */
export function pickFromScene(
  state: SaveState,
  itemId: string,
): PickResult | null {
  const idx = state.scene.indexOf(itemId);
  if (idx < 0) return null;
  if (!canTake(state.bag, itemId)) return null;

  const scene = [...state.scene];
  scene.splice(idx, 1);

  const firstTime = !state.discovered[itemId];
  const item = getItem(itemId);

  // 前任日志载体记账（B3，用户批准）。
  // 载体是普通物品，捡到 = 拿到那段记录 —— 与 `craft()` 产出载体时的口径一致
  // （见 craft 里约 L311 的注释）。载体不进 `AREA_POOLS`（GDD 约束 11：
  // 保底来源数稳定不受伤），这条路径只是「万一载体出现在场景里」的记账对齐。
  const pickedLogId = CARRIER_TO_LOG[itemId];
  const logsFound =
    pickedLogId && !state.logsFound.includes(pickedLogId)
      ? [...state.logsFound, pickedLogId]
      : state.logsFound;

  return {
    state: {
      ...state,
      scene,
      bag: addItem(state.bag, itemId),
      discovered: { ...state.discovered, [itemId]: true },
      logsFound,
      log: appendLog(state.log, {
        day: state.day,
        kind: '拾取',
        text: firstTime
          ? `第一次捡到「${item.name}」。${item.desc}`
          : `又捡到一个「${item.name}」。`,
      }),
    },
    firstTime,
  };
}

export type CraftResult =
  | {
      ok: true;
      state: SaveState;
      outcome: MixOutcome;
      dialogueKey: DialogueKey | null;
      /** 杰作：这次合成手感出奇地好，产出 ×2 */
      masterpiece: boolean;
      ending?: EndingId;
    }
  | { ok: false; reason: string };

/**
 * 合成。消耗两个物品，+1 天，产出结果。
 *
 * 顺序：扣材料 → 判定 → 加产物 → 推进阶段 → 检查支线 → 记账
 */
export function craft(
  state: SaveState,
  aId: string,
  bId: string,
): CraftResult {
  if (!ITEM_MAP[aId] || !ITEM_MAP[bId]) {
    return { ok: false, reason: '物品不存在' };
  }
  if (!hasPair(state.bag, aId, bId)) {
    return { ok: false, reason: '背包里的材料不够' };
  }

  let bag = state.bag;
  const afterA = removeItem(bag, aId);
  if (!afterA) return { ok: false, reason: '材料不足' };
  bag = afterA;
  const afterB = removeItem(bag, bId);
  if (!afterB) return { ok: false, reason: '材料不足' };
  bag = afterB;

  const outcome = resolveMix(aId, bId, {
    stage: state.stage,
    stepIndex: state.stepIndex,
  });

  const output = getItem(outcome.result.output);
  // 杰作 roll（确定性）：20% 概率 ×2。变率奖励——奖励大小不可预测，才有抽奖感。
  const masterpiece = isMasterpieceCraft(state.day, aId, bId);
  let next: SaveState = {
    ...state,
    bag: addItem(bag, output.id, masterpiece ? 2 : 1),
    day: state.day + 1,
    // 累计合成次数。GDD §6.2 的 L1 / L5 解锁条件挂在「合成次数 ≥ N」上，
    // 所以每一次成功的合成都要计数（含阶段目标命中与意外产物 —— 它们同样是「合成了一次」）。
    crafts: state.crafts + 1,
  };

  if (masterpiece) {
    next = {
      ...next,
      log: appendLog(next.log, {
        day: next.day,
        kind: '合成',
        text: '手感出奇地好——同样的材料，多整出来一个。',
      }),
    };
  }

  // 前任日志载体记账（C1 批次）。
  // 载体是普通合成产物，可以被消耗、可以重复合出 —— 所以记的是**日志 id 集合**，
  // 合出一次就记上，物品后来被用掉了也不收回（读过就记得）。
  //
  // ⚠️ 这里**不写** `ngPlus.readLogs`：那是「这辈子读过哪些篇目」，
  // 由玩家在日志面板里点开正文时才记（web 的 `readLog` 动作 → core `recordReadLog`）。
  // 「拿到载体」与「读过」是两件事，别混。
  const logId = CARRIER_TO_LOG[output.id];
  if (logId && !next.logsFound.includes(logId)) {
    next = { ...next, logsFound: [...next.logsFound, logId] };
  }

  let dialogueKey: DialogueKey | null = null;
  let ending: EndingId | undefined;

  // ── 阶段目标命中 ──
  if (outcome.result.kind === 'stage') {
    next = {
      ...next,
      stepIndex: outcome.result.nextStepIndex,
      log: appendLog(next.log, {
        day: next.day,
        kind: '合成',
        text: `${getItem(aId).name} + ${getItem(bId).name} → ${output.name}。${output.desc}`,
      }),
    };

    if (outcome.result.stageCleared && (state.stage === 1 || state.stage === 2)) {
      const clearedStage = state.stage;
      const keepsake = STAGE_KEEPSAKES[clearedStage];
      next = {
        ...next,
        stage: (clearedStage + 1) as 2 | 3,
        stepIndex: 0,
        areaId: clearedStage === 1 ? 'junkyard' : 'market',
        scene: [],
        keepsakes: next.keepsakes.includes(keepsake)
          ? next.keepsakes
          : [...next.keepsakes, keepsake],
        log: appendLog(next.log, {
          day: next.day,
          kind: '阶段',
          text: clearedStage === 1
            ? '迫降期完成。信号器修好了，垃圾山解锁。'
            : '探索期完成。外星集市废墟和怪石洞窟解锁。',
        }),
      };
      dialogueKey = clearedStage === 1 ? 'clear1' : 'clear2';
    } else if (outcome.result.stageCleared && state.stage === 3) {
      // ── 阶段 3 三步走满（GDD §2.4）──
      // 不进 stage 4：stage 保持 3，stepIndex 停在 3（不再推进），
      // 置 buildDone = true，发建设纪念品，写一条阶段日志。
      // 幂等：keepsakes 已含则不重复发放。
      const keepsake = STAGE_KEEPSAKES[3];
      next = {
        ...next,
        stage: 3,
        // 三步走满 → stepIndex 停在三步之后（= steps.length = 3），不再推进。
        // 这样 resolve.ts 的内层守卫 `stepIndex < steps.length` 会放行，
        // 建设期完成后回归纯配方判定。
        stepIndex: outcome.result.nextStepIndex,
        buildDone: true,
        keepsakes: next.keepsakes.includes(keepsake)
          ? next.keepsakes
          : [...next.keepsakes, keepsake],
        log: appendLog(next.log, {
          day: next.day,
          kind: '阶段',
          text: '建设期完成。东西造出来了，接下来去哪你自己定。',
        }),
      };
      dialogueKey = 'clear3';
    } else {
      dialogueKey = 'craft';
    }
  } else {
    // 非阶段产出
    const isAccident =
      outcome.result.kind === 'accident' || outcome.result.kind === 'fallback';

    next = {
      ...next,
      accidents: isAccident ? next.accidents + 1 : next.accidents,
      log: appendLog(next.log, {
        day: next.day,
        kind: isAccident ? '意外' : '合成',
        text: isAccident
          ? `意外发现「${output.name}」。${output.desc}`
          : `${getItem(aId).name} + ${getItem(bId).name} → ${output.name}。${output.desc}`,
      }),
    };
    // 精确配方命中：把「合成理由」也写进日志——玩家翻日志时能对上账。
    if (outcome.result.kind === 'recipe') {
      const why = recipeWhy(aId, bId);
      if (why) {
        next = {
          ...next,
          log: appendLog(next.log, {
            day: next.day,
            kind: '合成',
            text: why,
          }),
        };
      }
    }
    dialogueKey = isAccident ? 'accident' : 'craft';
  }

  // ── 支线检查（A3 B-soft：stage >= 2 即可达成，ship 仍锁 stage 3） ──
  //
  // 改版动机：原判定 `stage === 3` 把「探索期（阶段 2）就攒齐槽位」的玩家
  // 一直挡到建设期走满 —— 流程被预先回答，自主性受损。
  // B-soft 口径：非 ship 支线在阶段 2 即可达成；**ship 仍只在 stage 3 判定**
  // （防速通主导策略：阶段 2 攒齐飞船四件套不该直接决定「回家」结局），
  // 且 `availableEndings` 的 leave 入口同步加 stage >= 3 门（见下）。
  if (next.stage >= 2) {
    for (const status of allBranchStatus(next.bag)) {
      // ship 完成仍只在 stage 3 判定：阶段 2 攒齐四件套不触发、不进结局。
      if (status.id === 'ship' && next.stage < 3) continue;
      if (status.done && !next.branches[status.id]) {
        const branch = BRANCHES.find((b) => b.id === status.id)!;
        next = {
          ...next,
          branches: { ...next.branches, [status.id]: true },
          // 跨周目支线历史（C2 批次 · G3「你认得路」）：这条支线这辈子走过。
          ngPlus: recordBranch(next.ngPlus, status.id),
          keepsakes: next.keepsakes.includes(branch.keepsake)
            ? next.keepsakes
            : [...next.keepsakes, branch.keepsake],
          log: appendLog(next.log, {
            day: next.day,
            kind: '支线',
            text: `支线「${branch.name}」达成。`,
          }),
        };
        // 奶茶店 / 生日 / 留下来是直接结局；飞船要玩家自己决定何时起飞。
        //
        // ⚠️ 这里必须把 ending 写进 `next.ending`（= SaveState.ending），
        // 不能只写返回值字段 `ending`：
        // 结局页（web 的 EndingScreen）读的是 `save.ending`，
        // 只写返回值会让页面拿到 null 并回退成 free —— 玩家做完「留下来」
        // 看到的却是「自由模式 / 没有目标了」。这与 finishGame() 的
        // 「进入结局：${ending}」日志口径保持一致。
        if (status.id !== 'ship') {
          ending = branch.ending;
          next = {
            ...next,
            ending: branch.ending,
            // 跨周目结局记账（C2 批次）：图鉴 5 格的解锁来源。
            ngPlus: recordEnding(next.ngPlus, branch.ending),
            log: appendLog(next.log, {
              day: next.day,
              kind: '结局',
              text: `进入结局：${branch.ending}`,
            }),
          };
        }
      }
    }
  }

  return {
    ok: true,
    state: next,
    outcome,
    dialogueKey,
    masterpiece,
    ...(ending ? { ending } : {}),
  };
}

/** 发起起飞。返回是否成功，以及新状态 */
export function attemptLaunch(
  state: SaveState,
  rng: () => number = Math.random,
): { ok: boolean; state: SaveState; mode: 'none' | 'forced' | 'full' } {
  const mode = launchCheck(state.bag);
  const ok = rollLaunch(mode, rng);

  if (mode === 'none') {
    return { ok: false, state, mode };
  }

  let next: SaveState = {
    ...state,
    launchAttempts: state.launchAttempts + 1,
  };

  if (ok) {
    next = {
      ...next,
      ending: 'leave',
      // 跨周目结局记账（C2 批次）
      ngPlus: recordEnding(next.ngPlus, 'leave'),
      keepsakes: next.keepsakes.includes('ks_ship')
        ? next.keepsakes
        : [...next.keepsakes, 'ks_ship'],
      log: appendLog(next.log, {
        day: next.day,
        kind: '结局',
        text: '起飞成功。离开星球。',
      }),
    };
  } else {
    next = {
      ...next,
      day: next.day + 1,
      launchFailures: next.launchFailures + 1,
      keepsakes: next.keepsakes.includes('ks_fail')
        ? next.keepsakes
        : [...next.keepsakes, 'ks_fail'],
      log: appendLog(next.log, {
        day: next.day,
        kind: '系统',
        text: '起飞失败。获得「起飞失败纪念章」。',
      }),
    };
  }

  return { ok, state: next, mode };
}

/** 选择结束（自由模式 / 已完成支线的结局） */
export function finishGame(
  state: SaveState,
  ending: EndingId,
): SaveState {
  return {
    ...state,
    ending,
    // 跨周目结局记账（C2 批次）：图鉴 5 格的解锁来源。
    ngPlus: recordEnding(state.ngPlus, ending),
    log: appendLog(state.log, {
      day: state.day,
      kind: '结局',
      text: `进入结局：${ending}`,
    }),
  };
}

/** 结局台词 */
export function endingLines(ending: EndingId): string[] {
  return ENDING_LINES[ending];
}

/** 缺标签提示文案 */
export function hintMessage(outcome: MixOutcome): string | null {
  if (!outcome.hint) return null;
  if (outcome.hint.laterStep) {
    // A5（提示降噪）：去掉命令语气（「先把前面那步做完」），
    // 改成两条路都摆出来的中性表述 —— 顺序由玩家自己定。
    return `这个组合像是后面要用的东西。先做前面的也行，先造它也行。`;
  }
  if (outcome.hint.missing.length > 0) {
    return missingLine(outcome.hint.missing);
  }
  return null;
}

/** 某区域的解锁判定 */
export function isAreaUnlocked(state: SaveState, area: AreaId): boolean {
  if (area === 'crash') return true;
  if (area === 'junkyard') return state.stage >= 2;
  return state.stage >= 3;
}

/** 已完成支线对应的结局入口 */
export function availableEndings(state: SaveState): EndingId[] {
  const out: EndingId[] = [];
  for (const b of BRANCHES) {
    if (state.branches[b.id] && b.id !== 'ship') out.push(b.ending);
  }
  // A3 B-soft：leave 入口与 BagDrawer 已有的 `showLaunch = stage === 3 && mode !== 'none'`
  // 对齐 —— 阶段 2 攒齐飞船四件套不开放起飞入口（防速通主导策略）。
  if (state.stage >= 3 && launchCheck(state.bag) !== 'none') out.push('leave');
  // GDD §2.5 拍板口径：「自由模式」= 完成迫降期（stage ≥ 2）后随时可选、且永久可选。
  // stage 1 不可选 —— 玩家还没学会合成、还没理解标签并集就能结束游戏，
  // 等于把核心机制变成可跳过项。
  // 完成 stay 之后 free 仍可选：那是「我建好了这里，但我还是想走」的语义分叉。
  if (state.stage >= 2) out.push('free');
  return out;
}

export { lines };
export type { BranchId };
