import { ENDING_LINES, ENDINGS, type EndingId } from '@haola/game-core';
import { useGame } from '../store/gameStore';

export function EndingScreen() {
  const save = useGame((s) => s.save);
  const resetAll = useGame((s) => s.resetAll);
  const backToStart = useGame((s) => s.backToStart);

  const ending: EndingId = save.ending ?? 'free';
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
