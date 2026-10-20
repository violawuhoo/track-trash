# 《好垃》内容总表（T6 扩容版）

> 数据真源：`packages/game-core/src/items.ts`（80 件）、`recipes.ts`（36 条）、`stages.ts`。
> 本文档是 T6 内容扩容的交付说明与人工核对底稿，改物品/配方时必须同步更新本文。
> 验收：`node scripts/check-content.mjs`（A 无孤立 / B 每标签 ≥2 可捡来源）、
> `node scripts/check-assets.mjs`（A–D，含 80 件不撞脸）、`pnpm --filter @haola/game-core test`。
> 本轮三项均已跑通（测试仅剩 search.test.ts 一处存量硬编码池待质量成员更新，见 §3.6）。

---

## 1. 物品总表（80 件）

区域分布：crash 坠毁点 9 / junkyard 垃圾山 8 / market 外星集市废墟 9 / cave 怪石洞窟 7（可捡池共 33 件）。
kind 分布：base 33 / mid 9 / ship 10 / commission 9 / accident 13 / keepsake 6。

「获取方式」列：`拾·<区域>` = 该区域地面可刷（硬保底来源）；`第7天` = 访客掉落；`配方` = 精确合成；`阶段n-m` = 阶段目标；`意外` = 意外配对表 / 风险 / 兜底。★ = T6 新增。

### 1.1 基础物品 · base（33 件，区域可捡）

| id | 名称 | 标签 | 区域 | 颜色 | icon | 获取方式 |
|---|---|---|---|---|---|---|
| tape | 胶带 | 实体,粘 | crash | orange | tape | 拾·坠毁点 |
| wrench | 生锈扳手 | 实体,导电,金属 | crash | yellow | wrench | 拾·坠毁点 |
| manual | 缺页火箭手册 | 知识,实体 | crash | mint | book | 拾·坠毁点 |
| sandwich | 半块三明治 | 实体 | crash | pink | sandwich | 拾·坠毁点 |
| battery | 漏气电池 | 实体,导电,风险 | crash | orange | battery | 拾·坠毁点 |
| ★ ducttape | 银色管道胶带 | 实体,粘 | crash | mint | tape2 | 拾·坠毁点 |
| ★ crowbar | 撬棍 | 实体,能推,金属 | crash | orange | wrench | 拾·坠毁点 |
| ★ photo | 划痕全家福 | 知识,实体 | crash | pink | cards | 拾·坠毁点 |
| ★ lamp | 燃油台灯 | 实体,能烧 | crash | orange | sun | 拾·坠毁点 |
| plunger | 马桶搋子 | 实体,能推 | junkyard | purple | plunger | 拾·垃圾山 |
| screw | 有梦想的螺丝 | 实体,金属 | junkyard | yellow | screw | 拾·垃圾山 |
| sock | 前任的袜子 | 实体 | junkyard | pink | sock | 拾·垃圾山 |
| lottery | 半张彩票 | 风险,实体 | junkyard | orange | ticket | 拾·垃圾山 |
| ★ broom | 秃毛扫帚 | 实体,能推 | junkyard | mint | plunger | 拾·垃圾山 |
| ★ firework | 受潮烟花 | 实体,风险,能烧 | junkyard | purple | spiral | 拾·垃圾山 |
| ★ tire | 汽车轮胎 | 实体 | junkyard | pink | tape | 拾·垃圾山 |
| antigrav | 反向重力 | 外星,抽象 | market | mint | arrow-up | 拾·集市废墟 |
| fuel | 「差不多」燃料 | 外星,能烧 | market | orange | canister | 拾·集市废墟 |
| taste | 「昨天的味道」 | 外星,抽象 | market | purple | cloud | 拾·集市废墟 |
| homework | 外星小孩的物理作业 | 知识,外星 | market | mint | paper | 拾·集市废墟 |
| ★ paste | 外星浆糊 | 外星,粘 | market | mint | gum | 拾·集市废墟 |
| ★ plasma | 罐装等离子体 | 外星,能烧 | market | pink | canister | 拾·集市废墟 |
| ★ mirror | 外星魔镜 | 外星,抽象 | market | purple | sun | 拾·集市废墟 |
| ★ debt | 外星欠条 | 知识,风险 | market | yellow | ticket | 拾·集市废墟 |
| mood | 好心情 | 抽象 | cave | yellow | sun | 拾·怪石洞窟 |
| awkward | 尴尬 | 抽象 | cave | pink | sweat | 拾·怪石洞窟 |
| poker | 扑克牌 | 风险,实体 | cave | orange | cards | 拾·怪石洞窟 |
| rock | 会唱歌的石头 | 实体,抽象 | cave | purple | rock | 拾·怪石洞窟 |
| ★ echo | 抓得到的回声 | 抽象 | cave | mint | wave | 拾·怪石洞窟 |
| ★ crystal | 导电水晶 | 实体,导电 | cave | mint | rock | 拾·怪石洞窟 |
| ★ fossil | 外星化石 | 知识,实体 | cave | yellow | rock | 拾·怪石洞窟 |
| note | 外星留言条 | 知识,外星 | market | mint | note | 第7天访客 + 拾·集市废墟（T6 补 area） |
| glitter | 亮片胶水 | 实体,粘 | junkyard | yellow | sparkle | 第7天访客 + 拾·垃圾山（T6 补 area） |

