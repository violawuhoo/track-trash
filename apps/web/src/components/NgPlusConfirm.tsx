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
 * ## ⚠️ 清单必须与 core 的 `startNextCycle()` 逐字段对齐
 *
 * QA 2026 复审抓到过一次真实遗漏：初版「重置」段只列了 3 条，漏了 `crafts` 与
 * `logsFound` —— 而 `crafts` 归零**直接卡住 L1（需合成 3 次）与 L5（需合成 14 次）
 * 的解锁**。玩家看完清单以为二周目能直接重读 L1–L5，实际上要重新攒次数。
 *
 * 根因是「core 一份、web 一份、两份靠人同步」。所以现在清单**只有一份**：
 * core 的 `NEXT_CYCLE_KEPT` / `NEXT_CYCLE_RESET`（见下方「字段对照表在哪」）。
 *
 * ### 文案是定稿
 *
 * 三段逐行文案（保留 K1–K5 / 重置 R1–R8 / 增益 G1–G4）由文策渊定稿，
 * 真源是 `docs/design/CONTENT-v3-NGPLUS-UI-COPY.md`。
 * core 的清单里 `text` 字段带 `【N】` 占位符，`note` 字段是「——」之后的后果说明，
 * 本文件只做「插值 + 排版」，**不改一个字**。
 *
 * ### 修法：清单搬到 core，不再手写
 *
 * 手写清单必然漂移（改 core 的人不会记得去改 UI 的清单）。
 * 现在清单是 core 的 `NEXT_CYCLE_KEPT` / `NEXT_CYCLE_RESET`，
 * 与 `startNextCycle()` 放在同一个文件里，
 * 由 `ngplus.test.ts` 的 **B5 断言**守着（少字段 / 多字段 / 分类错 都红）。
 * 本文件只负责把 core 的清单**渲染成玩家能读的话** + 挂上计数。
 *
 * ### 字段对照表在哪
 *
 * **不在这个文件里。** 字段对照表在 core：`packages/game-core/src/ngplus.ts` 的
 * `NEXT_CYCLE_KEPT` / `NEXT_CYCLE_RESET`，与 `startNextCycle()` 同一个文件，
 * 每条自带 `fields`（覆盖哪些存档字段）、`countOf`（计数来源）、`text`、`note`。
 *
 * ⚠️ **这里刻意不抄第二份字段清单**：2026 QA 复审抓到的漏字段（`crafts` /
 * `logsFound`），根因就是「core 一份、web 一份、两份靠人同步」。
 * 抄一份 = 漏字段必然复发。所以本组件**只渲染 core 的 `text` + `countOf`**。
 *
 * 完整性由 `packages/game-core/tests/ngplus.test.ts` 的 **B5 断言**守着，
 * 两个方向都查：
 * - core 改了字段却没加清单 → 红（少字段）；
 * - 清单列了字段但 core 没改 → 红（多字段）；
 * - 分类错（清单标「重置」但实现是保留）→ 红。
 *
 * `ngPlus` 的四个子字段（`endings` / `readLogs` / `branchesHistory` / `cycle`）
 * 在清单里是**点号路径**（`ngPlus.endings` …），拆到子字段粒度，
 * 这样 core 往 `NgPlusState` 里加第五个字段时断言也会红。
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
 * 「保留」与「重置」清单来自 **core**（`NEXT_CYCLE_KEPT` / `NEXT_CYCLE_RESET`）。
 *
 * ⚠️ 为什么要从 core 来，而不是在 web 里手写一份：
 * 2026 QA 复审抓到过真实缺陷 —— web 手写的「重置」清单漏了 `crafts` 与 `logsFound`，
 * 而 `crafts` 归零**直接卡住 L1（需合成 3 次）与 L5（需合成 14 次）的解锁**。
 * 手写清单必然漂移，所以清单搬到 core 并由 `ngplus.test.ts` 的 B5 断言守着
 * （core 加字段却没加清单 → 断言红）。
 *
 * 这里只负责把 core 的字段清单**渲染成玩家能读的话** + 挂上计数。
 */
import { NEXT_CYCLE_KEPT, NEXT_CYCLE_RESET } from '@haola/game-core';

/**
 * 本周目增益（GDD §7.1 G1–G4）。
 *
 * 文案是**定稿**（2026-10-22 文策渊，`docs/design/CONTENT-v3-NGPLUS-UI-COPY.md` §3），
 * 四条**逐字照抄**，不改标点与语气。
 *
 * ⚠️ G4 的方向钉死：实现是「石头唱得比上次**少一遍**」，
 * 所以文案只能写「少唱一遍」——「多唱一句」与实现相反，是被 QA 判过的错误方向。
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
    text: '第一个阶段的目标会多给一行提示 —— 这步要哪两个标签、可能拿什么凑。',
  },
  {
    id: 'G3',
    name: '你认得路',
    text: '走过哪条支线会被标出来——但还是得重新做一遍。',
  },
  {
    id: 'G4',
    name: '石头记得你',
    text: '新的周目里第一次捡到会唱歌的石头时，它会少唱一遍。',
  },
];

export function NgPlusConfirm() {
  const open = useGame((s) => s.ngPlusConfirmOpen);
  const close = useGame((s) => s.closeNgPlusConfirm);
  const startNewCycle = useGame((s) => s.startNewCycle);

  // 细粒度订阅：用 `archive`（跨周目档案镜像）而不是 `s.save.ngPlus`。
  // `archive` 在主菜单 / 结局页 / 游戏内都等于当前真实档案。
  // ⚠️ 不订阅 `s.save` 整体（性能铁律），也不订阅 `player`。
  const endings = useGame((s) => s.archive.endings);
  const readLogs = useGame((s) => s.archive.readLogs);
  const branchesHistory = useGame((s) => s.archive.branchesHistory);
  const keepsakes = useGame((s) => s.archiveKeepsakes);
  const cycle = useGame((s) => s.archive.cycle);

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

  /**
   * 「保留」每一条的计数。
   *
   * `countOf` 指向 core 清单里声明的来源；这里只做取值，不改清单。
   * `Object.is` 去重：数组引用不变时不重算（性能铁律）。
   */
  const counts: Record<string, number> = {
    endings: endings.length,
    readLogs: readLogs.length,
    branchesHistory: branchesHistory.length,
    keepsakes: keepsakes.length,
    // `cycle` 显示的是**即将进入的**周目号（当前 + 1）。
    cycle: nextCycle,
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

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
              {NEXT_CYCLE_KEPT.map((b) => (
                <li key={b.countOf ?? b.text}>
                  {b.countOf ? b.text.replace('【N】', String(counts[b.countOf] ?? 0)) : b.text}
                  {b.note ? <span className="ngplus__note"> —— {b.note}</span> : null}
                </li>
              ))}
            </ul>
          </section>

          <section className="ngplus__section">
            <h3 className="ngplus__sectiontitle">重置</h3>
            <ul className="ngplus__list ngplus__list--reset">
              {NEXT_CYCLE_RESET.map((b) => (
                <li key={b.text}>
                  {b.text}
                  {b.note ? <span className="ngplus__note"> —— {b.note}</span> : null}
                </li>
              ))}
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
