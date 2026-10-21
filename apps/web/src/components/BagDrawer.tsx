/**
 * 背包 + 合成台容器。三档布局由 CSS 决定，组件只有一份（设计系统 §10.6）：
 * - `< 768`：全屏抽屉，从底部进，顶部留 `--sp-12`（48px）世界可见，不遮死。
 * - `768–1023`：宽 `--drawer-w`（420px）居中。
 * - `≥ 1024`：常驻右侧 `--sidebar-w`（320px），背包可折叠（合成台始终可见）。
 *
 * 遮罩点击关闭；关闭不重置任何东西（世界层不卸载，角色位置不动）。
 */
import { useCallback, useEffect, useState } from 'react';
import { BRANCHES, launchCheck } from '@haola/game-core';
import { useGame } from '../store/gameStore';
import { ItemCard } from './ItemCard';
import { CraftSlots } from './CraftSlots';

/** 抽屉滑出动画时长（tokens.css --dur-2 = 180ms）。关抽屉后等这么久再跳过布局，
 *  避免动画播到一半内容被抽走。reduced-motion 下过渡是 1ms，多等无害。 */
const DRAWER_SLIDE_MS = 200;

/** ≥1024px：常驻右侧栏，「折叠」只是收掉 bag 网格，合成台始终可见（设计系统 §10.6）。
 *  没有滑出动画，也永远不能跳过 body 布局——那会把合成台一起收掉。 */
