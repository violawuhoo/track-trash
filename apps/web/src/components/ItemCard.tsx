import { getItem } from '@haola/game-core';
import { ItemIcon } from './ItemIcon';

interface Props {
  id: string;
  count?: number;
  selected?: boolean;
  onClick?: () => void;
  onHelp?: () => void;
  showHelp?: boolean;
}

export function ItemCard({ id, count, selected, onClick, onHelp, showHelp }: Props) {
  const item = getItem(id);
  // 用 id 哈希做微旋转，让贴纸看起来是手贴的
  const hash = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const tilt = ((hash % 7) - 3) * 0.9;

  return (
    <button
      className={`item ${selected ? 'item--selected' : ''}`}
      onClick={onClick}
      style={{ transform: `rotate(${tilt}deg)` }}
      title={item.name}
    >
      {showHelp && onHelp && (
        <span
          className="item__help"
          role="button"
          aria-label="查看描述"
          onClick={(e) => {
            e.stopPropagation();
            onHelp();
          }}
        >
          ?
        </span>
      )}
      {count !== undefined && count > 1 && <span className="item__count">{count}</span>}
      <ItemIcon icon={item.icon} color={item.color} />
      <span className="item__name">{item.name}</span>
    </button>
  );
}
