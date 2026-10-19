# 《好垃》v2 任务分包

> 用途：把 v2 开放世界改造拆成**可独立交给不同专家、互不打架**的任务包。
> 每个任务包对应**一次独立对话**。开新对话时，第一句话贴该卡片的「开场提示词」，后面不用再解释背景。

---

## 0. 共用背景（所有对话都要先读）

> 这一段是给专家的输入，不是给人看的说明。开新对话时让专家先读本文件 §0 与目标卡片即可。

**项目**：单机休闲合成游戏《好垃》，荒诞太空捡垃圾。
**仓库**：https://github.com/violawuhoo/track-trash （公开，main 分支）
**本地路径**：`C:\Users\E14\WorkBuddy\好垃`（就是仓库根，直接在此改，不要另建目录）

**技术栈（已定，不要换）**
- pnpm 9 workspace monorepo：`apps/web`、`apps/api`（未开工）、`packages/game-core`
- 前端：React 18 + TypeScript + Vite 5 + Zustand 4，样式用**原生 CSS**（`tokens.css` + 普通 class），**禁止引入 Tailwind / styled-components / UI 组件库**
- 规则内核：`packages/game-core` 是**纯函数**，禁止出现 DOM、`window`、`localStorage`、`fetch`
- 目标渲染层：PixiJS 8（仅 v2 世界层使用），不得引入 Three.js

**怎么跑**
```bash
pnpm install
pnpm --filter @haola/web dev        # http://127.0.0.1:5173
pnpm --filter @haola/game-core test # 39 个用例，必须全绿
pnpm --filter @haola/web typecheck
```

**美术基因（不可回退的硬约束）**
1. 奶油底 `#F7F0E0` / 墨黑 `#1A1A1A` / 有限荧光色盘（橙 `#FF6B35`、薄荷 `#4ECDC4`、紫 `#9B6BFF`、粉 `#FF8FB1`、黄 `#FFD166`）
2. 3px 墨黑实线描边，**禁止渐变、模糊、发光**；所有阴影都是实心偏移色块
3. 贴纸拼贴感：白边、微旋转、错位投影
4. Riso 颗粒噪点，用 CSS/SVG 内联生成，不引位图
5. 手机优先（375px 起），**点击操作，禁用拖拽**
6. 所有资源内联（SVG / data-URI），**不引入外部图片、字体、图标库**

**玩法红线（改动会直接导致卡死）**
1. 物品不唯一，背包按 `{itemId: count}` 堆叠，同一物品可重复获得
2. 硬保底：当前阶段缺什么标签，就保证地图上/搜索结果里必定有对应物品（不是提高概率）
3. 判定优先级固定：**阶段目标 > 支线 > 精确配方 > 风险物品 > 意外配对 > 兜底**，永远有产物
4. 阶段 3 支线按**具体物品 id** 判定，不用标签匹配
5. 前端断网必须能完整通关

**当前状态**（2026-10-19 16:45 更新）

| 部分 | 状态 |
|---|---|
| `packages/game-core` | ✅ 60 件物品 / 24 条精确配方 / 11 条意外配对 / 3 阶段 6 步链 / 3 支线 / 起飞判定；**T5 `world.ts` 空间分布与硬保底已实现并提交**（`6eb2cfe`、`017e2f9`），5 测试文件 / 60 用例（含 world 21 条与 10 万次模拟） |
| `apps/web` | ✅ v1 区域搜索版可玩（开始页 / 主界面 / 结局页 / localStorage 存档）；**T1 设计系统已交付**（`tokens.css` 116 令牌 + `docs/design/DESIGN-SYSTEM.md` + `preview.html`） |
| v2 世界层 | 🟢 T0 契约 + T5 规则 + T2 美术资产（批 0 `07c5c4c`、批 1 地形 `1ac2c7c`）+ T3 Pixi 世界层（`68cac73`：五层容器/相机/输入/地形摆放/雾障）已提交；**T4 界面接线未开工** |
| `apps/api` | ❌ 未开工 |