> note / glitter 原为「仅第 7 天访客掉落」，T6 补 `area` 后两路并存：物品不唯一，
> 地面刷新与访客掉落互不冲突，且让「知识 / 外星 / 实体 / 粘」四个标签多一个可捡来源。

### 1.2 中间产物 · mid（9 件）

| id | 名称 | 标签 | 颜色 | icon | 获取方式 |
|---|---|---|---|---|---|
| wire | 临时导线 | 中间,导电,部件 | orange | wire | 配方 battery+tape；阶段1-1（导电+粘） |
| bracket | 信号器支架 | 中间,导电,部件,金属 | yellow | bracket | 配方 wire+wrench；阶段1-2（导电+金属） |
| signal | 修好的信号器 | 中间,部件,导电 | mint | signal | 配方 manual+bracket / fossil+crystal★；阶段1-3（知识+导电） |
| windbreak | 临时挡风板 | 中间,部件,实体 | purple | shield | 配方 plunger+sock / broom+sock★；阶段2-1（实体+实体） |
| bedframe | 简易床架 | 中间,部件,实体,金属 | yellow | bed | 配方 screw+windbreak / tire+windbreak★；阶段2-2（金属+实体） |
| shelter | 临时避难所 | 中间,部件,实体,能挡风 | pink | tent | 配方 bedframe+lottery；阶段2-3（风险+实体） |
| doorplate | 加厚门板 | 中间,部件,实体,能挡风 | orange | door | 配方 doorthing+sandwich |
| hopefood | 有希望的口粮 | 中间,实体,能呼吸 | pink | bowl | 配方 mood+ration |
| ★ hotsandwich | 热三明治 | 中间,实体,能呼吸 | orange | bowl | 配方 lamp+sandwich |

### 1.3 飞船部件 · ship（10 件）

| id | 名称 | 标签 | 颜色 | icon | 获取方式 |
|---|---|---|---|---|---|
| joystick | 应急操纵杆 | 部件,实体,金属 | orange | joystick | 配方 plunger+tape |
| theoryfuel | 理论燃料 | 部件,能烧 | yellow | flame | 配方 manual+sandwich |
| optimistic | 乐观反重力引擎 | 部件,外星 | mint | engine | 配方 antigrav+mood |
| lostafternoon | 输掉的下午 | 部件,风险,抽象 | purple | clock | 配方 poker+taste |
| bat2 | 差不多电池 | 部件,导电 | yellow | battery2 | 配方 homework+battery |
| socialengine | 社交死摇滚引擎 | 部件,实体 | pink | speaker | 配方 awkward+rock |
| spinner | 原地转圈引擎 | 部件,外星,风险 | orange | spiral | 配方 fuel+antigrav / plasma+antigrav★ |
| doorthing | 看起来像门的东西 | 部件,实体,能挡风 | purple | doorway | 配方 tape+wrench / ducttape+wrench★ |
| ration | 应急口粮 | 部件,实体,能呼吸 | pink | bar | 配方 plunger+sandwich |
| ★ hullplate | 货舱外壳板 | 部件,实体,能挡风 | mint | shield | 配方 crowbar+windbreak |

