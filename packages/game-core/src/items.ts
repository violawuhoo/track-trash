import type { Item } from './types';

/**
 * 全物品表。60 件。
 *
 * kind 说明：
 *  - base       区域里能刷出来的基础物品
 *  - mid        阶段目标产出的中间产物
 *  - ship       飞船部件
 *  - commission 支线委托物品
 *  - accident   没有精确配方时的意外产物，可继续参与合成
 *  - keepsake   纪念品，只陈列不参与合成
 *
 * 注意：物品不设唯一性，背包按数量堆叠，搜索可重复刷出同一物品。
 * 这是「不死锁」的前提，不要加 unique 标记。
 */
export const ITEMS: Item[] = [
  // ───────── 坠毁点 crash ─────────
  { id: 'tape', name: '胶带', desc: '前任留下的。粘性还在，但已经粘不住任何重要的东西了。', tags: ['实体', '粘'], kind: 'base', area: 'crash', color: 'orange', icon: 'tape' },
  { id: 'wrench', name: '生锈扳手', desc: '型号早停产了。锈成这样还能拧螺丝，拧人心就不行了。', tags: ['实体', '导电', '金属'], kind: 'base', area: 'crash', color: 'yellow', icon: 'wrench' },
  { id: 'manual', name: '缺页火箭手册', desc: '缺了目录、索引和最关键的第 47 页。剩下的部分讲得很清楚。', tags: ['知识', '实体'], kind: 'base', area: 'crash', color: 'mint', icon: 'book' },
  { id: 'sandwich', name: '半块三明治', desc: '另一半不知道去哪了。面包边已经硬到可以当工具用。', tags: ['实体'], kind: 'base', area: 'crash', color: 'pink', icon: 'sandwich' },
  { id: 'battery', name: '漏气电池', desc: '外壳鼓包，闻起来像有人在里面偷偷放烟花。', tags: ['实体', '导电', '风险'], kind: 'base', area: 'crash', color: 'orange', icon: 'battery' },

  // ───────── 垃圾山 junkyard ─────────
  { id: 'plunger', name: '马桶搋子', desc: '在一艘飞船的残骸里找到它，说明前人也有正常需求。', tags: ['实体', '能推'], kind: 'base', area: 'junkyard', color: 'purple', icon: 'plunger' },
  { id: 'screw', name: '有梦想的螺丝', desc: '它一直想成为一颗铆钉。现在它只是颗螺丝，还拧花了。', tags: ['实体', '金属'], kind: 'base', area: 'junkyard', color: 'yellow', icon: 'screw' },
  { id: 'sock', name: '前任的袜子', desc: '单独一只，尺码惊人，硬度接近建筑材料。', tags: ['实体'], kind: 'base', area: 'junkyard', color: 'pink', icon: 'sock' },
  { id: 'lottery', name: '半张彩票', desc: '号码栏正好被撕掉了。严格来说，这半张也中不了。', tags: ['风险', '实体'], kind: 'base', area: 'junkyard', color: 'orange', icon: 'ticket' },

  // ───────── 外星集市废墟 market ─────────
  { id: 'antigrav', name: '反向重力', desc: '把它放在地上，它会努力往下掉——往天花板那个方向。', tags: ['外星', '抽象'], kind: 'base', area: 'market', color: 'mint', icon: 'arrow-up' },
  { id: 'fuel', name: '「差不多」燃料', desc: '加多少都行，飞多远看命。说明书只有两个字：差不多。', tags: ['外星', '能烧'], kind: 'base', area: 'market', color: 'orange', icon: 'canister' },
  { id: 'taste', name: '「昨天的味道」', desc: '闻起来像昨天。具体是哪个昨天，取决于你有没有后悔的事。', tags: ['外星', '抽象'], kind: 'base', area: 'market', color: 'purple', icon: 'cloud' },
  { id: 'homework', name: '外星小孩的物理作业', desc: '题目是：如果光速可以商量，通勤要多久。批注是「再想想」。', tags: ['知识', '外星'], kind: 'base', area: 'market', color: 'mint', icon: 'paper' },

  // ───────── 怪石洞窟 cave ─────────
  { id: 'mood', name: '好心情', desc: '今天不知道为什么，就是还行。这种状态很稀有，建议存起来。', tags: ['抽象'], kind: 'base', area: 'cave', color: 'yellow', icon: 'sun' },
  { id: 'awkward', name: '尴尬', desc: '可以拿在手里，但没法放进兜里。它总在你需要的时候掉出来。', tags: ['抽象'], kind: 'base', area: 'cave', color: 'pink', icon: 'sweat' },
  { id: 'poker', name: '扑克牌', desc: '可以合，但每次用都可能浪费一天。缺了大王，也缺了赢的可能。', tags: ['风险', '实体'], kind: 'base', area: 'cave', color: 'orange', icon: 'cards' },
  { id: 'rock', name: '会唱歌的石头', desc: '唱得不准，但很投入。它只在没人的时候唱，所以你听到的都是巧合。', tags: ['实体', '抽象'], kind: 'base', area: 'cave', color: 'purple', icon: 'rock' },

  // ───────── 访客掉落（第 7 天，无区域） ─────────
  { id: 'note', name: '外星留言条', desc: '字迹是圆的，像用舌头写的。翻译过来是：你们也迷路了吗。', tags: ['知识', '外星'], kind: 'base', color: 'mint', icon: 'note' },
  { id: 'glitter', name: '亮片胶水', desc: '粘性一般，但闪。在宇宙里，能闪的东西比能粘的值钱。', tags: ['实体', '粘'], kind: 'base', color: 'yellow', icon: 'sparkle' },

  // ───────── 中间产物 mid ─────────
  { id: 'wire', name: '临时导线', desc: '丑，但通电。我收回刚才的吐槽。', tags: ['中间', '导电', '部件'], kind: 'mid', color: 'orange', icon: 'wire' },
  { id: 'bracket', name: '信号器支架', desc: '结构上像支架，功能上也像支架，就是不好看。', tags: ['中间', '导电', '部件', '金属'], kind: 'mid', color: 'yellow', icon: 'bracket' },
  { id: 'signal', name: '修好的信号器', desc: '能发信号了。内容是「救命」，发送范围：未知。', tags: ['中间', '部件', '导电'], kind: 'mid', color: 'mint', icon: 'signal' },
  { id: 'windbreak', name: '临时挡风板', desc: '由搋子和袜子组成。它挡风，也挡视线，还挡人际关系。', tags: ['中间', '部件', '实体'], kind: 'mid', color: 'purple', icon: 'shield' },
  { id: 'bedframe', name: '简易床架', desc: '躺上去会响，但不会塌。这已经是本星球的最高标准。', tags: ['中间', '部件', '实体', '金属'], kind: 'mid', color: 'yellow', icon: 'bed' },
  { id: 'shelter', name: '临时避难所', desc: '四面有墙，顶上有盖。安全等级：能睡着。', tags: ['中间', '部件', '实体', '能挡风'], kind: 'mid', color: 'pink', icon: 'tent' },
  { id: 'doorplate', name: '加厚门板', desc: '厚度翻了三倍。现在它挡得住风，也挡得住你自己。', tags: ['中间', '部件', '实体', '能挡风'], kind: 'mid', color: 'orange', icon: 'door' },
  { id: 'hopefood', name: '有希望的口粮', desc: '味道一般，但吃完之后觉得明天也许还行。', tags: ['中间', '实体', '能呼吸'], kind: 'mid', color: 'pink', icon: 'bowl' },

  // ───────── 飞船部件 ship ─────────
  { id: 'joystick', name: '应急操纵杆', desc: '搋子加胶带。握感奇怪，但确实能推。', tags: ['部件', '实体', '金属'], kind: 'ship', color: 'orange', icon: 'joystick' },
  { id: 'theoryfuel', name: '理论燃料', desc: '理论上能烧，理论上能飞，理论上我们都还活着。', tags: ['部件', '能烧'], kind: 'ship', color: 'yellow', icon: 'flame' },
  { id: 'optimistic', name: '乐观反重力引擎', desc: '它不产生推力，只产生信心。数据上很糟，心理上很强。', tags: ['部件', '外星'], kind: 'ship', color: 'mint', icon: 'engine' },
  { id: 'lostafternoon', name: '输掉的下午', desc: '你把它输在牌桌上了。它现在是零件，也是教训。', tags: ['部件', '风险', '抽象'], kind: 'ship', color: 'purple', icon: 'clock' },
  { id: 'bat2', name: '差不多电池', desc: '电量显示：差不多。能撑多久：差不多。', tags: ['部件', '导电'], kind: 'ship', color: 'yellow', icon: 'battery2' },
  { id: 'socialengine', name: '社交死摇滚引擎', desc: '尴尬加石头。启动后会响，声音像有人在道歉。', tags: ['部件', '实体'], kind: 'ship', color: 'pink', icon: 'speaker' },
  { id: 'spinner', name: '原地转圈引擎', desc: '它能提供完美的旋转。方向问题留给下一版。', tags: ['部件', '外星', '风险'], kind: 'ship', color: 'orange', icon: 'spiral' },
  { id: 'doorthing', name: '看起来像门的东西', desc: '它确实是门。只是不确定通向哪里。', tags: ['部件', '实体', '能挡风'], kind: 'ship', color: 'purple', icon: 'doorway' },
  { id: 'ration', name: '应急口粮', desc: '压缩饼干的口感，宇宙的口味。', tags: ['部件', '实体', '能呼吸'], kind: 'ship', color: 'pink', icon: 'bar' },

  // ───────── 委托物品 commission ─────────
  { id: 'shopfront', name: '店面', desc: '招牌还没写，但结构上已经是个店面了。', tags: ['委托', '实体'], kind: 'commission', color: 'orange', icon: 'shop' },
  { id: 'menu', name: '菜单', desc: '第一页写着「今日供应：差不多」。', tags: ['委托', '知识'], kind: 'commission', color: 'mint', icon: 'menu' },
  { id: 'fakecustomer', name: '假装是顾客的东西', desc: '它会站在门口，看起来很犹豫。演技一般。', tags: ['委托', '抽象'], kind: 'commission', color: 'pink', icon: 'person' },
  { id: 'birthproof', name: '生日证明', desc: '证明书上写着：今天，大概。', tags: ['委托', '知识'], kind: 'commission', color: 'yellow', icon: 'cert' },
  { id: 'cakerepl', name: '蛋糕替代品', desc: '不建议吃，但可以吹。', tags: ['委托', '实体'], kind: 'commission', color: 'purple', icon: 'cake' },
  { id: 'clapper', name: '愿意鼓掌的东西', desc: '它会在你说话的时候拍手，很捧场。', tags: ['委托', '抽象'], kind: 'commission', color: 'mint', icon: 'hands' },

  // ───────── 意外产物 accident ─────────
  { id: 'failedtaste', name: '失败的味道', desc: '尝起来像烧焦的塑料和一点点希望。', tags: ['意外', '风险'], kind: 'accident', color: 'orange', icon: 'smoke' },
  { id: 'unclear', name: '说不清的东西', desc: '它有两个把手，和一个不知道干什么用的凸起。', tags: ['意外', '实体'], kind: 'accident', color: 'purple', icon: 'blob' },
  { id: 'halfplan', name: '半个计划', desc: '前半段很清晰，后半段是「然后就……」。', tags: ['意外', '知识'], kind: 'accident', color: 'mint', icon: 'map' },
  { id: 'gum', name: '外星口香糖', desc: '嚼起来有星尘味。吐出来会自己爬回去。', tags: ['意外', '外星', '粘'], kind: 'accident', color: 'pink', icon: 'gum' },
  { id: 'opttape', name: '乐观胶带', desc: '粘性一般，但每次粘东西都会说「应该能行」。', tags: ['意外', '抽象', '粘'], kind: 'accident', color: 'yellow', icon: 'tape2' },
  { id: 'wastepaper', name: '一页废纸', desc: '两面印着同一段话。内容不重要，重要的是它很干净。', tags: ['意外', '知识'], kind: 'accident', color: 'mint', icon: 'paper' },
  { id: 'alienink', name: '外星笔迹', desc: '看起来像数学，读起来像诗，用起来像废纸。', tags: ['意外', '外星', '知识'], kind: 'accident', color: 'purple', icon: 'scribble' },
  { id: 'halfget', name: '懂了但没完全懂', desc: '你知道它在说什么，但不知道它为什么要说。', tags: ['意外', '抽象'], kind: 'accident', color: 'mint', icon: 'question' },
  { id: 'unclear2', name: '更说不清的东西', desc: '比说不清的东西多一个把手。', tags: ['意外', '外星'], kind: 'accident', color: 'purple', icon: 'blob2' },
  { id: 'alienmood', name: '外星心情', desc: '它不属于你，但你能感觉到它。类似别人的坏情绪。', tags: ['意外', '外星', '抽象'], kind: 'accident', color: 'pink', icon: 'aura' },
  { id: 'complexmood', name: '复杂的情绪', desc: '同时觉得还好和不太行。两种感觉互相抵消，剩下困。', tags: ['意外', '抽象'], kind: 'accident', color: 'yellow', icon: 'wave' },
  { id: 'gambler', name: '赌徒的乐观', desc: '你确信下一把能赢。这个信念本身不产生任何东西，但它很亮。', tags: ['意外', '风险', '抽象'], kind: 'accident', color: 'orange', icon: 'dice' },

  // ───────── 纪念品 keepsake ─────────
  { id: 'ks_signal', name: '信号器纪念徽章', desc: '第一阶段纪念。它证明你确实把两样破东西接在了一起。', tags: ['纪念品'], kind: 'keepsake', color: 'mint', icon: 'badge' },
  { id: 'ks_shelter', name: '避难所纪念砖', desc: '第二阶段纪念。重量惊人，象征意义也惊人。', tags: ['纪念品'], kind: 'keepsake', color: 'pink', icon: 'brick' },
  { id: 'ks_ship', name: '起飞纪念章', desc: '你从这颗星球离开了。章是纪念这段日子的。', tags: ['纪念品'], kind: 'keepsake', color: 'orange', icon: 'medal' },
  { id: 'ks_fail', name: '起飞失败纪念章', desc: '你试过了。章上刻着「差一点」，字体很小。', tags: ['纪念品'], kind: 'keepsake', color: 'purple', icon: 'broken' },
  { id: 'ks_shop', name: '奶茶店招牌', desc: '字很大。外星人路过确实能看见。', tags: ['纪念品'], kind: 'keepsake', color: 'yellow', icon: 'sign' },
  { id: 'ks_birthday', name: '石头生日蛋糕', desc: '不能吃，但石头很喜欢。它唱了一首歌。', tags: ['纪念品'], kind: 'keepsake', color: 'pink', icon: 'candle' },
];

export const ITEM_MAP: Readonly<Record<string, Item>> = Object.freeze(
  Object.fromEntries(ITEMS.map((it) => [it.id, it])),
);

export function getItem(id: string): Item {
  const item = ITEM_MAP[id];
  if (!item) throw new Error(`未知物品 id: ${id}`);
  return item;
}
