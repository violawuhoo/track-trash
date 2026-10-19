import type { EndingId, Tag } from './types';

/**
 * AI 台词库。
 *
 * 语气约束：毒舌但靠谱，吐槽事情，不攻击玩家，不阴阳怪气。
 * 每句一行，UI 逐句显示，点一下继续。
 */
export type DialogueKey =
  | 'start'
  | 'stage1'
  | 'stage2'
  | 'stage3'
  | 'clear1'
  | 'clear2'
  | 'accident'
  | 'wrong'
  | 'craft'
  | 'pick'
  | 'day7'
  | 'day30'
  | 'day100'
  | 'launchFail'
  | 'launchSuccess';

export const DIALOGUE: Readonly<Record<DialogueKey, string[]>> = Object.freeze({
  start: [
    '我是这艘船的导航 AI。船没了，我还在。',
    '恭喜，你现在是船长，也是唯一的船员。',
    '先修信号器。修不好我们就一直待在这儿——我倒是无所谓，我没有腿。',
  ],
  stage1: [
    '信号器缺根线。能导电的加能粘的，去坠毁点找找。',
    '扳手也算导电，别问为什么。',
  ],
  stage2: [
    '能发信号不等于能住人。找个能挡风的地方。',
    '垃圾山那边东西多，虽然大多没什么用。',
  ],
  stage3: [
    '接下来三条路：造飞船走人、开奶茶店、给石头过生日。',
    '我建议造飞船。另外两个听起来都需要社交。',
  ],
  clear1: [
    '信号发出去了。有没有人收到，另说。',
    '至少现在，外面知道这里还有个活人。',
  ],
  clear2: [
    '有墙、有顶、有床。恭喜，你从「遇难者」升级成「居民」了。',
    '居民这个身份没有补贴，但至少能睡个整觉。',
  ],
  accident: [
    '这不是你要的。但它现在归你了。',
    '别扔，说不定哪天用得上。这星球上什么都可能用得上。',
  ],
  wrong: [
    '方向不对。但材料还在，你可以再试。',
  ],
  craft: [
    '成了。丑是丑了点，但能用。',
  ],
  pick: [
    '捡吧。这星球上最不缺的就是别人不要的东西。',
  ],
  day7: [
    '第 7 天。有东西在靠近。',
    '它看起来不像是来救我们的。',
  ],
  day30: [
    '第 30 天。你还在。我有点意外，真的。',
  ],
  day100: [
    '第 100 天。说实话，我已经把这儿当家了。',
    '你别告诉别人。',
  ],
  launchFail: [
    '没飞起来。',
    '别看我，我负责导航，不负责物理。',
    '纪念章给你，下次再来。',
  ],
  launchSuccess: [
    '起来了。',
    '我算过很多次这条轨道，这是第一次算对。',
  ],
});

export const ENDING_LINES: Readonly<Record<EndingId, string[]>> = Object.freeze({
  leave: [
    '走了。',
    '石头还在唱。它大概会一直唱下去，唱给没有人听的宇宙。',
    '你回头看了一眼。就一眼。这很正常。',
  ],
  teashop: [
    '招牌写大点，至少外星人路过能看见。',
    '第一杯我请。虽然我喝不了，也尝不出味道，也没有嘴的实体。',
    '生意会好的。这颗星球上终于有点甜的东西了。',
  ],
  birthday: [
    '它唱了一首没人听懂的歌。你鼓掌了。',
    '这就算过完了。仪式感这东西，本来就是给活着的人准备的。',
    '它记得今天。这一点比蛋糕重要。',
  ],
  free: [
    '没有目标了。你可以继续捡垃圾，也可以什么都不做。',
    '我建议什么都不做。难得。',
    '反正船也没了，信号器也修好了，剩下的时间都是你的。',
  ],
});

/** 缺标签时的提示。UI 也可以直接用 hint.missing 自己拼。 */
const MISSING_LABEL: Readonly<Partial<Record<Tag, string>>> = Object.freeze({
  导电: '能导电的',
  粘: '能粘的',
  金属: '金属件',
  知识: '能查的东西',
  实体: '实打实的东西',
  风险: '带点风险的东西',
});

export function missingLine(missing: Tag[]): string {
  if (missing.length === 0) return '差一点点。再试试别的组合。';
  const parts = missing.map((t) => MISSING_LABEL[t] ?? t);
  return `还缺${parts.join('、')}。这俩凑不齐，再翻翻。`;
}

/** 取某个事件的所有台词 */
export function lines(key: DialogueKey): string[] {
  return DIALOGUE[key];
}
