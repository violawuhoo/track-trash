import { useGame } from './store/gameStore';
import { StartScreen } from './screens/StartScreen';
import { GameScreen } from './screens/GameScreen';
import { EndingScreen } from './screens/EndingScreen';
import { ItemSheet, Toast } from './components/Toast';
import { CodexPanel } from './components/CodexPanel';
import { NgPlusConfirm } from './components/NgPlusConfirm';

export default function App() {
  const screen = useGame((s) => s.screen);
  const toast = useGame((s) => s.toast);
  const viewing = useGame((s) => s.viewing);
  const dismissToast = useGame((s) => s.dismissToast);
  const view = useGame((s) => s.view);

  return (
    <>
      {/* 主界面要占满视口，不能被 v1 的 560px 内容列宽夹住 */}
      <div className={`shell ${screen === 'game' ? 'shell--full' : ''}`}>
        {screen === 'start' && <StartScreen />}
        {screen === 'game' && <GameScreen />}
        {screen === 'ending' && <EndingScreen />}
      </div>
      <Toast toast={toast} onDismiss={dismissToast} />
      <ItemSheet id={viewing} onClose={() => view(null)} />
      {/* C2 批次：图鉴（主菜单 / 结局页入口）与二周目确认页（结局页入口）。 */}
      <CodexPanel />
      <NgPlusConfirm />
      <div className="grain" aria-hidden="true" />
    </>
  );
}
