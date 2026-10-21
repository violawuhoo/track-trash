/**
 * 二周目增益 G2「你有点手艺」（C2 批次）。
 *
 * GDD §7.1 G2：阶段 1 的目标提示额外给出一组**可行配对示例**。
 * 例：「扳手 + 胶带，能导电又能粘」。
 *
 * ## 硬边界：只改文案，不改判定
 *
 * 这个函数**不参与任何合成判定**，它只把「当前这一步在标签上能被什么满足」
 * 翻译成一句给玩家看的示例。玩家照着做一定能过 —— 因为示例就是按
 * 「两个可捡物品的标签并集覆盖 requires」筛出来的。
 *
 * 所以它跟 `resolve.ts` 的判定是两回事：判定是「你手上这两个合不合成得出来」，
 * 示例是「你要的东西长什么样」。示例算错不会让游戏出错，只会让提示说错话。
 *
 * ## 为什么只在阶段 1 用
 *
 * GDD 只写了阶段 1。阶段 2 / 3 的目标链更复杂（标签更多、候选更宽），
 * 示例给多了反而会误导玩家去试错位组合。这里保守实现：只覆盖阶段 1。
 */
import { AREA_POOLS } from './stages';
import { ITEMS, getItem } from './items';

/** 一个可行配对示例 */
export interface PairingExample {
  /** 物品 a id */
  a: string;
  /** 物品 b id */
  b: string;
  /** 给玩家看的一行文案 */
  text: string;
}

/**
 * 阶段 1 每一步的「教科书配对」。
 *
 * 硬编码而不是搜索：这三对是**设计上最直观的**（电池+胶带 = 能导电又能粘），
 * 而且它们在坠毁点就能捡到（`area: 'crash'`）—— 二周目第 1 天玩家就在坠毁点，
 * 示例里提到的两样东西都摸得到。
 *
 * 判定上并不唯一：阶段 1 是标签匹配，任何「导电 + 粘」的组合都能过 s1-1。
 * 这里给的是示例，不是唯一解。
 */
const STAGE1_EXAMPLES: Readonly<Record<string, readonly [string, string]>> =
  Object.freeze({
    's1-1': ['battery', 'tape'],
    's1-2': ['wrench', 'tape'],
    's1-3': ['manual', 'battery'],
  });

/**
 * 取当前阶段目标的一个可行配对示例。
 *
 * @param stage 当前阶段
 * @param stepIndex 当前步位（0 起）
 * @returns 示例；该阶段 / 该步没有登记示例时返回 null
 */
export function pairingExample(
  stage: number,
  stepIndex: number,
): PairingExample | null {
  if (stage !== 1) return null;
  const step = STAGE1_EXAMPLES[`s1-${stepIndex + 1}`];
  if (!step) return null;
  const [a, b] = step;
  const itemA = getItem(a);
  const itemB = getItem(b);
  if (!itemA || !itemB) return null;
  return {
    a,
    b,
    text: `比如：${itemA.name} + ${itemB.name}，能凑齐这一步要的两样。`,
  };
}

/**
 * 校验：示例里的两样东西必须都在坠毁点能捡到。
 *
 * 二周目第 1 天玩家只有坠毁点 —— 示例提到了捡不到的东西就是废话。
 * 这条断言在测试里跑。
 */
export function stage1ExampleItemsInCrash(): boolean {
  for (const pair of Object.values(STAGE1_EXAMPLES)) {
    for (const id of pair) {
      const item = ITEMS.find((i) => i.id === id);
      if (!item) return false;
      if (item.kind !== 'base') return false;
      if (!AREA_POOLS.crash.includes(id)) return false;
    }
  }
  return true;
}
