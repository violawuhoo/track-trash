/**
 * web 侧存档层的跨包回归测试（C2 批次）。
 *
 * ## 为什么放在 api 包里跑
 *
 * `apps/web` 没有配测试运行器（它的 `package.json` 只有 dev/build/preview/typecheck），
 * 但 web 的存档逻辑（`gameStore.ts`）是 C2 批次风险最高的部分 ——
 * 二周目档案、主菜单重开、云端合并、「留在这里继续」全在这里。
 * `apps/api` 已有 vitest，且 C2 已经在 `api.test.ts` 里跨包 import
 * `apps/web/src/lib/cloud.js` 做跨端一致性断言 —— 这里沿用同一条路：
 * 用 api 的 vitest 跑 web 的纯逻辑（不碰 React / Pixi / DOM）。
 *
 * ## 覆盖范围
 *
 * 这几条对应 C2 复审点名的 QA 复验重点，全部是**手测很难稳定复现、但逻辑上是纯函数**
 * 的路径。QA 那边跑的是同一批场景的手工复验，这里跑的是它的自动化替身。
 *
 * 覆盖：
 * - QA1 主菜单「重新开始」后，图鉴内容与二周目入口仍在（阻断 bug 的回归护栏）
 * - QA3 老存档三形态（`ngPlus` 缺失 / `false` / `true`）读档归一化，
 *   且 web 与 api 对同一输入算出同一个 progressScore
 * - QA4 「留在这里继续」：清 `ending`、保留 `keepsakes` / `ngPlus` / `branches`，
 *   且**不调用 `localStorage.removeItem`**（= 没有走 `resetAll`）；
 *   `built` / `runSeed` / `signsFound` 在「回星球」路径上原样往返
 *   （`fromCore` 漏带 `built` 曾把落地成景清空 —— 回归护栏；
 *   `dismissEnding` 与 `continueAfterEnding` 同一实现，同路径再断言一组）
 * - `readSignsFound` 读档归一化：假 id / 重复 / 非字符串一律滤掉
 * - QA6 `readLog` 幂等：已读再点不产生多余的云端推送
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveStateV2 } from '../../web/src/store/gameStore.js';

// ── localStorage 桩（web 的 store 直接用全局 localStorage）──
const ls = new Map<string, string>();
const g = globalThis as unknown as { localStorage: unknown; fetch: unknown };
g.localStorage = {
  getItem: (k: string) => (ls.has(k) ? ls.get(k)! : null),
  setItem: (k: string, v: string) => void ls.set(k, v),
  removeItem: (k: string) => void ls.delete(k),
  clear: () => ls.clear(),
};

// 桩掉云端网络：离线优先，测试里不该真的发请求
g.fetch = vi.fn(async () => new Response('{}', { status: 200 }));

/** 导入一份全新的 web store 模块实例（模块顶层会读一次 localStorage 建初始档案） */
async function freshStore() {
  vi.resetModules();
  const mod = await import('../../web/src/store/gameStore.js');
  return mod.useGame;
}

/** 一个 schemaVersion=2 的最小合法存档 */
function baseSave(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    day: 1,
    bag: {},
    discovered: {},
    stage: 1,
    stepIndex: 0,
    branches: { ship: false, teashop: false, birthday: false, stay: false },
    keepsakes: [],
    accidents: 0,
    log: [],
    ending: null,
    launchAttempts: 0,
    launchFailures: 0,
    world: [],
    tutorial: { step: 'free', picks: 0 },
    buildDone: false,
    crafts: 0,
    logsFound: [],
    ...over,
  };
}

