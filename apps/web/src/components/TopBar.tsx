import type { SaveState } from '@haola/game-core';

const TOTAL_STEPS = 6; // 阶段 1 三步 + 阶段 2 三步

function completedSteps(save: SaveState): number {
  if (save.stage >= 3) return TOTAL_STEPS;
  if (save.stage === 1) return save.stepIndex;
  return 3 + save.stepIndex;
}

export function TopBar({ save }: { save: SaveState }) {
  const pct = Math.min(100, (completedSteps(save) / TOTAL_STEPS) * 100);

  return (
    <header className="topbar">
      <div className="stat stat--day">
        <span>第</span>
        <b>{save.day}</b>
        <span>天</span>
      </div>
      <div className="stat">
        <span>意外</span>
        <b>{save.accidents}</b>
      </div>
      <div className="stat">
        <span>纪念</span>
        <b>{save.keepsakes.length}</b>
      </div>
      <div className="topbar__spacer" />
      <div className="progress" aria-label="阶段进度">
        <div className="progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </header>
  );
}
