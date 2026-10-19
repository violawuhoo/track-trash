# 《好垃》v2 跨任务契约

> 由 T0 产出，**后续所有任务包以本文件为准**。
> 与 `REDESIGN.md` 冲突时以本文件为准（冲突已在 §9 列出并说明理由）。
> 修改流程：任何任务需要改这里的接口，先停下来说明，由主对话统一改。**禁止自行变更签名**。

---

## 1. 空间模型

### 1.1 常量（`packages/game-core/src/world.ts`）

```ts
export const WORLD = {
  size: 1440,            // 世界边长，世界坐标 [0, 1440)
  center: { x: 720, y: 720 },
  planetRadius: 640,     // 星球半径（视觉边界）
  walkableRadius: 600,   // 角色可走半径，比视觉边界内缩 40
  itemRadius: 560,       // 物品落点最大半径，比可走半径再内缩 40
  edgeMargin: 80,        // 星球外的留白环带
  minSpacing: 32,        // 任意两个物品点的最小间距
  maxItems: 18,
  minItems: 12,
  pickupRadius: 40,      // 角色进入该半径自动拾取
  focusRadius: 80,       // 进入该半径显示名称与橙色描边
} as const;
```

### 1.2 坐标与区域

- 世界坐标原点左上，`x` 向右，`y` 向下，**单位：世界像素**（zoom 1 时 1 单位 = 1 CSS px）。
- 星球圆心 `(720, 720)`，半径 640。角色限制在 `walkableRadius` 内，物品点限制在 `itemRadius` 内。
- **四个区域是角度扇区，不是矩形**：

| AreaId | 几何 | 中心角 | 半径区间 |
|---|---|---|---|
| `crash` | 圆心圆盘 | — | `r ∈ [0, 200]` |
| `junkyard` | 东扇区 | `θ = 0°` | `r ∈ [300, 560]`，`θ ∈ [-45°, 45°]` |
| `market` | 北扇区 | `θ = -90°` | `r ∈ [300, 560]`，`θ ∈ [-135°, -45°]` |
| `cave` | 西扇区 | `θ = 180°` | `r ∈ [300, 560]`，`θ ∈ [135°, 225°]` |

`θ` 以 `+x` 为 0°，`+y`（屏幕向下）为 90°；北是 `-90°`。

```ts
export interface Vec2 { x: number; y: number }

/** 点到圆心的极坐标 */
export function toPolar(p: Vec2): { r: number; deg: number };

/** 判断点属于哪个区域；落在扇区缝隙时返回最近的区域 */
export function areaOfPoint(p: Vec2): AreaId;

/** 区域扇区的中心点（用于保底点、地标摆放） */
export function sectorCenter(area: AreaId): Vec2;

/** 是否在星球可走范围内 */
export function isWalkable(p: Vec2): boolean;

/** 把任意点夹进可走圆内 */
export function clampToWalkable(p: Vec2): Vec2;
```

**以上四个几何函数由 T5 实现，T3/T4 只调用，不自己算。**

---

## 2. 分布算法（T5 负责实现）

### 2.1 数据结构

```ts
export interface PlacedItem {
  /** 稳定唯一 id，同一次分布内不重复；格式 `d{day}-{seq}-{itemId}` */
  uid: string;
  /** 物品 id，指向 ITEM_MAP */
  id: string;
  /** 世界坐标，必须落在 itemRadius 内，且属于 area 扇区 */
  x: number;
  y: number;
  /** 该物品的来源区域池 */
  area: AreaId;
  /** 生成时的天数，用于刷新动画区分新旧 */
  spawnedDay: number;
}
```

### 2.2 签名

