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
  addItem,
  allBranchStatus,
  appendLog,
  attemptLaunch,
  craft,
  createInitialState,
  distribute,
  finishGame,
  getItem,
  hintMessage,
  launchCheck,
  lines,
  sectorCenter,
  type AreaId,
  type EndingId,
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
      // 归一化：老存档没有 ngPlus 字段 → 一律 false。
      // GDD §7.3 把 ngPlus 定义为对象容器（cycle/endings/readLogs/branchesHistory），
      // 本批只落布尔语义位；扩成对象容器是 C2 批次的事（见 game-core types.ts 注释）。
      ngPlus: parsed.ngPlus === true,
      // 归一化：老存档的 branches 缺 stay 键 → 一律 false。
      // 不做的话 `branches.stay` 读到 undefined，UI 与 availableEndings 的形状会不一致。
      branches: readBranches(parsed.branches),
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

  // ── UI 状态（不持久化）──
  slots: [string | null, string | null];
  toast: ToastData | null;
  dialog: string[];
  dialogIndex: number;
  viewing: string | null;
  /** 背包抽屉 / 网页侧栏的展开态 */
  bagOpen: boolean;
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
  /** 统一的写入 + 持久化。`world` 镜像跟着一起更新 */
  const commit = (save: SaveStateV2, extra: Partial<GameStore> = {}) => {
    persist(save);
    // 后台防抖推云端；失败静默（离线优先，不打断游玩）
    queuePush(save);
    set({ save, world: save.world, ...extra });
  };

  return {
    save: fromCore(createInitialState(), [], TUTORIAL_SKIP),
    screen: 'start',
    slots: [null, null],
    toast: null,
    dialog: [],
    dialogIndex: 0,
    viewing: null,
    bagOpen: false,
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
      const world = redistribute(fromCore(base, [], TUTORIAL_SKIP), spawn, DEFAULT_MAX_DIST);
      const save: SaveStateV2 = fromCore(base, world, { step: 'newcomer', picks: 0 });
      persist(save);
      // 开始页「重新开始」同时丢弃云端旧档。否则按「高分不败」的冲突规则，
      // 新档永远赢不过云端旧档，下次启动会被原样覆盖回来 —— 等于新游戏开不起来。
      cancelPendingPush();
      void clearCloudSave();
      queuePush(save);
      set({
        save,
        world,
        screen: 'game',
        slots: [null, null],
        dialog: lines('start'),
        dialogIndex: 0,
        viewing: null,
        bagOpen: false,
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
        screen: 'game',
        slots: [null, null],
        dialog:
          save.stage === 1
            ? ['继续。船还是那颗船，星球还是那颗星球。']
            : [],
        dialogIndex: 0,
        viewing: null,
        bagOpen: false,
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
            ? `第一次捡到「${item.name}」。${item.desc}`
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

    toggleBag: () => set({ bagOpen: !get().bagOpen }),

    closeBag: () => set({ bagOpen: false }),

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
              set({ save: normalized, world: normalized.world });
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
              set({ save: normalized, world: normalized.world });
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
        world: [],
        screen: 'start',
        slots: [null, null],
        dialog: [],
        dialogIndex: 0,
        toast: null,
        viewing: null,
        bagOpen: false,
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
