import { memo } from 'react';
import { getItem } from '@haola/game-core';
import { ItemIcon } from './ItemIcon';

interface Props {
  id: string;
  count?: number;
  selected?: boolean;
  /** 点卡片本体：把 id 交给调用方（稳定引用由调用方保证，否则 memo 失效） */
  onSelect?: (id: string) => void;
  /** 点「?」：查看描述浮层 */
  onView?: (id: string) => void;
  showHelp?: boolean;
}

/**
 * 背包网格里的一张卡片。
 *
 * **memo 是性能契约的一部分**（T10-QW1）：BagDrawer 每次 collect 都会重渲染，
 * 没有 memo 时整张网格（含每张卡片的 SVG 字符串重建）都跟着重跑。
 * 因此 props 里的回调必须是稳定引用（`useCallback`），匿名闭包会让 memo 失效。
 */
export const ItemCard = memo(function ItemCard({
  id,
  count,
  selected,
  onSelect,
  onView,
  showHelp,
}: Props) {
  const item = getItem(id);
  // 用 id 哈希做微旋转，让贴纸看起来是手贴的
  const hash = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const tilt = ((hash % 7) - 3) * 0.9;

  return (
    <button
      className={`item ${selected ? 'item--selected' : ''}`}
      onClick={() => onSelect?.(id)}
      style={{ transform: `rotate(${tilt}deg)` }}
      title={item.name}
    >
      {showHelp && onView && (
        <span
          className="item__help"
          role="button"
          aria-label="查看描述"
          onClick={(e) => {
            e.stopPropagation();
            onView(id);
          }}
        >
          ?
        </span>
      )}
      {count !== undefined && count > 1 && <span className="item__count">{count}</span>}
      {/* 走 id 出口：与地面贴纸共用同一份形状数据（契约 §5.2），不另写一套 */}
      <ItemIcon id={id} />
      <span className="item__name">{item.name}</span>
    </button>
  );
});