```ts
export interface DistributeOptions {
  progress: Progress;
  bag: Record<string, number>;
  day: number;
  /** 唯一随机源。同 rng 序列 + 同其余入参 => 同输出 */
  rng: () => number;
  /** 上一次的分布结果。已存在且未被拾取的物品原样保留，只补空缺 */
  prev?: PlacedItem[];
  /** 角色当前位置，用于「保底点不超过 maxDist」 */
  player?: Vec2;
  /** 保底点与角色的最大距离（世界单位）。默认 400 ≈ 手机半屏 */
  maxDist?: number;
  /** 已解锁区域。缺省按 progress.stage 推导 */
  unlocked?: AreaId[];
}

export function distribute(opts: DistributeOptions): PlacedItem[];
```

**为什么不是 `distribute(progress, bag, day, rng)`**：规格里的四参数版本无法表达「未拾取物品保留原位」和「保底点离玩家不超过半屏」两条硬要求。改成 options 对象，语义不变，只多两个可选入参。T3 调用时必须传 `prev` 与 `player`。

### 2.3 行为约束（T5 的验收依据）

1. **数量**：返回项数 ∈ `[minItems, maxItems]`；`prev` 中未被拾取的项全部保留。
2. **保底（硬要求，不可退化为概率）**
   - `needs = missingForBag(progress, bag)`，取前 2 个标签。
   - 对每个 `need`：若**已解锁区域池**中存在带该标签的物品，则返回结果里必须至少有 1 个该标签物品的地面点。
   - 该点必须满足：在已解锁扇区内、`r ≤ itemRadius`、距 `player` ≤ `maxDist`。
   - 若整个星球池里都不存在该标签 → `throw new Error(...)`，开发期暴露配置错误。
3. **间距**：任意两点欧氏距离 ≥ `minSpacing`。
4. **确定性**：同一 `rng` 序列 + 同一入参，两次调用结果深度相等（含 `uid`）。
5. **不重叠角色**：新生成点距 `player` ≥ `pickupRadius * 2`，避免走一步就连环自动拾取。
6. **不产生无法拾取的点**：坐标必须在 `itemRadius` 内且落在对应 `area` 扇区里。

### 2.4 store 侧调用时序（T4 实现）

```ts
// 每次合成成功后（day + 1）
const next = distribute({
  progress: { stage, stepIndex },
  bag: save.bag,
  day: save.day,
  rng,
  prev: save.world,
  player: get().player,
  maxDist: get().viewportHalf / get().camera.zoom,
});
set({ world: next });
```

`rng` 用 `Math.random` 即可（存档只存结果，不存种子）。

---

## 3. 状态与存档

### 3.1 SaveState v2 变更

| 字段 | v1 | v2 |
|---|---|---|
| `scene: string[]` | 当前区域待拾取物品 | **删除**，由 `world: PlacedItem[]` 取代 |
| `areaId: AreaId` | 当前区域 | **删除**，由角色坐标推导 |
| `world: PlacedItem[]` | — | **新增**，地面物品 |
| `schemaVersion` | `1` | `2` |

**迁移策略**：`schemaVersion !== 2` 的存档直接丢弃，从头开始。现有代码已经是这个行为，不写迁移函数——这是一个还没上线的项目，不值得为兼容写分支。

**不持久化的字段**：角色坐标 `player`、相机、缩放、动画状态。刷新后角色回到坠毁点。

### 3.2 store 动作表

```ts
interface GameStore {
  // —— 状态 ——
  save: SaveState;
  screen: 'start' | 'game' | 'ending';
  player: Vec2;              // 不入存档
  moveTarget: Vec2 | null;   // 不入存档
  world: PlacedItem[];       // 镜像 save.world，便于订阅
  zoom: number;
  viewportHalf: number;      // 屏幕短边一半对应的世界单位，T3 每帧写入（节流 200ms）

  // —— 世界（T3 调用）——
  setMoveTarget: (x: number, y: number) => void;
  setPlayerPos: (x: number, y: number) => void;   // 解析到 `player`，不写存档
  collect: (uid: string) => void;                  // 自动拾取，内部 addItem + 移除点位

  // —— 玩法（T4 调用）——
  craft: () => void;
  refreshWorld: () => void;
}
```