> 注：测试基线受沙箱 `EPERM` 影响会静默丢文件（退出码仍为 0），验收必须核对「5 文件 / 60 用例」，不能只看 exit code。

**两份规格**
- `docs/SPEC.md` v1.0：后端、部署、CI 部分继续有效
- `docs/REDESIGN.md` v2.0：世界、渲染、界面、玩法改造，**当前基线**

---

## 1. 任务总表

分四组。**规模**是给人判断工作量用的，不是承诺工时。

| 编号 | 任务 | 组 | 主要产出 | 规模 | 前置 |
|---|---|---|---|---|---|
| **T0** | 架构契约冻结 | 工程 | `docs/CONTRACT-v2.md` + 空骨架文件 | S | — |
| **T1** | 设计系统与视觉规范 | A 视觉 | `tokens.css` 扩展 + `docs/design/DESIGN-SYSTEM.md` + 静态样张 | M | T0 |
| **T2** | 世界美术资产 | A 视觉 | 星球/地面/山石/小人/雾障 SVG + `ItemIcon` 纹理导出 | L | T1 |
| **T3** | 世界渲染层（PixiJS） | B 世界 | `apps/web/src/world/*` | L | T0、T2（可先用占位） |
| **T4** | 界面层实现 | A 视觉 | HUD / 背包抽屉 / 合成台 / 对话条 / 响应式 | L | T1、T3（要挂载点） |
| **T5** | 玩法规则与空间化保底 | B 世界 | `game-core/src/world.ts` + 穷举测试 | M | T0 |
| **T6** | 内容扩容 | C 内容 | 物品 / 配方 / 阶段 / 台词 / 结局 | M | T0 |
| **T7** | 新手指引与叙事节奏 | C 内容 | 前 5 分钟引导状态机 + 提示文案 | S | T4、T6 |
| **T8** | 后端云存档 | D 工程 | `apps/api` + 同步接口 | M | T0，**可与主线并行** |
| **T9** | 音效（可选） | D 工程 | WebAudio 合成音效 | S | T4 |
| **T10** | 性能与发布 | D 工程 | 帧率优化 + Pages 上线 | S | T3、T4 |

规模：S ≈ 半天以内、M ≈ 1–2 天、L ≈ 3 天以上（单人视角）。

---

## 2. 依赖与并行顺序

```
Wave 0  T0 契约
          │
Wave 1    ├── T1 设计系统 ──┐
          ├── T5 玩法规则    │
          └── T6 内容扩容    │
                │           │
Wave 2          ├── T2 美术资产 ◄┘
                └── T3 渲染层（可先吃占位资产）
                        │
Wave 3                  ├── T4 界面层
                        └── T8 后端（独立，随时可开）
                                │
Wave 4                          ├── T7 引导
                                └── T9 音效
                                        │
Wave 5                                  └── T10 性能与发布
```

**只有同一 Wave 内的任务可以同时开对话**。跨 Wave 开会让后一件任务在没有输入的情况下瞎猜，返工成本比串行高。

**最省事的三条线**（如果只想开三个对话）：
1. 视觉线：T1 → T2 → T4（同一个视觉/前端专家连续做）
2. 世界线：T5 → T3（同一个前端工程专家）
3. 内容线：T6 → T7（同一个策划）

---

## 3. 文件归属矩阵（防冲突的唯一手段）

多开对话时，**一个文件只能有一个任务写**。其他任务只能读。

