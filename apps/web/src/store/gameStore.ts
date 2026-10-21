/**
 * 《好垃》v2 全局状态。
 *
 * 契约见 `docs/CONTRACT-v2.md` §3（状态与存档、动作表）、§2.4（distribute 调用时序）。
 *
 * ## 三条铁律（改这个文件前先读）
 *
 * 1. **持久化只发生在 `collect` / `craft` / `doLaunch` / `chooseEnding` / `newGame` 上。**
 *    `setPlayerPos` 每帧被调用，内部只改内存里的 `player`，绝不写 localStorage。
 *    角色坐标、相机、缩放、移动目标都不入存档 —— 刷新后角色回到坠毁点。
 *    （T7 例外说明：`setMoveTarget` 首次会把 `save.tutorial.step` 在内存里推进一步，
 *    但不写盘 —— 下次 `collect` / `craft` 连它一起持久化。刷新后这步重来，无损失。）
 * 2. **`player` 没有订阅者。** 它是给 `craft()` 算 `maxDist` 用的，不是给 UI 用的。
 *    谁要是 `useGame((s) => s.player)`，每帧都会重渲染整个界面树。
 *    要给 `WorldCanvas` 的权威位置用 `spawn`（只在开新档/读档时变一次）。
 * 3. **写入只走 action。** 世界层（Pixi）只读 store，所有写入经本文件的 action。
 *
 * ## 与 game-core 的类型边界（重要）
 *
 * `packages/game-core/src/types.ts` 里的 `SaveState` 还是 v1 形状（有 `scene` / `areaId`），
 * 而这两个文件归 T0 / T5，T4 不许改。所以 v2 的存档类型 `SaveStateV2` 定义在这里，
 * 用 `Omit` 去掉两个区域字段、加上 `world`。
 * 所有要调用 game-core 纯函数（`craft` / `attemptLaunch` / `finishGame`）的地方，
 * 统一经过 `toCore` / `fromCore` 这一对适配器 —— **只此一处有 `as`**，别在别处再写一遍。
 */
import { create } from 'zustand';
import {
  BRANCHES,
  LOG_BY_ID,
  addItem,
  allBranchStatus,
  appendLog,
  attemptLaunch,
  continueAfterEnding as coreContinueAfterEnding,
  craft,
  createInitialState,
  createNgPlus,
  distribute,
  finishGame,
  getItem,
  hintMessage,
  launchCheck,
  lines,
  normalizeNgPlus,
  recordReadLog,
  sectorCenter,
  startNextCycle as coreStartNextCycle,
  type AreaId,
  type EndingId,
  type NgPlusState,
  type PlacedItem,
  type SaveState,
  type Vec2,
} from '@haola/game-core';
import { cancelPendingPush, clearCloudSave, progressScoreOf, pullSave, queuePush } from '../lib/cloud';

const KEY = 'haola.save.v2';

/** 存档版本。不是 2 的存档一律丢弃，不写迁移函数（契约 §3.1） */
export const SAVE_SCHEMA = 2;

/** 缩放范围，与 `world/camera.ts` 的 `ZOOM_MIN` / `ZOOM_MAX` 同值（世界层内部也会钳一次） */
export const ZOOM_MIN = 0.8;
export const ZOOM_MAX = 1.6;

/** `distribute` 的保底距离默认值：手机半屏 ≈ 400 世界单位（契约 §2.2） */
const DEFAULT_MAX_DIST = 400;

/**
 * v2 存档：删掉 `scene`（区域搜索结果）与 `areaId`（当前区域），
 * 改成 `world: PlacedItem[]`（地面物品）。区域由角色坐标推导。
 */
export type SaveStateV2 = Omit<SaveState, 'scene' | 'areaId' | 'schemaVersion'> & {
  schemaVersion: 2;
  world: PlacedItem[];
  /** T7 引导状态。入存档，读档续播不重放 */
  tutorial: TutorialState;
};

// ───────────────────────── v1 ⇄ v2 适配（唯一的类型边界） ─────────────────────────

/** v2 → v1：补两个已废弃字段的空壳，喂给 game-core 的纯函数 */
function toCore(save: SaveStateV2): SaveState {
  return { ...save, scene: [], areaId: 'crash' } as SaveState;
}

/** v1 → v2：剥掉两个废弃字段，接上本次的地面分布与引导进度 */
function fromCore(next: SaveState, world: PlacedItem[], tutorial: TutorialState): SaveStateV2 {
  return {
    schemaVersion: SAVE_SCHEMA,
    day: next.day,
    bag: next.bag,
    discovered: next.discovered,
    stage: next.stage,
    stepIndex: next.stepIndex,
    branches: next.branches,
    keepsakes: next.keepsakes,
    buildDone: next.buildDone,
    ngPlus: next.ngPlus,
    // C1 批次：累计合成次数 + 已获得的前任日志 id 集合。
    // `fromCore` 是**逐字段列举**的（不是展开 next），所以新增字段必须显式带出，
    // 漏一个就静默丢数据 —— 这条是 web 侧存档字段的通用规矩。
    crafts: next.crafts,
    logsFound: next.logsFound,
    accidents: next.accidents,
    log: next.log,
    ending: next.ending,
    launchAttempts: next.launchAttempts,
    launchFailures: next.launchFailures,
    world,
    tutorial,
  };
}

// ───────────────────────── T7 引导状态机 ─────────────────────────

