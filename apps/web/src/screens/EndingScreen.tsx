/**
 * 结局页。
 *
 * ## 三个出口（C2 批次 · GDD §7.2）
 *
 * | 出口 | 可见条件 | 行为 |
 * |---|---|---|
 * | 「开始二周目」 | `ngPlusUnlocked` = `cycle >= 1 && endings.length >= 1` | 打开确认页 → 写 `cycle += 1` → 全新周目 state → 播 `DIALOGUE.ngplus` |
 * | 「留在这里继续」 | 仅 stay / free 结局 | **不清档**，回自由模式（清掉 `ending`，保留 `keepsakes` / `ngPlus` / `logsFound` / `branches`） |
 * | 「再来一次」 | 总是 | `newGame` —— 重开**当前周目**（世界清零），但**保留跨周目档案**（`ngPlus` / `keepsakes`） |
 *
 * ## ⚠️「留在这里继续」为什么不能用 `resetAll`
 *
 * `resetAll` 会 `localStorage.removeItem` + `clearCloudSave` + 重建初始 state ——
 * `ngPlus`（结局图鉴 / 已读日志 / 周目数）和 `keepsakes` 会被一起清掉。
 * GDD §7.5 明确「纪念品保留全部」，所以这条路必须用独立的
 * `continueAfterEnding`（core 的 `continueAfterEnding` 只清 `ending`）。
 *
 * ## ⚠️「再来一次」为什么也不能用 `resetAll`
 *
 * 同理：玩家刚打完一个结局，点一次「再来一次」就把图鉴清空了 →
 * 二周目入口再也出不来。所以它走 `newGame`（保留档案，只重置世界）。
 *
 * ## `resetAll` 的 UI 入口
 *
 * 只剩**一处**：下面的「结局数据缺失」兜底分支（存档坏了、结算被打断）。
 * 那里清空全部是合理的 —— 数据已经不可信。文案写明「清空全部记录」，
 * 避免和「再来一次」混淆。
 *
 * ## ⚠️ 不要用 `save.ending ?? 'free'` 兜底
 *
 * 「ending 缺失」和「玩家主动选了自由模式」是两件事 —— 兜底成 free 会让
 * 状态机缺陷（支线完成时 ending 没落盘）伪装成正常结局，玩家看到的是
 * 完全错误的结局页。缺失时显式报错，比静默显示错结局好。
 */
import {
  ENDING_LINES,
  ENDINGS,
  ngPlusUnlocked,
} from '@haola/game-core';
import { useGame } from '../store/gameStore';

export function EndingScreen() {
  // 细粒度订阅（性能铁律）：不订阅 `s.save` 整体。
  const ending = useGame((s) => s.save.ending);
  const day = useGame((s) => s.save.day);
  const accidents = useGame((s) => s.save.accidents);
  const keepsakeCount = useGame((s) => s.save.keepsakes.length);
  const archive = useGame((s) => s.archive);
  const resetAll = useGame((s) => s.resetAll);
  const newGame = useGame((s) => s.newGame);
  const backToStart = useGame((s) => s.backToStart);
  const openNgPlusConfirm = useGame((s) => s.openNgPlusConfirm);
  const continueAfterEnding = useGame((s) => s.continueAfterEnding);
  const toggleCodex = useGame((s) => s.toggleCodex);

  if (!ending) {
    return (
      <div className="ending">
        <div className="ending__stamp">此处盖章</div>
        <h1 className="ending__title">结局数据缺失</h1>
        <p className="ending__sub">
          这一局没有记录结局。存档可能来自旧版本，或结算流程被打断过。
        </p>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            maxWidth: 320,
            margin: '0 auto',
            width: '100%',
          }}
        >
          <button className="btn btn--primary btn--block" onClick={resetAll}>
            清空全部记录并重开
          </button>
          <button className="btn btn--block" onClick={backToStart}>
            回到开始页
          </button>
        </div>
      </div>
    );
  }

  const meta = ENDINGS[ending];
  const paragraphs = ENDING_LINES[ending];

  // 二周目入口：完成至少一个结局后才出现（GDD §7.2）。
  // 一周目内不可见 —— 避免玩家把「重开」当成「跳过」。
  const canStartNgPlus = ngPlusUnlocked(archive);
  // 「留在这里继续」只有 stay / free 有（GDD §7.2）。
  // leave / teashop / birthday 都是「走了」，留下就没意义了。
  const canStayHere = ending === 'stay' || ending === 'free';

  return (
    <div className="ending">
      <div className="ending__stamp">此处盖章</div>
      <h1 className="ending__title">{meta.title}</h1>
      <p className="ending__sub">{meta.subtitle}</p>

      <div className="ending__lines">
        {paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>

      <div className="ending__stats">
        <span>第 {day} 天</span>
        <span>意外 {accidents}</span>
        <span>纪念品 {keepsakeCount}</span>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          maxWidth: 320,
          margin: '0 auto',
          width: '100%',
        }}
      >
        {canStayHere && (
          <button
            className="btn btn--primary btn--block"
            onClick={continueAfterEnding}
          >
            留在这里继续
          </button>
        )}
        {canStartNgPlus && (
          <button className="btn btn--block" onClick={openNgPlusConfirm}>
            {/* 一周目时写「开始二周目」（GDD §7.2 的原措辞）；
                已经在第 2 周目及以后就写「开始新的周目」——
                否则玩家在第三周目点「开始二周目」，进去发现是第三周目，会以为自己记错了。
                `cycle` 的口径是「当前周目序号」，与确认页 / 图鉴三处一致。 */}
            {archive.cycle >= 2 ? '开始新的周目' : '开始二周目'}
          </button>
        )}
        <button className="btn btn--block" onClick={toggleCodex}>
          图鉴
        </button>
        {/*
          「再来一次」= 重开**一周目**（世界清零），但**保留跨周目档案**
          （`ngPlus`：结局图鉴 / 已读日志 / 走过的支线 / 周目数）。
          所以它走 `newGame` 而不是 `resetAll` ——
          `resetAll` 会把 `ngPlus` 一起清掉，玩家点一次「再来一次」，
          结局图鉴就永久空了，二周目入口也再也不会出现。
        */}
        <button className="btn btn--block" onClick={newGame}>
          再来一次
        </button>
        <button className="btn btn--block" onClick={backToStart}>
          回到开始页
        </button>
      </div>
    </div>
  );
}
