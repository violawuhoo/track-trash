# 《好垃》实施规格 v1.0

> 依据：桌面《好垃.docx》设计文档 + 2026-10-19 三轮对齐结论。
> 本文件是开发依据，所有实现以本文件为准；与 docx 冲突处以本文件为准。

---

## 0. 相对原文档的变更（已确认）

| 原文档 | 现在 | 原因 |
|---|---|---|
| 单 HTML 文件、无依赖 | pnpm monorepo，前端/后端/共享包分离 | 用户要求完整工程 |
| GitHub Pages only | 前端 Pages + 后端 Render + 数据库 Neon | Pages 无法托管后端 |
| 暂不做前后端分离 | 做，但**前端离线可完整通关** | 后端仅做增强 |
| 暂不做账号/排行榜 | 仍不做 | 无运营需求 |
| 阶段 1 步骤 1 产出二选一 | 只产「临时导线」 | 消除歧义 |
| 判定优先级未定 | 阶段目标 > 支线 > 精确配方 > 意外 > 兜底 | 消除冲突 |
| 物品唯一性未定 | 不唯一，按「物品 + 数量」堆叠，可重复刷出 | 防死锁 |
| 搜索保底为"优先出" | 改为「缺什么刷什么」硬保底 | 防死锁 |
| 起飞无失败规则 | 强行起飞 50%，完整三件套 100% | 补全成就 |

---

## 1. 技术栈（锁定版本区间）

| 层 | 选型 |
|---|---|
| 包管理 | pnpm 9 + workspace |
| 前端 | React 18 + TypeScript 5 + Vite 5 + Zustand 4 |
| 路由 | 无路由库，三屏用 store 状态切换（屏幕级切换不需要 URL） |
| 样式 | 原生 CSS + CSS 变量 tokens，CSS Modules 分组件作用域；**不引入 Tailwind**（Riso 需精细控制） |
| 后端 | Fastify 4 + TypeScript + Drizzle ORM |
| 数据库 | 本地 SQLite（better-sqlite3），生产 Postgres（Neon） |
| 测试 | Vitest（game-core 单测 + 穷举模拟） |
| CI/CD | GitHub Actions |
| 容器 | Docker + docker-compose（本地三件套一键起） |

Node 版本：22 LTS，`engines` 锁定 `>=20`。

---

## 2. 仓库结构

```
track-trash/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── screens/{StartScreen,GameScreen,EndingScreen}.tsx
│   │   │   ├── components/
│   │   │   │   ├── TopBar.tsx            # 天数/意外/纪念品/进度
│   │   │   │   ├── AreaTabs.tsx          # 横向滚动，未解锁带锁
│   │   │   │   ├── Scene.tsx             # 可点击贴纸物品
│   │   │   │   ├── SearchBar.tsx         # 搜索 +1 天
│   │   │   │   ├── CraftBench.tsx        # 双槽 + 合成按钮
│   │   │   │   ├── Bag.tsx               # 背包网格
│   │   │   │   ├── ItemCard.tsx          # 贴纸卡 + 问号
│   │   │   │   ├── Accordion.tsx         # 目标/合成台/背包/陈列/日志
│   │   │   │   ├── DialogueBar.tsx       # 底部 AI，逐句
│   │   │   │   ├── Toast.tsx
│   │   │   │   └── Stamp.tsx             # 盖章庆祝
│   │   │   ├── store/gameStore.ts        # Zustand，唯一状态源
│   │   │   ├── lib/{api,storage,sfx?}.ts
│   │   │   ├── styles/{tokens.css,global.css,grain.css}
│   │   │   └── assets/icons/             # 内联 SVG 组件（按物品）
│   │   └── vite.config.ts
│   └── api/
│       ├── src/
│       │   ├── server.ts
│       │   ├── routes/{config,saves,health}.ts
│       │   ├── db/{schema.ts,client.ts}
│       │   └── lib/{validate,conflict}.ts
│       └── migrations/
├── packages/
│   └── game-core/
│       ├── src/
│       │   ├── types.ts                  # Item/Tag/Recipe/Stage/Goal
│       │   ├── items.ts                  # 55 个物品 + 描述 + 标签
│       │   ├── recipes.ts                # 精确配方 + 意外匹配表
│       │   ├── stages.ts                 # 阶段目标链 + 支线 + 结局
│       │   ├── dialogue.ts               # AI 台词库
│       │   ├── resolve.ts                # 合成判定（纯函数）
│       │   ├── search.ts                 # 搜索 + 硬保底（纯函数）
│       │   ├── launch.ts                 # 起飞判定（纯函数）
│       │   └── index.ts
│       └── tests/{resolve,search,playthrough}.test.ts
├── .github/workflows/{ci.yml,deploy-web.yml,deploy-api.yml}
├── docker-compose.yml
├── pnpm-workspace.yaml
├── .env.example
└── README.md
```

