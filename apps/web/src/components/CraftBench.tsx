import { getItem } from '@haola/game-core';
import { ItemIcon } from './ItemIcon';

interface Props {
  slots: [string | null, string | null];
  onClear: (index: number) => void;
  onCraft: () => void;
}

function Slot({
  id,
  index,
  onClear,
}: {
  id: string | null;
  index: number;
  onClear: (i: number) => void;
}) {
  if (!id) {
    return (
      <div className="slot">
        <span className="muted">放东西</span>
      </div>
    );
  }
  const item = getItem(id);
  return (
    <button className="slot slot--filled" onClick={() => onClear(index)}>
      <ItemIcon icon={item.icon} color={item.color} size={26} />
      <span className="slot__name">{item.name}</span>
    </button>
  );
}

export function CraftBench({ slots, onClear, onCraft }: Props) {
  const ready = !!slots[0] && !!slots[1];

  return (
    <div className="bench">
      <div className="bench__inner">
        <div className="bench__label">合成台 · 消耗两件 · +1 天</div>
        <div className="slots">
          <Slot id={slots[0]} index={0} onClear={onClear} />
          <span className="slot__plus">+</span>
          <Slot id={slots[1]} index={1} onClear={onClear} />
        </div>
        <button
          className="btn btn--primary btn--block"
          style={{ marginTop: 10 }}
          disabled={!ready}
          onClick={onCraft}
        >
          {ready ? '合成这两样' : '先放两样东西进去'}
        </button>
      </div>
    </div>
  );
}