| 路径 | 写入方 | 其他人 |
|---|---|---|
| `docs/CONTRACT-v2.md` | T0 | 只读，视为法律 |
| `packages/game-core/src/world.ts` | T5 | 只读 |
| `packages/game-core/src/items.ts` `recipes.ts` `stages.ts` `dialogue.ts` | T6 | 只读。**只能新增 id，不许改已有 id 的语义** |
| `packages/game-core/src/resolve.ts` `search.ts` `launch.ts` `state.ts` `types.ts` | T0 / T5 | 只读；确需改动走 §4 契约流程 |
| `packages/game-core/tests/world*.test.ts` | T5 | — |
| `apps/web/src/styles/tokens.css` | T1 | T4 只引用变量，不新增变量 |
| `apps/web/src/styles/app.css` | T4 | T1 不改 |
| `apps/web/src/world/**` | T3 | T2 只往 `world/assets/` 里放文件 |
| `apps/web/src/world/assets/**` | T2 | T3 只读 |
| `apps/web/src/components/ItemIcon.tsx` | T2 | T3/T4 只读，只能调用其导出 |
| `apps/web/src/components/**`（其余） | T4 | — |
| `apps/web/src/screens/GameScreen.tsx` | T4 | T3 只负责提供 `<WorldCanvas />` |
| `packages/game-core/src/store/gameStore.ts` | T0 定接口，T4 实现 | T3 只读 store，禁止写入 |
| `docs/design/DESIGN-SYSTEM.md` `preview.html` | T1 | — |
| `docs/design/ASSETS.md` `assets-gallery.html` | T2 | T3/T4 只读 |
| `scripts/check-assets.mjs` | T2 | 新增，零依赖；校验色值同源 + 物品全覆盖 |
| `apps/web/src/world/assets/palette.ts` | T2 | T3 只读，用它取色，禁止自己写 hex |
| `docs/content/**` | T6 | — |
| `apps/api/**` | T8 | — |

**冲突处理**：如果某任务确实需要改别人的文件，先停在对话里说明，让主对话统一改，不要自己动手。

---

## 4. 跨任务契约（T0 要产出什么）

T0 的产物 `docs/CONTRACT-v2.md` 是后面所有任务的共同语言。至少写清六件事：

**4.1 空间数据**
```ts
export interface PlacedItem {
  uid: string;      // 稳定唯一 id，用于动画与去重
  id: string;       // 物品 id，指向 ITEM_MAP
  x: number; y: number;
  area: AreaId;
  spawnedDay: number;
}

export function distribute(
  progress: Progress,
  bag: Record<string, number>,
  day: number,
  rng: () => number,
): PlacedItem[];
```
`distribute` 是纯函数，输入同样参数必须输出同样结果（`rng` 是唯一随机源）。

**4.2 Game-core 与 UI 的分界**
- `distribute` 只决定「哪里有东西」，不决定「东西长什么样」
- 坐标合法性（不重叠、在星球内、在已解锁扇区）由 `distribute` 保证，渲染层不做二次过滤

**4.3 Store 动作表**（T4 实现，T3 只读）
现有 v1 的 action 保留可复用的部分，v2 新增：
```ts
setMoveTarget(x: number, y: number): void   // T3 写入唯一入口
setPlayerPos(x: number, y: number): void    // 由 T3 每帧节流回报，不持久化
collect(uid: string): void                  // 自动拾取
refreshWorld(): void                        // 合成后重刷
```
**禁止 Pixi 直接改 store 的业务字段**，一切写入走 action。

**4.4 事件与动画握手**
T3（渲染）→ T4（UI）只用三类通知：`onFirstPickup(itemId)`、`onCraftResult(payload)`、`onAreaBlocked(areaId)`。用 Zustand 状态或回调 prop 传递，不引事件总线库。

**4.5 ItemIcon 的双出口**（T2 提供）
```ts
export function ItemIcon(props: { id: string; size?: number }): JSX.Element;  // React 用
export function itemSvgMarkup(id: string): string;                            // 给 Pixi 转纹理
```
两出口必须基于同一份形状数据，不允许各写一套，否则背包里的图标和地上的长得不一样。

**4.6 时间模型定案**
**合成 +1 天，拾取不推进时间。** 第 7 天访客事件改为「第 7 天当天首次合成时」触发。T5、T6 都按这条实现，不再讨论。

---

## 5. 任务卡片

### T0 · 架构契约冻结

**目标**：在任何人写业务代码之前，把跨模块接口钉死，避免三路对话各写一套。