### 1.4 委托物品 · commission（9 件）

| id | 名称 | 标签 | 颜色 | icon | 获取方式 |
|---|---|---|---|---|---|
| shopfront | 店面 | 委托,实体 | orange | shop | 配方 plunger+wrench |
| menu | 菜单 | 委托,知识 | mint | menu | 配方 homework+sandwich / photo+homework★ |
| fakecustomer | 假装是顾客的东西 | 委托,抽象 | pink | person | 配方 awkward+sock |
| birthproof | 生日证明 | 委托,知识 | yellow | cert | 配方 manual+poker |
| cakerepl | 蛋糕替代品 | 委托,实体 | purple | cake | 配方 fuel+sandwich |
| clapper | 愿意鼓掌的东西 | 委托,抽象 | mint | hands | 配方 mood+tape |
| ★ musicbox | 石头录音机 | 委托,抽象 | yellow | speaker | 配方 echo+rock |
| ★ mannequin | 外星假人 | 委托,实体 | mint | person | 配方 mirror+paste |
| ★ bankrupt | 破产证明 | 委托,知识 | orange | cert | 配方 debt+lottery |

### 1.5 意外产物 · accident（13 件）

| id | 名称 | 标签 | 颜色 | icon | 获取方式 |
|---|---|---|---|---|---|
| failedtaste | 失败的味道 | 意外,风险 | orange | smoke | 任一「风险」物品参与合成 |
| unclear | 说不清的东西 | 意外,实体 | purple | blob | 兜底；意外 实体+实体 |
| halfplan | 半个计划 | 意外,知识 | mint | map | 意外 实体+知识 |
| gum | 外星口香糖 | 意外,外星,粘 | pink | gum | 意外 实体+外星 |
| opttape | 乐观胶带 | 意外,抽象,粘 | yellow | tape2 | 意外 实体+抽象 |
| wastepaper | 一页废纸 | 意外,知识 | mint | page | 意外 知识+知识 |
| alienink | 外星笔迹 | 意外,外星,知识 | purple | scribble | 意外 知识+外星 |
| halfget | 懂了但没完全懂 | 意外,抽象 | mint | question | 意外 知识+抽象 |
| unclear2 | 更说不清的东西 | 意外,外星 | purple | blob2 | 意外 外星+外星 |
| alienmood | 外星心情 | 意外,外星,抽象 | pink | aura | 意外 外星+抽象 |
| complexmood | 复杂的情绪 | 意外,抽象 | yellow | wave | 意外 抽象+抽象 |
| gambler | 赌徒的乐观 | 意外,风险,抽象 | orange | dice | 配方 mood+poker；意外 风险+抽象 |
| ★ dud | 哑炮 | 意外,实体 | orange | blob2 | 配方 firework+battery |

### 1.6 纪念品 · keepsake（6 件，只陈列不合成）

| id | 名称 | 颜色 | icon | 获取方式 |
|---|---|---|---|---|
| ks_signal | 信号器纪念徽章 | mint | badge | 阶段 1 完成 |
| ks_shelter | 避难所纪念砖 | pink | brick | 阶段 2 完成 |
| ks_ship | 起飞纪念章 | orange | medal | 造飞船支线完成 |
| ks_fail | 起飞失败纪念章 | purple | broken | 强行起飞失败 |
| ks_shop | 奶茶店招牌 | yellow | sign | 奶茶店支线完成 |
| ks_birthday | 石头生日蛋糕 | pink | candle | 石头生日支线完成 |

---

## 2. 标签分布统计

### 2.1 按区域（可捡池，33 件）

| 区域 | 件数 | 物品 |
|---|---|---|
| crash 坠毁点 | 9 | tape, wrench, manual, sandwich, battery, ducttape, crowbar, photo, lamp |
| junkyard 垃圾山 | 8 | plunger, screw, sock, lottery, broom, firework, tire, glitter |
| market 外星集市废墟 | 9 | antigrav, fuel, taste, homework, paste, plasma, mirror, debt, note |
| cave 怪石洞窟 | 7 | mood, awkward, poker, rock, echo, crystal, fossil |

