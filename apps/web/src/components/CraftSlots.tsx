/**
 * 双槽 + 合成按钮。
 *
 * 设计系统 §10.3：槽 `min-height: --slot-h`（62px），空态 3px 虚线，填充态实线。
 * 槽位只接受背包里的东西（禁用拖拽，REDESIGN §5），点槽清空。
 * 位置由父容器决定：手机在背包抽屉底部，网页在常驻右侧栏。
 */
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
        <span className="slot__empty">放东西</span>
      </div>
    );
  }
  const item = getItem(id);
  return (
    <button
      type="button"
      className="slot slot--filled"
      onClick={() => onClear(index)}
      aria-label={`第 ${index + 1} 槽：${item.name}，点击取出`}
    >
      <ItemIcon id={id} size={26} />
      <span className="slot__name">{item.name}</span>
    </button>
  );
}

export function CraftSlots({ slots, onClear, onCraft }: Props) {
  const ready = !!slots[0] && !!slots[1];

  return (
    <div className="bench">
      <div className="bench__inner">
        <div className="bench__label">合成台 · 消耗两件 · +1 天</div>
        <div className="slots">
          <Slot id={slots[0]} index={0} onClear={onClear} />
          <span className="slot__plus" aria-hidden="true">
            +
          </span>
          <Slot id={slots[1]} index={1} onClear={onClear} />
        </div>
        <button
          type="button"
          className="btn btn--primary btn--block bench__go"
          disabled={!ready}
          onClick={onCraft}
        >
          {ready ? '合成这两样' : '先放两样东西进去'}
        </button>
      </div>
    </div>
  );
}