**必须先读**：`docs/REDESIGN.md` 全文、`packages/game-core/src/types.ts`、`apps/web/src/store/gameStore.ts`

**产出**
- 新建 `docs/CONTRACT-v2.md`，按 §4 的六节写全，接口给真实可编译的 TS 签名
- 新建空骨架（只放类型与 `throw new Error('not implemented')`，不写实现）：
  `packages/game-core/src/world.ts`、`apps/web/src/world/{WorldCanvas.tsx,layers.ts,camera.ts,sprites.ts,input.ts}`
- 在 `packages/game-core/src/index.ts` 补导出

**验收**
- `pnpm --filter @haola/game-core typecheck` 通过
- `pnpm --filter @haola/web typecheck` 通过
- 契约文档里每一个接口，都有对应的真实文件与签名

**禁止**：写任何实现逻辑；改 `resolve.ts` / `state.ts` 的行为

**开场提示词**
```
读 C:\Users\E14\WorkBuddy\好垃\docs\TASKS-v2.md 的 §0 和 T0 卡片，按卡片执行。
你的角色是架构师，只冻结接口，不写业务实现。
先给出 docs/CONTRACT-v2.md 的完整内容给我确认，我点头后你再建骨架文件。
```

---

### T1 · 设计系统与视觉规范

**目标**：把「奶油纸盘星球 + 贴纸拼贴」翻译成一套可执行的令牌与规则，让后面画资产和写界面的人不用自己发挥。

**必须先读**：`docs/REDESIGN.md` §3、`apps/web/src/styles/tokens.css`、`apps/web/src/styles/app.css`

**产出**
- 扩展 `apps/web/src/styles/tokens.css`：新增 `--space` / `--planet` / `--planet-shade` / `--void`，补齐间距阶（4 的倍数）、层级 z-index、动效时长与缓动
- `docs/design/DESIGN-SYSTEM.md`：色盘用途表、描边/投影规则、字号阶、圆角阶、组件状态表（默认/按压/禁用/选中/危险）
- `docs/design/preview.html`：**单文件**静态样张，直接双击可看。里面要有：色板、按钮四种状态、物品贴纸、HUD 条、对话条、合成槽、背包卡片
- 写一份「禁止清单」：渐变/模糊/发光/阴影扩散/第三方组件库

**验收**
- 双击 `preview.html` 能在浏览器直接看，无外部依赖
- `preview.html` 里的每个控件都用 `tokens.css` 的变量，不写死颜色
- 手机 375px 宽下不横向滚动

**禁止**：改 `app.css`；改任何 TSX 组件的结构

**开场提示词**
```
读 C:\Users\E14\WorkBuddy\好垃\docs\TASKS-v2.md 的 §0 和 T1 卡片，以及 docs/REDESIGN.md §3。
你是视觉设计专家，负责设计系统，不写游戏逻辑。
先给我一版色板与组件状态表的文字方案，我确认后再落 tokens.css 和 preview.html。
```

---

### T2 · 世界美术资产

**目标**：做出星球这张「纸」上所有可见元素的矢量资产，并让物品贴纸能同时给 React 和 Pixi 用。

**必须先读**：`docs/REDESIGN.md` §3.2、`apps/web/src/components/ItemIcon.tsx`（现 431 行 / **39** 个几何形状，不是 30）

**产出**
- `apps/web/src/world/assets/` 下按元素分文件，全部纯 SVG 函数（接收 size 返回 markup），不要 `.svg` 静态文件：
  `planet.ts`（星球本体 + 大气虚线环）、`terrain.ts`（6–9 边地面斑块、山、石、坑）、`player.ts`（24×36 小人，四向 + 6 帧走路）、`props.ts`（坠毁点/垃圾山/集市废墟/洞窟四个地标）、`fog.ts`（未解锁扇区雾障）
