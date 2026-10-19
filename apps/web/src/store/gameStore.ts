import { create } from 'zustand';
import {
  BRANCHES,
  addItem,
  allBranchStatus,
  appendLog,
  attemptLaunch,
  craft,
  createInitialState,
  finishGame,
  getItem,
  hintMessage,
  isAreaUnlocked,
  launchCheck,
  lines,
  pickFromScene,
  searchArea,
  type AreaId,
  type DialogueKey,
  type EndingId,
  type SaveState,
} from '@haola/game-core';

const KEY = 'haola.save.v1';

function persist(save: SaveState) {
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

function readSavedGame(): SaveState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveState;
    // 结构不兼容就丢弃，不冒坏档的风险
    if (parsed.schemaVersion !== 1) return null;
    if (typeof parsed.day !== 'number' || !parsed.bag) return null;
    return parsed;
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

interface GameStore {
  save: SaveState;
  screen: Screen;
  slots: [string | null, string | null];
  toast: ToastData | null;
  dialog: string[];
  dialogIndex: number;
  viewing: string | null;
  openPanel: string | null;

  newGame: () => void;
  continueGame: () => boolean;
  setArea: (area: AreaId) => void;
  search: () => void;
  pick: (id: string) => void;
  toggleSlot: (id: string) => void;
  clearSlot: (index: number) => void;
  doCraft: () => void;
  doLaunch: () => void;
  chooseEnding: (ending: EndingId) => void;
  advanceDialog: () => void;
  say: (text: string[]) => void;
  view: (id: string | null) => void;
  showToast: (title: string, body?: string) => void;
  dismissToast: () => void;
  togglePanel: (key: string) => void;
  backToStart: () => void;
  resetAll: () => void;
}

export const useGame = create<GameStore>((set, get) => {
  /** 统一的写入 + 持久化 */
  const commit = (save: SaveState, extra: Partial<GameStore> = {}) => {
    persist(save);
    set({ save, ...extra });
  };

  return {
    save: createInitialState(),
    screen: 'start',
    slots: [null, null],
    toast: null,
    dialog: [],
    dialogIndex: 0,
    viewing: null,
    openPanel: 'goal',

    newGame: () => {
      const save = createInitialState();
      persist(save);
      set({
        save,
        screen: 'game',
        slots: [null, null],
        dialog: lines('start'),
        dialogIndex: 0,
        openPanel: 'goal',
        viewing: null,
      });
    },

    continueGame: () => {
      const save = readSavedGame();
      if (!save) return false;
      set({
        save,
        screen: 'game',
        slots: [null, null],
        dialog: save.stage === 1 ? ['继续。船还是那颗船，星球还是那颗星球。'] : [],
        dialogIndex: 0,
        openPanel: 'goal',
        viewing: null,
      });
      return true;
    },

    setArea: (area) => {
      const { save } = get();
      if (!isAreaUnlocked(save, area)) return;
      if (save.areaId === area) return;
      set({ save: { ...save, areaId: area, scene: [] }, slots: [null, null] });
    },

    search: () => {
      const { save } = get();
      let next = searchArea(save);
      let dialog = get().dialog;

      // 第 7 天：外星访客
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
        dialog = [
          ...lines('day7'),
          '它扔了三样东西下来，然后就走了。我猜是清库存。',
        ];
      } else if (next.day === 30) {
        dialog = lines('day30');
      } else if (next.day === 100) {
        dialog = lines('day100');
      }

      commit(next, {
        slots: [null, null],
        ...(next.day === 7 || next.day === 30 || next.day === 100
          ? { dialog, dialogIndex: 0 }
          : {}),
      });
    },

    pick: (id) => {
      const { save } = get();
      const res = pickFromScene(save, id);
      if (!res) return;
      const item = getItem(id);

      if (res.firstTime) {
        get().showToast(item.name, item.desc);
      }
      commit(res.state);
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

    doCraft: () => {
      const { save, slots } = get();
      const [a, b] = slots;
      if (!a || !b) return;

      const res = craft(save, a, b);
      if (!res.ok) {
        get().showToast('合成不了', res.reason);
        return;
      }

      const output = getItem(res.outcome.result.output);
      let dialog: string[] = [];
      let nextDialogIndex = 0;

      if (res.outcome.result.kind === 'stage') {
        const cleared = res.state.stage !== save.stage;
        if (cleared) {
          dialog = lines(save.stage === 1 ? 'clear1' : 'clear2');
        } else {
          dialog = [`「${output.name}」成了。${output.desc}`];
        }
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

      // 支线达成
      if (res.state.stage === 3) {
        const newlyDone = allBranchStatus(res.state.bag).filter(
          (s) => s.done && !save.branches[s.id],
        );
        if (newlyDone.length > 0) {
          const branch = BRANCHES.find((x) => x.id === newlyDone[0]!.id)!;
          dialog = [...dialog, `「${branch.name}」成了。${branchSummary(branch.id)}`];
        }
      }

      commit(res.state, {
        slots: [null, null],
        dialog,
        dialogIndex: nextDialogIndex,
      });

      if (res.ending) {
        set({ screen: 'ending' });
      }
    },

    doLaunch: () => {
      const { save } = get();
      const mode = launchCheck(save.bag);
      if (mode === 'none') return;

      const res = attemptLaunch(save);
      if (res.ok) {
        commit(res.state, { screen: 'ending', dialog: lines('launchSuccess') });
      } else {
        commit(res.state, {
          dialog: lines('launchFail'),
          dialogIndex: 0,
        });
        get().showToast('没飞起来', '获得「起飞失败纪念章」。还能再试。');
      }
    },

    chooseEnding: (ending) => {
      const { save } = get();
      commit(finishGame(save, ending), { screen: 'ending' });
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

    togglePanel: (key) =>
      set({ openPanel: get().openPanel === key ? null : key }),

    backToStart: () => set({ screen: 'start', dialog: [], dialogIndex: 0 }),

    resetAll: () => {
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      set({
        save: createInitialState(),
        screen: 'start',
        slots: [null, null],
        dialog: [],
        dialogIndex: 0,
        toast: null,
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

export type { DialogueKey };
