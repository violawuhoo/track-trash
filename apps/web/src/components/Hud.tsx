/**
 * HUD：天数 / 阶段 / 缩放 / 背包入口。
 *
 * 契约 §6.1、设计系统 §10.1：
 * - 视觉高 `--hud-h`（36px），**不透明**纸卡片 + `--shadow-sm`。
 *   （不做半透明：世界底色随相机变化，12px 字压在动态底上对比度无法验证。）
 * - 容器 `pointer-events: none`，只有按钮自己开启 —— 点 HUD 空白要能落到画布上触发移动。
 * - 热区靠 `::after` 补到 44px，视觉高度不变（设计系统 §8「热区与视觉分离」）。
 */
import { useGame } from '../store/gameStore';

const ZOOM_STEP = 0.2;

export function Hud() {
  const day = useGame((s) => s.save.day);
  const stage = useGame((s) => s.save.stage);
  const bagCount = useGame((s) =>
    Object.values(s.save.bag).reduce((sum, n) => sum + n, 0),
  );
  const zoom = useGame((s) => s.zoom);
  const bagOpen = useGame((s) => s.bagOpen);
  const setZoom = useGame((s) => s.setZoom);
  const toggleBag = useGame((s) => s.toggleBag);

  return (
    <header className="hud">
      <div className="hud__group">
        <span className="stat stat--day">
          <span>第</span>
          <b>{day}</b>
          <span>天</span>
        </span>
        <span className="hud__stage">阶段 {stage === 3 ? '3 · 建设' : stage}</span>
      </div>

      <div className="hud__group">
        <div className="hud__zoom">
          <button
            type="button"
            className="hud__btn"
            onClick={() => setZoom(zoom - ZOOM_STEP)}
            aria-label="缩小"
          >
            −
          </button>
          <span className="hud__zoomval" aria-hidden="true">
            {zoom.toFixed(1)}×
          </span>
          <button
            type="button"
            className="hud__btn"
            onClick={() => setZoom(zoom + ZOOM_STEP)}
            aria-label="放大"
          >
            +
          </button>
        </div>

        <button
          type="button"
          className="hud__bag"
          onClick={toggleBag}
          aria-pressed={bagOpen}
          aria-label={`背包，${bagCount} 件`}
        >
          <span className="hud__baglabel">背包</span>
          {bagCount > 0 && <span className="hud__badge">{bagCount}</span>}
        </button>
      </div>
    </header>
  );
}
