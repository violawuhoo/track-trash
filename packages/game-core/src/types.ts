/**
 * 《好垃》领域类型定义
 *
 * 设计原则：
 * 1. 物品 id 稳定不变，存档只存 { itemId, count }，物品数据升级不会坏档。
 * 2. 判定全部是纯函数，输入状态输出结果，不碰 DOM、不碰网络、不碰 localStorage。
 * 3. 前后端共用同一份规则，避免两份实现漂移。
 */

/** 标签枚举。基础标签用于意外表配对，功能标签用于阶段目标判定。 */
export type Tag =
  | '实体'
  | '知识'
  | '外星'
  | '抽象'
  | '风险'
  | '中间'
  | '部件'
  | '委托'
  | '意外'
  | '纪念品'
  | '导电'
  | '粘'
  | '金属'
  | '能推'
  | '能烧'
  | '能呼吸'
  | '能挡风';

export type AreaId = 'crash' | 'junkyard' | 'market' | 'cave';

export type ItemKind =
  | 'base'
  | 'mid'
  | 'ship'
  | 'commission'
  | 'accident'
  | 'keepsake';

export type EndingId = 'leave' | 'teashop' | 'birthday' | 'free';

export type BranchId = 'ship' | 'teashop' | 'birthday';

/** 贴纸配色，只允许有限色盘 */
export type StickerColor = 'orange' | 'mint' | 'purple' | 'pink' | 'yellow';

export interface Item {
  id: string;
  name: string;
  /** 一到两句描述，第一次拾取时展示 */
  desc: string;
  tags: Tag[];
  kind: ItemKind;
  /** base 物品的刷新区域；其余物品为空 */
  area?: AreaId;
  color: StickerColor;
  /** 内联 SVG 图标的 key，由前端映射 */
  icon: string;
}

/** 精确配方。无序匹配，a/b 顺序无关。 */
export interface Recipe {
  a: string;
  b: string;
  out: string;
}

/** 意外匹配规则。两个基础标签无序配对。 */
export interface AccidentRule {
  tags: [Tag, Tag];
  out: string;
}

/** 阶段目标的一步。requires 为标签集合，玩家的两个物品标签并集需覆盖它。 */
export interface StageStep {
  id: string;
  requires: Tag[];
  output: string;
}

export interface StageDef {
  id: 1 | 2 | 3;
  name: string;
  /** 阶段一句话说明，给 UI 用 */
  blurb: string;
  /** 该阶段解锁的区域 */
  unlock: AreaId[];
  /** 阶段 1、2 用目标链；阶段 3 用分支，此字段为空 */
  steps: StageStep[];
}

export interface BranchDef {
  id: BranchId;
  name: string;
  /**
   * 三件套要求。外层数组每一项是一个槽位，内层数组是候选物品（任一满足即可）。
   * 例：飞船动力 = ['optimistic', 'theoryfuel'] 二选一。
   */
  requires: string[][];
  /** 每个槽位在 UI 上显示的名字，与 requires 一一对应 */
  slots: string[];
  /** 完成后获得的纪念品 */
  keepsake: string;
  /** 完成后的结局入口 */
  ending: EndingId;
}

/** 判定所需的进度上下文 */
export interface Progress {
  stage: 1 | 2 | 3 | 4;
  stepIndex: number;
}

/** 合成结果 */
export type MixResult =
  | {
      kind: 'stage';
      output: string;
      stepId: string;
      nextStepIndex: number;
      stageCleared: boolean;
    }
  | { kind: 'recipe'; output: string }
  | { kind: 'accident'; output: string; rule: [Tag, Tag] }
  | { kind: 'fallback'; output: string };

/** 合成时附带的提示信息 */
export interface MixHint {
  /** 当前目标还缺哪些标签 */
  missing: Tag[];
  /** 若这个组合恰好对应后面某一步，提示玩家先做前面的 */
  laterStep?: { index: number; stepId: string };
  /** 给 AI 对话条用的一句话 */
  message?: string;
}

export interface MixOutcome {
  result: MixResult;
  hint: MixHint | null;
}

/** 存档结构。后端只做校验与存储，不解释内容。 */
export interface SaveState {
  schemaVersion: number;
  day: number;
  areaId: AreaId;
  scene: string[];
  bag: Record<string, number>;
  discovered: Record<string, true>;
  stage: 1 | 2 | 3 | 4;
  stepIndex: number;
  branches: Record<BranchId, boolean>;
  keepsakes: string[];
  accidents: number;
  log: LogEntry[];
  ending: EndingId | null;
  launchAttempts: number;
  launchFailures: number;
}

export interface LogEntry {
  day: number;
  kind: '拾取' | '合成' | '阶段' | '支线' | '意外' | '结局' | '系统';
  text: string;
}
