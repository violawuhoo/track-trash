import type { AccidentRule, Recipe, Tag } from './types';

/**
 * 精确配方。
 *
 * 精确配方不是推进阶段的唯一途径，只是快捷路径。
 * 判定优先级：阶段目标 > 精确配方 > 风险 > 意外配对 > 兜底。
 *
 * ## `why` 字段（合成理由）
 *
 * 每条配方必须写一句话说清「为什么这两个东西能变成那个东西」——
 * 逻辑桥三选一：功能继承 / 材质拼接 / 气质共鸣。
 * 荒诞但要有点道理，玩家合成成功时 AI 把这句念出来。
 * 写不出 why 的配方不许入库（data.test 有断言守着）。
 *
 * ⚠️ 新增配方注意：产物若是支线候选品，原料标签并集**不得**覆盖
 * 阶段 3 三步的 requires（粘+知识 / 金属+能烧 / 能推+抽象），
 * 否则阶段目标会截胡，支线死掉（stage3.test ⑧ 有断言守着）。
 */
export const RECIPES: Recipe[] = [
  // 迫降期
  { a: 'battery', b: 'tape', out: 'wire', why: '电池有电，胶带能把电绑成一根线——丑，但通电。' },
  { a: 'wire', b: 'wrench', out: 'bracket', why: '导线缠上金属扳手，就多了一个能站立的架子。' },
  { a: 'manual', b: 'bracket', out: 'signal', why: '手册写明信号器怎么装，支架把它举到该有的高度。' },
  // 探索期
  { a: 'plunger', b: 'sock', out: 'windbreak', why: '搋子的面加袜子的硬度，拼起来正好是一块板——挡风足够了。' },
  { a: 'screw', b: 'windbreak', out: 'bedframe', why: '螺丝把挡风板拧成四条腿，一块板就变成了床架。' },
  { a: 'bedframe', b: 'lottery', out: 'shelter', why: '床架当骨架，再围一圈「赌一把」的勇气，就是个家。' },
  // 飞船
  { a: 'plunger', b: 'tape', out: 'joystick', why: '搋子是现成的杆，胶带缠出握把——操纵杆就这么回事。' },
  { a: 'manual', b: 'sandwich', out: 'theoryfuel', why: '手册第 47 页说燃料可以合成，三明治是唯一的原料。理论上。' },
  { a: 'antigrav', b: 'mood', out: 'optimistic', why: '反向重力负责往上，好心情负责相信它——引擎拼的是信心。' },
  { a: 'poker', b: 'taste', out: 'lostafternoon', why: '用「昨天的味道」当赌注打牌，输掉的就是一个下午。' },
  { a: 'homework', b: 'battery', out: 'bat2', why: '外星物理作业写明「电量可以商量」，电池商量完就是差不多。' },
  { a: 'awkward', b: 'rock', out: 'socialengine', why: '尴尬驱动的引擎，启动时会响——像有人在道歉，但确实在响。' },
  { a: 'tape', b: 'wrench', out: 'doorthing', why: '扳手弯成门框，胶带缠满剩下的部分。看起来像门，功能上也是。' },
  { a: 'plunger', b: 'sandwich', out: 'ration', why: '搋子压实的三明治，体积小了一半，饱腹感差不多。' },
  { a: 'mood', b: 'poker', out: 'gambler', why: '好心情碰上扑克牌，下一把肯定赢——这就是赌徒的全部逻辑。' },
  { a: 'fuel', b: 'antigrav', out: 'spinner', why: '差不多燃料配上反向重力，转是转得很好，方向另说。' },
  { a: 'doorthing', b: 'sandwich', out: 'doorplate', why: '给「像门的东西」贴一层三明治面包边，厚度和体面都翻了倍。' },
  { a: 'mood', b: 'ration', out: 'hopefood', why: '好心情拌进口粮里，味道没变，但吃完觉得明天也许还行。' },
  // 奶茶店
  { a: 'plunger', b: 'wrench', out: 'shopfront', why: '搋子当门把，扳手搭出骨架，店面的结构就这么立起来了。' },
  { a: 'homework', b: 'sandwich', out: 'menu', why: '作业本翻过来当纸，抄上仅有的两样货——菜单齐了。' },
  { a: 'awkward', b: 'sock', out: 'fakecustomer', why: '袜子套在一个尴尬上，远看像个人，站在门口正合适。' },
  // 石头生日
  { a: 'manual', b: 'poker', out: 'birthproof', why: '手册的空白页写上日期，红桃尖当印章——证明书就有了。' },
  { a: 'fuel', b: 'sandwich', out: 'cakerepl', why: '「差不多」燃料点着的蛋糕不是蛋糕，但吹蜡烛够用了。' },
  { a: 'mood', b: 'tape', out: 'clapper', why: '把好心情缠在手上，它就会在你说完话的时候拍手。' },
  // T6 扩容：新物品路线 + 旧产物备选路径
  { a: 'crowbar', b: 'windbreak', out: 'hullplate', why: '撬棍把挡风板撬平、加固，就成了能叫外壳的板子。' },
  { a: 'lamp', b: 'sandwich', out: 'hotsandwich', why: '台灯的火力刚好够把三明治加热——热的就感人。' },
  { a: 'echo', b: 'rock', out: 'musicbox', why: '把回声灌进会唱歌的石头，歌就能随身带着放了。' },
  { a: 'mirror', b: 'paste', out: 'mannequin', why: '魔镜照出「你可能成为的样子」，浆糊把它定型——假人诞生了。' },
  { a: 'debt', b: 'lottery', out: 'bankrupt', why: '欠条和废彩票凑在一起，双方联合认证：破产。' },
  { a: 'firework', b: 'battery', out: 'dud', why: '两个都很想炸的东西凑在一起，互相抵消，只剩礼貌。' },
  { a: 'ducttape', b: 'wrench', out: 'doorthing', why: '银色胶带缠扳手，缠出第二扇门——这次还有点反光。' },
  { a: 'plasma', b: 'antigrav', out: 'spinner', why: '等离子灌进反向重力，旋转性能翻倍，方向问题保留。' },
  { a: 'broom', b: 'sock', out: 'windbreak', why: '扫帚板加袜子，第二块挡风板——材料不同，命运相同。' },
  { a: 'tire', b: 'windbreak', out: 'bedframe', why: '轮胎垫在挡风板下面，床架变得又圆又稳。' },
  { a: 'fossil', b: 'crystal', out: 'signal', why: '化石摆出天线的姿势，水晶把信号导出来——就通了。' },
  { a: 'photo', b: 'homework', out: 'menu', why: '全家福背面是最平整的纸，抄上菜单，生意和念想都在上面。' },
  // 阶段 3「建设期」三步产物的同构精确配方（GDD §4.3 R7/R8/R9）。
  // 「同构」= 与 s3-1/s3-2/s3-3 的 requires 完全等价：
  //   R7 tape(粘)+manual(知识) ≡ s3-1 粘+知识 → notice
  //   R8 crowbar(金属)+fuel(能烧) ≡ s3-2 金属+能烧 → generator
  //   R9 echo(抽象)+broom(能推) ≡ s3-3 能推+抽象 → hourglass
  // 作用：给玩家一条「提前备料」的路；同时满足 check-content 断言 A
  // （每个非 accident/keepsake 物品必须被配方引用）。
  { a: 'tape', b: 'manual', out: 'notice', why: '手册上唯一能看懂的一段，抄在木板上就是告示。' },
  { a: 'crowbar', b: 'fuel', out: 'generator', why: '撬棍当摇柄，「差不多」燃料当动力——摇十圈发三度电。' },
  { a: 'echo', b: 'broom', out: 'hourglass', why: '扫帚每扫一圈，回声就应一声——一应一答，就是一天。' },
  // ── v3 增量配方（GDD §5）──
  // 第 1 层：其余 6 件 mid（base + base）。
  { a: 'mirror', b: 'tape', out: 'valvework', why: '魔镜照出阀门的三个接口，胶带把形状固定住。' },
  { a: 'battery', b: 'lottery', out: 'switchpanel', why: '电池供电，彩票的号码栏当四个档位——咔哒声是真的。' },
  { a: 'screw', b: 'tape', out: 'driverset', why: '螺丝和胶带互相较劲，较出来的成品能拧五种螺丝。' },
  { a: 'lamp', b: 'ducttape', out: 'portablelight', why: '台灯缠上提手，光就能跟着你走了——四小时之内。' },
  { a: 'crowbar', b: 'manual', out: 'beacontower', why: '按手册的图把撬棍架起来，灯还没装，位置先占上。' },
  { a: 'firework', b: 'tape', out: 'warnlamp', why: '点不着的烟花改行闪灯，每晚三下，风雨无阻。' },
  // 第 2 层：第四支线「留下来」的六个槽位候选（mid/委托 + base）。
  { a: 'valvework', b: 'tire', out: 'toolstand', why: '阀门组当托架，轮胎当台面——摊子比摊主先开业。' },
  { a: 'driverset', b: 'glitter', out: 'sewkit', why: '螺丝刀改行当锥子，亮片胶水封边——针线这就齐了。' },
  { a: 'switchpanel', b: 'fossil', out: 'staykey', why: '开关盘的第四档藏着一把钥匙，化石是它的备用齿纹。' },
  { a: 'debt', b: 'photo', out: 'landdeed', why: '欠条背面对着全家福按个手印——这块地就算有主了。' },
  { a: 'awkward', b: 'mirror', out: 'neighbor', why: '魔镜照出尴尬的样子，尴尬学会敲墙——它决定住隔壁。' },
  { a: 'bedframe', b: 'tape', out: 'warmchair', why: '床架拆掉一半缠成靠背——椅子留给别人，摆得很正。' },
  // 第 3 层：前任日志载体（GDD §5.3 R16–R23，8 条）。
  // 载体 ↔ 日志的映射见 `logs.ts` 的表；每条配方都要能走通（依赖闭包终止于可捡 base）。
  { a: 'manual', b: 'photo', out: 'log_page1', why: '手册缺的那页，原来一直压在全家福下面——字很小，但都在。' },
  { a: 'lamp', b: 'lottery', out: 'log_map2', why: '台灯照亮彩票背面，那里写满燃料消耗——最后一栏「留给下一个」。' },
  { a: 'manual', b: 'broom', out: 'log_page2', why: '扫帚扫出夹层里的值班记录，字迹越到后面越工整。' },
  { a: 'manual', b: 'mirror', out: 'log_map1', why: '魔镜照出手册没有的来时路——最后一段被人反复描过。' },
  { a: 'homework', b: 'switchpanel', out: 'log_chip1', why: '作业的批注接上开关盘，第四档弹出一块芯片。' },
  { a: 'hourglass', b: 'poker', out: 'log_q1', why: '时漏漏到底，牌下面压着半页空白——只有一个没写完的问句。' },
  { a: 'warnlamp', b: 'crystal', out: 'log_b1', why: '警示灯闪到第三下，水晶把它导成一个发热的物件。' },
  { a: 'generator', b: 'note', out: 'log_reel1', why: '发电机给留言条通电，圆的字迹转起来，像有人在很远的地方翻身。' },

  // ───────── 意外产物的二阶配方（世界线接线批次）─────────
  // 目标一：意外产物不再是死胡同——每个都能继续合，通向各条世界线的候选品。
  // 目标二：给支线候选品补「莫名原料」的第二条路，降低凑三件套的机械感。
  // 全部经过 stage3.test ⑧ 的截胡校验（原料标签并集不覆盖 s3 三步的 requires）。
  { a: 'failedtaste', b: 'sandwich', out: 'ration', why: '失败的味道盖在面包上，反正难吃，压实了就是应急口粮。' },
  { a: 'unclear', b: 'sock', out: 'fakecustomer', why: '说不清的东西套上袜子，远看像个人，站在门口正合适。' },
  { a: 'opttape', b: 'screw', out: 'shopfront', why: '乐观胶带把螺丝钉缠成门把，招牌不用写，气势先到位。' },
  { a: 'wastepaper', b: 'homework', out: 'menu', why: '干净的废纸抄上物理作业，菜单有了——反正没人看得懂。' },
  { a: 'halfplan', b: 'manual', out: 'birthproof', why: '半个计划对照手册补全，日期那栏写着：今天，大概。' },
  { a: 'gum', b: 'rock', out: 'cakerepl', why: '口香糖把石头裹成蛋糕的形状，能吹不能吃，正合适。' },
  { a: 'alienink', b: 'photo', out: 'menu', why: '外星笔迹写满全家福背面，今日特供看不懂，但很高级。' },
  { a: 'dud', b: 'battery', out: 'bat2', why: '哑炮和鼓包电池凑一起，谁也不响——电量显示：差不多。' },
  { a: 'gambler', b: 'fuel', out: 'theoryfuel', why: '赌徒的乐观兑进差不多燃料，理论上，这桶真的能烧。' },
  { a: 'unclear2', b: 'mirror', out: 'mannequin', why: '魔镜照出更说不清的东西——远看是顾客，近看是你。' },
  { a: 'notice', b: 'plunger', out: 'shopfront', why: '告示绑在搋子上举高，就是招牌——举招牌的人暂时缺席。' },
  { a: 'beacontower', b: 'ducttape', out: 'doorthing', why: '空架子缠满银色胶带，看起来像扇门，也确实能挡风。' },
  { a: 'portablelight', b: 'poker', out: 'lostafternoon', why: '挑灯夜战打扑克，输掉的那个下午就封装在灯里。' },
  { a: 'dud', b: 'firework', out: 'warnlamp', why: '哑炮插上受潮烟花，谁也炸不成——改行闪灯，每晚三下。' },
  { a: 'taste', b: 'sandwich', out: 'hopefood', why: '昨天的味道夹进面包，咬一口，居然尝出了明天还行。' },
  { a: 'paste', b: 'plunger', out: 'joystick', why: '浆糊把搋子的杆粘粗了一圈，握感反而正经了。' },
  { a: 'plasma', b: 'fuel', out: 'theoryfuel', why: '等离子兑进差不多燃料，理论上这桶能烧出奇迹。' },
  { a: 'note', b: 'sandwich', out: 'menu', why: '留言条写什么今天就供什么——今日特供：你们也迷路了吗。' },

  // ───────── 第五支线「混沌线」─────────
  // 莫名其妙的东西合到底，合出来的是「你自己」。
  // 三个槽位：轮廓 → 声音 → 答案；前两槽各有两条路（意外产物两两组合），
  // 答案由「半个计划 + 赌徒的乐观」补全——说不清的前半生，配敢信的后半段。
  { a: 'unclear', b: 'complexmood', out: 'selfthing', why: '说不清的东西撞上复杂的情绪，轮廓忽然清晰了一下——那个轮廓有点像你。' },
  { a: 'unclear2', b: 'alienmood', out: 'selfthing', why: '更说不清的东西配上外星心情，别人的情绪替你描出了轮廓。' },
  { a: 'alienmood', b: 'halfget', out: 'selfvoice', why: '别人的坏心情滤过一层半懂不懂，剩下的那句是你自己的声音。' },
  { a: 'alienink', b: 'complexmood', out: 'selfvoice', why: '读不懂的笔迹写满复杂的情绪，念出来居然像你自己。' },
  { a: 'halfplan', b: 'gambler', out: 'selfanswer', why: '半个计划的后半段写着「然后就……」，赌徒的乐观替你补上：然后就信了。' },
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

const WHY_MAP: Readonly<Record<string, string>> = Object.freeze(
  RECIPES.reduce<Record<string, string>>((acc, r) => {
    acc[recipeKey(r.a, r.b)] = r.why;
    return acc;
  }, {}),
);

/** 查某对原料的合成理由。没有精确配方时返回 null。 */
export function recipeWhy(a: string, b: string): string | null {
  return WHY_MAP[recipeKey(a, b)] ?? null;
}

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
