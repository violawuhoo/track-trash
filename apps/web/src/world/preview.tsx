/**
 * 世界层开发预览 —— **只用于验证，不进生产构建**。
 *
 * 契约里没有这个文件，它存在的理由很实际：T3 交付的世界层没有挂载点
 * （`GameScreen` 还归 T4），没有它就无法证明「星球画出来了、小人能走、
 * 相机跟得上、StrictMode 不泄漏」。所以做一个最小宿主：
 *
 * - 物品来自**真实的 `distribute()`**，固定种子 → 每次打开位置都一样，截图可比
 * - 小人位置由世界层自己积分，这里只做展示（把 `onPlayerPos` 记进 ref，不 setState）
 * - 三个按钮：卸载 / 重挂 / 跳回坠毁点 —— 对应验收清单里的生命周期与边界检查
 * - `window.__t3`：给验收脚本读计数与状态（`stats()` / `state()`）
 */
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  WORLD,
  areaOfPoint,
  distribute,
  type AreaId,
  type PlacedItem,
  type Vec2,
} from '@haola/game-core';

import { WorldCanvas } from './WorldCanvas';
import { WORLD_STATS } from './diagnostics';
import { textureCount } from './sprites';

/** 固定种子：同一份分布，截图可复现 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const START: Vec2 = { x: WORLD.center.x, y: WORLD.center.y };
/** 故意锁住两个区域：既验证雾障绘制，也验证"走不进去"。
 *  `?locked=0` 可以关掉，用于对比截图排查雾障是否遮挡。 */
const LOCK_QUERY = new URLSearchParams(window.location.search).get('locked');
const LOCKED: readonly AreaId[] =
  LOCK_QUERY === '0' ? [] : ['market', 'cave'];
/** `?collect=0`：拾取后不删物品、不触发 React 重渲染 —— 用来把
 *  「世界层自身开销」和「宿主 React 重渲染开销」分开测。 */
const COLLECT_ENABLED =
  new URLSearchParams(window.location.search).get('collect') !== '0';

const initialItems: PlacedItem[] = distribute({
  progress: { stage: 2, stepIndex: 0 },
  bag: {},
  day: 1,
  rng: mulberry32(20261019),
  player: START,
  maxDist: 400,
  unlocked: ['crash', 'junkyard'],
});

/** 给 window.__t3 读的实时状态（不参与渲染） */
const live = {
  pos: { ...START } as Vec2,
  moveTo: null as Vec2 | null,
  blocked: null as AreaId | null,
  blockedCount: 0,
  items: initialItems.length,
  itemList: initialItems,
};

function Preview() {
  const [items, setItems] = useState<PlacedItem[]>(initialItems);
  const [mounted, setMounted] = useState(true);
  const [gen, setGen] = useState(0);
  /** 只在"跳回坠毁点"时换成新对象 —— 新对象 = 世界层执行外部跳转 */
  const [resetPos, setResetPos] = useState<Vec2>(START);
  const infoRef = useRef<HTMLDivElement | null>(null);

  // 面板 200ms 刷一次：世界层 60fps 变化，但诊断信息没必要每帧写 DOM
  useEffect(() => {
    const timer = window.setInterval(() => {
      const el = infoRef.current;
      if (!el) return;
      const s = WORLD_STATS;
      const r = Math.hypot(live.pos.x - WORLD.center.x, live.pos.y - WORLD.center.y);
      el.innerHTML = [
        `画布 <code>${document.querySelectorAll('canvas').length}</code>`,
        `liveApps <code>${s.liveApps}</code> · tickers <code>${s.liveTickers}</code>`,
        `挂载/卸载 <code>${s.mounts} / ${s.teardowns}</code>`,
        `纹理 <code>${textureCount()}</code> · 物品 <code>${live.items}</code>`,
        `位置 <code>${live.pos.x.toFixed(1)}, ${live.pos.y.toFixed(1)}</code>`,
        `离圆心 <code>${r.toFixed(1)}</code> / 可走 ${WORLD.walkableRadius}`,
        `区域 <code>${areaOfPoint(live.pos)}</code> · 被挡 <code>${live.blocked ?? '—'}</code>`,
      ].join('<br/>');
    }, 200);
    return () => window.clearInterval(timer);
  }, []);

  // 验收脚本入口
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__t3 = {
      stats: () => ({
        ...WORLD_STATS,
        stepsSeen: [...WORLD_STATS.stepsSeen].sort((a, b) => a - b),
        canvases: document.querySelectorAll('canvas').length,
        textures: textureCount(),
      }),
      state: () => ({
        pos: { ...live.pos },
        radius: Math.hypot(live.pos.x - WORLD.center.x, live.pos.y - WORLD.center.y),
        area: areaOfPoint(live.pos),
        items: live.items,
        itemList: live.itemList.map((it) => ({ uid: it.uid, x: it.x, y: it.y })),
        blockedCount: live.blockedCount,
      }),
      unmount: () => setMounted(false),
      mount: () => setMounted(true),
      remount: () => setGen((g) => g + 1),
      reset: () => setResetPos({ x: WORLD.center.x, y: WORLD.center.y }),
    };
  }, []);

  return (
    <div className="preview">
      {mounted && (
        <WorldCanvas
          key={gen}
          className="preview__stage"
          items={items}
          player={resetPos}
          zoom={1}
          lockedAreas={LOCKED}
          onMoveTo={(x, y) => {
            live.moveTo = { x, y };
          }}
          onCollect={(uid) => {
            if (!COLLECT_ENABLED) return;
            // 真实项目里这一步走 store.collect；预览里直接从数据里删掉
            setItems((prev) => {
              const next = prev.filter((it) => it.uid !== uid);
              live.items = next.length;
              live.itemList = next;
              return next;
            });
          }}
          onAreaBlocked={(area) => {
            live.blocked = area;
            live.blockedCount++;
          }}
          onPlayerPos={(x, y) => {
            // 只写 ref，不 setState：世界层 60fps，React 不该跟着重渲染
            live.pos = { x, y };
          }}
        />
      )}

      <div className="preview__hud">
        <b>世界层预览 · T3</b>
        <div ref={infoRef} />
        <div className="preview__row">
          <button type="button" onClick={() => setMounted((v) => !v)}>
            {mounted ? '卸载' : '挂载'}
          </button>
          <button type="button" onClick={() => setGen((g) => g + 1)}>
            重挂
          </button>
          <button type="button" onClick={() => setResetPos({ x: WORLD.center.x, y: WORLD.center.y })}>
            跳回坠毁点
          </button>
        </div>
        <span className="preview__note">
          点地面走，WASD / 方向键并行。紫色雾障区进不去。拖拽无效。
        </span>
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