describe('QA1 主菜单「重新开始」不清跨周目档案', () => {
  beforeEach(() => ls.clear());

  it('重开后 cycle / endings / readLogs / branchesHistory / keepsakes 全部保留', async () => {
    // 造一个「已经二周目、读过日志、走过支线、拿过纪念品」的存档
    ls.set(
      'haola.save.v2',
      JSON.stringify(
        baseSave({
          keepsakes: ['ks_signal'],
          logsFound: ['L1'],
          ngPlus: {
            cycle: 2,
            endings: ['stay'],
            readLogs: ['L3'],
            branchesHistory: ['ship'],
          },
        }),
      ),
    );

    const useGame = await freshStore();
    // 启动时档案镜像就从 localStorage 读进来了
    const boot = useGame.getState();
    expect(boot.archive.cycle).toBe(2);
    expect(boot.archive.endings).toEqual(['stay']);
    expect(boot.archive.readLogs).toEqual(['L3']);
    expect(boot.archive.branchesHistory).toEqual(['ship']);
    expect(boot.archiveKeepsakes).toEqual(['ks_signal']);

    // 点「重新开始」
    useGame.getState().newGame();
    const after = useGame.getState();

    expect(after.save.ngPlus.cycle).toBe(2);
    expect(after.save.ngPlus.endings).toEqual(['stay']);
    expect(after.save.ngPlus.readLogs).toEqual(['L3']);
    expect(after.save.ngPlus.branchesHistory).toEqual(['ship']);
    expect(after.save.keepsakes).toEqual(['ks_signal']);
    // 档案镜像也要跟着同步（newGame 走 set 不是 commit，不会自动同步）
    expect(after.archive.cycle).toBe(2);
    expect(after.archiveKeepsakes).toEqual(['ks_signal']);
    // 本周目状态确实重置了
    expect(after.save.day).toBe(1);
    expect(after.save.stage).toBe(1);
    expect(after.save.logsFound).toEqual([]);
  });

  it('重开后二周目入口条件仍成立', async () => {
    ls.set(
      'haola.save.v2',
      JSON.stringify(
        baseSave({ ngPlus: { cycle: 2, endings: ['leave'], readLogs: [], branchesHistory: [] } }),
      ),
    );
    const useGame = await freshStore();
    useGame.getState().newGame();
    const { ngPlusUnlocked } = await import('@haola/game-core');
    expect(ngPlusUnlocked(useGame.getState().save.ngPlus)).toBe(true);
  });
});

describe('QA3 老存档三形态归一化 + 跨端同分', () => {
  beforeEach(() => ls.clear());

  const cases: Array<[string, unknown, number]> = [
    ['ngPlus 缺失', undefined, 1],
    ['ngPlus = false', false, 1],
    ['ngPlus = true', true, 2],
  ];

  for (const [name, ngPlus, cycle] of cases) {
    it(`${name} → cycle=${cycle}，endings/readLogs/branchesHistory 为空`, async () => {
      const raw = baseSave() as Record<string, unknown>;
      if (ngPlus !== undefined) raw.ngPlus = ngPlus;
      ls.set('haola.save.v2', JSON.stringify(raw));

      const useGame = await freshStore();
      const arch = useGame.getState().archive;
      expect(arch.cycle).toBe(cycle);
      expect(arch.endings).toEqual([]);
      expect(arch.readLogs).toEqual([]);
      expect(arch.branchesHistory).toEqual([]);
    });

    it(`${name} → web 与 api 算出的 progressScore 相同`, async () => {
      const { progressScoreOf } = await import('../../web/src/lib/cloud.js');
      const { computeProgressScore } = await import('../src/lib/progress.js');
      const input = {
        stage: 1,
        stepIndex: 0,
        branches: { ship: false, teashop: false, birthday: false, stay: false },
        day: 1,
        ngPlus,
      };
      expect(progressScoreOf(input)).toBe(computeProgressScore(input));
    });
  }
});