- 改造 `ItemIcon.tsx`，加 `itemSvgMarkup(id)` 出口，与 React 出口共用同一份形状数据
  - **先修数据再加出口**：现有 `SHAPE_OF` 有 7 件物品查不到（`manual/lottery/antigrav/fuel/mood/poker/theoryfuel` 落进 `blob`），加出口会把 bug 复制到地面
  - **只改本文件，不改调用方**：`CraftBench.tsx` / `ItemCard.tsx` / `Toast.tsx` 归 T4。保留 `icon + color` 可用，新增可选 `id`，禁止把 `id` 改成必填
- 一份资产清单表（放 `docs/design/ASSETS.md`）：每个元素的名字、尺寸、色值、被谁引用

**验收**
- 所有元素在 `preview.html` 或独立测试页里能平铺展示
- 物品贴纸**固定 32 世界单位**（2026-10-19 定案，放弃 28–36 区间：28 下 6 个形状发糊，36 与 40 的拾取半径打架，32 = `minSpacing` 恰好不重叠），39 个形状在该尺寸下全部清晰
- 星球本体**不出纹理**，只提供 `PLANET` / `ATMOSPHERE_DASH` 常量，由 T3 用 Pixi `Graphics` 现画（避免 27MB 显存）
- 小人的 4 向 × 6 帧全部存在，帧间差异肉眼可辨（不要复制造型凑数）
- 无位图、无外部字体、无渐变

**禁止**：写 Pixi 代码；改 `tokens.css`

**开场提示词**
```
读 C:\Users\E14\WorkBuddy\好垃\docs\TASKS-v2.md 的 §0 和 T2 卡片，以及 docs/REDESIGN.md §3.2。
你是矢量插画/游戏美术专家，只做 SVG 资产，不写游戏逻辑、不碰 Pixi。
先给我资产清单（元素名/尺寸/色值/用在哪），我确认后再逐个画。
输出必须全部内联 SVG，禁止位图和渐变。
```

---

### T3 · 世界渲染层（PixiJS）

**目标**：让小人能在纸片星球上走、东西能捡、相机跟得上，60fps 不掉。

**必须先读**：`docs/CONTRACT-v2.md`、`docs/REDESIGN.md` §2 §5 §7

**产出**（全部在 `apps/web/src/world/`）
- `WorldCanvas.tsx`：Pixi 应用生命周期，挂载/销毁干净（React 18 StrictMode 双挂载不泄漏）
- `layers.ts`：背景 / 地面 / 物件 / 角色 / 特效 五层，层顺序固定
- `camera.ts`：死区跟随 + 缩放钳制 0.8–1.6 + 世界边界钳制
- `input.ts`：屏幕坐标 → 世界坐标；点击地面设移动目标；WASD/方向键并行支持
- `sprites.ts`：调 `itemSvgMarkup()` 生成纹理并缓存（同一物品只生成一次）

**验收**
- 小人走到星球边缘即停住，**不做水平回绕**（`CONTRACT-v2.md` §9 已否决回绕：圆形星球 + 方形世界 + 取模回绕几何上自相矛盾）
- 上下走到极地停住，不越界
- 连续移动 60 秒，中端安卓（或 Chrome CPU 4× 降速）帧率不低于 50
- 切到后台再回来不黑屏、不重复创建 canvas
- React 组件卸载后 `PIXI.Application` 被销毁，无残留 ticker

**禁止**：写 HUD/背包/对话条（属 T4）；改 `game-core`；在 Pixi 里直接写 store 业务字段

**开场提示词**
```
读 C:\Users\E14\WorkBuddy\好垃\docs\TASKS-v2.md 的 §0 和 T3 卡片，以及 docs/CONTRACT-v2.md、docs/REDESIGN.md §2/§5/§7。
你是 WebGL/游戏前端工程专家，负责 PixiJS 世界层。
美术资产由 T2 提供，现在可能只有占位，先用纯色圆角方块顶上，接口按契约走。
禁止在 Pixi 里直接改 store，只读 + 调 action。
```

---

### T4 · 界面层实现

**目标**：把 DOM UI 重构到 v2 结构：全屏世界 + 浮动 HUD + 背包抽屉 + 合成槽 + 对话条。

