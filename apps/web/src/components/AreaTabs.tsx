import { AREAS, isAreaUnlocked, type AreaId, type SaveState } from '@haola/game-core';

const ORDER: AreaId[] = ['crash', 'junkyard', 'market', 'cave'];

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

interface Props {
  save: SaveState;
  onSelect: (area: AreaId) => void;
}

export function AreaTabs({ save, onSelect }: Props) {
  return (
    <nav className="areas">
      {ORDER.map((id) => {
        const unlocked = isAreaUnlocked(save, id);
        const active = save.areaId === id;
        return (
          <button
            key={id}
            className={`area ${active ? 'area--active' : ''} ${unlocked ? '' : 'area--locked'}`}
            onClick={() => unlocked && onSelect(id)}
            disabled={!unlocked}
          >
            {!unlocked && <LockIcon />} {AREAS[id].name}
          </button>
        );
      })}
    </nav>
  );
}