### 2.2 按 kind（80 件）

| kind | 件数 |
|---|---|
| base | 33 |
| mid | 9 |
| ship | 10 |
| commission | 9 |
| accident | 13 |
| keepsake | 6 |

### 2.3 按颜色（80 件）

| 颜色 | 件数 |
|---|---|
| orange | 18 |
| yellow | 15 |
| mint | 19 |
| pink | 15 |
| purple | 13 |

（D 断言要求 (形状, 颜色) 两两不重复，check-assets D 已全绿。）

### 2.4 按标签（含硬保底视角：可捡来源数）

「可捡来源数」= 区域池中带该标签的物品件数。硬保底只从池里刷，
所以这一列 < 2 就意味着玩家用完即卡死——**必须 ≥ 2**（check-content B 断言）。

| 标签 | 全物品计数 | 可捡来源数 | 达标(≥2) | 可捡来源（id） |
|---|---|---|---|---|
| 实体 | 36 | 21 | ✓ | tape, wrench, manual, sandwich, battery, ducttape, crowbar, photo, lamp, plunger, screw, sock, lottery, glitter, broom, firework, tire, poker, rock, crystal, fossil |
| 知识 | 13 | 6 | ✓ | manual, photo, homework, note, debt, fossil |
| 外星 | 13 | 8 | ✓ | antigrav, fuel, taste, homework, note, paste, plasma, mirror |
| 抽象 | 16 | 7 | ✓ | antigrav, taste, mood, awkward, rock, echo, mirror |
| 风险 | 9 | 5 | ✓ | battery, lottery, firework, poker, debt |
| 粘 | 6 | 4 | ✓ | tape, ducttape, glitter, paste |
| 导电 | 7 | 3 | ✓ | wrench, battery, crystal |
| 金属 | 6 | 3 | ✓ | wrench, screw, crowbar |
| 能推 | 4 | 3 | ✓ | plunger, crowbar, broom |
| 能烧 | 5 | 4 | ✓ | lamp, fuel, firework, plasma |
| 中间 | 9 | 0 | — | 分类标签，全部由合成产出，无池内来源 |
| 部件 | 17 | 0 | — | 分类标签，全部由合成产出 |
| 委托 | 9 | 0 | — | 分类标签，全部由合成产出 |
| 意外 | 13 | 0 | — | 分类标签，全部由意外/配方产出 |
| 纪念品 | 6 | 0 | — | 分类标签，只陈列 |
| 能呼吸 | 3 | 0 | — | 功能标签，仅 mid/ship（支线槽位用） |
| 能挡风 | 4 | 0 | — | 功能标签，仅 mid/ship（支线槽位用） |

说明：
- 阶段 1/2 的目标只用到「导电 / 粘 / 金属 / 实体 / 风险 / 知识」，可捡来源最低为 3（导电、金属），安全。
- 「能呼吸 / 能挡风」是支线槽位标签，不在阶段 1/2 目标里，池内为 0 是设计使然
  （world.test.ts「配置错误暴露」用例专门断言「能挡风」不出现在任何基础池）。
- T6 新增可捡物品把「能推」从 2 → 3、「能烧」从 2 → 4、「导电」从 2 → 3、
  「风险」从 4 → 5，硬保底全面增厚。

---

## 3. 配方可达性验证（36 条）

可达性口径：从 33 件可捡基础物品出发，按配方闭包传播，全部 36 条产物的两条材料均可达。
（playthrough.test.ts「配方可达性 / 支线槽位」两个用例即机检此结论。）

图例：`基` = 可捡基础物品；`←n` = 由第 n 条配方产出；★ = T6 新增配方。
「备选」= 该产物原有路线之外新增的第二条材料路线。