/**
 * 引导步骤。卡片状态机 newcomer → firstMove → firstPickup → firstCraft → free，
 * 其中 firstCraft 与 free 行为一致（都不再提示），实现为「首次合成成功」迁移边。
 */
export type TutorialStep = 'newcomer' | 'firstMove' | 'firstPickup' | 'free';

export interface TutorialState {
  step: TutorialStep;
  /** 累计拾取次数。到顶强制收尾（卡片验收：第 4 次拾取后不再出任何引导提示） */
  picks: number;
}

/** 第 N 次拾取后引导全面静默 */
export const TUTORIAL_PICK_CAP = 4;

/** 老存档没有 tutorial 字段时的归一值：老玩家直接跳过，不重播 */
const TUTORIAL_SKIP: TutorialState = { step: 'free', picks: 0 };

/** 读档归一化：缺字段 / 坏形状 / picks 到顶 → 跳过引导 */
function readTutorial(raw: unknown): TutorialState {
  if (!raw || typeof raw !== 'object') return TUTORIAL_SKIP;
  const t = raw as Partial<TutorialState>;
  const step: TutorialStep =
    t.step === 'newcomer' || t.step === 'firstMove' || t.step === 'firstPickup'
      ? t.step
      : 'free';
  const picks =
    typeof t.picks === 'number' && Number.isFinite(t.picks) && t.picks > 0
      ? Math.floor(t.picks)
      : 0;
  if (step !== 'free' && picks >= TUTORIAL_PICK_CAP) return { step: 'free', picks };
  return { step, picks };
}

/** 读档归一化：branches 里缺失的支线键一律 false */
function readBranches(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {
    ship: false,
    teashop: false,
    birthday: false,
    stay: false,
  };
  if (!raw || typeof raw !== 'object') return out;
  const b = raw as Record<string, unknown>;
  for (const key of Object.keys(out)) out[key] = b[key] === true;
  return out;
}

/** 读档归一化：累计合成次数。缺字段 / 坏形状 / 负数 → 0 */
function readCrafts(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return 0;
  return Math.floor(raw);
}

/**
 * 读档归一化：已获得的前任日志 id 集合。
 *
 * 只保留 `LOGS` 里真实存在的 id —— 存档可能被手改过，
 * 塞进来的假 id 会让日志面板渲染出不存在的东西。
 */
function readLogsFound(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id !== 'string') continue;
    if (!LOG_BY_ID[id]) continue;
    if (out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/** 状态机推进。已在 free 的不动；craft 一刀切到 free */
function advanceTutorial(t: TutorialState, on: 'move' | 'pickup' | 'craft'): TutorialState {
  if (t.step === 'free') return t;
  if (on === 'craft') return { ...t, step: 'free' };
  if (on === 'move') return t.step === 'newcomer' ? { ...t, step: 'firstMove' } : t;
  const picks = t.picks + 1;
  if (picks >= TUTORIAL_PICK_CAP) return { ...t, picks, step: 'free' };
  return { ...t, picks, step: 'firstPickup' };
}

// ───────────────────────── 持久化 ─────────────────────────

function persist(save: SaveStateV2) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* 存储满了或隐私模式，忽略——游戏仍可继续 */
  }
}

export function hasSavedGame(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

/** 读档。`schemaVersion !== 2` 或结构不对 → 返回 null，从头开始（契约 §3.1：不写迁移） */
function readSavedGame(): SaveStateV2 | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SaveStateV2>;
    if (parsed.schemaVersion !== SAVE_SCHEMA) return null;
    if (typeof parsed.day !== 'number' || !parsed.bag) return null;
    if (!Array.isArray(parsed.world)) return null;

    // 地面点做一遍结构校验：坏了就丢，反正刷新会重新分布
    const world: PlacedItem[] = [];
    for (const it of parsed.world) {
      if (!it) continue;
      if (typeof it.uid !== 'string' || typeof it.id !== 'string') continue;
      if (!Number.isFinite(it.x) || !Number.isFinite(it.y)) continue;
      world.push(it);
    }

    return {
      ...(parsed as SaveStateV2),
      world,
      tutorial: readTutorial(parsed.tutorial),
      // 归一化：老存档（A1a 之前写入的）没有 buildDone 字段 → 一律 false。
      // 不 bump schemaVersion，走 T7 `tutorial` 的同款先例（入存档但不迁移）。
      buildDone: parsed.buildDone === true,
      // 归一化：老存档的 ngPlus 有三种形态（A2 的布尔语义位 / 缺字段 / C2 的对象容器）。
      // **不能因为读到 boolean 就崩** —— 交给 core 的 `normalizeNgPlus` 统一处理：
      //   undefined/null → 一周目空档案
      //   true          → cycle: 2 的空档案（A2 语义位「二周目已解锁」）
      //   false         → 一周目空档案
      //   对象          → 逐键防御性归一化（cycle / endings / readLogs / branchesHistory）
      ngPlus: normalizeNgPlus(parsed.ngPlus),
      // 归一化：老存档的 branches 缺 stay 键 → 一律 false。
      // 不做的话 `branches.stay` 读到 undefined，UI 与 availableEndings 的形状会不一致。
      branches: readBranches(parsed.branches),
      // 归一化：老存档没有 crafts 字段 → 0（不影响既有进度，只是日志解锁条件之一）。
      crafts: readCrafts(parsed.crafts),
      // 归一化：老存档没有 logsFound 字段 → 空数组。
      // 只保留真实存在的日志 id，去重。
      logsFound: readLogsFound(parsed.logsFound),
    };
  } catch {
    return null;
  }
}