**必须先读**：`docs/REDESIGN.md` §4、`docs/CONTRACT-v2.md`、现有 `apps/web/src/components/**`

**产出**
- 新组件：`Hud.tsx`（天数/阶段/背包入口）、`BagDrawer.tsx`（全屏抽屉 + 双槽合成）、`CraftSlots.tsx`、`HintBar.tsx`（左下角缺什么）
- 重构：`DialogueBar.tsx`（44px 高、可上滑收起）、`Toast.tsx`（不再遮底部面板）
- `screens/GameScreen.tsx` 只保留 UI 层，世界换成 `<WorldCanvas />`
- 响应式：`<768` 手机 / `768–1023` 平板 / `≥1024` 网页三档，网页模式合成台常驻右侧 320px
- 删除 v1 遗留的 `AreaTabs.tsx` 与此相关的 store 字段使用

**验收**
- 375×667 全流程可点，无横向滚动，无可点元素小于 44×44
- iOS 上 `100dvh` 正确，地址栏收起时不跳动
- 背包抽屉打开时，世界仍可见边缘（不遮死），关闭后位置不重置
- HUD / 对话条 `pointer-events: none`，子元素单独开启，点空白处能触发移动
- 键盘 Tab 焦点可见

**禁止**：改 `world/**`；改 `game-core`；引 UI 库

**开场提示词**
```
读 C:\Users\E14\WorkBuddy\好垃\docs\TASKS-v2.md 的 §0 和 T4 卡片，以及 docs/REDESIGN.md §4、docs/CONTRACT-v2.md。
你是 React 前端 + 交互设计专家，负责 UI 层，不碰 Pixi 世界层。
用原生 CSS，禁止 Tailwind 和组件库。设计令牌只用 tokens.css 里已有的变量。
先出一版组件树和状态表给我确认，再动手写。
```

---

### T5 · 玩法规则与空间化保底

**目标**：把 v1 的「搜索刷新」换成「地面分布」，且证明任何时刻地图上都有能推进的东西。

**必须先读**：`docs/CONTRACT-v2.md`、`packages/game-core/src/search.ts`（`missingForBag` / `bagHasTag` 可复用）、`stages.ts`

**产出**
- `packages/game-core/src/world.ts`：`distribute()` 完整实现
  - 常驻 12–18 个物品点，按区域池分布
  - 未拾取物品刷新后保留，只补空缺
  - 保底：`missingForBag` 的标签，只要星球池里存在带该标签的物品，就必须有至少一个地面点，且落在**已解锁扇区、距小人 ≤ 半屏**
  - 保底标签在任何池里都不存在 → `throw`，开发期暴露配置错误
  - 坐标去重：任意两点距离 ≥ 32 单位
- `packages/game-core/tests/world.test.ts`：10 万次随机游玩模拟，100% 通关、任何时刻地图上存在可推进物品、无死锁
- 若 `state.ts` 需要新增 `refreshWorld` 之类的纯函数，在此一并加

**验收**
- `pnpm --filter @haola/game-core test` 全绿，且新增用例数 ≥ 8
- 10 万次模拟单次运行时间 < 30 秒（不能慢到没人愿意跑）
- 固定 rng 输出可复现：同种子两次调用 `distribute` 结果完全一致

**禁止**：改 `resolve.ts` 判定顺序；改 `items.ts` 数据；写渲染代码

**开场提示词**
```
读 C:\Users\E14\WorkBuddy\好垃\docs\TASKS-v2.md 的 §0 和 T5 卡片，以及 docs/CONTRACT-v2.md、docs/REDESIGN.md §6。
你是游戏算法/规则工程专家，只写 packages/game-core 里的纯函数和测试。
保底是硬约束，不能退化成概率。先给我 distribute 的算法伪代码和边界情况清单，我确认后再写实现。
```

---

### T6 · 内容扩容

**目标**：把 60 件物品的世界补成「有东西可捡、有话可说」的世界，而不是只有过关所需的最小集合。

