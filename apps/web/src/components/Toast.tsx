import { useEffect } from 'react';
import { getItem, type Tag } from '@haola/game-core';
import { ItemIcon } from './ItemIcon';
import type { ToastData } from '../store/gameStore';

/** Toast 停留时长（设计系统 §10.7：--dur-2 进入，停留 2.4s） */
const HOLD = 2400;

/**
 * Toast：顶部（不遮底部对话条），点一下关掉。
 * 设计系统 §10.7：`role="status"` + `aria-live="polite"`。
 */
export function Toast({ toast, onDismiss }: { toast: ToastData | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, HOLD);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div className="toast" onClick={onDismiss} role="status" aria-live="polite">
      <div className="toast__title">{toast.title}</div>
      {toast.body && <div className="toast__body">{toast.body}</div>}
    </div>
  );
}

/** 物品描述浮层。长按 / 点「?」打开，ESC 或点遮罩关闭 */
export function ItemSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, onClose]);

  if (!id) return null;
  const item = getItem(id);

  return (
    <div className="sheet" onClick={onClose}>
      <div
        className="sheet__card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
      >
        <div className="sheet__head">
          <ItemIcon id={id} size={52} />
          <h2 className="sheet__title">{item.name}</h2>
        </div>
        <p className="sheet__desc">{item.desc}</p>
        <div className="sheet__tags">
          {item.tags.map((t: Tag) => (
            <span className="tag" key={t}>
              {t}
            </span>
          ))}
        </div>
        <button type="button" className="btn btn--block" onClick={onClose}>
          知道了
        </button>
      </div>
    </div>
  );
}