---

## 3. 领域模型

### 3.1 标签

```
基础：实体 知识 外星 抽象 风险 中间 部件 委托 意外 纪念品
功能：导电 粘 金属 能推 能烧 能呼吸 能挡风
```

固定枚举，`Tag` 为字符串字面量联合类型。

### 3.2 物品

```ts
interface Item {
  id: string;            // 稳定英文 id，存档用
  name: string;
  desc: string;          // 一到两句
  tags: Tag[];
  kind: 'base' | 'mid' | 'ship' | 'commission' | 'accident' | 'keepsake';
  area?: AreaId;         // base 物品限定刷新区域
  icon: string;          // SVG 组件 key
}
```

背包只存 `{ itemId, count }`，不存物品快照——物品数据升级不会坏档。

### 3.3 区域

| id | 名称 | 解锁 | 池 |
|---|---|---|---|
| `crash` | 坠毁点 | 初始 | 胶带、生锈扳手、缺页火箭手册、半块三明治、漏气电池 |
| `junkyard` | 垃圾山 | 阶段 1 完成 | 马桶搋子、有梦想的螺丝、前任的袜子、半张彩票 |
| `market` | 外星集市废墟 | 阶段 2 完成 | 反向重力、「差不多」燃料、「昨天的味道」、外星小孩的物理作业 |
| `cave` | 怪石洞窟 | 阶段 2 完成 | 好心情、尴尬、扑克牌、会唱歌的石头 |

访客掉落（第 7 天一次性）：外星留言条、亮片胶水、会唱歌的石头。

---

## 4. 合成判定 `resolve(a, b, state)`

严格按顺序，首个命中即返回：

```
1. 阶段目标    当前阶段未完成步骤，tags(a ∪ b) ⊇ step.requires
                  → 产出 step.output，steps.push，+1 天
2. 支线目标    阶段 3，任一分支未完成，同一标签判定
                  → 产出分支物品，+1 天
3. 精确配方    无序 key = [idA, idB].sort().join('+')
                  → 产出配方产物，+1 天
4. 意外匹配    标签对查表（无序），例如 实体+知识 → 半个计划
                  → 产出意外物品，意外计数 +1，+1 天
5. 兜底        产出「说不清的东西」
```

**不命中阶段目标时**必须给提示：算出「缺的标签」，从台词库取一句，例如
`这俩都导电，缺个能粘的。再翻翻。`

### 4.1 阶段目标链（修正后）

**阶段 1 迫降期**（区域：坠毁点）

| 步 | requires | output |
|---|---|---|
| 1 | 导电 + 粘 | 临时导线 |
| 2 | 导电 + 金属 | 信号器支架 |
| 3 | 知识 + 导电 | 修好的信号器 |

**阶段 2 探索期**（区域：垃圾山）

| 步 | requires | output |
|---|---|---|
| 1 | 实体 + 实体 | 临时挡风板 |
| 2 | 金属 + 实体 | 简易床架 |
| 3 | 风险 + 实体 | 临时避难所 |

**阶段 3 建设期**：三条支线，完成任一 → 自由模式

| 支线 | 三件套 |
|---|---|
| 造飞船 | 乐观反重力引擎 / 理论燃料、看起来像门的东西 / 加厚门板、应急口粮 / 有希望的口粮 |
| 开奶茶店 | 店面、菜单、假装是顾客的东西 |
| 给石头过生日 | 生日证明、蛋糕替代品、愿意鼓掌的东西 |

### 4.2 意外匹配表

| 组合 | 产出 | 产出标签 |
|---|---|---|
| 风险 + 任何 | 失败的味道 | 风险、中间 |
| 实体 + 实体 | 说不清的东西 | 实体、中间 |
| 实体 + 知识 | 半个计划 | 知识、中间 |
| 实体 + 外星 | 外星口香糖 | 外星、中间 |
| 实体 + 抽象 | 乐观胶带 | 抽象、粘、中间 |
| 知识 + 知识 | 一页废纸 | 知识、中间 |
| 知识 + 外星 | 外星笔迹 | 外星、知识、中间 |
| 知识 + 抽象 | 懂了但没完全懂 | 抽象、中间 |
| 外星 + 外星 | 更说不清的东西 | 外星、中间 |
| 外星 + 抽象 | 外星心情 | 抽象、外星、中间 |
| 抽象 + 抽象 | 复杂的情绪 | 抽象、中间 |