export type Screen = 'start' | 'game' | 'ending';

export interface ToastData {
  key: number;
  title: string;
  body?: string;
}

// ───────────────────────── 区域解锁 ─────────────────────────

/**
 * 未解锁区域（画雾障 + 挡人）。
 * 与 `game-core` 的 `isAreaUnlocked` 同规则，但那份要吃 v1 的 `SaveState`，
 * 这里直接按 stage 算，省掉一次适配。
 */
export function lockedAreasFor(stage: number): AreaId[] {
  if (stage >= 3) return [];
  if (stage === 2) return ['market', 'cave'];
  return ['junkyard', 'market', 'cave'];
}

// ───────────────────────── 分布 ─────────────────────────

/**
 * 重算地面分布。契约 §2.4：合成成功后调用，未拾取的物品保留原位，只补空缺。
 *
 * `distribute` 在「保底标签全星球都不存在」时会 throw（配置错误的开发期哨兵）。
 * 这里兜住：控制台报错、保留上一次分布，不让玩家卡死在空白星球上。
 */
function redistribute(
  save: SaveStateV2,
  player: Vec2,
  maxDist: number,
): PlacedItem[] {
  try {
    return distribute({
      progress: { stage: save.stage, stepIndex: save.stepIndex },
      bag: save.bag,
      day: save.day,
      rng: Math.random,
      prev: save.world,
      player,
      maxDist: Number.isFinite(maxDist) && maxDist > 0 ? maxDist : DEFAULT_MAX_DIST,
    });
  } catch (err) {
    console.error('[store] distribute 失败，保留上一次分布', err);
    return save.world;
  }
}

// ───────────────────────── store ─────────────────────────

interface GameStore {
  // ── 存档（持久化）──
  save: SaveStateV2;
  screen: Screen;

  /**
   * 跨周目档案的**只读镜像**（C2 批次 · 图鉴面板用）。
   *
   * 为什么不让图鉴直接读 `save.ngPlus`：
   * 主菜单（screen === 'start'）时 `save` 是 `createInitialState()` 的空档案 ——
   * 玩家还没点「继续游戏」，存档躺在 localStorage 里没进 store。
   * 那样从主菜单打开图鉴会看到一片空白（结局 0/5、日志 0/8），
   * 而玩家明明已经通关过。`archive` 在 store 初始化时从 localStorage 读一次，
   * 之后每次 `commit` 同步，保证图鉴在任何页面都反映真实档案。
   */
  archive: NgPlusState;

  /**
   * 跨周目**纪念品**的只读镜像（C2 批次）。
   *
   * 为什么单独一个字段而不是塞进 `archive`（`NgPlusState`）：
   * `NgPlusState` 是 **core 存档契约**里的类型（`SaveState.ngPlus`），
   * 纪念品不在其中 —— 它是 `SaveState.keepsakes`（本周目存档字段）。
   * 但 GDD §7.5 的口径是「纪念品**保留全部**」，所以它跟 `ngPlus` 一样
   * 属于**跨周目**的东西，主菜单重开时也必须留住。
   *
   * 与 `archive` 同生命周期：`commit` 同步、`resetAll` 清空、
   * `newGame` 读取。
   */
  archiveKeepsakes: string[];

  /**
   * 「已获得载体」的只读镜像（C2 批次 · 图鉴三态用）。
   *
   * `SaveState.logsFound` 是**单周目**字段（「本周目合出过哪些载体」），
   * 二周目开新周目时清零。它跟 `ngPlus.readLogs`（跨周目「读过」）是**两个概念** ——
   * 图鉴必须分开显示：「已读」（readLogs）与「本周目已获得」（logsFound）。
   *
   * 为什么也要一个镜像：主菜单时 `save` 是空档案，
   * 直接读 `save.logsFound` 会让图鉴把「拿到载体但还没读」的篇目
   * 误判成「完全没碰到」。镜像在 `commit` 时同步，
   * 所以主菜单看到的是上一次存档的载体获得情况。
   */
  archiveLogsFound: string[];

  // ── UI 状态（不持久化）──
  slots: [string | null, string | null];
  toast: ToastData | null;
  dialog: string[];
  dialogIndex: number;
  viewing: string | null;
  /** 背包抽屉 / 网页侧栏的展开态 */
  bagOpen: boolean;
  /** 前任日志面板的展开态（C1 批次） */
  logOpen: boolean;
  /** 图鉴面板的展开态（C2 批次）。主菜单与结局页各一个入口 */
  codexOpen: boolean;
  /** 二周目确认页的展开态（C2 批次）。结局页「开始二周目」→ 确认页 → 真正开新周目 */
  ngPlusConfirmOpen: boolean;
  /**
   * T7 一次性事件台词的防重旗（不入存档）。
   * 引导期内「首次合错 / 首次被雾障弹回」各只说一次；刷新后可能重来一次，可接受。
   */
  tutorFlags: { wrong: boolean; blocked: boolean };

  // ── 世界（不持久化，契约 §3.2）──
  /** 角色实时位置。每帧更新，**没有订阅者**，别拿它渲染 */
  player: Vec2;
  /** 外部跳转用的权威位置。只在开新档 / 读档时换对象 → 直接喂给 WorldCanvas */
  spawn: Vec2;
  moveTarget: Vec2 | null;
  /** `save.world` 的镜像，便于订阅与避免每帧解引用 */
  world: PlacedItem[];
  zoom: number;
  /** 屏幕短边一半（CSS px）。T4 自己按窗口算，见 GameScreen */
  viewportHalf: number;