**铁律**
- 渲染层**只读** store，写入只走上面五个 action。
- `setPlayerPos` 每帧会调用，内部**不得**触发持久化；持久化只在 `collect` / `craft` 时发生。
- `viewportHalf` 由 T3 计算并写入，T4 用它算 `maxDist`。

---

## 4. 渲染层接口（T3 负责，T2 供给资产）

### 4.1 组件边界

```tsx
// apps/web/src/world/WorldCanvas.tsx
export interface WorldCanvasProps {
  /** 仅用于样式定位，不传业务数据 */
  className?: string;
}
export function WorldCanvas(props: WorldCanvasProps): JSX.Element;
```

WorldCanvas **自己订阅 store**，不接受 `world` / `player` 之类的 props。理由：世界层每帧变化，走 props 会让 React 每帧重渲染。

### 4.2 分层（`layers.ts`）

固定五层，顺序不可变：

| 层 | 内容 | 说明 |
|---|---|---|
| `bg` | 太空底色 + 星球外的纸纹理 | 静态，一次绘制 |
| `ground` | 星球圆盘、地面斑块、山石、地标 | 半静态，区域解锁时更新 |
| `items` | 物品贴纸 + 底部椭圆投影 | 随 `world` 更新 |
| `actors` | 角色 + 走路动画 | 每帧更新 |
| `fx` | 拾取飞入、刷新缩放、雾障渐显 | 跑完即销毁 |

### 4.3 模块职责

- `camera.ts`：`follow(cam, target, viewport)` 死区跟随；`clamp(cam)` 夹到 `[edgeMargin, size - edgeMargin]`；缩放 `0.8–1.6`。**纯函数，无 Pixi 依赖，可单测。**
- `input.ts`：`screenToWorld(point, cam, viewport) → Vec2`；点击地面 → `setMoveTarget`；WASD/方向键映射为持续移动目标。**纯函数部分与 Pixi 解耦。**
- `sprites.ts`：`textureFor(itemId)`，内部调 `itemSvgMarkup(itemId)` 生成 SVG → `PIXI.Texture`，带缓存（同一 id 只生成一次）。
- `layers.ts`：创建五层 `Container`，暴露 `mount(app)` / `update(state)` / `destroy()`。

### 4.4 生命周期要求

- React 18 StrictMode 下会挂载两次：`useEffect` 必须返回完整清理（`app.destroy(true, { children: true })`、移除 ticker、释放纹理缓存）。
- 页面隐藏（`visibilitychange`）时暂停 ticker，恢复时重启，避免后台烧电。
- `prefers-reduced-motion` 时关闭走路循环与浮动动画，只保留位移。

---

## 5. 美术资产接口（T2 负责）

### 5.1 目录与导出

```
apps/web/src/world/assets/
├── planet.ts   export const planetSvg = (size: number) => string
├── terrain.ts  export const patchSvg / hillSvg / rockSvg / pitSvg = (size: number) => string
├── player.ts   export interface PlayerFrame { dir: 'up'|'down'|'left'|'right'; step: 0|1|2|3|4|5 }
│               export const playerSvg = (frame: PlayerFrame, size: number) => string
├── props.ts    export const landmarkSvg = (area: AreaId, size: number) => string
└── fog.ts      export const fogSvg = (area: AreaId, size: number) => string
```

**全部是返回 SVG 字符串的纯函数**，不返回 React 元素，不写文件。原因：Pixi 需要字符串转纹理，React 只是顺带能用。

### 5.2 ItemIcon 双出口（`components/ItemIcon.tsx`）

```ts
/** React 侧 */
export function ItemIcon(props: { id: string; size?: number; className?: string }): JSX.Element;

/** Pixi 侧：同一份形状数据渲染出的完整 <svg> 字符串 */
export function itemSvgMarkup(id: string, size?: number): string;
```

**必须共用同一份形状定义**。禁止为了 Pixi 另写一套路径，否则背包里的图标和地上的贴纸长得不一样。

