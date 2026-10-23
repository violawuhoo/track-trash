/**
 * HUD：天数 / 阶段 / 缩放 / 背包入口。
 *
 * 契约 §6.1、设计系统 §10.1：
 * - 视觉高 `--hud-h`（36px），**不透明**纸卡片 + `--shadow-sm`。
 *   （不做半透明：世界底色随相机变化，12px 字压在动态底上对比度无法验证。）
 * - 容器 `pointer-events: none`，只有按钮自己开启 —— 点 HUD 空白要能落到画布上触发移动。
 * - 热区靠 `::after` 补到 44px，视觉高度不变（设计系统 §8「热区与视觉分离」）。
 */
import { useMemo } from 'react';
import { leadingLine, readableLogs } from '@haola/game-core';
import { useGame } from '../store/gameStore';

const ZOOM_STEP = 0.2;

export function Hud() {
  const day = useGame((s) => s.save.day);
  const stage = useGame((s) => s.save.stage);
  const bag = useGame((s) => s.save.bag);
  // 世界线倾向：背包里哪条线的关键物品最多。只读展示，纯函数派生
  const leading = useMemo(() => leadingLine(bag), [bag]);
  const bagCount = useGame((s) =>
    Object.values(s.save.bag).reduce((sum, n) => sum + n, 0),
  );
  const zoom = useGame((s) => s.zoom);
  const bagOpen = useGame((s) => s.bagOpen);
  const logOpen = useGame((s) => s.logOpen);
  // 已读日志篇数（可读 = 解锁条件满足 + 载体已获得）。
  // 细粒度订阅：只订阅这 5 个标量/数组引用，别订阅整个 save。
  const logDay = useGame((s) => s.save.day);
  const logCrafts = useGame((s) => s.save.crafts);
  const logStage = useGame((s) => s.save.stage);
  const logBuildDone = useGame((s) => s.save.buildDone);
  const logLogsFound = useGame((s) => s.save.logsFound);
  const logCount = useMemo(
    () =>
      readableLogs({
        day: logDay,
        crafts: logCrafts,
        stage: logStage,
        buildDone: logBuildDone,
        logsFound: logLogsFound,
      }).length,
    [logDay, logCrafts, logStage, logBuildDone, logLogsFound],
  );
  const setZoom = useGame((s) => s.setZoom);
  const toggleBag = useGame((s) => s.toggleBag);
  const toggleLog = useGame((s) => s.toggleLog);
  // R3 反悔出口的回路：本局撞过结局（save.ending 非空）→ HUD 常驻「结局」入口，
  // 从星球上随时能回结局页。没有结局时不显示（回哪去）。
  const ending = useGame((s) => s.save.ending);
  const showEnding = useGame((s) => s.showEnding);

  return (
    <header className="hud">
      <div className="hud__group">
        <span className="stat stat--day">
          <span>第</span>
          <b>{day}</b>
          <span>天</span>
        </span>
        <span className="hud__stage">阶段 {stage === 3 ? '3 · 建设' : stage}</span>
        {leading && <span className="hud__stage">线 · {leading.name}</span>}
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

        {/* R3：结局入口。视觉与「记录」同族（hud__log），无计数徽标——
            它是一个「门」，不是一摞待处理项 */}
        {ending && (
          <button
            type="button"
            className="hud__log"
            onClick={showEnding}
            aria-label="回到结局页"
          >
            <span className="hud__baglabel">结局</span>
          </button>
        )}

        <button
          type="button"
          className="hud__log"
          onClick={toggleLog}
          aria-pressed={logOpen}
          aria-label={`前任的记录，已读到 ${logCount} 篇`}
        >
          <span className="hud__baglabel">记录</span>
          {logCount > 0 && <span className="hud__badge">{logCount}</span>}
        </button>

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