  // ── 动作 ──
  newGame: () => void;
  continueGame: () => boolean;

  setMoveTarget: (x: number, y: number) => void;
  setPlayerPos: (x: number, y: number) => void;
  collect: (uid: string) => void;

  craft: () => void;
  refreshWorld: () => void;

  toggleSlot: (id: string) => void;
  clearSlot: (index: number) => void;
  doLaunch: () => void;
  chooseEnding: (ending: EndingId) => void;

  advanceDialog: () => void;
  say: (text: string[]) => void;
  /** T7：标记一次性事件台词已播过（瞬态，不持久化） */
  markTutorFlag: (key: 'wrong' | 'blocked') => void;
  view: (id: string | null) => void;
  showToast: (title: string, body?: string) => void;
  dismissToast: () => void;

  setZoom: (zoom: number) => void;
  setViewportHalf: (half: number) => void;
  toggleBag: () => void;
  closeBag: () => void;
  /** C1 批次：前任日志面板开关 */
  toggleLog: () => void;
  closeLog: () => void;
  /** C2 批次：图鉴面板开关（主菜单 / 结局页入口） */
  toggleCodex: () => void;
  closeCodex: () => void;
  /** C2 批次：二周目确认页开关 */
  openNgPlusConfirm: () => void;
  closeNgPlusConfirm: () => void;
  /**
   * C2 批次：开始二周目（真正开新周目）。
   *
   * 保留 `keepsakes` / `ngPlus.endings` / `ngPlus.readLogs` / `ngPlus.branchesHistory`，
   * `ngPlus.cycle += 1`，其余世界进度清零（GDD §7.1）。
   */
  startNewCycle: () => void;
  /**
   * C2 批次：「留在这里继续」—— 结局后不重开，回自由模式。
   *
   * ⚠️ **不能用 `resetAll`**（会清掉 `ngPlus` 档案与 `keepsakes`）。
   */
  continueAfterEnding: () => void;
  /**
   * C2 批次：标记一篇日志「已读」。
   *
   * 写进 `ngPlus.readLogs`（跨周目保留）→ 二周目里这篇不再需要重新解锁（G1）。
   */
  readLog: (logId: string) => void;

  backToStart: () => void;
  resetAll: () => void;
  /** T8：启动时从云端拉取并合并（progressScore 高者胜），全程静默 */
  syncFromCloud: () => void;
}

/** 出生点：坠毁点圆心（契约：刷新后角色回到坠毁点） */
function spawnPoint(): Vec2 {
  return sectorCenter('crash');
}

