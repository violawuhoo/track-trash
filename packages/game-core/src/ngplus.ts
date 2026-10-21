/**
 * 二周目（New Game+）核心逻辑（C2 批次）。
 *
 * GDD §7.1–§7.3 的工程落点。这个文件只放**纯函数**：
 * 判定、归一化、状态搬运 —— 不碰 DOM、不碰 localStorage、不碰网络。
 *
 * ## 三个核心概念
 *
 * | 概念 | 含义 | 存放位置 |
 * |---|---|---|
 * | 本周目状态 | 背包 / 阶段 / 天数 / 世界日志…… | `SaveState` 其余字段 |
 * | 跨周目档案 | 已解锁结局 / 已读日志 / 走过的支线 / 周目数 | `SaveState.ngPlus` |
 * | 单周目内已获得 | 载体记账 | `SaveState.logsFound` |
 *
 * `logsFound`（C1，单周目）与 `ngPlus.readLogs`（跨周目）是**两个不同的东西**：
 * 前者是「本周目合出过哪些载体」，后者是「这辈子读过哪些篇目」。
 * 二周目里 `logsFound` 清零，但 `readLogs` 保留 —— 于是旧篇目**不再需要重新解锁**
 * （GDD §7.1 G1：读过即记住）。
 *
 * ## 归一化（不 bump `schemaVersion`）
 *
 * `normalizeNgPlus()` 同时处理三种输入：
 * 1. `undefined`（老存档没这个键）→ 一周目空档案（`cycle: 1`）
 * 2. `true` / `false`（A2 落的布尔语义位）→ 见下方「布尔迁移点」
 * 3. 对象形态 → 逐键防御性归一化
 *
 * ### 布尔迁移点
 *
 * A2 落的 `ngPlus: true` 语义是「二周目已解锁」。
 * C2 把它归一化成 **「`cycle >= 2` 的空档案」**：
 * `cycle: 2` + 三个空数组。
 *
 * 为什么要 cycle 从 2 起算：布尔位为 `true` 说明玩家已经完成过至少一周目，
 * 所以周目数不应从 1 起算。三个集合是空的 —— 布尔位本身不携带任何结局 / 日志 /
 * 支线信息，不能凭空造出来。
 *
 * ⚠️ 副作用（已知且可接受）：`endings` 为空 → 二周目入口条件
 * `cycle >= 1 && endings.length >= 1` 不成立 → **入口不可见**。
 * 玩家需要在新周目里再完成一个结局，入口才会出现。这符合「入口只在真正
 * 玩过结局之后才出现」的原始设计意图。
 */
import { LOG_BY_ID } from './logs';
import type {
  BranchId,
  EndingId,
  NgPlusState,
  SaveState,
} from './types';

/** 全部合法结局 id（图鉴 5 格）。用于归一化时过滤脏数据。 */
export const ENDING_IDS: readonly EndingId[] = Object.freeze([
  'leave',
  'teashop',
  'birthday',
  'stay',
  'free',
]);

/** 全部合法支线 id */
export const BRANCH_IDS: readonly BranchId[] = Object.freeze([
  'ship',
  'teashop',
  'birthday',
  'stay',
]);

/** 新周目的空档案（一周目） */
export function createNgPlus(): NgPlusState {
  return { cycle: 1, endings: [], readLogs: [], branchesHistory: [] };
}

/** 结局 id 合法性 */
export function isEndingId(v: unknown): v is EndingId {
  return typeof v === 'string' && (ENDING_IDS as readonly string[]).includes(v);
}

/** 支线 id 合法性 */
export function isBranchId(v: unknown): v is BranchId {
  return typeof v === 'string' && (BRANCH_IDS as readonly string[]).includes(v);
}

/**
 * 读档归一化：把任意形状的 `ngPlus` 变成结构完整的 `NgPlusState`。
 *
 * **纯函数 + 幂等**：对已经归一化的对象再跑一次，结果不变。
 * 存档可能被手改过，所以每一项都要防御坏形状，不能只判 `=== undefined`。
 */
export function normalizeNgPlus(raw: unknown): NgPlusState {
  // 缺字段 → 一周目空档案
  if (raw === undefined || raw === null) return createNgPlus();

  // 布尔迁移点：A2 的语义位
  if (typeof raw === 'boolean') {
    // true = 「二周目已解锁」→ cycle ≥ 2 的空档案
    // false = 「还没解锁过」→ 一周目空档案
    return raw
      ? { cycle: 2, endings: [], readLogs: [], branchesHistory: [] }
      : createNgPlus();
  }

  if (typeof raw !== 'object') return createNgPlus();

  const o = raw as Partial<Record<keyof NgPlusState, unknown>>;

  // cycle：必须是 ≥1 的整数。0 / 负数 / NaN / 字符串 → 1
  let cycle = 1;
  if (typeof o.cycle === 'number' && Number.isFinite(o.cycle)) {
    const c = Math.floor(o.cycle);
    if (c >= 1) cycle = c;
  }

  return {
    cycle,
    endings: uniqFilter(o.endings, isEndingId),
    readLogs: uniqFilter(o.readLogs, (v): v is string =>
      typeof v === 'string' && !!LOG_BY_ID[v],
    ),
    branchesHistory: uniqFilter(o.branchesHistory, isBranchId),
  };
}

