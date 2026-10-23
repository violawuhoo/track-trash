/**
 * 主界面：只管 UI 层，世界交给 `<WorldCanvas />`（T3）。
 *
 * 契约 §6.1 组件树：
 * ```
 * GameScreen
 * ├── WorldCanvas          // T3，只读 store，写入只走 action
 * ├── Hud                  // 天数 / 阶段 / 缩放 / 背包入口
 * ├── TutorBar             // T7 引导提示（引导期内占 HintBar 的位置）
 * ├── HintBar              // 左下「缺：能粘的东西」
 * ├── BagDrawer            // 背包 + 双槽合成（≥1024 时常驻右侧栏）
 * ├── LogPanel             // C1：前任日志面板（HUD「记录」入口）
 * └── DialogueBar          // 底部，可上滑收起
 * ```
 *
 * 两条接线约定：
 * 1. **`player` 传 `spawn`，不传实时 `player`。** WorldCanvas 内部自己积分位移，
 *    每帧经 `onPlayerPos` 回报给 `setPlayerPos`（不持久化）。传实时位置会让它
 *    每帧收到一个"外部跳转"请求，也会让 React 每帧重渲染。
 * 2. **`items` 必须是同一个数组引用。** 只有 `collect` / `craft` 才换新数组，
 *    世界层靠引用比较决定是否同步。
 */
import { useEffect, useMemo, useRef } from 'react';
import { lines, type AreaId } from '@haola/game-core';
import { lockedAreasFor, useGame } from '../store/gameStore';
import { WorldCanvas } from '../world/WorldCanvas';
import { rocketSlots, builtProps } from '../lib/monuments';
import { Hud } from '../components/Hud';
import { HintBar } from '../components/HintBar';
import { TutorBar } from '../components/TutorBar';
import { ItemInfoCard } from '../components/ItemInfoCard';
import { BagDrawer } from '../components/BagDrawer';
import { LogPanel } from '../components/LogPanel';
import { DialogueBar } from '../components/DialogueBar';

/** 走进雾障时的台词。毒舌但不攻击玩家（T6 语气约束） */
const BLOCKED_LINES: Readonly<Record<AreaId, string>> = {
  crash: '这边是坠毁点，随便走。',
  junkyard: '垃圾山还没解锁。先修好信号器，别急着翻别人的垃圾。',
  market: '集市废墟那头还锁着。路是有的，等你把探索期走完。',
  cave: '洞窟里黑得不像话。先把前面该做的做完。',
};

/** 双指缩放：两根手指按下时记录起始距离，按比值改 zoom（0.8–1.6） */
function bindPinch(host: HTMLElement): () => void {
  const points = new Map<number, { x: number; y: number }>();
  let startDist = 0;
  let startZoom = 1;

  const spread = (): number => {
    const [a, b] = [...points.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onDown = (e: PointerEvent) => {
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (points.size === 2) {
      startDist = spread();
      startZoom = useGame.getState().zoom;
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!points.has(e.pointerId)) return;
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (points.size === 2 && startDist > 0) {
      useGame.getState().setZoom(startZoom * (spread() / startDist));
    }
  };
  const onUp = (e: PointerEvent) => {
    points.delete(e.pointerId);
    if (points.size < 2) startDist = 0;
  };

  host.addEventListener('pointerdown', onDown);
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerup', onUp);
  host.addEventListener('pointercancel', onUp);
  return () => {
    host.removeEventListener('pointerdown', onDown);
    host.removeEventListener('pointermove', onMove);
    host.removeEventListener('pointerup', onUp);
    host.removeEventListener('pointercancel', onUp);
  };
}

export function GameScreen() {
  const world = useGame((s) => s.world);
  const spawn = useGame((s) => s.spawn);
  const zoom = useGame((s) => s.zoom);
  const stage = useGame((s) => s.save.stage);
  const bag = useGame((s) => s.save.bag);
  const built = useGame((s) => s.save.built);
  const dialog = useGame((s) => s.dialog);
  const dialogIndex = useGame((s) => s.dialogIndex);

  const setMoveTarget = useGame((s) => s.setMoveTarget);
  const setPlayerPos = useGame((s) => s.setPlayerPos);
  const collect = useGame((s) => s.collect);
  const setFocusItem = useGame((s) => s.setFocusItem);
  const say = useGame((s) => s.say);
  const setViewportHalf = useGame((s) => s.setViewportHalf);
  const refreshWorld = useGame((s) => s.refreshWorld);
  const advanceDialog = useGame((s) => s.advanceDialog);

  /**
   * 走进雾障被弹回。引导期内首次改播引导台词（一次性），之后维持区域台词。
   * 旗子走瞬态 `markTutorFlag` —— 弹回不是持久化动作，不为它破铁律。
   */
  const onAreaBlocked = (area: AreaId) => {
    const s = useGame.getState();
    if (s.save.tutorial.step !== 'free' && !s.tutorFlags.blocked) {
      s.markTutorFlag('blocked');
      say(lines('tutBlocked'));
      return;
    }
    say([BLOCKED_LINES[area]]);
  };

  const worldRef = useRef<HTMLDivElement | null>(null);

  /** 未解锁扇区（画雾障 + 挡人）。按 stage 推导，引用稳定 */
  const lockedAreas = useMemo(() => lockedAreasFor(stage), [stage]);

  /**
   * 纪念物（乐趣改版 ⑤）：火箭完成段数 + 落地成景清单。
   * 只在合成 / 拾取飞船部件时变，memo 保证引用稳定（世界层靠内容 key 比较同步）。
   */
  const monuments = useMemo(
    () => ({
      rocket: rocketSlots(bag, built).filter(Boolean).length,
      props: builtProps(built),
    }),
    [bag, built],
  );

  /**
   * `viewportHalf`：屏幕短边一半（CSS px）。
   * 契约 §3.2 本来写的是「T3 每帧节流写入」，但 T3 的 `WorldCanvasProps` 没有
   * 视口回调（它自己用 ResizeObserver 内部维护），所以这里由 UI 层按窗口算：
   * zoom 1 时 1 世界单位 = 1 CSS px，`maxDist = viewportHalf / zoom` 成立。
   */
  useEffect(() => {
    const sync = () => {
      setViewportHalf(Math.min(window.innerWidth, window.innerHeight) / 2);
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, [setViewportHalf]);

  /** 地面上什么都没有（读档损坏 / 全捡空了）时补一批 */
  useEffect(() => {
    if (useGame.getState().world.length === 0) refreshWorld();
  }, [refreshWorld]);

  /** 双指缩放。单指点击移动由世界层自己处理 */
  useEffect(() => {
    const host = worldRef.current;
    if (!host) return;
    return bindPinch(host);
  }, []);

  return (
    <div className="game">
      <div className="game__world" ref={worldRef}>
        <WorldCanvas
          className="world-canvas"
          items={world}
          player={spawn}
          zoom={zoom}
          lockedAreas={lockedAreas}
          monuments={monuments}
          onMoveTo={setMoveTarget}
          onCollect={collect}
          onFocusItem={setFocusItem}
          onPlayerPos={setPlayerPos}
          onAreaBlocked={onAreaBlocked}
        />
      </div>

      <Hud />
      <TutorBar />
      <HintBar />
      <ItemInfoCard />
      <BagDrawer />
      <LogPanel />
      <DialogueBar lines={dialog} index={dialogIndex} onAdvance={advanceDialog} />
    </div>
  );
}