describe('QA4「留在这里继续」保留档案，不走 resetAll', () => {
  beforeEach(() => ls.clear());

  it('清 ending、保留 keepsakes / ngPlus / branches，且不动 localStorage.removeItem', async () => {
    const useGame = await freshStore();
    useGame.getState().newGame();

    // 伪造一个「已达成结局」的状态
    const base = useGame.getState().save;
    useGame.setState({
      save: {
        ...base,
        ending: 'stay',
        keepsakes: ['ks_stay'],
        branches: { ship: false, teashop: false, birthday: false, stay: true },
        ngPlus: { cycle: 2, endings: ['stay'], readLogs: [], branchesHistory: ['stay'] },
      },
    });

    // 监听 removeItem：resetAll 会调它（清 localStorage + 清云端）
    let removed = 0;
    const lsAny = g.localStorage as { removeItem: (k: string) => void };
    const origRemove = lsAny.removeItem;
    lsAny.removeItem = (k: string) => {
      removed++;
      origRemove(k);
    };

    useGame.getState().continueAfterEnding();
    lsAny.removeItem = origRemove;

    const after = useGame.getState();
    expect(after.save.ending).toBeNull();
    expect(after.save.keepsakes).toEqual(['ks_stay']);
    expect(after.save.ngPlus.endings).toEqual(['stay']);
    expect(after.save.ngPlus.cycle).toBe(2);
    expect(after.save.branches.stay).toBe(true);
    expect(removed, '「留在这里继续」不得调用 localStorage.removeItem（= 不得走 resetAll）').toBe(0);
  });

  it('continueAfterEnding 与 dismissEnding 都不丢 built / runSeed / signsFound', async () => {
    const useGame = await freshStore();
    useGame.getState().newGame();

    // 伪造「已达成 stay 结局」且带落地成景 / 剧本种子 / 已触发迹象的存档
    const withStayEnding = (base: SaveStateV2): SaveStateV2 => ({
      ...base,
      ending: 'stay',
      keepsakes: ['ks_stay'],
      branches: { ...base.branches, stay: true },
      ngPlus: { cycle: 2, endings: ['stay'], readLogs: [], branchesHistory: ['stay'] },
      built: ['wire'],
      runSeed: 4242,
      signsFound: ['sign_light'],
    });

    /** 两个入口共用 backToGameAfterEnding，断言口径完全一致 */
    const expectBackOnPlanet = () => {
      const after = useGame.getState();
      expect(after.save.ending).toBeNull();
      expect(after.save.keepsakes).toEqual(['ks_stay']);
      expect(after.save.ngPlus.endings).toEqual(['stay']);
      expect(after.save.ngPlus.cycle).toBe(2);
      expect(after.save.branches.stay).toBe(true);
      // built 回归护栏：修前 fromCore 逐字段列举漏带 built，
      // 「回星球」会把它清成 []（落地成景整局痕迹丢掉）
      expect(after.save.built).toEqual(['wire']);
      // runSeed / signsFound 走 core 字段往返 —— 这条路径此前零覆盖
      expect(after.save.runSeed).toBe(4242);
      expect(after.save.signsFound).toEqual(['sign_light']);
    };

    // 入口一：continueAfterEnding（stay / free 结局页「留在这里继续」）
    useGame.setState({ save: withStayEnding(useGame.getState().save) });
    useGame.getState().continueAfterEnding();
    expectBackOnPlanet();

    // 入口二：dismissEnding（R3 反悔出口「再逛逛，先不收摊」）—— 同一实现，同一条路径
    useGame.setState({ save: withStayEnding(useGame.getState().save) });
    useGame.getState().dismissEnding();
    expectBackOnPlanet();
  });
});

describe('readSignsFound 归一化（假 id / 重复 / 非字符串）', () => {
  beforeEach(() => ls.clear());

  it('signsFound 只保留真实 id、去重、剔除非字符串', async () => {
    // 手改存档：重复的真实 id + 假 id + 非字符串混在一起
    ls.set(
      'haola.save.v2',
      JSON.stringify(baseSave({ signsFound: ['sign_light', 'sign_light', 'sign_fake', 42] })),
    );
    const useGame = await freshStore();
    expect(useGame.getState().continueGame()).toBe(true);
    expect(useGame.getState().save.signsFound).toEqual(['sign_light']);
  });
});

describe('QA6 readLog 幂等', () => {
  beforeEach(() => ls.clear());

  it('已读再点不产生多余的云端推送；未读那一次会推送', async () => {
    const pushMock = vi.fn(async () => {});
    vi.doMock('../../web/src/lib/cloud.js', () => ({
      queuePush: pushMock,
      cancelPendingPush: vi.fn(),
      clearCloudSave: vi.fn(async () => {}),
      pullSave: vi.fn(async () => null),
      pushSave: vi.fn(async () => {}),
      progressScoreOf: () => 0,
    }));
    try {
      vi.resetModules();
      const mod = await import('../../web/src/store/gameStore.js');
      mod.useGame.getState().newGame();
      const base = mod.useGame.getState().save;
      mod.useGame.setState({
        save: { ...base, ngPlus: { ...base.ngPlus, readLogs: ['L3'] } },
      });

      pushMock.mockClear();
      // 已读的再点一次 → 不该推送
      mod.useGame.getState().readLog('L3');
      expect(pushMock).not.toHaveBeenCalled();
      // 未读的 → 推一次
      mod.useGame.getState().readLog('L1');
      expect(pushMock).toHaveBeenCalledTimes(1);
      // 读到 L1 后再点 L1 → 仍然不推
      pushMock.mockClear();
      mod.useGame.getState().readLog('L1');
      expect(pushMock).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock('../../web/src/lib/cloud.js');
    }
  });
});
