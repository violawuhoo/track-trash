import { ENDING_LINES, ENDINGS, type EndingId } from '@haola/game-core';
import { useGame } from '../store/gameStore';

export function EndingScreen() {
  const save = useGame((s) => s.save);
  const resetAll = useGame((s) => s.resetAll);
  const backToStart = useGame((s) => s.backToStart);

  // ⚠️ 不要用 `save.ending ?? 'free'` 兜底。
  // 「ending 缺失」和「玩家主动选了自由模式」是两件事 —— 兜底成 free 会让
  // 状态机缺陷（支线完成时 ending 没落盘）伪装成正常结局，玩家看到的是
  // 完全错误的结局页。缺失时显式报错，比静默显示错结局好。
  const ending: EndingId | null = save.ending;

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
            重开一局
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
        <span>第 {save.day} 天</span>
        <span>意外 {save.accidents}</span>
        <span>纪念品 {save.keepsakes.length}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, margin: '0 auto', width: '100%' }}>
        <button className="btn btn--primary btn--block" onClick={resetAll}>
          再来一次
        </button>
        <button className="btn btn--block" onClick={backToStart}>
          回到开始页
        </button>
      </div>
    </div>
  );
}
