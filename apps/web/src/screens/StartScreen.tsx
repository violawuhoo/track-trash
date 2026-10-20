import { hasSavedGame, useGame } from '../store/gameStore';

export function StartScreen() {
  const newGame = useGame((s) => s.newGame);
  const continueGame = useGame((s) => s.continueGame);
  const saved = hasSavedGame();

  return (
    <div className="start">
      <div className="start__kicker">荒诞星球合成</div>
      <h1 className="start__title">好垃</h1>
      <div className="start__pack" aria-hidden="true">
        <span style={{ background: 'var(--orange)' }} />
        <span style={{ background: 'var(--mint)' }} />
        <span style={{ background: 'var(--purple)' }} />
        <span style={{ background: 'var(--pink)' }} />
      </div>
      <p className="start__sub">
        船坠毁了，星球是别人的旧垃圾场。
        <br />
        捡破烂、拼零件、修好信号器——
        <br />
        或者留下来，开一家奶茶店。
      </p>
      <div className="start__actions">
        <button className="btn btn--primary btn--block" onClick={newGame}>
          {saved ? '重新开始' : '开始游戏'}
        </button>
        {saved && (
          <button className="btn btn--block" onClick={() => continueGame()}>
            继续游戏
          </button>
        )}
      </div>
      <div className="start__hint">合成一次算一天。不会死，只会变老。</div>
    </div>
  );
}
