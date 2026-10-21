import { ITEM_MAP, getItem } from './items';
import { ENDING_LINES, lines, missingLine, type DialogueKey } from './dialogue';
import { launchCheck, rollLaunch, allBranchStatus } from './launch';
import { resolveMix } from './resolve';
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

/** 新游戏 */
export function createInitialState(): SaveState {
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
    ngPlus: false,
    branches: { ship: false, teashop: false, birthday: false, stay: false },
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

/** 拾取场景中的物品（不耗天数） */
export function pickFromScene(
  state: SaveState,
  itemId: string,
): PickResult | null {
  const idx = state.scene.indexOf(itemId);
  if (idx < 0) return null;

  const scene = [...state.scene];
  scene.splice(idx, 1);

  const firstTime = !state.discovered[itemId];
  const item = getItem(itemId);

  return {
    state: {
      ...state,
      scene,
      bag: addItem(state.bag, itemId),
      discovered: { ...state.discovered, [itemId]: true },
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
  let next: SaveState = {
    ...state,
    bag: addItem(bag, output.id),
    day: state.day + 1,
  };

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
    dialogueKey = isAccident ? 'accident' : 'craft';
  }

  // ── 支线检查（阶段 3） ──
  if (next.stage === 3) {
    for (const status of allBranchStatus(next.bag)) {
      if (status.done && !next.branches[status.id]) {
        const branch = BRANCHES.find((b) => b.id === status.id)!;
        next = {
          ...next,
          branches: { ...next.branches, [status.id]: true },
          keepsakes: next.keepsakes.includes(branch.keepsake)
            ? next.keepsakes
            : [...next.keepsakes, branch.keepsake],
          log: appendLog(next.log, {
            day: next.day,
            kind: '支线',
            text: `支线「${branch.name}」达成。`,
          }),
        };
        // 奶茶店 / 生日是直接结局；飞船要玩家自己决定何时起飞
        if (status.id !== 'ship') ending = branch.ending;
      }
    }
  }

  return { ok: true, state: next, outcome, dialogueKey, ...(ending ? { ending } : {}) };
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
    return `这个组合对应第 ${outcome.hint.laterStep.index + 1} 步。先把前面那步做完。`;
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
  if (launchCheck(state.bag) !== 'none') out.push('leave');
  // GDD §2.5 拍板口径：「自由模式」= 完成迫降期（stage ≥ 2）后随时可选、且永久可选。
  // stage 1 不可选 —— 玩家还没学会合成、还没理解标签并集就能结束游戏，
  // 等于把核心机制变成可跳过项。
  // 完成 stay 之后 free 仍可选：那是「我建好了这里，但我还是想走」的语义分叉。
  if (state.stage >= 2) out.push('free');
  return out;
}

export { lines };
export type { BranchId };
