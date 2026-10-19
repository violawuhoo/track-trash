/**
 * 世界画布挂载点。
 *
 * 契约见 `docs/CONTRACT-v2.md` §4。
 * ⚠️ T0 占位实现：只渲染一个空容器，T3 负责接入 PixiJS。
 * 在这里渲染占位而不是 throw，是为了让 T4 的界面层可以先行开发。
 */
import { useEffect, useRef } from 'react';

export interface WorldCanvasProps {
  className?: string;
}

export function WorldCanvas({ className }: WorldCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.dataset.worldReady = 'pending';
    // T3：在这里创建 PIXI.Application，挂到 host 上。
    // 必须返回清理函数，且能承受 React 18 StrictMode 的二次挂载。
    return () => {
      delete host.dataset.worldReady;
    };
  }, []);

  return <div ref={hostRef} className={className} data-world="placeholder" />;
}
