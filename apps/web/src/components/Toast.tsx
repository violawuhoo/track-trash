import { useEffect } from 'react';
import { getItem, type Tag } from '@haola/game-core';
import { ItemIcon } from './ItemIcon';
import type { ToastData } from '../store/gameStore';

export function Toast({ toast, onDismiss }: { toast: ToastData | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, 3600);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div className="toast" onClick={onDismiss} role="status">
      <div className="toast__title">{toast.title}</div>
      {toast.body && <div className="toast__body">{toast.body}</div>}
    </div>
  );
}

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
      <div className="sheet__card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ItemIcon icon={item.icon} color={item.color} size={52} />
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
        <button className="btn btn--block" onClick={onClose}>
          知道了
        </button>
      </div>
    </div>
  );
}