const DESKTOP_MQ = '(min-width: 1024px)';
/** 768–1023px：宽 420px 居中，收起 transform 带 -50% 横向分量（app.css 平板断段） */
const TABLET_MQ = '(min-width: 768px) and (max-width: 1023px)';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export function BagDrawer() {
  // 细粒度订阅（T10-QW1）：只订阅本组件真正用到的字段。
  // 订阅整个 save 会让每次 collect / 台词 / 引导推进都重渲染整张背包网格——
  // 那是拾取帧整文档 Layout 的根因（见 docs/perf/PERF-REPORT-v2.md B1）。
  const bag = useGame((s) => s.save.bag);
  const stage = useGame((s) => s.save.stage);
  const branches = useGame((s) => s.save.branches);
  // G3「你认得路」（C2 批次）：上周目走过的支线。数组引用只在开新周目时变。
  const branchesHistory = useGame((s) => s.save.ngPlus.branchesHistory);
  const keepsakeCount = useGame((s) => s.save.keepsakes.length);
  const accidentCount = useGame((s) => s.save.accidents);
  const logCount = useGame((s) => s.save.log.length);
  const slots = useGame((s) => s.slots);
  const bagOpen = useGame((s) => s.bagOpen);

  const toggleBag = useGame((s) => s.toggleBag);
  const toggleSlot = useGame((s) => s.toggleSlot);
  const clearSlot = useGame((s) => s.clearSlot);
  const craft = useGame((s) => s.craft);
  const view = useGame((s) => s.view);
  const doLaunch = useGame((s) => s.doLaunch);
  const chooseEnding = useGame((s) => s.chooseEnding);

  // 稳定回调：ItemCard 是 memo 的，匿名闭参会每次都变、让 memo 失效
  const onSelect = useCallback((id: string) => toggleSlot(id), [toggleSlot]);
  const onView = useCallback((id: string) => view(id), [view]);

  /**
   * 关闭态跳过抽屉体的布局与绘制（T10-QW1 收尾）。
   *
   * 抽屉关着只是被 transform 移出屏幕 + visibility:hidden，子树仍然参与布局——
   * 而每次 collect 都会弄脏这棵常驻子树（trace 实测 45/121 个对象，
   * 整文档 Layout 42–66ms@4× 降速）。`content-visibility: hidden` 让关着的
   * 抽屉体整体退出布局，collect 的脏区就不再包含它。
   *
   * 三条护栏，缺一条动画就塌（都实测复现过）：
   * ① 延迟 200ms 生效：等滑出动画（--dur-2 = 180ms）播完再抽内容，
   *    否则收起动画会播放到一半突然塌成只剩标题栏。
   * ② 桌面常驻侧栏（≥1024）永不跳过：那边的「折叠」是 CSS display 收 bag
   *    网格，合成台必须始终可见（§10.6），跳过 body 会把合成台一起收掉。
   * ③ 跳过期间把面板的收起 transform 覆盖成 100dvh：body 被压成 0 高后，
   *    面板只剩标题栏，CSS 的 translateY(105%) 相对塌掉的高度只有 ~85px——
   *    面板会缩在屏幕底边，重开时从 85px 处滑入，「从底部进」塌成 85px
   *    微移。100dvh 与视口等高，面板塌不塌都远在屏幕外；重开时内联样式
   *    移除，从屏幕外完整滑入。平板断段的 transform 带 -50% 横向分量。
   *
   * 已知取舍：跳过期间 body 高度为 0，包内滚动位置会重置——60 件物品上限
   * 下网格很短，重开从顶部开始可接受，换来的是 collect 帧的脏区减半。
   */
  const isDesktop = useMediaQuery(DESKTOP_MQ);
  const isTablet = useMediaQuery(TABLET_MQ);
  const skipTransform = isTablet ? 'translate(-50%, 100dvh)' : 'translateY(100dvh)';
  const [bodySkipped, setBodySkipped] = useState(false);
  useEffect(() => {
    if (bagOpen || isDesktop) {
      setBodySkipped(false);
      return;
    }
    const timer = window.setTimeout(() => setBodySkipped(true), DRAWER_SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [bagOpen, isDesktop]);

  const bagIds = Object.keys(bag).filter((id) => (bag[id] ?? 0) > 0);
  const total = bagIds.reduce((n, id) => n + (bag[id] ?? 0), 0);
  const mode = launchCheck(bag);
  const showLaunch = stage === 3 && mode !== 'none';

  return (
    <>
      <div
        className={`drawer__scrim ${bagOpen ? 'is-open' : ''}`}
        onClick={toggleBag}
        aria-hidden="true"
      />

      <aside
        className={`drawer ${bagOpen ? 'drawer--open' : ''}`}
        style={bodySkipped ? { transform: skipTransform } : undefined}
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

        <div
          className="drawer__body"
          style={bodySkipped ? { contentVisibility: 'hidden' } : undefined}
        >
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
                    count={bag[id]}
                    selected={slots.includes(id)}
                    onSelect={onSelect}
                    onView={onView}
                    showHelp
                  />
                ))}
              </div>
            )}
          </div>

          <CraftSlots slots={slots} onClear={clearSlot} onCraft={craft} />

          {/*
            支线面板（G3「你认得路」）。
            四条支线各一行：本周目做完 / 上周目走过 / 还没动。
            「上次走过」来自 `ngPlus.branchesHistory`（跨周目保留）。
            注意：上周目做完的支线**本周目仍需重做**（世界进度清零）——
            所以标记只是提示，不是「已完成」。
          */}
          <div className="drawer__branches">
            <div className="drawer__brancheshead">支线</div>
            {BRANCHES.map((b) => {
              const done = branches[b.id] === true;
              const before = branchesHistory.includes(b.id);
              return (
                <div
                  key={b.id}
                  className={`drawer__branch ${done ? 'is-done' : ''}`}
                >
                  <span className="drawer__branchname">{b.name}</span>
                  {done && <span className="drawer__branchflag">本周目完成</span>}
                  {!done && before && (
                    <span className="drawer__branchflag drawer__branchflag--past">
                      上次走过
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/*
            收尾区。GDD §2.5：「自由模式」= 完成迫降期（stage ≥ 2）后随时可选，
            所以整块在 stage ≥ 2 就出现；起飞按钮仍只在 stage 3。
          */}
          {stage >= 2 && (
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
              {branches.teashop && (
                <button
                  type="button"
                  className="btn btn--block"
                  onClick={() => chooseEnding('teashop')}
                >
                  开奶茶店
                </button>
              )}
              {branches.birthday && (
                <button
                  type="button"
                  className="btn btn--block"
                  onClick={() => chooseEnding('birthday')}
                >
                  给石头过生日
                </button>
              )}
              {/*
                第四支线「留下来」。与 free 同时可选、互不关闭（GDD §3.4）：
                free 是「什么都不再追求」，stay 是「这个地方承认了你」。
                按钮文案必须区分，故 free 用「自由模式」、stay 用「留下来」。
              */}
              {branches.stay && (
                <button
                  type="button"
                  className="btn btn--block"
                  onClick={() => chooseEnding('stay')}
                >
                  留下来
                </button>
              )}
              <button
                type="button"
                className="btn btn--block"
                onClick={() => chooseEnding('free')}
              >
                自由模式
              </button>
            </div>
          )}

          <div className="drawer__stats">
            <span>纪念 {keepsakeCount}</span>
            <span>意外 {accidentCount}</span>
            <span>日记 {logCount} 条</span>
          </div>
        </div>
      </aside>
    </>
  );
}