/** 数组去重 + 类型过滤（只保留通过判定的项，保留原始顺序） */
function uniqFilter<T>(raw: unknown, ok: (v: unknown) => v is T): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const v of raw) {
    if (!ok(v)) continue;
    if (out.includes(v)) continue;
    out.push(v);
  }
  return out;
}

/**
 * 二周目入口是否可见。
 *
 * GDD §7.2：完成任意一个结局后，二周目入口才出现。
 * 一周目内不可见 —— 避免玩家在还没玩明白时把「重开」当成「跳过」。
 */
export function ngPlusUnlocked(np: NgPlusState): boolean {
  return np.cycle >= 1 && np.endings.length >= 1;
}

/** 记录一个已解锁结局（去重） */
export function recordEnding(np: NgPlusState, ending: EndingId): NgPlusState {
  if (!isEndingId(ending)) return np;
  if (np.endings.includes(ending)) return np;
  return { ...np, endings: [...np.endings, ending] };
}

/** 记录一篇已读日志（去重） */
export function recordReadLog(np: NgPlusState, logId: string): NgPlusState {
  if (!LOG_BY_ID[logId]) return np;
  if (np.readLogs.includes(logId)) return np;
  return { ...np, readLogs: [...np.readLogs, logId] };
}

/**
 * 记录一条走过的支线（去重）
 */
export function recordBranch(np: NgPlusState, branchId: BranchId): NgPlusState {
  if (!isBranchId(branchId)) return np;
  if (np.branchesHistory.includes(branchId)) return np;
  return { ...np, branchesHistory: [...np.branchesHistory, branchId] };
}

/**
 * 开新周目（二周目）。
 *
 * GDD §7.1：
 * - **保留**：`keepsakes` / `ngPlus.endings` / `ngPlus.readLogs` /
 *   `ngPlus.branchesHistory`，以及 `ngPlus.cycle += 1`。
 * - **重置**：`bag` / `discovered` / `day`(=1) / `areaId`(=crash) / `scene` /
 *   `stage`(=1) / `stepIndex`(=0) / `branches` / `accidents` / `log` /
 *   `ending`(=null) / `launchAttempts` / `launchFailures`。
 *   另外 C1 落的两项也重置：`crafts`(=0)（解锁条件用的合成计数）、
 *   `logsFound`(=[])（单周目载体记账；跨周目的「已读」在 `ngPlus.readLogs`）。
 *   `buildDone`(=false)（阶段 3 三步走满是世界进度，重做）。
 *
 * 「世界进度全部清零，只留下『你知道的东西』和『你拿到过的东西』」。
 */
export function startNextCycle(state: SaveState): SaveState {
  const np: NgPlusState = {
    ...state.ngPlus,
    cycle: Math.max(1, Math.floor(state.ngPlus.cycle)) + 1,
  };
  return {
    ...state,
    day: 1,
    areaId: 'crash',
    scene: [],
    bag: {},
    discovered: {},
    stage: 1,
    stepIndex: 0,
    buildDone: false,
    crafts: 0,
    logsFound: [],
    branches: { ship: false, teashop: false, birthday: false, stay: false },
    accidents: 0,
    log: [
      {
        day: 1,
        kind: '系统',
        text: `第 ${np.cycle} 周目。地面上的东西都回到原位。`,
      },
    ],
    ending: null,
    launchAttempts: 0,
    launchFailures: 0,
    keepsakes: state.keepsakes,
    ngPlus: np,
  };
}

/**
 * 「留在这里继续」—— 结局后不重开，回到自由模式继续玩。
 *
 * GDD §7.2：仅 stay / free 结局页有此出口。
 * **不清档**：`keepsakes` / `ngPlus` / `logsFound` / `branches` / 背包 / 天数
 * 全部保留，只把 `ending` 清成 null（否则回到游戏界面后 ending 还挂着，
 * 结局页的「结局数据缺失」分支会一直命中）。
 */
export function continueAfterEnding(state: SaveState): SaveState {
  if (state.ending === null) return state;
  return {
    ...state,
    ending: null,
    log: [
      ...state.log,
      {
        day: state.day,
        kind: '系统',
        text: '结局那一页翻过去了。日子照过。',
      },
    ],
  };
}
