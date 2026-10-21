import type {
  AreaId,
  BranchDef,
  EndingId,
  StageDef,
} from './types';
import { ITEMS } from './items';

/**
 * 区域定义。
 * 解锁顺序：crash（初始）→ junkyard（阶段 1 完成）→ market + cave（阶段 2 完成）
 */
export const AREAS: Readonly<
  Record<AreaId, { id: AreaId; name: string; subtitle: string }>
> = Object.freeze({
  crash: { id: 'crash', name: '坠毁点', subtitle: '船在这里，人也在这里。' },
  junkyard: { id: 'junkyard', name: '垃圾山', subtitle: '前人留下的东西堆成了一座山。' },
  market: { id: 'market', name: '外星集市废墟', subtitle: '曾经很热闹，现在只剩摊子和货。' },
  cave: { id: 'cave', name: '怪石洞窟', subtitle: '石头会唱歌，说明这里确实不太对劲。' },
});

/** 每个区域能刷出的物品 id */
export const AREA_POOLS: Readonly<Record<AreaId, string[]>> = Object.freeze({
  crash: ITEMS.filter((i) => i.area === 'crash').map((i) => i.id),
  junkyard: ITEMS.filter((i) => i.area === 'junkyard').map((i) => i.id),
  market: ITEMS.filter((i) => i.area === 'market').map((i) => i.id),
  cave: ITEMS.filter((i) => i.area === 'cave').map((i) => i.id),
});

/** 区域解锁所属阶段：完成该阶段后解锁 */
export const AREA_UNLOCK_STAGE: Readonly<Record<AreaId, 0 | 1 | 2>> = Object.freeze({
  crash: 0,
  junkyard: 1,
  market: 2,
  cave: 2,
});

/**
 * 阶段目标链。
 *
 * 阶段 1、2 用标签匹配判定：两个物品的标签并集覆盖 requires 即通过。
 * 所以「扳手 + 胶带」和「电池 + 胶带」都能过第 1 步，不依赖唯一配方。
 */
export const STAGES: StageDef[] = [
  {
    id: 1,
    name: '迫降期',
    blurb: '把信号器修好，让外面知道这里还有人。',
    unlock: ['crash'],
    steps: [
      { id: 's1-1', requires: ['导电', '粘'], output: 'wire' },
      { id: 's1-2', requires: ['导电', '金属'], output: 'bracket' },
      { id: 's1-3', requires: ['知识', '导电'], output: 'signal' },
    ],
  },
  {
    id: 2,
    name: '探索期',
    blurb: '有个能挡风、能躺下、能关门的地方，人才算安顿下来。',
    unlock: ['junkyard'],
    steps: [
      { id: 's2-1', requires: ['实体', '实体'], output: 'windbreak' },
      { id: 's2-2', requires: ['金属', '实体'], output: 'bedframe' },
      { id: 's2-3', requires: ['风险', '实体'], output: 'shelter' },
    ],
  },
  {
    id: 3,
    name: '建设期',
    blurb: '能造出东西了。接下来造什么，你定。',
    unlock: ['market', 'cave'],
    // 三步目标链（GDD §2.1）。每步都有一条同构精确配方（recipes.ts R7/R8/R9），
    // 但不是唯一路径 —— 标签并集覆盖 requires 即通过。
    steps: [
      { id: 's3-1', requires: ['粘', '知识'], output: 'notice' },
      { id: 's3-2', requires: ['金属', '能烧'], output: 'generator' },
      { id: 's3-3', requires: ['能推', '抽象'], output: 'hourglass' },
    ],
  },
];

/**
 * 阶段完成纪念品
 *
 * 阶段 3 的 `ks_build` 在 A1a 只有发放点，物品本体与资产在 A1b 补齐。
 */
export const STAGE_KEEPSAKES: Readonly<Record<1 | 2 | 3, string>> = Object.freeze({
  1: 'ks_signal',
  2: 'ks_shelter',
  3: 'ks_build',
});

/**
 * 阶段 3 的三条支线。完成任意一条即可进入收尾，
 * 但只有「造飞船」分支能起飞。
 */
export const BRANCHES: BranchDef[] = [
  {
    id: 'ship',
    name: '造飞船',
    slots: ['动力', '外壳', '生命维持'],
    requires: [
      ['optimistic', 'theoryfuel'],
      ['doorthing', 'doorplate', 'hullplate'],
      ['ration', 'hopefood', 'hotsandwich'],
    ],
    keepsake: 'ks_ship',
    ending: 'leave',
  },
  {
    id: 'teashop',
    name: '开奶茶店',
    slots: ['店面', '菜单', '顾客'],
    requires: [['shopfront'], ['menu'], ['fakecustomer', 'mannequin']],
    keepsake: 'ks_shop',
    ending: 'teashop',
  },
  {
    id: 'birthday',
    name: '给石头过生日',
    slots: ['生日证明', '蛋糕', '观众'],
    requires: [['birthproof', 'bankrupt'], ['cakerepl'], ['clapper', 'musicbox']],
    keepsake: 'ks_birthday',
    ending: 'birthday',
  },
];

/** 飞船三件套，用于起飞判定 */
export const SHIP_BRANCH = BRANCHES.find((b) => b.id === 'ship')!;

/** 强行起飞成功率 */
export const FORCED_LAUNCH_RATE = 0.5;

export const ENDINGS: Readonly<
  Record<EndingId, { id: EndingId; title: string; subtitle: string }>
> = Object.freeze({
  leave: { id: 'leave', title: '离开星球', subtitle: '你走了。石头还在唱。' },
  teashop: { id: 'teashop', title: '开奶茶店', subtitle: '宇宙尽头，一杯差不多。' },
  birthday: { id: 'birthday', title: '给石头过生日', subtitle: '它唱了一首没人听懂的歌。' },
  free: { id: 'free', title: '自由模式', subtitle: '没有目标了。这可能是最好的结局。' },
});