| # | 配方 | 材料来源 | 产物可达链 |
|---|---|---|---|
| 1 | battery + tape → wire | 基+基 | battery(基)+tape(基) |
| 2 | wire + wrench → bracket | ←1+基 | wire←1 |
| 3 | manual + bracket → signal | 基+←2 | manual(基)+bracket←2 |
| 4 | plunger + sock → windbreak | 基+基 | — |
| 5 | screw + windbreak → bedframe | 基+←4 | windbreak←4 |
| 6 | bedframe + lottery → shelter | ←5+基 | bedframe←5 |
| 7 | plunger + tape → joystick | 基+基 | — |
| 8 | manual + sandwich → theoryfuel | 基+基 | — |
| 9 | antigrav + mood → optimistic | 基+基 | — |
| 10 | poker + taste → lostafternoon | 基+基 | — |
| 11 | homework + battery → bat2 | 基+基 | — |
| 12 | awkward + rock → socialengine | 基+基 | — |
| 13 | tape + wrench → doorthing | 基+基 | — |
| 14 | plunger + sandwich → ration | 基+基 | — |
| 15 | mood + poker → gambler | 基+基 | — |
| 16 | fuel + antigrav → spinner | 基+基 | — |
| 17 | doorthing + sandwich → doorplate | ←13+基 | doorthing←13 |
| 18 | mood + ration → hopefood | 基+←14 | ration←14 |
| 19 | plunger + wrench → shopfront | 基+基 | — |
| 20 | homework + sandwich → menu | 基+基 | — |
| 21 | awkward + sock → fakecustomer | 基+基 | — |
| 22 | manual + poker → birthproof | 基+基 | — |
| 23 | fuel + sandwich → cakerepl | 基+基 | — |
| 24 | mood + tape → clapper | 基+基 | — |
| ★25 | crowbar + windbreak → hullplate | 基+←4 | crowbar(基)+windbreak←4 |
| ★26 | lamp + sandwich → hotsandwich | 基+基 | lamp(基)+sandwich(基) |
| ★27 | echo + rock → musicbox | 基+基 | echo(基)+rock(基) |
| ★28 | mirror + paste → mannequin | 基+基 | mirror(基)+paste(基) |
| ★29 | debt + lottery → bankrupt | 基+基 | debt(基)+lottery(基) |
| ★30 | firework + battery → dud | 基+基 | firework(基)+battery(基) |
| ★31 | ducttape + wrench → doorthing（备选） | 基+基 | ducttape(基)+wrench(基)；原路 ←13 |
| ★32 | plasma + antigrav → spinner（备选） | 基+基 | plasma(基)+antigrav(基)；原路 ←16 |
| ★33 | broom + sock → windbreak（备选） | 基+基 | broom(基)+sock(基)；原路 ←4 |
| ★34 | tire + windbreak → bedframe（备选） | 基+←4 | tire(基)+windbreak←4；原路 ←5 |
| ★35 | fossil + crystal → signal（备选） | 基+基 | fossil(基)+crystal(基)；原路 ←3 |
| ★36 | photo + homework → menu（备选） | 基+基 | photo(基)+homework(基)；原路 ←20 |

### 3.1 新配方产物（25–30）材料全部可捡

6 件新非基础物品的两材料全部直接来自区域池，不依赖任何中间产物：
hullplate 是唯一用到中间产物的一条（windbreak←4，plunger+sock 或 broom+sock 均可）。

### 3.2 支线槽位可达性（stages.ts BRANCHES）

| 支线 | 槽位 | 候选 | 可达候选 |
|---|---|---|---|
| ship 造飞船 | 动力 | optimistic / theoryfuel | ✓ ←9 / ←8 |
| ship 造飞船 | 外壳 | doorthing / doorplate / ★hullplate | ✓ ←13(或←31) / ←17 / ★←25 |
| ship 造飞船 | 生命维持 | ration / hopefood / ★hotsandwich | ✓ ←14 / ←18 / ★←26 |
| teashop 开奶茶店 | 店面 | shopfront | ✓ ←19 |
| teashop 开奶茶店 | 菜单 | menu | ✓ ←20(或←36) |
| teashop 开奶茶店 | 顾客 | fakecustomer / ★mannequin | ✓ ←21 / ★←28 |
| birthday 石头生日 | 生日证明 | birthproof / ★bankrupt | ✓ ←22 / ★←29 |
| birthday 石头生日 | 蛋糕 | cakerepl | ✓ ←23 |
| birthday 石头生日 | 观众 | clapper / ★musicbox | ✓ ←24 / ★←27 |

