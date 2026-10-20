/**
 * 背包 + 合成台容器。三档布局由 CSS 决定，组件只有一份（设计系统 §10.6）：
 * - `< 768`：全屏抽屉，从底部进，顶部留 `--sp-12`（48px）世界可见，不遮死。
 * - `768–1023`：宽 `--drawer-w`（420px）居中。
 * - `≥ 1024`：常驻右侧 `--sidebar-w`（320px），背包可折叠（合成台始终可见）。
 *
 * 遮罩点击关闭；关闭不重置任何东西（世界层不卸载，角色位置不动）。
 */
import { launchCheck } from '@haola/game-core';
import { useGame } from '../store/gameStore';
import { ItemCard } from './ItemCard';
import { CraftSlots } from './CraftSlots';

export function BagDrawer() {
  const save = useGame((s) => s.save);
  const slots = useGame((s) => s.slots);
  const bagOpen = useGame((s) => s.bagOpen);
  const toggleBag = useGame((s) => s.toggleBag);
  const toggleSlot = useGame((s) => s.toggleSlot);
  const clearSlot = useGame((s) => s.clearSlot);
  const craft = useGame((s) => s.craft);
  const view = useGame((s) => s.view);
  const doLaunch = useGame((s) => s.doLaunch);
  const chooseEnding = useGame((s) => s.chooseEnding);

  const bagIds = Object.keys(save.bag).filter((id) => (save.bag[id] ?? 0) > 0);
  const total = bagIds.reduce((n, id) => n + (save.bag[id] ?? 0), 0);
  const mode = launchCheck(save.bag);
  const showLaunch = save.stage === 3 && mode !== 'none';

  return (
    <>
      <div
        className={`drawer__scrim ${bagOpen ? 'is-open' : ''}`}
        onClick={toggleBag}
        aria-hidden="true"
      />

      <aside
        className={`drawer ${bagOpen ? 'drawer--open' : ''}`}
        aria-label="背包与合成台"
      >
        <div className="drawer__head">
          <span className="drawer__title">背包</span>
          <span className="drawer__meta">
            {bagIds.length} 种 · {total} 件
          </span>
          <button
            type="button"
            className="drawer__toggle"
            onClick={toggleBag}
            aria-expanded={bagOpen}
          >
            {bagOpen ? '收起' : '展开'}
          </button>
        </div>

        <div className="drawer__body">
          <div className="drawer__bag">
            {bagIds.length === 0 ? (
              <p className="drawer__empty">
                空的。点地面走过去，靠近就自动捡起来了。
              </p>
            ) : (
              <div className="bag-grid">
                {bagIds.map((id) => (
                  <ItemCard
                    key={id}
                    id={id}
                    count={save.bag[id]}
                    selected={slots.includes(id)}
                    onClick={() => toggleSlot(id)}
                    onHelp={() => view(id)}
                    showHelp
                  />
                ))}
              </div>
            )}
          </div>

          <CraftSlots slots={slots} onClear={clearSlot} onCraft={craft} />

          {save.stage === 3 && (
            <div className="drawer__final">
              {showLaunch && (
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  onClick={doLaunch}
                >
                  {mode === 'full' ? '起飞 · 准备完毕' : '强行起飞 · 一半机会'}
                </button>
              )}
              {save.branches.teashop && (
                <button
                  type="button"
                  className="btn btn--block"
                  onClick={() => chooseEnding('teashop')}
                >
                  开奶茶店
                </button>
              )}
              {save.branches.birthday && (
                <button
                  type="button"
                  className="btn btn--block"
                  onClick={() => chooseEnding('birthday')}
                >
                  给石头过生日
                </button>
              )}
              <button
                type="button"
                className="btn btn--block"
                onClick={() => chooseEnding('free')}
              >
                留下来
              </button>
            </div>
          )}

          <div className="drawer__stats">
            <span>纪念 {save.keepsakes.length}</span>
            <span>意外 {save.accidents}</span>
            <span>日记 {save.log.length} 条</span>
          </div>
        </div>
      </aside>
    </>
  );
}