export const useGame = create<GameStore>((set, get) => {
  /**
   * 启动时读一次 localStorage 存档。
   *
   * 读两次会拿到两个不同的对象引用，所以这里读一次、复用。
   * 用途：`archive` / `archiveKeepsakes` 的初值 —— 主菜单（还没点「继续游戏」）
   * 时 `save` 还是空档案，但跨周目档案必须是真的。
   */
  const boot = readSavedGame();

  /** 统一的写入 + 持久化。`world` 镜像跟着一起更新 */
  const commit = (save: SaveStateV2, extra: Partial<GameStore> = {}) => {
    persist(save);
    // 后台防抖推云端；失败静默（离线优先，不打断游玩）
    queuePush(save);
    set({
      save,
      world: save.world,
      archive: save.ngPlus,
      archiveKeepsakes: save.keepsakes,
      archiveLogsFound: save.logsFound,
      ...extra,
    });
  };

  return {
    save: fromCore(createInitialState(), [], TUTORIAL_SKIP),
    // 档案镜像：初始化时从 localStorage 读一次（主菜单打开图鉴要看到真实进度）
    archive: boot?.ngPlus ?? createNgPlus(),
    archiveKeepsakes: boot?.keepsakes ?? [],
    archiveLogsFound: boot?.logsFound ?? [],
    screen: 'start',
    slots: [null, null],
    toast: null,
    dialog: [],
    dialogIndex: 0,
    viewing: null,
    bagOpen: false,
    logOpen: false,
    codexOpen: false,
    ngPlusConfirmOpen: false,
    tutorFlags: { wrong: false, blocked: false },

    player: spawnPoint(),
    spawn: spawnPoint(),
    moveTarget: null,
    world: [],
    zoom: 1,
    viewportHalf: DEFAULT_MAX_DIST,

    newGame: () => {
      const spawn = spawnPoint();
      const base = createInitialState();
      // C2 批次：`ngPlus` 是**跨周目档案**，主菜单「重新开始」不清它
      // （图鉴 / 已读日志 / 走过的支线 / 周目数都是「这辈子」的东西）。
      // `resetAll` 才是真正的清档（它会把 ngPlus 一起清掉）。
      //
      // ⚠️ 必须读 `get().archive`，**不能读 `get().save.ngPlus`**：
      // 主菜单（screen === 'start'）时 `save` 还是 `createInitialState()` 的空档案
      // —— 玩家还没点「继续游戏」，存档躺在 localStorage 里没进 store。
      // 读 `save.ngPlus` 会拿到空档案，把真实的档案整个覆盖掉
      // （图鉴全空 / 二周目入口消失 / 已读日志清零）。
      // `archive` 才是「跨周目档案的正确来源」：store 初始化时从 localStorage 读一次，
      // 每次 `commit` 同步。
      base.ngPlus = get().archive;
      // 纪念品默认**不清空**（GDD §7.5）：「提供清空纪念品开关（默认关闭）——
      // 不作为默认行为，因为默认清空就是伤害收集欲的那一方」。
      // 彻底清档走 `resetAll`。
      //
      // 同理读 `archiveKeepsakes` 而不是 `save.keepsakes`（主菜单时后者是空的）。
      base.keepsakes = get().archiveKeepsakes;
      const world = redistribute(fromCore(base, [], TUTORIAL_SKIP), spawn, DEFAULT_MAX_DIST);
      const save: SaveStateV2 = fromCore(base, world, { step: 'newcomer', picks: 0 });
      persist(save);
      // 开始页「重新开始」同时丢弃云端旧档。否则按「高分不败」的冲突规则，
      // 新档永远赢不过云端旧档，下次启动会被原样覆盖回来 —— 等于新游戏开不起来。
      //
      // ⚠️ 顺序：先等 DELETE 落地，再入队 PUT。
      // 原来 `void clearCloudSave(); queuePush(save);` 是并发的 ——
      // 理论上可能出现「PUT 先到、DELETE 后到」→ 云端档被删掉。
      // 现在把入队挂到 DELETE 的 finally 上，顺序确定。
      cancelPendingPush();
      void clearCloudSave().finally(() => queuePush(save));
      set({
        save,
        world,
        screen: 'game',
        slots: [null, null],
        // 档案镜像：值与 `base.ngPlus` / `base.keepsakes` 同源（就是从 `archive` /
        // `archiveKeepsakes` 读出来再放回去的），这里显式写一遍是为了让
        // 「哪些路径更新 archive」这条规则在代码里一眼可见 ——
        // `newGame` 走的是 `set`（不是 `commit`），所以不会自动同步。
        archive: base.ngPlus,
        archiveKeepsakes: base.keepsakes,
        archiveLogsFound: base.logsFound,
        // 二周目玩家重开 → 播二周目开场（GDD §7.2「回到第 1 天」）。
        dialog: save.ngPlus.cycle >= 2 ? lines('ngplus') : lines('start'),
        dialogIndex: 0,
        viewing: null,
        bagOpen: false,
        logOpen: false,
        codexOpen: false,
        ngPlusConfirmOpen: false,
        tutorFlags: { wrong: false, blocked: false },
        player: spawn,
        spawn,
        moveTarget: null,
        zoom: 1,
        toast: null,
      });
    },

    continueGame: () => {
      const save = readSavedGame();
      if (!save) return false;
      const spawn = spawnPoint();
      set({
        save,
        world: save.world,
        // 读档后把跨周目档案镜像同步成本档的值
        // （boot 时读的是同一个存档，但云端同步后 localStorage 可能已是别的值）。
        archive: save.ngPlus,
        archiveKeepsakes: save.keepsakes,
        archiveLogsFound: save.logsFound,
        screen: 'game',
        slots: [null, null],
        dialog:
          save.stage === 1
            ? ['继续。船还是那颗船，星球还是那颗星球。']
            : [],
        dialogIndex: 0,
        viewing: null,
        bagOpen: false,
        logOpen: false,
        tutorFlags: { wrong: false, blocked: false },
        player: spawn,
        spawn,
        moveTarget: null,
        zoom: 1,
        toast: null,
      });
      return true;
    },

    // ── 世界（T3 调用）──

    setMoveTarget: (x, y) => {
      const s = get();
      // T7：首次点地面 = newcomer → firstMove。
      // 只改内存不持久化（铁律：持久化只在五个动作上）——下次 collect/craft 会连它一起写盘。
      // 引导中途刷新的话这一步会重来，角色反正也回出生点，可接受。
      if (s.save.tutorial.step === 'newcomer') {
        set({
          moveTarget: { x, y },
          save: { ...s.save, tutorial: advanceTutorial(s.save.tutorial, 'move') },
        });
        return;
      }
      set({ moveTarget: { x, y } });
    },

    /**
     * 每帧被调用。**内部绝不持久化**，也绝不碰 `save`。
     * 距离阈值 0.5 世界单位：站着不动时不产生新对象。
     */
    setPlayerPos: (x, y) => {
      const prev = get().player;
      if (Math.abs(prev.x - x) < 0.5 && Math.abs(prev.y - y) < 0.5) return;
      set({ player: { x, y } });
    },

    /** 走进拾取半径：自动拾取。这是唯一会「从地上拿走东西」的入口 */
    collect: (uid) => {
      const { save, world } = get();
      const placed = world.find((it) => it.uid === uid);
      // 已经捡走了 / 被上一次刷新顶掉了 —— 世界层有 700ms 节流，这里静默忽略
      if (!placed) return;

      const firstTime = !save.discovered[placed.id];
      const item = getItem(placed.id);
      const nextWorld = world.filter((it) => it.uid !== uid);

      // G4「石头记得你」（C2 批次）：二周目第 1 天第一次捡到会唱歌的石头时，
      // 拾取文案多一句。纯文案，不改数值、不改判定、不改 `items.ts` 的 desc。
      const ngPlusFlavor =
        placed.id === 'rock' && firstTime && save.ngPlus.cycle >= 2 && save.day === 1
          ? '它今天唱得比上次少一遍，不知道为什么。'
          : '';

      // T7：引导期内第一次捡（此时 step 还是 newcomer / firstMove）→ 播一次性台词
      const isFirstPickup =
        save.tutorial.step === 'newcomer' || save.tutorial.step === 'firstMove';

      const next: SaveStateV2 = {
        ...save,
        bag: addItem(save.bag, placed.id),
        discovered: firstTime
          ? { ...save.discovered, [placed.id]: true }
          : save.discovered,
        log: appendLog(save.log, {
          day: save.day,
          kind: '拾取',
          text: firstTime
            ? `第一次捡到「${item.name}」。${item.desc}${ngPlusFlavor}`
            : `又捡到一个「${item.name}」。`,
        }),
        world: nextWorld,
        tutorial: advanceTutorial(save.tutorial, 'pickup'),
      };

      commit(next);
      if (firstTime) get().showToast(item.name, item.desc);
      if (isFirstPickup) {
        // 追加而不是替换：别把开场的 start 台词顶掉
        const queued = get().dialog;
        get().say(queued.length > 0 ? [...queued, ...lines('tutPickup')] : lines('tutPickup'));
      }
    },

    // ── 玩法（T4 调用）──

    craft: () => {
      const { save, slots, player, viewportHalf, zoom } = get();
      const [a, b] = slots;
      if (!a || !b) return;

      const res = craft(toCore(save), a, b);
      if (!res.ok) {
        // T7：引导期内首次合错，播一次性台词（瞬态旗防重，不入存档）
        const s = get();
        if (s.save.tutorial.step !== 'free' && !s.tutorFlags.wrong) {
          get().markTutorFlag('wrong');
          const queued = s.dialog;
          get().say(queued.length > 0 ? [...queued, ...lines('tutWrong')] : lines('tutWrong'));
        }
        get().showToast('合成不了', res.reason);
        return;
      }

      const output = getItem(res.outcome.result.output);
      let dialog: string[] = [];

      if (res.outcome.result.kind === 'stage') {
        // 阶段播报**统一由 core 说了算**（A1b 任务 9）。
        // 旧写法是 web 自己用 `res.state.stage !== save.stage` 推断「阶段是否跃迁」，
        // 但阶段 3 走满时 stage 保持 3 不变 → 推断恒为 false → clear3 永远不播。
        // 现在直接读 core 返回的 dialogueKey：clear1 / clear2 / clear3 三条走同一条路。
        // 注意只认「阶段完成」这三个键：core 在非阶段跃迁时也会给 'craft'，
        // 那种情况仍走下面的产物播报（带物品名和描述），不能让 dialogueKey 把它盖掉。
        const dk = res.dialogueKey;
        const isStageClear =
          dk === 'clear1' || dk === 'clear2' || dk === 'clear3';
        dialog = isStageClear
          ? lines(dk)
          : [`「${output.name}」成了。${output.desc}`];
        get().showToast(output.name, output.desc);
      } else {
        const hint = hintMessage(res.outcome);
        if (hint) {
          dialog = [hint];
        } else if (res.outcome.result.kind === 'recipe') {
          dialog = [`「${output.name}」。${output.desc}`];
        } else {
          dialog = [`意外发现「${output.name}」。${output.desc}`];
        }
        get().showToast(
          res.outcome.result.kind === 'recipe' ? output.name : `意外：${output.name}`,
          output.desc,
        );
      }

      // T7：引导期内首次合成成功 → 状态机收尾，庆祝台词插到结果台词最前面
      const wasGuiding = save.tutorial.step !== 'free';
      if (wasGuiding) dialog = [...lines('tutCraft'), ...dialog];

      // 时间由合成推进（契约 §7）：第 7 天访客改为「当天首次合成后」触发
      let next = fromCore(res.state, save.world, advanceTutorial(save.tutorial, 'craft'));
      if (next.day === 7) {
        next = {
          ...next,
          bag: addItem(addItem(addItem(next.bag, 'note'), 'glitter'), 'rock'),
          log: appendLog(next.log, {
            day: 7,
            kind: '系统',
            text: '外星访客扔下三样东西就走了：外星留言条、亮片胶水、会唱歌的石头。',
          }),
        };
        dialog = [...lines('day7'), '它扔了三样东西下来，然后就走了。我猜是清库存。'];
      } else if (next.day === 30) {
        dialog = [...dialog, ...lines('day30')];
      } else if (next.day === 100) {
        dialog = [...dialog, ...lines('day100')];
      }

      // 支线达成
      if (next.stage === 3) {
        const newlyDone = allBranchStatus(next.bag).filter(
          (s) => s.done && !save.branches[s.id],
        );
        if (newlyDone.length > 0) {
          const branch = BRANCHES.find((x) => x.id === newlyDone[0]!.id)!;
          dialog = [...dialog, `「${branch.name}」成了。${branchSummary(branch.id)}`];
        }
      }

      // 合成 → +1 天 → 重刷地面（契约 §2.4）
      const world = redistribute(next, player, viewportHalf / zoom);
      next = { ...next, world };

      commit(next, { slots: [null, null], dialog, dialogIndex: 0 });

      if (res.ending) {
        set({ screen: 'ending' });
      }
    },

    /** 手动重刷地面。读档时地面为空 / 想换一批东西时用 */
    refreshWorld: () => {
      const { save, player, viewportHalf, zoom } = get();
      const world = redistribute(save, player, viewportHalf / zoom);
      commit({ ...save, world });
    },

    toggleSlot: (id) => {
      const { slots, save } = get();
      const count = save.bag[id] ?? 0;
      if (count <= 0) return;

      const filled = slots.filter((s) => s === id).length;

      // 两槽都是它 → 全部清掉
      if (filled >= 2) {
        set({ slots: [null, null] });
        return;
      }
      // 已在一个槽里，且还有第二个 → 放到另一个槽（自合）
      if (filled === 1 && count >= 2) {
        const empty = slots.indexOf(null);
        if (empty >= 0) {
          const next: [string | null, string | null] = [...slots];
          next[empty] = id;
          set({ slots: next });
          return;
        }
      }
      // 已在一个槽里，且只有一份 → 取消
      if (filled === 1) {
        set({ slots: slots.map((s) => (s === id ? null : s)) as [string | null, string | null] });
        return;
      }
      // 放进第一个空槽
      const empty = slots.indexOf(null);
      if (empty >= 0) {
        const next: [string | null, string | null] = [...slots];
        next[empty] = id;
        set({ slots: next });
      } else {
        set({ slots: [id, slots[1]] });
      }
    },

    clearSlot: (index) => {
      const { slots } = get();
      const next: [string | null, string | null] = [...slots];
      next[index] = null;
      set({ slots: next });
    },

    doLaunch: () => {
      const { save } = get();
      const mode = launchCheck(save.bag);
      if (mode === 'none') return;

      const res = attemptLaunch(toCore(save));
      const next = fromCore(res.state, save.world, save.tutorial);
      if (res.ok) {
        commit(next, { screen: 'ending', dialog: lines('launchSuccess'), dialogIndex: 0 });
      } else {
        commit(next, { dialog: lines('launchFail'), dialogIndex: 0 });
        get().showToast('没飞起来', '获得「起飞失败纪念章」。还能再试。');
      }
    },

    chooseEnding: (ending) => {
      const { save } = get();
      commit(fromCore(finishGame(toCore(save), ending), save.world, save.tutorial), {
        screen: 'ending',
      });
    },

    advanceDialog: () => {
      const { dialogIndex, dialog } = get();
      if (dialogIndex < dialog.length - 1) {
        set({ dialogIndex: dialogIndex + 1 });
      } else {
        set({ dialog: [], dialogIndex: 0 });
      }
    },

    say: (text) => set({ dialog: text, dialogIndex: 0 }),

    markTutorFlag: (key) =>
      set((s) => ({ tutorFlags: { ...s.tutorFlags, [key]: true } })),

    view: (id) => set({ viewing: id }),

    showToast: (title, body) =>
      set({ toast: { key: Date.now(), title, body } }),

    dismissToast: () => set({ toast: null }),

    setZoom: (zoom) =>
      set({ zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 100) / 100)) }),

    setViewportHalf: (half) => {
      if (Math.abs(get().viewportHalf - half) < 1) return;
      set({ viewportHalf: half });
    },

    // 背包与日志面板互斥（一次只开一个）
    toggleBag: () => {
      const next = !get().bagOpen;
      set({ bagOpen: next, ...(next ? { logOpen: false } : {}) });
    },

    closeBag: () => set({ bagOpen: false }),

    /** C1 批次：前任日志面板开关。背包与日志面板互斥（一次只开一个） */
    toggleLog: () => {
      const next = !get().logOpen;
      set({ logOpen: next, ...(next ? { bagOpen: false } : {}) });
    },

    closeLog: () => set({ logOpen: false }),

    // ── C2 批次：图鉴 / 二周目 ──

    /** 图鉴面板开关。背包 / 日志 / 图鉴三者互斥（一次只开一个） */
    toggleCodex: () => {
      const next = !get().codexOpen;
      set({
        codexOpen: next,
        ...(next ? { bagOpen: false, logOpen: false } : {}),
      });
    },

    closeCodex: () => set({ codexOpen: false }),

    openNgPlusConfirm: () => set({ ngPlusConfirmOpen: true, codexOpen: false }),

    closeNgPlusConfirm: () => set({ ngPlusConfirmOpen: false }),

    /**
     * 开始二周目。**确认页点「开始」后才走这里**。
     *
     * 流程（GDD §7.2）：
     * 1. `core.startNextCycle` → `ngPlus.cycle += 1`，保留 keepsakes / endings /
     *    readLogs / branchesHistory，世界进度清零。
     * 2. 重新分布地面（世界是新的）。
     * 3. 回到第 1 天，播 `DIALOGUE.ngplus`（3 句定稿）。
     */
    startNewCycle: () => {
      const { save, player, viewportHalf, zoom } = get();
      const nextCore = coreStartNextCycle(toCore(save));
      let next = fromCore(nextCore, save.world, save.tutorial);
      const world = redistribute(next, player, viewportHalf / zoom);
      next = { ...next, world };
      commit(next, {
        screen: 'game',
        slots: [null, null],
        dialog: lines('ngplus'),
        dialogIndex: 0,
        viewing: null,
        bagOpen: false,
        logOpen: false,
        codexOpen: false,
        ngPlusConfirmOpen: false,
      });
      // 「开新周目」也是一次**世界归零**，所以同样要处理云端旧档。
      //
      // 正常情况下 `cycle` 参与评分已经够用（cycle += 1 → 分数 +1e6，
      // 必然赢过云端的上一周目档）。但有一个同周目的边角：云端存着
      // 「同一周目、更靠后」的档（score 更大）时，本地刚归零的新周目会输 ——
      // 玩家会发现「我点了开始二周目，回来还是老存档」。
      // 所以这里跟 `newGame` 一样先清云端再推。代价：云端那份旧档被覆盖，
      // 但它携带的档案（endings / readLogs / branchesHistory）本来就在本地
      // `ngPlus` 里，会跟着新档一起推上去，不丢。
      cancelPendingPush();
      void clearCloudSave().finally(() => queuePush(next));
    },

    /**
     * 「留在这里继续」—— 结局后不清档，回自由模式继续玩。
     *
     * ⚠️ **不能用 `resetAll`**：`resetAll` 会 `localStorage.removeItem` +
     * `clearCloudSave` + 重建初始 state，把 `ngPlus` 档案和 `keepsakes` 一起清掉。
     * 这里只清 `ending`（core 的 `continueAfterEnding`），其余全留。
     */
    continueAfterEnding: () => {
      const { save } = get();
      const next = fromCore(coreContinueAfterEnding(toCore(save)), save.world, save.tutorial);
      commit(next, {
        screen: 'game',
        slots: [null, null],
        viewing: null,
        bagOpen: false,
        logOpen: false,
        codexOpen: false,
        ngPlusConfirmOpen: false,
        dialog: [],
        dialogIndex: 0,
      });
    },

    /**
     * 标记一篇日志「已读」。写进 `ngPlus.readLogs`（跨周目保留）。
     *
     * ## 语义（团队已裁决）
     *
     * `readLogs` = **玩家点开日志正文**时记录，**不是**合出载体时记录。
     * 「拿到载体」与「读过」是两件事：载体拿到 ≠ 玩家读了。
     * （core 的 `craft()` 只写 `logsFound` —— 本周目载体记账。）
     *
     * ## 幂等 + 不做无谓写入
     *
     * 已读过的篇目再点一次 → 直接 return，**不 commit**。
     * `commit` 会触发 `persist` + `queuePush`（一次云端推送），
     * 二周目里已读篇目默认展开、玩家随手点一下就推一次云端，纯浪费。
     */
    readLog: (logId) => {
      const { save } = get();
      // 已读 → 不重复记账，也不触发持久化 / 云端推送
      if (save.ngPlus.readLogs.includes(logId)) return;
      const next = {
        ...save,
        ngPlus: recordReadLog(save.ngPlus, logId),
      };
      commit(next);
    },

    backToStart: () => set({ screen: 'start', dialog: [], dialogIndex: 0 }),

    syncFromCloud: () => {
      // 启动时后台执行；任何异常都吞掉，绝不阻塞开始页
      pullSave()
        .then((remote) => {
          // 拉取往返期间玩家可能已经开局（或读档）了。此时任何采纳都会踩掉他正在玩的东西。
          if (get().screen !== 'start') return;
          const local = readSavedGame();
          if (!remote) {
            // 云端无档：本地有则推上去，统一两端
            if (local) queuePush(local);
            return;
          }
          if (!local) {
            // 仅云端有：写回本地并采纳
            persist(remote);
            const normalized = readSavedGame();
            if (normalized) {
              set({
                save: normalized,
                world: normalized.world,
                archive: normalized.ngPlus,
                archiveKeepsakes: normalized.keepsakes,
                archiveLogsFound: normalized.logsFound,
              });
              get().showToast('已从云端同步');
            }
            return;
          }
          // 两端都有：progressScore 高者胜（相等保留本地）
          const remoteScore = progressScoreOf(remote);
          const localScore = progressScoreOf(local);
          if (remoteScore > localScore) {
            persist(remote);
            const normalized = readSavedGame();
            if (normalized) {
              set({
                save: normalized,
                world: normalized.world,
                archive: normalized.ngPlus,
                archiveKeepsakes: normalized.keepsakes,
                archiveLogsFound: normalized.logsFound,
              });
              get().showToast('已从云端同步');
            }
          } else if (localScore > remoteScore) {
            queuePush(local);
          }
        })
        .catch(() => {
          /* 静默降级 */
        });
    },

    resetAll: () => {
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      // 先掐掉待发的推送，再清云端（否则旧存档会被防抖队列重新推回去）
      cancelPendingPush();
      void clearCloudSave();
      const spawn = spawnPoint();
      set({
        save: fromCore(createInitialState(), [], TUTORIAL_SKIP),
        // `resetAll` 是**彻底清档**：连跨周目档案（`ngPlus`）一起清。
        // 「再来一次」（结局页）走的是 `newGame`，不清档案。
        archive: createNgPlus(),
        archiveKeepsakes: [],
        archiveLogsFound: [],
        world: [],
        screen: 'start',
        slots: [null, null],
        dialog: [],
        dialogIndex: 0,
        toast: null,
        viewing: null,
        bagOpen: false,
        logOpen: false,
        tutorFlags: { wrong: false, blocked: false },
        player: spawn,
        spawn,
        moveTarget: null,
        zoom: 1,
      });
    },
  };
});

function branchSummary(id: string): string {
  switch (id) {
    case 'ship':
      return '三件套齐了，什么时候起飞你说了算。';
    case 'teashop':
      return '招牌还没干，但已经有人排队了。';
    case 'birthday':
      return '生日办完了，它很高兴。';
    case 'stay':
      return '落脚的地方有了，生计有了，熟人也有了。';
    default:
      return '';
  }
}

export type { AreaId, EndingId, PlacedItem, Vec2 };
