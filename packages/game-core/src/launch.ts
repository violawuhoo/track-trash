import { BRANCHES, FORCED_LAUNCH_RATE, SHIP_BRANCH } from './stages';
import type { BranchDef, BranchId } from './types';

export type LaunchMode = 'none' | 'forced' | 'full';

export interface BranchStatus {
  id: BranchId;
  /** 每个槽位是否已满足 */
  filled: boolean[];
  /** 已填槽位数 */
  filledCount: number;
  /** 是否三件套齐 */
  done: boolean;
}

/** 检查一条支线的完成情况 */
export function branchStatus(
  branch: BranchDef,
  bag: Record<string, number>,
): BranchStatus {
  const filled = branch.requires.map((options) =>
    options.some((id) => (bag[id] ?? 0) > 0),
  );
  const filledCount = filled.filter(Boolean).length;
  return {
    id: branch.id,
    filled,
    filledCount,
    done: filledCount === branch.requires.length,
  };
}

/** 所有支线状态 */
export function allBranchStatus(
  bag: Record<string, number>,
): BranchStatus[] {
  return BRANCHES.map((b) => branchStatus(b, bag));
}

/**
 * 起飞判定。
 * - full：三件套齐，必成功
 * - forced：至少有一件，但不齐，50% 成功
 * - none：一件都没有，按钮不出现
 */
export function launchCheck(bag: Record<string, number>): LaunchMode {
  const status = branchStatus(SHIP_BRANCH, bag);
  if (status.done) return 'full';
  if (status.filledCount > 0) return 'forced';
  return 'none';
}

/** 掷一次起飞结果 */
export function rollLaunch(mode: LaunchMode, rng: () => number = Math.random): boolean {
  if (mode === 'full') return true;
  if (mode === 'forced') return rng() < FORCED_LAUNCH_RATE;
  return false;
}