优先级：精确配方先于意外表；风险+任何 放在意外表内最低位，避免吃掉其他组合。

---

## 5. 搜索与硬保底 `pickSearch(area, state)`

```
count = random() < 0.7 ? 1 : 2
needs = 当前阶段未完成步骤的 requires 中，
        背包现有未消耗标签无法覆盖的那些标签
```

- 若 `needs` 非空且该区域池中存在带 `needs` 任一标签的物品 → **强插 1 个**该类物品
- 剩余名额从区域池均匀随机（同一物品可重复）
- 每次搜索清空场景重刷，`day + 1`

保底保证：只要该区域内存在对应标签物品，玩家任何时候都能搜到它。这是「不死锁」的核心机制。

---

## 6. 起飞与结局 `launch(state)`

| 条件 | 按钮 | 结果 |
|---|---|---|
| 飞船三件套齐 | 「起飞」 | 100% 成功 → 结局「离开星球」 |
| 有 ≥1 个飞船部件但不齐 | 「强行起飞」 | 50% 成功 → 「离开星球」；50% 失败 → 获「起飞失败纪念章」，+1 天，回自由模式可重试 |
| 无飞船部件 | 不显示 | — |

结局四种：离开星球 / 开奶茶店 / 给石头过生日 / 自由模式。每种一段 AI 点评。

---

## 7. 前端状态

Zustand 单 store：

```ts
interface GameState {
  screen: 'start' | 'game' | 'ending';
  day: number;
  areaId: AreaId;
  scene: string[];                  // 当前场景物品 id
  bag: Record<string, number>;      // itemId -> count
  craftSlots: (string | null)[];    // 长度 2
  discovered: Record<string, true>; // 首次拾得，弹 toast
  stage: 1 | 2 | 3 | 4;
  stepIndex: number;
  branches: Record<BranchId, { done: boolean; parts: string[] }>;
  keepsakes: string[];
  accidents: number;
  log: LogEntry[];
  dialogue: { queue: string[]; current: string; charIndex: number };
  ending?: EndingId;
  forcedLaunchFailed: boolean;
}
```

持久化字段单独列出，写入 `localStorage['haola.save.v1']`，`schemaVersion` 随结构递增，读档时做迁移。

### 7.1 交互（手机优先）

- 点物品 → 进第一个空合成槽；再点已选物品 → 退出槽位
- 长按 / 点卡片右上角 `?` → 弹出描述浮层
- 不做 HTML5 拖拽（移动端不可靠），桌面端仅作增强，可选
- 折叠面板默认只展开「当前目标」，其余收起，避免首屏过长

### 7.2 美术实现

- `tokens.css`：`--cream:#F7F0E0` `--ink:#1A1A1A` `--orange:#FF6B35` `--mint:#4ECDC4` `--purple:#9B6BFF` `--pink:#FF8FAB` `--yellow:#FFD166` `--paper:#FFFDF7`
- 贴纸卡：`border: 3px solid var(--ink)` + `box-shadow: 4px 4px 0 var(--ink)` + `transform: rotate(-1.2deg)`（按 id 哈希微旋转）
- Riso 颗粒：`grain.css` 用内联 SVG `feTurbulence` 生成 data-URI，`opacity: .06`，`mix-blend-mode: multiply`，固定覆盖层
- 字体：系统栈 `-apple-system, "PingFang SC", "Microsoft YaHei"`，标题 `font-weight: 900` + `letter-spacing: .06em`
- 图标：每物品一个内联 SVG 组件，2–4 个几何图元，限用三色盘

---

## 8. 后端接口

Base：`/api`。鉴权：`X-Device-Id`（前端生成 UUID，存 localStorage），不做账号。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | `{ ok, version, uptime }` |
| GET | `/api/config` | 返回 game-core 编译出的 `{ version, items, recipes, stages, dialogue }`；`ETag` + `Cache-Control: public, max-age=300`，前端用版本号比对缓存 |
| GET | `/api/saves/me` | 取当前设备存档；无则 404 |
| PUT | `/api/saves/me` | `{ state, schemaVersion, progressScore, clientUpdatedAt }` → 按冲突规则写入，返回最终存档 |
| DELETE | `/api/saves/me` | 清空云端存档（开始页"重开"时可选） |

