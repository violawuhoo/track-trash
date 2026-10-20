/**
 * T7 引导提示条：常驻「下一步做什么」，贴在对话条上方（引导期内 HintBar 让位，两者不并存）。
 *
 * 设计约束：
 * - 只读 `save.tutorial.step`，不订阅 `player`（每帧更新，会重渲染整棵树）。
 * - 容器 `pointer-events: none`，只有 pill 自己可点 —— 引导期间不阻塞移动（卡片验收）。
 * - step 到 `free` 组件直接返回 null，零残留。
 */
import { useGame } from '../store/gameStore';

const STEP_COPY: Readonly<Record<string, string>> = {
  newcomer: '点一下地面，小人会直线走过去。',
  firstMove: '走近地上的东西，它会自己进背包——不用按钮。',
  firstPickup: '点右上角「背包」，放两样东西进合成台，按「合成这两样」。',
};

export function TutorBar() {
  const step = useGame((s) => s.save.tutorial.step);
  if (step === 'free') return null;

  const text = STEP_COPY[step];
  if (!text) return null;

  return (
    <div className="tutor">
      <div className="tutor__pill" role="status">
        <span className="tutor__badge">引导</span>
        <span className="tutor__text">{text}</span>
      </div>
    </div>
  );
}
