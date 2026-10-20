/**
 * AI 对话条。
 *
 * 设计系统 §10.2（高度算式照抄，不要再手调）：
 * - 展开 `min-height: --dialogue-h-expanded`（80px）= 2 行 × 14px × 1.7 + padding 24 + 边框 3
 * - 收起 `height: --dialogue-h-collapsed`（44px）= 1 行 23.8 + 16 + 3
 * - 上滑收起 / 下滑展开；键盘 ↑ ↓ 同效。
 *
 * 外层 `.dialogue-dock` 是 `pointer-events: none` 的定位容器，只有 `.dialogue` 本身可点，
 * 这样对话条左右两侧的空白仍然能落到世界画布上触发移动（契约 §6.3）。
 */
import { useEffect, useRef, useState } from 'react';

interface Props {
  lines: string[];
  index: number;
  onAdvance: () => void;
}

/** 判定为滑动的位移阈值（CSS px）。小于它算点击 */
const SWIPE = 24;

export function DialogueBar({ lines, index, onAdvance }: Props) {
  const current = lines[index] ?? '';
  const [shown, setShown] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const doneRef = useRef(true);
  const swipedRef = useRef(false);
  const startYRef = useRef<number | null>(null);

  // 打字机。逐字显示时点一下 = 立刻显示全文，再点 = 下一句
  useEffect(() => {
    if (!current) {
      setShown('');
      doneRef.current = true;
      return;
    }
    doneRef.current = false;
    setShown('');
    let i = 0;
    const timer = window.setInterval(() => {
      i += 1;
      setShown(current.slice(0, i));
      if (i >= current.length) {
        window.clearInterval(timer);
        doneRef.current = true;
      }
    }, 24);
    return () => window.clearInterval(timer);
  }, [current, index]);

  const advance = () => {
    if (!current) return;
    if (!doneRef.current) {
      setShown(current);
      doneRef.current = true;
      return;
    }
    onAdvance();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    startYRef.current = e.clientY;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const start = startYRef.current;
    startYRef.current = null;
    if (start === null) return;
    const dy = e.clientY - start;
    if (Math.abs(dy) <= SWIPE) return;
    // 竖划只做收起/展开，不当成「点击继续」
    swipedRef.current = true;
    setCollapsed(dy < 0);
  };

  const onClick = () => {
    if (swipedRef.current) {
      swipedRef.current = false;
      return;
    }
    advance();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      advance();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCollapsed(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCollapsed(false);
    }
  };

  return (
    <div className="dialogue-dock">
      <div
        className={`dialogue ${collapsed ? 'dialogue--collapsed' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={current ? '对话，点击继续' : '对话条'}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        <div className="dialogue__avatar" aria-hidden="true">
          AI
        </div>
        <div className="dialogue__text">
          {current ? shown : '点地面走过去，靠近东西会自动捡起来。'}
        </div>
        <div className="dialogue__next" aria-hidden="true">
          {current ? (index < lines.length - 1 ? '点击继续' : '点击收起') : '▴ 上滑'}
        </div>
      </div>
    </div>
  );
}