### 5.3 尺寸规范

| 用途 | 尺寸 |
|---|---|
| 地面物品贴纸 | 28–36 世界单位（渲染时按 zoom 缩放） |
| 背包卡片图标 | 40 CSS px |
| 角色 | 24 × 36 世界单位 |
| 地标 | 96–128 世界单位 |

---

## 6. 界面层接口（T4 负责）

### 6.1 组件树

```
GameScreen
├── WorldCanvas                      // T3
├── Hud                 (absolute)   // 天数 / 阶段 / 背包入口 / 缩放
├── HintBar             (absolute)   // 左下「缺：能粘的东西」
├── DialogueBar         (absolute)   // 底部 44px，可上滑收起
├── BagDrawer           (overlay)    // 背包 + 双槽合成
│   └── CraftSlots
└── Toast               (overlay)    // 顶部，不遮底部
```

### 6.2 断点

| 断点 | 布局 |
|---|---|
| `< 768px` | 世界全屏，合成台在 `BagDrawer` 底部 |
| `768–1023px` | 同手机，`BagDrawer` 宽度锁 420px 居中 |
| `≥ 1024px` | 世界全屏，合成台**常驻右侧 320px**，背包可折叠 |

### 6.3 交互约束

- `Hud` / `HintBar` / `DialogueBar` 容器 `pointer-events: none`，仅内部可点元素开启。点空白必须能落到画布上触发移动。
- 所有可点元素 ≥ 44 × 44 CSS px。
- 禁用拖拽；长按保留给「查看物品详情」。
- 双指缩放 0.8–1.6，不影响世界逻辑。

---

## 7. 时间模型（定案）

- **合成成功 +1 天。拾取不推进时间。**
- 第 7 天访客事件：`day === 7` 当天首次合成后触发一次。
- 天数不再作为资源或失败条件，只是叙事计数器。

---

## 8. 事件握手

跨层只需要三件事，**统一走 store 状态**，不引事件总线：

| 事件 | 产生方 | 消费方 | 实现 |
|---|---|---|---|
| 首次拾取 | `collect` | Toast + 日志 + 台词 | `save.discovered` 里没有该 id 时置 `justPicked` |
| 合成结果 | `craft` | 对话条 / 提示 / 刷新世界 | `save.lastCraft`（不持久化时可放 UI state） |
| 走进未解锁扇区 | T3 | 台词 + 轻震动 | `collect` 之外的 `blockedArea` 字段 |

---

## 9. 与 REDESIGN.md 的冲突（已裁决）

| 冲突点 | REDESIGN 写法 | 本契约 | 理由 |
|---|---|---|---|
| 水平环绕 | `x` 越界取模回绕 | **不回绕**，角色夹在圆内（`walkableRadius`） | 圆形星球 + 方形世界 + 水平回绕三者几何上自相矛盾：在 y=200 处越界，回绕点已在星球外。回绕只在「圆柱展开」模型下成立，与圆形贴纸美术冲突。球感由圆形边界 + 相机夹紧提供，够用。若日后要真周游，改渲染为横向平铺，规则层不受影响。 |
| 世界边界 | `clamp(x, 80, 1360)` + 垂直钳制 | 统一为圆形夹紧 | 同上，方形边界与圆形星球不一致 |
| `distribute` 签名 | `(progress, bag, day, rng)` | `(opts: DistributeOptions)` | 需要 `prev` 与 `player` 才能满足「保留未拾取物品」和「保底点 ≤ 半屏」 |
| 相机夹紧 | `cam.x = clamp(cam.x, 80, 1360)` | 夹到圆形范围，另加边缘留白 | 同上 |

---

## 10. 验收清单（所有任务合并前必跑）

```bash
pnpm --filter @haola/game-core test
pnpm --filter @haola/game-core typecheck
pnpm --filter @haola/web typecheck
node scripts/smoke-build.mjs      # 需先构建 + 起 .preview 静态服务
```

任何一项红，不许合并。
