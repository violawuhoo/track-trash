/**
 * A2 批次：第四支线 `stay` + 新结局 + 自由模式口径修正。
 *
 * 覆盖 5 组断言：
 * - ⑨ stay 支线定义与 GDD §3.1 一致（三槽位、具体物品 id 判定、纪念品、结局）
 * - ⑩ stay 完成判定：三个槽位各齐一件即达成；发 ks_stay；非 ship 支线完成即进结局
 * - ⑪ free 口径：stage ≥ 2 才可选；stage 1 不可选；stay 完成后 free 仍可选
 * - ⑫ ngPlus 字段：新档 false、字段进类型、老档缺失时归一化由 web 端负责
 * - ⑬ ENDINGS.stay / ENDING_LINES.stay 与 GDD §3.3 一致
 */
import { describe, expect, it } from 'vitest';
import {
  BRANCHES,
  ENDING_LINES,
  ENDINGS,
  availableEndings,
  branchStatus,
  createInitialState,
  craft,
} from '../src/index';
import type { SaveState } from '../src/index';

/** 阶段 3 的存档（stage 3 才能触发支线检查） */
function stage3State(bag: Record<string, number> = {}): SaveState {
  return { ...createInitialState(), stage: 3, stepIndex: 0, bag: { ...bag } };
}

describe('A2 · 第四支线 stay', () => {
  it('⑨ 支线定义与 GDD §3.1 一致', () => {
    const stay = BRANCHES.find((b) => b.id === 'stay');
    expect(stay).toBeDefined();
    if (!stay) throw new Error('unreachable');
    expect(stay.name).toBe('留下来');
    expect(stay.slots).toEqual(['落脚', '营生', '熟人']);
    expect(stay.requires).toEqual([
      ['staykey', 'landdeed'],
      ['toolstand', 'sewkit'],
      ['neighbor', 'warmchair'],
    ]);
    expect(stay.keepsake).toBe('ks_stay');
    expect(stay.ending).toBe('stay');
    // 四条支线
    expect(BRANCHES.map((b) => b.id)).toEqual(['ship', 'teashop', 'birthday', 'stay']);
  });

  it('⑩ 三个槽位各齐一件即达成；发 ks_stay；完成即进结局', () => {
    // 槽位按**具体物品 id** 判定 —— 标签对但物品不对不算
    const stay = BRANCHES.find((b) => b.id === 'stay')!;
    const first = branchStatus(stay, { staykey: 1, toolstand: 1, neighbor: 1 });
    expect(first.done).toBe(true);

    // 换一组候选（landdeed / sewkit / warmchair）同样成立
    const alt = branchStatus(stay, { landdeed: 1, sewkit: 1, warmchair: 1 });
    expect(alt.done).toBe(true);

    // 缺一件就不成立
    const partial = branchStatus(stay, { staykey: 1, toolstand: 1 });
    expect(partial.done).toBe(false);
    expect(partial.filledCount).toBe(2);

    // 走一次真实 craft：合成 staykey → 支线达成 → 发纪念品 + 进结局
    // （craft 消耗背包里的材料，故 switchpanel / fossil 要先在包里）
    const state = stage3State({ switchpanel: 1, fossil: 1, toolstand: 1, neighbor: 1 });
    expect(state.branches.stay).toBe(false);

    const res = craft(state, 'switchpanel', 'fossil'); // → staykey
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.state.bag.staykey).toBe(1);
    expect(res.state.branches.stay).toBe(true);
    expect(res.state.keepsakes).toContain('ks_stay');
    expect(res.ending).toBe('stay');
    expect(res.state.log.some((l) => l.kind === '支线')).toBe(true);
  });

  it('⑩b stay 完成不因缺 buildDone 而失效（可见性门禁不加在完成判定上，GDD §3.6）', () => {
    // buildDone = false（建设期还没走满），但 stay 仍可完成
    const state = stage3State({ switchpanel: 1, fossil: 1, toolstand: 1, neighbor: 1 });
    expect(state.buildDone).toBe(false);
    const res = craft(state, 'switchpanel', 'fossil');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.state.branches.stay).toBe(true);
  });

  it('⑪ free 口径：stage ≥ 2 才可选，stage 1 不可选', () => {
    // stage 1：没有 free
    const s1: SaveState = { ...createInitialState(), stage: 1 };
    expect(availableEndings(s1)).not.toContain('free');

    // stage 2：free 可选
    const s2: SaveState = { ...createInitialState(), stage: 2 };
    expect(availableEndings(s2)).toContain('free');

    // stage 3：free 仍可选
    const s3: SaveState = { ...createInitialState(), stage: 3 };
    expect(availableEndings(s3)).toContain('free');
  });

  it('⑪b stay 完成后 free 仍可选（两者不互斥，GDD §3.4）', () => {
    const s: SaveState = {
      ...createInitialState(),
      stage: 3,
      branches: { ship: false, teashop: false, birthday: false, stay: true },
    };
    const list = availableEndings(s);
    expect(list).toContain('stay');
    expect(list).toContain('free');
  });

  it('⑫ ngPlus 字段：新档为 false，且进 SaveState 类型', () => {
    const s = createInitialState();
    expect(s.ngPlus).toBe(false);
    // 不 bump schemaVersion（本批只加字段，老档走归一化）
    expect(s.schemaVersion).toBe(1);
    // branches 初始形状含 stay
    expect(s.branches).toEqual({ ship: false, teashop: false, birthday: false, stay: false });
  });

  it('⑬ ENDINGS.stay 与 ENDING_LINES.stay 与 GDD §3.3 一致', () => {
    expect(ENDINGS.stay.title).toBe('留下来');
    expect(ENDINGS.stay.subtitle).toBe('你没有走。石头多了一个会回来的邻居。');
    expect(ENDING_LINES.stay).toEqual([
      '没有起飞。你的行李里多了一个能住人的地方。',
      '前人把钥匙留给了这颗星球，你把它用上了。这大概是这里最像遗产的东西。',
      '石头今天唱得比平时多三遍。多出来的部分，我在你的日志里也记了。',
      '我建议你把这地方记成坐标。以后有人路过，至少知道这儿可以停。',
    ]);
  });
});
