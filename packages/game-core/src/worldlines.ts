/**
 * 世界线系统。
 *
 * 五条世界线 = 五条支线（ship / teashop / birthday / stay / chaos）。
 * 支线的**完成判定**不变（背包集齐槽位即达成，见 launch.ts / state.ts），
 * 这里提供的是**涌现层**：
 *
 * 1. 倾向值（affinity）：背包里各线关键物品的去重计数——玩家「合偏了」时，
 *    倾向值会先于完成度涨起来。
 * 2. 邀请（invite）：倾向值达到阈值且该线尚未完成时，浮现一条方向性提示。
 *    邀请不改变判定，只负责在玩家偏离主线时告诉他「这条路也通向一个结局」。
 *
 * 纯函数，不碰 DOM / IO / localStorage。
 */
import type { BranchId, SaveState } from './types';

export interface WorldLineDef {
  id: BranchId;
  name: string;
  /** 邀请浮现时的提示文案（AI 口吻） */
  invite: string;
  /** 参与倾向判定的关键物品。都是「这条线特有的东西」 */
  keys: readonly string[];
  /** 背包中关键物品（去重）≥ threshold 时浮现邀请 */
  threshold: number;
}

/**
 * 五条世界线定义。
 *
 * - ship 的 keys 只含飞船部件（不含信号器的 mid——那是阶段目标，人人都有，
 *   不该算「倾向」）：合出任何两个零件，「回家」这条路就开始发亮。
 * - chaos 的 keys 是全部意外产物（不含前任日志载体）：玩家乱合得越多，
 *   这条线越亮——这正是「莫名其妙的合成物有自己的世界线」的机制表达。
 */
export const WORLD_LINES: readonly WorldLineDef[] = Object.freeze([
  {
    id: 'ship',
    name: '造飞船',
    invite: '这些零件拼起来像半艘船。我说的是「船」的那个方向——继续的话，你就能回家了。',
    keys: [
      'joystick', 'theoryfuel', 'optimistic', 'spinner', 'socialengine', 'bat2', 'lostafternoon',
      'doorthing', 'doorplate', 'hullplate',
      'ration', 'hopefood', 'hotsandwich',
    ],
    threshold: 2,
  },
  {
    id: 'teashop',
    name: '开奶茶店',
    invite: '你攒的东西够开一家奶茶店了。我没有味觉，所以不拦你。',
    keys: ['shopfront', 'menu', 'fakecustomer', 'mannequin', 'notice'],
    threshold: 2,
  },
  {
    id: 'birthday',
    name: '给石头过生日',
    invite: '石头这几天唱得比平时多。它可能想过生日，可能没有。你看着办。',
    keys: ['birthproof', 'cakerepl', 'clapper', 'musicbox', 'rock'],
    threshold: 2,
  },
  {
    id: 'stay',
    name: '留下来',
    invite: '钥匙、摊架、会敲墙的邻居——你攒的东西越来越像「不走」的配置。',
    keys: ['staykey', 'landdeed', 'toolstand', 'sewkit', 'neighbor', 'warmchair'],
    threshold: 2,
  },
  {
    id: 'chaos',
    name: '搞清楚自己是什么',
    invite: '你合出来的东西越来越说不清。说不定再合几次，就能说清你自己了。',
    keys: [
      'failedtaste', 'unclear', 'halfplan', 'gum', 'opttape',
      'wastepaper', 'alienink', 'halfget', 'unclear2', 'alienmood', 'complexmood',
      'gambler', 'dud',
    ],
    threshold: 4,
  },
]);

/** 每条线的倾向值：背包中该线关键物品的去重计数 */
export function lineAffinity(
  bag: Record<string, number>,
): Record<BranchId, number> {
  const out = Object.fromEntries(
    WORLD_LINES.map((l) => [l.id, 0]),
  ) as Record<BranchId, number>;
  for (const line of WORLD_LINES) {
    for (const key of line.keys) {
      if ((bag[key] ?? 0) > 0) out[line.id] += 1;
    }
  }
  return out;
}

/** 倾向最高的线（并列时按 WORLD_LINES 顺序取先者）。背包为空时返回 null */
export function leadingLine(bag: Record<string, number>): WorldLineDef | null {
  const aff = lineAffinity(bag);
  let best: WorldLineDef | null = null;
  let bestVal = 0;
  for (const line of WORLD_LINES) {
    if (aff[line.id] > bestVal) {
      best = line;
      bestVal = aff[line.id];
    }
  }
  return best;
}

/**
 * 当前应浮现的邀请：倾向值达到阈值、该线尚未完成。
 *
 * 已完成的线（branches[id] = true）不再邀请——结局都触发了，没什么可邀请的。
 * 起飞线（ship）完成前不会触发结局，所以 ship 完成判定是 branches.ship，
 * 与其他线一致。
 */
export function activeInvites(state: SaveState): WorldLineDef[] {
  const aff = lineAffinity(state.bag);
  return WORLD_LINES.filter(
    (l) => !state.branches[l.id] && aff[l.id] >= l.threshold,
  );
}