配置下发意义：改物品/配方/台词不用重新发版。前端构建时把 game-core 打进包作为兜底，接口不可用时用本地版本——保证离线可玩。

### 8.1 冲突规则

```
progressScore = stage * 10000 + stepIndex * 1000 + branchesDone * 200 + day
云端与本地都取 progressScore 大者；相等取 updatedAt 新者。
PUT 返回最终生效存档，前端以此覆盖本地并 toast「已同步」。
```

### 8.2 数据库（Drizzle）

```sql
CREATE TABLE saves (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id     text NOT NULL UNIQUE,
  state         jsonb NOT NULL,
  schema_version int NOT NULL,
  progress_score int NOT NULL,
  day           int NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX saves_updated_at_idx ON saves (updated_at DESC);
```

配置不进数据库：`/api/config` 直接返回 `@haola/game-core` 导出的常量 + 构建时哈希。少一张表，少一处不一致。

### 8.3 安全与限流

- 请求体上限 256KB（存档 JSON 通常 < 20KB）
- `@fastify/rate-limit`：全局 60 req/min/device
- `X-Device-Id` 校验 UUID 格式，非法直接 400
- CORS 仅允许 `WEB_ORIGIN` 环境变量指定的前端域名
- 不做 JWT：设备 ID 不是凭证，仅作隔离键；README 注明「存档不加密、不防跨设备冒用」，符合单机定位

---

## 9. 部署

| 部分 | 平台 | 方式 |
|---|---|---|
| web | GitHub Pages | Actions 构建 `apps/web` → `gh-pages` |
| api | Render Web Service | Docker（仓库根 Dockerfile），免费层会休眠 |
| db | Neon | 免费 Postgres，连接串进 Render 环境变量 |

前端 `VITE_API_BASE` 环境变量指向 api 域名。断网或 api 休眠时，前端走本地 game-core + localStorage，不阻塞游玩。

`docker-compose.yml`：`web`（nginx 托管构建产物）+ `api` + `postgres`，供本地/自托管一套起。

### 9.1 CI

- `ci.yml`：PR 上跑 `pnpm lint` / `pnpm -r test` / `pnpm -r build`
- `deploy-web.yml`：push main → 构建 → Pages
- `deploy-api.yml`：push main → Render Deploy Hook（需在仓库 Secrets 配 `RENDER_DEPLOY_HOOK`）

---

## 10. 验收标准

**功能**
1. 从开始页 → 阶段 1 → 阶段 2 → 阶段 3 → 任一结局，全流程可走通
2. 阶段 1 不依赖精确配方也能完成（扳手+电池、胶带+电池两条路都能过第 2 步前的判定）
3. 任意时刻至少存在一条能推进的搜索路径（硬保底生效）
4. 首次拾取弹 toast + 写日志；背包 `?` 显示描述
5. 刷新页面进度不丢；云端可达时自动同步
6. 强行起飞有成功与失败两种结果，失败后给纪念章且可重试

**工程**
7. `pnpm -r test` 全绿，含 **阶段 1 穷举模拟**：随机游玩 100,000 次，通关率 100%，无死锁
8. 移动端 375×667 无横向滚动、无元素重叠、按钮可点区域 ≥ 44px
9. 断网状态完整可玩（config 与 save 接口均失败时降级）
10. `README.md` 含本地启动、部署、架构说明

---

## 11. 里程碑

| M | 内容 | 出口 |
|---|---|---|
| M1 | monorepo 脚手架 + game-core 全部数据与算法 + 单测 | 穷举模拟 100% 通关 |
| M2 | 前端三屏 + 阶段 1 可玩 | 阶段 1 在浏览器里走通 |
| M3 | 全流程 + 贴纸美术 + AI 对话 + 存档 | 完整可玩 |
| M4 | Fastify 后端 + 同步 + Docker | 本地 compose 跑通 |
| M5 | CI + Pages/Render 部署 + README | 线上可访问 |

开发顺序固定：**先 game-core 与穷举验证，再 UI**。规则没验通之前不写界面，避免在 UI 里调规则。

---

## 12. 待你提供

- GitHub 推送凭证（`gh` 浏览器授权，或 PAT）
- Render / Neon 账号（M5 才需要；没有的话 M1–M4 本地完整可跑，部署留配置与文档）
