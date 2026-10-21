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
 * 「开新周目」时，玩家会**保留**什么 / **失去**什么 —— 给 UI 确认页用的数据。
 *
 * ## 为什么放在 core 而不是 web
 *
 * 2026 QA 复审抓到一个真实缺陷：确认页的「重置」清单漏了 `crafts` 与 `logsFound`，
 * 而 `crafts` 归零会**直接卡住 L1（需合成 3 次）与 L5（需合成 14 次）的解锁**。
 * 玩家看完清单以为二周目能直接重读 L1–L5，实际上要重新攒次数。
 *
 * 漏字段的根因是**清单是人手抄的**：core 加字段 → 没人记得去改 UI 的清单。
 * 所以清单搬到 core，**跟 `startNextCycle()` 放在一起**，
 * 并由 `ngplus.test.ts` 的断言守着：
 * **每个被 `startNextCycle` 改动/保留的字段，都必须出现在这两个列表里。**
 * core 加字段却没加清单 → 断言红。
 *
 * ## 字段口径
 *
 * - `fields`：这条文案覆盖的存档字段（可能多个，合成一句话）。
 *   守恒断言按 `fields` 的并集与实际行为比对。
 * - `countOf`：UI 要显示的计数来源（「N 个」里的 N 从哪来）。
 *   确认页把 `ngPlus` 的三个子集合和 `keepsakes` 拆成四条各带计数，
 *   所以这里给的是**子集合名**而不是顶层字段名。
 * - `text`：给玩家看的一句话。措辞是**文策渊定稿**
 *   （`docs/design/CONTENT-v3-NGPLUS-UI-COPY.md`），
 *   里面用 `【N】` 占位待插入的计数。core 只管「不许漏字段 + 不许改文案」。
 * - `note`：「——」之后的**后果说明**，UI 用次要色渲染（定稿 §1.2）。
 */
export interface NextCycleBullet {
  /** 这一条覆盖的存档字段 */
  fields: readonly (keyof SaveState)[];
  /** UI 计数的来源；不填 = 这条不显示计数 */
  countOf?: 'endings' | 'readLogs' | 'branchesHistory' | 'keepsakes' | 'cycle';
  /** 给玩家看的一句话。`【N】` 会被计数替换 */
  text: string;
  /** 「——」之后的后果说明（可选） */
  note?: string;
}

/**
 * 保留清单（`startNextCycle` 原样带着走）。
 *
 * 文案是**定稿**（2026-10-22 文策渊，`docs/design/CONTENT-v3-NGPLUS-UI-COPY.md` §1）。
 * 计数不加分隔符（不加「共」字、不加千分位）；N = 0 时整行照常显示。
 *
 * | # | 文案 | 插入源 | 字段 |
 * |---|---|---|---|
 * | K1 | 已解锁的结局（【N】个）—— 那几格不会灭 | `endings.length` | `ngPlus.endings` |
 * | K2 | 读过的前任记录（【N】篇）—— 读过的不用再读一遍 | `readLogs.length` | `ngPlus.readLogs` |
 * | K3 | 走过的支线（【N】条）—— 面板上会标出「上次走过」 | `branchesHistory.length` | `ngPlus.branchesHistory` |
 * | K4 | 纪念品（【N】件）—— 你拿到的东西不会丢 | `keepsakes.length` | `keepsakes` |
 * | K5 | 这是你的第 【N】 周目 | `cycle + 1` | `ngPlus.cycle` |
 */
export const NEXT_CYCLE_KEPT: readonly NextCycleBullet[] = Object.freeze([
  Object.freeze({
    fields: Object.freeze(['ngPlus'] as const),
    countOf: 'endings' as const,
    text: '已解锁的结局（【N】个）',
    note: '那几格不会灭',
  }),
  Object.freeze({
    fields: Object.freeze(['ngPlus'] as const),
    countOf: 'readLogs' as const,
    text: '读过的前任记录（【N】篇）',
    note: '读过的不用再读一遍',
  }),
  Object.freeze({
    fields: Object.freeze(['ngPlus'] as const),
    countOf: 'branchesHistory' as const,
    text: '走过的支线（【N】条）',
    note: '面板上会标出「上次走过」',
  }),
  Object.freeze({
    fields: Object.freeze(['keepsakes'] as const),
    countOf: 'keepsakes' as const,
    text: '纪念品（【N】件）',
    note: '你拿到的东西不会丢',
  }),
  Object.freeze({
    fields: Object.freeze(['ngPlus'] as const),
    countOf: 'cycle' as const,
    text: '这是你的第 【N】 周目',
  }),
]);

/**
 * 重置清单（`startNextCycle` 清零 / 归位）。
 *
 * 文案是**定稿**（2026-10-22 文策渊，`docs/design/CONTENT-v3-NGPLUS-UI-COPY.md` §2）。
 *
 * ⚠️ 措辞要能让玩家明白**后果**，不只是列字段名。
 * 例如 `crafts` 那条必须点明「上周目没读完的那几篇记录，要重新攒次数才能读」——
 * 玩家看到「累计合成次数」不知道这跟读日志有关，看到那句才知道。
 *
 * **行数不是硬指标，但每个被重置的字段必须落在某一行的后果描述里。**
 * R4 / R5 各自的后果不同，**不可合并进别的行、也不可彼此合并**（定稿 §2.2）。
 */
export const NEXT_CYCLE_RESET: readonly NextCycleBullet[] = Object.freeze([
  Object.freeze({
    fields: Object.freeze(['bag', 'discovered', 'day', 'areaId', 'scene'] as const),
    text: '背包、地面上捡到过的东西、天数',
    note: '回到坠毁点的第 1 天',
  }),
  Object.freeze({
    fields: Object.freeze(['stage', 'stepIndex', 'buildDone'] as const),
    text: '阶段进度',
    note: '回到第一个阶段的第 1 步，建设期得重新走满',
  }),
  Object.freeze({
    fields: Object.freeze(['branches'] as const),
    text: '已完成的支线',
    note: '但还是得重新做一遍',
  }),
  Object.freeze({
    fields: Object.freeze(['crafts'] as const),
    text: '累计合成次数',
    note: '上周目没读完的那几篇记录，要重新攒次数才能读',
  }),
  Object.freeze({
    fields: Object.freeze(['logsFound'] as const),
    text: '这一周拿到的记录载体',
    note: '载体是要用掉的，不带过去',
  }),
  Object.freeze({
    fields: Object.freeze(['accidents', 'log'] as const),
    text: '意外次数与这一周的世界日志',
  }),
  Object.freeze({
    fields: Object.freeze(['ending'] as const),
    text: '本周目的结局',
    note: '结局本身已经记在「已解锁的结局」里了',
  }),
  Object.freeze({
    fields: Object.freeze(['launchAttempts', 'launchFailures'] as const),
    text: '起飞尝试与失败的次数',
  }),
]);

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
 *
 * ⚠️ 改这个函数时**必须同步 `NEXT_CYCLE_KEPT` / `NEXT_CYCLE_RESET`** ——
 * 确认页给玩家看的清单就是从这里来的，漏一条就等于没告诉玩家你会失去什么。
 * `ngplus.test.ts` 里有断言守着（少字段就红）。
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