### 3.3 阶段目标与配方的优先级说明

判定优先级为 阶段目标 > 精确配方 > 风险 > 意外配对 > 兜底（resolve.ts）。
因此个别配方在阶段推进途中会被阶段目标「截胡」——例如 lamp+sandwich（实体+实体）
在阶段 2 第 1 步会先产出 windbreak；想稳定拿到 hotsandwich，请在阶段 3 之后合成。
这与既有条目 manual+sandwich → theoryfuel 的行为完全一致，是设计而非缺陷。

### 3.4 配方去重检查

36 条的 `recipeKey(a,b)` 两两不同（无序组合键无重复），data.test.ts
「配方没有重复的组合键」机检通过。新配方不与任何存量配方撞键；
★31/★32/★33/★34/★35/★36 为同一产物增加第二材料路线，不死锁、不唯一。

### 3.5 撞脸检查

80 件物品的 (形状, 颜色) 组合两两不重复，check-assets D 全绿。
新增 20 件的 icon/颜色组合均为既有调色板内的未占用组合，未更换任何存量字段。

### 3.6 测试存量问题（已清理）

`tests/search.test.ts` 曾硬编码旧坠毁点五件池
`['tape', 'wrench', 'manual', 'sandwich', 'battery']`，不包含 T6 新增的 4 件 crash 物品。
pickSearch 以 `pool[floor(rng * pool.length)]` 随机取物，池扩到 9 件后该用例必然取到新物品
（实测取到 lamp）。已由质量成员修复：硬编码池改为动态 `AREA_POOLS.crash` 引用，
`tests/data.test.ts` 的 visitorItems 失效豁免（note/glitter 入池后成死代码）同步删除。
修复后 game-core 测试 5 文件 / 60 用例全绿。

## 4. 新手指引（T7）

### 4.1 状态机

`newcomer → firstMove → firstPickup → free`。卡片里的 `firstCraft` 与 `free`
行为一致（都不再提示），实现为「首次合成成功」迁移边 + 庆祝台词，不单设持久态。

| 状态 | 进入 | TutorBar 文案 | 退出 |
|---|---|---|---|
| newcomer | 开新档 | 「点一下地面，小人会直线走过去。」 | 首次点击地面 → firstMove |
| firstMove | 首次点击地面 | 「走近地上的东西，它会自己进背包——不用按钮。」 | 首次自动拾取 → firstPickup |
| firstPickup | 首次拾取 | 「点右上角「背包」，放两样东西进合成台，按「合成这两样」。」 | 首次合成成功 → free；或 picks ≥ 4 → free |
| free | 首次合成 / 第 4 次拾取 / 老存档读档 | 无 | — |

- **硬停止**：`picks ≥ 4` 强制进 free（卡片验收：第 4 次拾取后不再出任何引导提示）。
- **读档不重放**：`tutorial` 入存档；`schemaVersion` 保持 2 不 bump，
  老存档缺字段 → 归一化直接进 free（bump 会按契约 §3.1 丢弃现存存档）。
- **跳过逻辑**：无手动跳过按钮。引导最长 4 次拾取自然结束，不添决策。
- 引导期内 HintBar 让位（375px 两个 pill 放不下），结束后自动回来。

### 4.2 一次性事件台词（dialogue.ts 新增 4 键）

只在引导期内各出现一次，走对话条：`tutPickup`（首次拾取）/ `tutCraft`（首次合成）/
`tutWrong`（首次合错）/ `tutBlocked`（首次被雾障弹回）。文案见 dialogue.ts。

### 4.3 与既有机制的边界

- 持久化仍只发生在 collect / craft / doLaunch / chooseEnding / newGame 五个动作；
  `setMoveTarget` 的 newcomer → firstMove 只改内存，下次 collect/craft 连写盘。
- 防重旗（wrong / blocked）走瞬态，不入存档——刷新后可能重播一次，可接受。
- 引导期间不阻塞移动：pill 容器 `pointer-events: none`，无模态无遮罩。
