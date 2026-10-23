import { useEffect } from 'react';
import { autoDetectRenderer } from 'pixi.js';
import { hasSavedGame, useGame } from '../store/gameStore';

/**
 * 开始屏空闲预热 Pixi 渲染器（T10-QW2）。
 *
 * 背景：`WorldCanvas` 挂载时 `app.init()` → `autoDetectRenderer()` 才动态 import
 * 7 个渲染器 chunk（≈56KB gz：WebGLRenderer / RenderTargetSystem / browserAll /
 * webworkerAll / getTexelRangeRects / canvasUtils / CanvasPool），首次点击
 * 「开始游戏」要「下载 + 解析 + WebGL 初始化」一条龙走完（实测 488–610ms@4× 降速，
 * 弱网更糟）。开始屏通常停留 10s+，足够把这些成本挪到空闲期。
 *
 * 为什么必须真的调一次 `autoDetectRenderer`：那 7 个 chunk 的 `import()` 写在
 * Pixi 的 `autoDetectRenderer` 函数体里（`pixi.js/lib/rendering/renderers/
 * autoDetectRenderer.mjs`），只 import 模块图不会触发它们。
 *
 * 为什么必须**静态** import pixi：动态 `import('pixi.js')` 会让 Rollup 以
 * 「dynamic import will not move module into another chunk」为由把整个 pixi 图
 * （含 3 个渲染器后端）合并进主 chunk——首屏 JS gzip 从 158.6KB 涨到 345.8KB，
 * 突破 250KB 验收线（T10-R2 实测复现）。pixi 本来就在主 chunk 里（世界层静态
 * 导入），静态引用零成本，也不改变分包结构。
 *
 * 热身渲染器用完即销毁（`destroy(true)` 连 canvas 一起摘）。点击路径还会再建
 * 一个真渲染器——模块已在缓存里，省掉的是下载与能力探测，不是上下文创建。
 * 没有 WebGL 的环境静默失败：点击后走 WorldCanvas 既有的降级路径。
 *
 * StrictMode 双挂载 + 用户秒点都有护栏：模块级 `warmed` 旗保证只热一次；
 * 渲染中/已销毁不重试；失败不影响任何玩法。
 */
let warmed = false;

function warmPixi(): void {
  if (warmed) return;
  warmed = true;
  // 应用侧模块图（当前多数已在主 chunk 里，这里是语义声明 + 未来代码分割的兜底）
  void import('../world/WorldCanvas');
  // 真正触发那 7 个 chunk 的加载（静态引用，不触发 chunk 合并）
  void (async () => {
    try {
      const renderer = await autoDetectRenderer({ width: 1, height: 1, antialias: false });
      renderer.destroy(true);
    } catch {
      // 静默：预热失败不影响点击后的正常初始化（那里有自己的 try/catch 降级）
    }
  })();
}

export function StartScreen() {
  const newGame = useGame((s) => s.newGame);
  const continueGame = useGame((s) => s.continueGame);
  const toggleCodex = useGame((s) => s.toggleCodex);
  // 订阅到 store 上，云档拉回本地（T8）后能立刻出现「继续游戏」。
  // 直接调 hasSavedGame() 只在渲染时读一次 localStorage，拉取完成不会重渲染。
  const saved = useGame(() => hasSavedGame());

  useEffect(() => {
    // requestIdleCallback 不存在时退化为 1.2s 定时器（老 WebView）
    const ric = typeof window !== 'undefined' ? window.requestIdleCallback : undefined;
    if (ric) {
      const handle = ric(warmPixi, { timeout: 5000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(warmPixi, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="start">
      <div className="start__kicker">荒诞星球合成</div>
      <h1 className="start__title">好垃</h1>
      <div className="start__pack" aria-hidden="true">
        <span style={{ background: 'var(--orange)' }} />
        <span style={{ background: 'var(--mint)' }} />
        <span style={{ background: 'var(--purple)' }} />
        <span style={{ background: 'var(--pink)' }} />
      </div>
      <p className="start__sub">
        你说不清自己是什么。船坠毁在别人的旧垃圾场上。
        <br />
        捡垃圾、拼零件、造一艘能回家的东西——
        <br />
        合不成火箭的话，这颗星球上也有别的活法。
      </p>
      <div className="start__actions">
        <button className="btn btn--primary btn--block" onClick={newGame}>
          {saved ? '重新开始' : '开始游戏'}
        </button>
        {saved && (
          <button className="btn btn--block" onClick={() => continueGame()}>
            继续游戏
          </button>
        )}
        {/* C2 批次：图鉴入口（GDD §7.2「主菜单与结局页各一个」）。 */}
        <button className="btn btn--block" onClick={toggleCodex}>
          图鉴
        </button>
      </div>
      <div className="start__hint">合成一次算一天。不会死，只会变老。</div>
    </div>
  );
}
