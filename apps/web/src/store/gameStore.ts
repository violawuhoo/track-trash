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
};

// ───────────────────────── v1 ⇄ v2 适配（唯一的类型边界） ─────────────────────────

/** v2 → v1：补两个已废弃字段的空壳，喂给 game-core 的纯函数 */
function toCore(save: SaveStateV2): SaveState {
  return { ...save, scene: [], areaId: 'crash' } as SaveState;
}

/** v1 → v2：剥掉两个废弃字段，接上本次的地面分布 */
function fromCore(next: SaveState, world: PlacedItem[]): SaveStateV2 {
  return {
    schemaVersion: SAVE_SCHEMA,
    day: next.day,
    bag: next.bag,
    discovered: next.discovered,
    stage: next.stage,
    stepIndex: next.stepIndex,
    branches: next.branches,
    keepsakes: next.keepsakes,
    accidents: next.accidents,
    log: next.log,
    ending: next.ending,
    launchAttempts: next.launchAttempts,
    launchFailures: next.launchFailures,
    world,
  };
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

    return { ...(parsed as SaveStateV2), world };
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
  view: (id: string | null) => void;
  showToast: (title: string, body?: string) => void;
  dismissToast: () => void;

  setZoom: (zoom: number) => void;
  setViewportHalf: (half: number) => void;
  toggleBag: () => void;
  closeBag: () => void;

  backToStart: () => void;
  resetAll: () => void;
}

/** 出生点：坠毁点圆心（契约：刷新后角色回到坠毁点） */
function spawnPoint(): Vec2 {
  return sectorCenter('crash');
}

export const useGame = create<GameStore>((set, get) => {
  /** 统一的写入 + 持久化。`world` 镜像跟着一起更新 */
  const commit = (save: SaveStateV2, extra: Partial<GameStore> = {}) => {
    persist(save);
    set({ save, world: save.world, ...extra });
  };

  return {
    save: fromCore(createInitialState(), []),
    screen: 'start',
    slots: [null, null],
    toast: null,
    dialog: [],
    dialogIndex: 0,
    viewing: null,
    bagOpen: false,

    player: spawnPoint(),
    spawn: spawnPoint(),
    moveTarget: null,
    world: [],
    zoom: 1,
    viewportHalf: DEFAULT_MAX_DIST,

    newGame: () => {
      const spawn = spawnPoint();
      const base = createInitialState();
      const world = redistribute(fromCore(base, []), spawn, DEFAULT_MAX_DIST);
      const save: SaveStateV2 = fromCore(base, world);
      persist(save);
      set({
        save,
        world,
        screen: 'game',
        slots: [null, null],
        dialog: lines('start'),
        dialogIndex: 0,
        viewing: null,
        bagOpen: false,
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
        player: spawn,
        spawn,
        moveTarget: null,
        zoom: 1,
        toast: null,
      });
      return true;
    },

    // ── 世界（T3 调用）──

    setMoveTarget: (x, y) => set({ moveTarget: { x, y } }),

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
      };

      commit(next);
      if (firstTime) get().showToast(item.name, item.desc);
    },

    // ── 玩法（T4 调用）──

    craft: () => {
      const { save, slots, player, viewportHalf, zoom } = get();
      const [a, b] = slots;
      if (!a || !b) return;

      const res = craft(toCore(save), a, b);
      if (!res.ok) {
        get().showToast('合成不了', res.reason);
        return;
      }

      const output = getItem(res.outcome.result.output);
      let dialog: string[] = [];

      if (res.outcome.result.kind === 'stage') {
        const cleared = res.state.stage !== save.stage;
        dialog = cleared
          ? lines(save.stage === 1 ? 'clear1' : 'clear2')
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

      // 时间由合成推进（契约 §7）：第 7 天访客改为「当天首次合成后」触发
      let next = fromCore(res.state, save.world);
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
      const next = fromCore(res.state, save.world);
      if (res.ok) {
        commit(next, { screen: 'ending', dialog: lines('launchSuccess'), dialogIndex: 0 });
      } else {
        commit(next, { dialog: lines('launchFail'), dialogIndex: 0 });
        get().showToast('没飞起来', '获得「起飞失败纪念章」。还能再试。');
      }
    },

    chooseEnding: (ending) => {
      const { save } = get();
      commit(fromCore(finishGame(toCore(save), ending), save.world), {
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

    resetAll: () => {
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      const spawn = spawnPoint();
      set({
        save: fromCore(createInitialState(), []),
        world: [],
        screen: 'start',
        slots: [null, null],
        dialog: [],
        dialogIndex: 0,
        toast: null,
        viewing: null,
        bagOpen: false,
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
    default:
      return '';
  }
}

export type { AreaId, EndingId, PlacedItem, Vec2 };
