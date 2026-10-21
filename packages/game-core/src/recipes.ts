import type { AccidentRule, Recipe, Tag } from './types';

/**
 * 精确配方：39 条。
 *
 * 精确配方不是推进阶段的唯一途径，只是快捷路径。
 * 判定优先级：阶段目标 > 精确配方 > 风险 > 意外配对 > 兜底。
 */
export const RECIPES: Recipe[] = [
  // 迫降期
  { a: 'battery', b: 'tape', out: 'wire' },
  { a: 'wire', b: 'wrench', out: 'bracket' },
  { a: 'manual', b: 'bracket', out: 'signal' },
  // 探索期
  { a: 'plunger', b: 'sock', out: 'windbreak' },
  { a: 'screw', b: 'windbreak', out: 'bedframe' },
  { a: 'bedframe', b: 'lottery', out: 'shelter' },
  // 飞船
  { a: 'plunger', b: 'tape', out: 'joystick' },
  { a: 'manual', b: 'sandwich', out: 'theoryfuel' },
  { a: 'antigrav', b: 'mood', out: 'optimistic' },
  { a: 'poker', b: 'taste', out: 'lostafternoon' },
  { a: 'homework', b: 'battery', out: 'bat2' },
  { a: 'awkward', b: 'rock', out: 'socialengine' },
  { a: 'tape', b: 'wrench', out: 'doorthing' },
  { a: 'plunger', b: 'sandwich', out: 'ration' },
  { a: 'mood', b: 'poker', out: 'gambler' },
  { a: 'fuel', b: 'antigrav', out: 'spinner' },
  { a: 'doorthing', b: 'sandwich', out: 'doorplate' },
  { a: 'mood', b: 'ration', out: 'hopefood' },
  // 奶茶店
  { a: 'plunger', b: 'wrench', out: 'shopfront' },
  { a: 'homework', b: 'sandwich', out: 'menu' },
  { a: 'awkward', b: 'sock', out: 'fakecustomer' },
  // 石头生日
  { a: 'manual', b: 'poker', out: 'birthproof' },
  { a: 'fuel', b: 'sandwich', out: 'cakerepl' },
  { a: 'mood', b: 'tape', out: 'clapper' },
  // T6 扩容：新物品路线 + 旧产物备选路径
  { a: 'crowbar', b: 'windbreak', out: 'hullplate' },
  { a: 'lamp', b: 'sandwich', out: 'hotsandwich' },
  { a: 'echo', b: 'rock', out: 'musicbox' },
  { a: 'mirror', b: 'paste', out: 'mannequin' },
  { a: 'debt', b: 'lottery', out: 'bankrupt' },
  { a: 'firework', b: 'battery', out: 'dud' },
  { a: 'ducttape', b: 'wrench', out: 'doorthing' },
  { a: 'plasma', b: 'antigrav', out: 'spinner' },
  { a: 'broom', b: 'sock', out: 'windbreak' },
  { a: 'tire', b: 'windbreak', out: 'bedframe' },
  { a: 'fossil', b: 'crystal', out: 'signal' },
  { a: 'photo', b: 'homework', out: 'menu' },
  // 阶段 3「建设期」三步产物的同构精确配方（GDD §4.3 R7/R8/R9）。
  // 「同构」= 与 s3-1/s3-2/s3-3 的 requires 完全等价：
  //   R7 tape(粘)+manual(知识) ≡ s3-1 粘+知识 → notice
  //   R8 crowbar(金属)+fuel(能烧) ≡ s3-2 金属+能烧 → generator
  //   R9 echo(抽象)+broom(能推) ≡ s3-3 能推+抽象 → hourglass
  // 作用：给玩家一条「提前备料」的路；同时满足 check-content 断言 A
  // （每个非 accident/keepsake 物品必须被配方引用）。
  { a: 'tape', b: 'manual', out: 'notice' },
  { a: 'crowbar', b: 'fuel', out: 'generator' },
  { a: 'echo', b: 'broom', out: 'hourglass' },
];

/** 无序 key：两个 id 排序后拼接，保证 a+b 与 b+a 命中同一条 */
export function recipeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export const RECIPE_MAP: Readonly<Record<string, string>> = Object.freeze(
  RECIPES.reduce<Record<string, string>>((acc, r) => {
    acc[recipeKey(r.a, r.b)] = r.out;
    return acc;
  }, {}),
);

/**
 * 意外配对表（不含风险兜底）。
 * 只匹配「基础标签」，忽略 中间 / 部件 / 委托 / 意外 / 纪念品 等分类标签。
 */
export const ACCIDENT_RULES: AccidentRule[] = [
  { tags: ['实体', '实体'], out: 'unclear' },
  { tags: ['实体', '知识'], out: 'halfplan' },
  { tags: ['实体', '外星'], out: 'gum' },
  { tags: ['实体', '抽象'], out: 'opttape' },
  { tags: ['知识', '知识'], out: 'wastepaper' },
  { tags: ['知识', '外星'], out: 'alienink' },
  { tags: ['知识', '抽象'], out: 'halfget' },
  { tags: ['外星', '外星'], out: 'unclear2' },
  { tags: ['外星', '抽象'], out: 'alienmood' },
  { tags: ['抽象', '抽象'], out: 'complexmood' },
];

/** 完全不匹配时的兜底产物 */
export const FALLBACK_ITEM = 'unclear';

/** 风险物品参与时的固定产物 */
export const RISK_ITEM = 'failedtaste';

/** 参与意外配对的基础标签集合 */
const BASE_TAGS: Tag[] = ['实体', '知识', '外星', '抽象', '风险'];

export function baseTags(tags: Tag[]): Tag[] {
  return tags.filter((t) => BASE_TAGS.includes(t));
}

/**
 * 挑一条意外规则。
 *
 * 返回 null 表示没有任何规则命中，调用方用 FALLBACK_ITEM 兜底。
 * 风险判定不在这里做——风险优先级更高，由 resolveMix 前置处理。
 */
export function matchAccident(
  tagsA: Tag[],
  tagsB: Tag[],
): AccidentRule | null {
  const a = baseTags(tagsA);
  const b = baseTags(tagsB);
  for (const rule of ACCIDENT_RULES) {
    const [x, y] = rule.tags;
    const forward = a.includes(x) && b.includes(y);
    const backward = a.includes(y) && b.includes(x);
    if (forward || backward) return rule;
  }
  return null;
}