**必须先读**：`packages/game-core/src/{items,recipes,stages,dialogue}.ts`、`docs/SPEC.md` 的物品与阶段章节

**产出**
- 物品：按区域池补到 75–85 件（每件含名称、1–2 句描述、tags、配色、kind）
- 配方：精确配方从 24 条扩到 35 条左右，覆盖新增物品
- 台词：每个区域、每个阶段首次进入、每次合错、每次保底生效，都要有台词；语气**毒舌但不攻击玩家**
- 支线：3 条支线各补 1 条备选结局文案
- `docs/content/CONTENT.md`：物品总表 + 标签分布统计 + 每条配方的可达性验证

**验收**
- `pnpm --filter @haola/game-core test` 全绿（现有 1000 种子通关测试不能退化）
- 每个新物品都至少出现在一个区域池里，且至少有一条配方或阶段目标用到它
- 没有孤立物品（只能捡到、永远用不上）
- 标签分布统计里，每个阶段所需标签至少有 2 个来源物品

**禁止**：改已有物品的 `id` 与语义（存档兼容）；改 `resolve.ts`；改 UI

**开场提示词**
```
读 C:\Users\E14\WorkBuddy\好垃\docs\TASKS-v2.md 的 §0 和 T6 卡片，以及 packages/game-core/src/items.ts、stages.ts。
你是游戏策划/内容设计专家，负责物品、配方、台词、支线，不写代码逻辑。
硬规则：只能新增 id，不能改已有 id，否则老存档坏掉。
先给我一份新增物品清单（id/名称/标签/所属区域/用途），我确认后再落代码。
```

---

### T7 · 新手指引与叙事节奏

**目标**：让第一次打开的人在前 90 秒内知道「点地面走、靠近自动捡、两个东西能合成」，不用读说明。

**必须先读**：`docs/REDESIGN.md` §4 §5、`dialogue.ts`、T4 产出的组件

**产出**
- 引导状态机：`newcomer` → `firstMove` → `firstPickup` → `firstCraft` → `free`
- 每一步的触发条件、提示文案、跳过逻辑（老玩家/读档不重复触发）
- 首次拾取、首次合成、首次合错、首次被雾障弹回，各一段引导台词
- 存档里加 `tutorial` 字段（注意 schemaVersion 兼容）

**验收**
- 清空 localStorage 开新档，能纯靠提示走完第一次合成
- 第 4 次拾取后不再出任何引导提示
- 读档进入不会重放引导
- 引导期间不阻塞移动

**禁止**：改核心判定；改 `world.ts`

**开场提示词**
```
读 C:\Users\E14\WorkBuddy\好垃\docs\TASKS-v2.md 的 §0 和 T7 卡片。
你是关卡设计/新手体验专家，只做引导状态机与文案，不改核心规则。
先给我引导流程图（每步触发条件 + 文案 + 退出条件），我确认后再实现。
```

---

### T8 · 后端云存档

**目标**：换设备不丢档、清缓存不丢档，前端断网照样能玩。

**必须先读**：`docs/SPEC.md` 的后端章节、`packages/game-core/src/state.ts`

**产出**
- `apps/api`：Fastify + TypeScript + Drizzle，5 个接口
  - `GET /api/config` 配置下发（物品/配方/阶段，带 `version` 与 `etag`）
  - `POST /api/save` 上传存档（匿名设备 ID）
  - `GET /api/save/:deviceId` 拉取存档
  - `POST /api/telemetry` 埋点（哪个阶段卡住最多）
  - `GET /health`
- 数据库 schema + 迁移；本地 SQLite，生产 Postgres（Neon）
- `apps/web` 侧接入：**localStorage 优先，云端只做后台合并**，接口失败静默降级

**验收**
- 断网启动游戏，全流程可玩（这是硬要求）
- 同一设备 ID 在两台设备上能拉到同一存档，冲突取「天数更大」的一份
- `/api/config` 返回 304 时前端走本地缓存
- 接口全部有 zod 校验，非法输入返回 400 不是 500

