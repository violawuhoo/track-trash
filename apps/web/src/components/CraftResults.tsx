/**
 * 产物架（UI 批次 · 分区改版）。
 *
 * 「单独划分一个区域展示合成完成后的物品」——就是这一条。
 * 数据源是 store 的 `recentCrafts`（瞬态，最新在前，封顶 RECENT_CRAFTS_MAX）。
 * 与背包（原料）、地面（可拾取物）三处分开：这里只放「你造出来的东西」。
 *
 * 点一枚 → `view(id)` 进 `ItemSheet` 看完整描述 / 配方理由。
 */
import { getItem } from '@haola/game-core';
import { useGame } from '../store/gameStore';
import { ItemIcon } from './ItemIcon';

export function CraftResults() {
  const recent = useGame((s) => s.recentCrafts);
  const view = useGame((s) => s.view);

  return (
    <div className="results">
      <div className="results__head">
        <span className="results__title">产物架</span>
        <span className="results__meta">刚造出 {recent.length}</span>
      </div>
      {recent.length === 0 ? (
        <p className="results__empty">还没造出东西。两件原料丢进取合成台试试。</p>
      ) : (
        <div className="results__row">
          {recent.map((id, i) => {
            const item = getItem(id);
            return (
              <button
                key={`${id}-${i}`}
                type="button"
                className="results__chip"
                onClick={() => view(id)}
                title={`查看${item.name}`}
              >
                <ItemIcon id={id} size={28} />
                <span className="results__chipname">{item.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
