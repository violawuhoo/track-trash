/**
 * 二周目增益 G2「你有点手艺」（C2 批次）。
 *
 * GDD §7.1 G2：阶段 1 的目标提示额外给出一组**可行配对示例**。
 * 例：「扳手 + 胶带，能导电又能粘」。
 *
 * ## 硬边界：只改文案，不改判定
 *
 * 这个函数**不参与任何合成判定**，它只把「当前这一步在标签上能被什么满足」
 * 翻译成一句给玩家看的示例。判定归 `resolve.ts` 管，示例算错不会让游戏出错，
 * 只会让提示说错话。
 *
 * ## 定位：标签方向提示，不是配方步骤（2026 复审改口径）
 *
 * 初版把示例写成「确切配方提示」，并在注释里写「玩家照着做一定能过」。
 * 复审用变异测试 + 实测证明这个断言站不住：
 *
 * 1. **判定是标签并集覆盖，不是配方。** 阶段 1 三步的 requires 分别是
 *    `[导电,粘]` / `[导电,金属]` / `[知识,导电]`。玩家手上任何带这些标签的
 *    两件物品都能过，写死某一对物品就是给了一个**过时的唯一解**。
 * 2. **材料会被消耗。** `craft()` 会把材料从背包扣掉。s1-1 用掉 `battery+tape`
 *    之后，s1-3 的示例若还指着 `battery`，玩家在地面找不到它 —— 示例就变成了废话。
 *    （实测：坠毁点池只有 9 件 base 物品，每次重刷重新随机采样，
 *    `battery` 可能这一轮刷不出来。）
 * 3. **原 s1-2 的 `wrench + tape` 里 `tape` 是无用材料** ——
 *    `wrench` 自己就带「导电 + 金属」，`tape` 一个标签都贡献不上。
 *    没有语义组合含义，只是凑数。
 *
 * 所以本模块的口径是：**给方向 + 给例子，不给步骤**。
 * 文案说清这一步要哪两个标签，并给出「这一类里随便挑两件」的语气，
 * 材料拿不到、换成同类的另一件，都不会让提示说错话。
 *
 * 真正的可达性由两件事保证，都不靠本模块：
 * - `distribute()` 对「当前步骤缺的标签」做**硬保底** —— 地面必定刷出带该标签的物品；
 * - 判定是标签并集覆盖，捡到哪一件都能过。
 *
 * ## 为什么只在阶段 1 用
 *
 * GDD 只写了阶段 1。阶段 2 / 3 的目标链更复杂（标签更多、候选更宽），
 * 示例给多了反而会误导玩家去试错位组合。这里保守实现：只覆盖阶段 1。
 */
import { AREA_POOLS, STAGES } from './stages';
import { ITEMS, getItem } from './items';

/** 一个可行配对示例 */
export interface PairingExample {
  /** 代表物品 a id（示例中的首选，不保证此刻在地面） */
  a: string;
  /** 代表物品 b id */
  b: string;
  /** 给玩家看的一行文案 */
  text: string;
}

/**
 * 阶段 1 每一步的示例配对。
 *
 * 选法（两条硬标准）：
 * 1. **两件都必须是「base 且在坠毁点池里」** —— 二周目第 1 天玩家只有坠毁点。
 * 2. **每件各自贡献这一步 requires 里的一个标签**，不出现无用材料。
 *    由此排除掉初版的 `s1-2: wrench + tape`（`tape` 不贡献任何标签）。
 *
 * 覆盖关系：
 * - s1-1 `[导电,粘]`   → `battery`(导电) + `tape`(粘)
 * - s1-2 `[导电,金属]` → `battery`(导电) + `crowbar`(金属)
 * - s1-3 `[知识,导电]` → `manual`(知识)  + `battery`(导电)
 */
const STAGE1_EXAMPLES: Readonly<Record<string, readonly [string, string]>> =
  Object.freeze({
    's1-1': ['battery', 'tape'],
    's1-2': ['battery', 'crowbar'],
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
  const requires = STAGES[0].steps[stepIndex]?.requires ?? [];
  const tagA = requires.find((t) => itemA.tags.includes(t));
  const tagB = requires.find((t) => itemB.tags.includes(t));
  if (!tagA || !tagB) return null;
  return {
    a,
    b,
    text:
      `比如：${itemA.name}（${tagA}）配 ${itemB.name}（${tagB}）` +
      `—— 这一步要「${requires.join('」和「')}」，同一类里换别的也行。`,
  };
}

/**
 * 校验：示例里的两样东西必须都是「可直接捡的基础物品，且在坠毁点池里」。
 *
 * 二周目第 1 天玩家只有坠毁点 —— 示例提到了捡不到的东西就是废话。
 * 这条断言在测试里跑。
 *
 * ⚠️ 它验的是「**这类东西在坠毁点存在**」，**不是**「此刻地面上就有这一件」。
 * 后者由 `distribute()` 的标签硬保底负责（当前步骤缺的标签必定刷出），
 * 两者是不同层面的保证，不要混为一谈。
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
