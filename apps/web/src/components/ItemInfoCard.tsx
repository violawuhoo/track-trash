/**
 * 走近信息卡（UI 批次 · 分区改版）。
 *
 * 交互改动：取消「走近自动拾取」，改成走近弹出这张卡——
 * 每次走近一件新物品都由 `WorldCanvas.onFocusItem` 触发一次。
 * 真正入包要点「拾取」（或直接点地上的物品），二选一。
 *
 * 设计取舍：
 * - 只放 图标 + 名字 + 标签 + 两个按钮，**不放长描述**——文字堆在操作瞬间没人看，
 *   完整描述走「?」进 `ItemSheet`（想看才看）。
 * - 容器 `pointer-events: none`，只有按钮可点：点卡片空白要能落到画布上继续移动。
 * - 与 HintBar 同底同槽、z 高一级：走近物品时盖住合成提示（此刻物品信息更相关）。
 */
import { getItem } from '@haola/game-core';
import { useGame } from '../store/gameStore';
import { ItemIcon } from './ItemIcon';

export function ItemInfoCard() {
  const focus = useGame((s) => s.focusItem);
  const collect = useGame((s) => s.collect);
  const view = useGame((s) => s.view);

  if (!focus) return null;
  const item = getItem(focus.id);

  return (
    <div className="infocard" role="status" aria-live="polite">
      <ItemIcon id={focus.id} size={44} />
      <div className="infocard__body">
        <div className="infocard__name">{item.name}</div>
        <div className="infocard__tags">{item.tags.join(' · ')}</div>
      </div>
      <div className="infocard__actions">
        <button
          type="button"
          className="infocard__view"
          onClick={() => view(focus.id)}
          aria-label={`查看${item.name}的描述`}
        >
          ?
        </button>
        <button
          type="button"
          className="infocard__pick"
          onClick={() => collect(focus.uid)}
        >
          拾取
        </button>
      </div>
    </div>
  );
}
