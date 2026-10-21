/**
 * 二周目确认页（C2 批次）。
 *
 * GDD §7.2 流程图：结局页「开始二周目」→ **确认页**（列出：保留什么 / 重置什么 /
 * 本周目增益）→ 写 `ngPlus.cycle += 1` → 全新周目 state → 播 `DIALOGUE.ngplus`。
 *
 * ## 为什么要确认页
 *
 * 「开始二周目」是一个**不可逆**的动作：世界进度全部清零（背包、阶段、天数、
 * 支线、意外数、日志全没了）。玩家在结局页点错了按钮就再也回不去了 ——
 * 所以必须在点下去之前把「你会失去什么」摆出来。
 *
 * 这一页只做两件事：
 * 1. 把 GDD §7.1 的保留 / 重置清单原样列出来（不夸大、不缩小）
 * 2. 把 G1–G4 四个本周目增益列出来（让玩家知道「重来不是纯亏」）
 *
 * ## 文案口径
 *
 * 增益列表的文案是**工程自拟**，标注在下面的 `Gains` 常量里，
 * **待文策渊定稿**。结构（三段：保留 / 重置 / 增益）与条数对齐 GDD §7.1，
 * 但措辞不是定稿稿。
 *
 * ## `cycle` 的口径（与图鉴 / 结局页入口统一）
 *
 * `cycle` = **当前周目序号**（1 = 一周目）。
 * - 本页确认 → `cycle += 1`（core 的 `startNextCycle`）
 * - 「再来一次」/「重新开始」（`newGame`）→ **cycle 不变**（重开当前周目）
 *
 * 所以按钮写「第 N 周目」时 N 恒等于确认后写入的 `cycle` 值 ——
 * 三处（图鉴 / 结局页入口 / 本页）说的是同一件事。
 */
import { useEffect } from 'react';
import { useGame } from '../store/gameStore';

/**
 * 本周目增益（GDD §7.1 G1–G4）。
 *
 * ⚠️ **文案待定稿**（工程自拟）。GDD 只给了「具体表现」的技术描述，
 * 这里转写成玩家能读的一句话。四条的**效果**全部已实现（core + web），
 * 只有措辞等文策渊过一遍。
 */
const GAINS: readonly { id: string; name: string; text: string }[] = [
  {
    id: 'G1',
    name: '你记得',
    text: '读过的前任记录不用再解锁，翻开就在那儿。',
  },
  {
    id: 'G2',
    name: '你有点手艺',
    text: '第一个阶段的目标会多给一行可行的配对示例。',
  },
  {
    id: 'G3',
    name: '你认得路',
    text: '走过哪条支线会被标出来——但还是得重新做一遍。',
  },
  {
    id: 'G4',
    name: '石头记得你',
    text: '第一天捡到会唱歌的石头时，它会多唱一句给你听。',
  },
];

export function NgPlusConfirm() {
  const open = useGame((s) => s.ngPlusConfirmOpen);
  const close = useGame((s) => s.closeNgPlusConfirm);
  const startNewCycle = useGame((s) => s.startNewCycle);

  // 细粒度订阅：用 `archive`（跨周目档案镜像）而不是 `s.save.ngPlus`。
  // `archive` 在主菜单 / 结局页 / 游戏内都等于当前真实档案。
  const endings = useGame((s) => s.archive.endings);
  const readLogs = useGame((s) => s.archive.readLogs);
  const keepsakeCount = useGame((s) => s.archiveKeepsakes.length);
  const cycle = useGame((s) => s.archive.cycle);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  /**
   * 即将进入的周目序号。
   *
   * `cycle` 的口径（**全站统一**）：**当前周目序号**，1 = 一周目。
   * - `startNextCycle`（本页确认后）→ `cycle += 1` → 进入下一周目。
   * - `newGame`（「再来一次」/ 主菜单「重新开始」）→ **cycle 不变**：
   *   重开的是**当前这一周目**，不是「开新周目」。开新周目只有本页一个入口。
   *
   * 所以这里的「第 N 周目」= 即将进入的周目序号，与 core 的
   * `startNextCycle` 写入的值严格一致（图鉴 / 结局页入口 / 本页三处同义）。
   */
  const nextCycle = cycle + 1;

  return (
    <div className="sheet ngplus" onClick={close}>
      <div
        className="ngplus__card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="开始新的周目"
      >
        <div className="ngplus__head">
          <span className="ngplus__title">开始新的周目</span>
          <span className="ngplus__meta">第 {nextCycle} 周目 · 带着记忆再来一遍</span>
        </div>

        <div className="ngplus__body">
          <section className="ngplus__section">
            <h3 className="ngplus__sectiontitle">保留</h3>
            <ul className="ngplus__list ngplus__list--keep">
              <li>已解锁的结局（{endings.length} 个）</li>
              <li>读过的前任记录（{readLogs.length} 篇）</li>
              <li>纪念品（{keepsakeCount} 件）</li>
            </ul>
          </section>

          <section className="ngplus__section">
            <h3 className="ngplus__sectiontitle">重置</h3>
            <ul className="ngplus__list ngplus__list--reset">
              <li>背包、地面上的东西、天数</li>
              <li>阶段进度与已完成的支线</li>
              <li>意外次数与这一周的世界日志</li>
            </ul>
          </section>

          <section className="ngplus__section">
            <h3 className="ngplus__sectiontitle">本周目增益</h3>
            <ul className="ngplus__list ngplus__list--gain">
              {GAINS.map((g) => (
                <li key={g.id}>
                  <b>{g.id} · {g.name}</b>
                  <span>{g.text}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="ngplus__actions">
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={startNewCycle}
          >
            开始第 {nextCycle} 周目
          </button>
          <button type="button" className="btn btn--block" onClick={close}>
            再想想
          </button>
        </div>
      </div>
    </div>
  );
}