**禁止**：把判定逻辑搬到后端（服务端权威已明确否决）；改 `game-core` 规则

**开场提示词**
```
读 C:\Users\E14\WorkBuddy\好垃\docs\TASKS-v2.md 的 §0 和 T8 卡片，以及 docs/SPEC.md 的后端章节。
你是后端工程专家，Fastify + Drizzle。原则：前端必须离线可玩，后端只是增强。
先给我接口定义和数据库表结构，我确认后再写。
```

---

### T9 · 音效（可选）

**目标**：不加任何音频文件，用 WebAudio 现场合成一套贴纸质感的音效。

**产出**：`apps/web/src/audio/` — 拾取（短促三角波）、合成成功（两音上行）、合成失败（低音下滑）、脚步（噪声门限）、UI 点击。全局音量开关，默认 60%，存 localStorage。

**验收**：首屏不自动播放（等第一次用户交互）；移动端静音键生效；关闭后无定时器残留。

**禁止**：引入 `.mp3` / `.wav`；用第三方音频库

**开场提示词**
```
读 C:\Users\E14\WorkBuddy\好垃\docs\TASKS-v2.md 的 §0 和 T9 卡片。
你是 WebAudio 音效设计专家。禁止任何音频文件，全部用振荡器/噪声合成。
先给我每个音效的合成方案（波形/包络/时长），我确认后再写。
```

---

### T10 · 性能与发布

**目标**：中端安卓 60fps，首屏 < 2s，GitHub Pages 上线。

**产出**
- 性能：Pixi 纹理图集、空闲不重绘、粒子上限 24、`requestIdleCallback` 预生成纹理
- 移动端实测报告（真机机型 + 帧率 + 内存）
- 修复 Pages 部署（当前阻塞：仓库需手动启用 Pages，Source 选 GitHub Actions）
- `README.md` 补「怎么玩 / 怎么部署 / 怎么改内容」

**验收**：Lighthouse 移动端 Performance ≥ 85；首屏 JS gzip < 250KB；Pages 地址可访问且刷新不 404

**开场提示词**
```
读 C:\Users\E14\WorkBuddy\好垃\docs\TASKS-v2.md 的 §0 和 T10 卡片。
你是前端性能与发布工程专家。目标：中端安卓 60fps、首屏 < 2s、Pages 上线。
先跑一遍现状测量（包体、帧率），给我瓶颈清单，再逐条优化。
```

---

## 6. 需要拍板的默认值（已代你定，专家不要重复问）

| 项 | 定案 | 理由 |
|---|---|---|
| 时间模型 | 合成 +1 天，拾取不推进 | 开放世界不该用倒计时压迫探索 |
| 世界尺寸 | 1440×1440，星球半径 640 | 手机半屏 ≈ 400 单位，保底点可达 |
| 太空底色 | 浅色 `#ECE1C9` | 深色会毁掉墨黑描边的贴纸语言 |
| 渲染 | PixiJS 8 | 55+ 个 2D SVG 资产可复用，不转 3D |
| 后端职责 | 云存档 + 配置下发，无账号 | 服务端权威已否决 |
| 离线 | 前端必须能完整通关 | Render 免费层会休眠，不能让玩家卡在加载 |

---

## 7. 使用这套分包的方式

1. **先做 T0**。契约没冻结就并行开三个对话，产物一定对不上，合并成本比串行还高。
2. 同一 Wave 内最多同时开 2 个对话。三个以上，你的精力会花在搬运上下文而不是验收。
3. 每个对话结束时，让专家把「改了什么文件、怎么验证的」写进 commit message。多线合并时靠这个定位冲突。
4. 任意一次合并前跑三件事：`pnpm --filter @haola/game-core test`、`pnpm --filter @haola/web typecheck`、`node scripts/smoke-build.mjs`。
5. 觉得某个任务包太大，就往下拆一层再开对话，不要在一个对话里做两个包的事。
