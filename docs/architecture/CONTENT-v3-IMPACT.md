# CONTENT-v3 影响评估（阶段 3 补完 + 第四条支线 + 前任日志 + 二周目）

> 任务：`CONTENT-V3-IMPACT`。角色：技术方向 / 可行性与影响评估。
> **本文只读评估，未修改任何源码，未 commit。**
> 评估基线：`main = 344fca2`（v2.0.0 已上线）。被评估代码全部在 `packages/game-core`、
> `apps/web`、`apps/api`、`scripts`。
>
> ⚠️ 任务书里提到的 `apps/web/src/components/TopBar.tsx` 与 `Accordion.tsx`
> **在本仓库不存在**（那是 SPEC §2 的 v1 结构稿）。v2 实际对应的是
> `components/Hud.tsx`（顶部信息条）与 `components/BagDrawer.tsx`（背包抽屉，内含合成台与结局按钮）。
> 本文按实际文件给出。

---

## 0. 结论摘要（先看这三条）

1. **A 线可行，但「阶段 3 补 3 步目标链」不是纯数据改动。**
   `resolve.ts:55` 与 `search.ts:34` 两处硬编码了 `stage === 1 || stage === 2`。
   只往 `STAGES[2].steps` 里塞 3 步，**这些步骤永远不会触发**，
   而且 `search.ts` 的硬保底也不会为它们保底 → 玩家会卡死在阶段 3。
   必须同时改这两处（外加 `state.ts:204` 的阶段跃迁分支）。

2. **C 线（存档兼容）可以做到「不 bump schemaVersion」，且有现成先例可抄。**
   实际生效的 `schemaVersion` 是 `apps/web/src/store/gameStore.ts:53` 的 `SAVE_SCHEMA = 2`
   （`packages/game-core/src/state.ts:16` 的 `SCHEMA_VERSION = 1` 是 v1 遗留、已被 web 层覆盖）。
   T7 的 `tutorial` 字段就是「入存档但不 bump、老存档缺字段走归一化」的先例
   （`gameStore.ts:119-135` 的 `TUTORIAL_SKIP` / `readTutorial`）。
   新字段照抄这个模式即可，**契约 §3.1「非 2 一律丢弃」的语义不被触碰**。

3. **阶段 3 目标链与支线产物抢配的风险是真实且可量化的。**
   已用脚本枚举全部「材料标签并集 ⊇ 阶段 requires」的配方，得出
   **9 组绝对禁用标签对**、**29 组高危标签对**、**25 组零风险标签对**（见 §3）。
   结论：**阶段 3 的 requires 绝不能出现「实体」**（实体单独就能吞掉 17 条支线产物配方），
   建议只用「功能标签」组合（粘/导电/金属/知识/风险/能推/能烧/外星/抽象 之间两两组合）。

---

## 1. 改动文件清单（按批次）

### 批次 A1 —— 阶段 3 目标链（3 步）

| 文件 | 改什么 | 关键位置 |
|---|---|---|
| `packages/game-core/src/stages.ts` | `STAGES[2].steps` 填 3 步 `{id, requires, output}` | L67-73（当前 `steps: []`） |
| `packages/game-core/src/resolve.ts` | **必改**：`progress.stage === 1 \|\| progress.stage === 2` 放宽到含 3 | L55-57 |
| `packages/game-core/src/resolve.ts` | `getStage(id: 1 \| 2 \| 3)` 已支持 3，无需改；但 `stageCleared()` L131 的语义要复核（阶段 3 有 steps 后会返回 true，而它当前被 `state.ts` 用于「阶段 3 无 steps → false」的隐含约定） | L131-135 |
| `packages/game-core/src/search.ts` | **必改**：`missingForBag` 的 `if (progress.stage !== 1 && progress.stage !== 2) return []` 要含 stage 3，否则硬保底不生效 | L34-40 |
| `packages/game-core/src/state.ts` | 阶段跃迁分支 `outcome.result.stageCleared && (state.stage === 1 \|\| state.stage === 2)`：阶段 3 走完 3 步后要跳到哪？（stage 4？还是解锁支线？）——**待产品拍板** | L204-224 |
| `packages/game-core/src/types.ts` | `StageDef.id` 已是 `1 \| 2 \| 3`，够用；`Progress.stage` 已是 `1 \| 2 \| 3 \| 4`，够用 | L81-90, L109-112 |
| `packages/game-core/src/dialogue.ts` | 阶段 3 的 `DIALOGUE.stage3` 文案（现在写死「接下来三条路」）要改成四条 | L46-50 |
| `packages/game-core/src/dialogue.ts` | 可能新增 `DIALOGUE` key（如 `stage3b`）走完三步的播报 | L30-110 |
| `packages/game-core/src/index.ts` | 若新增导出符号需补 | — |

> **未在改动清单里、但会被 A1 牵连的文件（隐式破坏点）**：
> - `packages/game-core/tests/search.test.ts:73` — 用例「阶段 3 没有标签目标，不会触发保底」
>   **会被 A1 直接打破**，必须改写。
> - `packages/game-core/tests/resolve.test.ts:109` — 「同一种物品可以自合」用 `at(3, 0)` 调用，
>   阶段 3 有了 steps 之后，`sandwich + sandwich`（实体）可能命中第 1 步 requires，
>   断言从 `kind === 'accident'` 变 `kind === 'stage'`。**必须改写。**
> - `packages/game-core/tests/playthrough.test.ts:65` — 模拟循环 `while (state.stage < 3)`，
>   阶段 3 目标链不受该模拟覆盖 → 需要新写一个阶段 3 模拟。
> - `apps/web/src/components/HintBar.tsx:50` — 阶段 3 的文案分支 `'凑齐一条三件套就能收尾'`
>   与 `getStage(stage as 1 \| 2)` 的类型断言（L53，cast 成 `1|2`）会失配，需改成 `1|2|3`。

### 批次 A2 —— 第四条支线 + 新结局 + 支线判定改造

| 文件 | 改什么 | 关键位置 |
|---|---|---|
| `packages/game-core/src/types.ts` | `BranchId` 加成员（`'stay'` 或产品定名）；`EndingId` 加成员；`BranchDef` 可能要加字段（如 `autoEnding: boolean`） | L40, L42, L92-106 |
| `packages/game-core/src/stages.ts` | `BRANCHES` 数组加第 4 条；`ENDINGS` 加新结局条目 | L86-115, L123-130 |
| `packages/game-core/src/stages.ts` | **`SHIP_BRANCH = BRANCHES.find(b => b.id === 'ship')!`（L118）** —— 见 §1.2 分析 | L118 |
| `packages/game-core/src/launch.ts` | `launchCheck` 只看 `SHIP_BRANCH`，**逻辑上无需改**（强行起飞只对飞船有意义）。但若新支线也要「尝试性结局」，需要新的 launch 通道 | L46-51 |
| `packages/game-core/src/state.ts` | **关键改动点**：`craft()` 里 `if (status.id !== 'ship') ending = branch.ending;`（L265）—— 现在是「非飞船支线完成即刻进结局」。第四条支线若不想即刻进结局，这里要改。`ks_fail` 纪念章发放（L308-310）只在 `attemptLaunch` 里，与支线无关，**不动** | L247-268 |
| `packages/game-core/src/state.ts` | **`availableEndings()`（L363-371）** —— 「完成任一支线 → 自由模式」的判定就在这里。L366 `if (state.branches[b.id] && b.id !== 'ship') out.push(b.ending)` 加上 L369 无条件 `out.push('free')`。**注意：目前 `free` 是无条件可用的，不是「完成支线才解锁」** | L363-371 |
| `packages/game-core/src/state.ts` | `createInitialState()` 的 `branches: { ship:false, teashop:false, birthday:false }`（L30）要加第四个 key —— **这是存档结构变更点，见 §2** | L30 |
| `packages/game-core/src/state.ts` | `finishGame()` 通用，无需改 | L323-336 |
| `packages/game-core/src/dialogue.ts` | `ENDING_LINES` 加新结局台词（`Record<EndingId, string[]>` 是穷尽映射，**不加就 TS 编译失败**） | L112-136 |
| `apps/web/src/store/gameStore.ts` | `branchSummary(id)` 的 switch（L732-743）要加新支线分支，否则新支线达成时弹空字符串 | L732-743 |
| `apps/web/src/lib/cloud.ts` | `progressScoreOf` 的 `branches: { ship; teashop; birthday }` 类型（L41）+ 计分（L45-47）—— 第四条支线不计入进度分会导致「本地支线完成但云端判定落后」 | L38-49 |
| `apps/api/src/lib/progress.ts` | 同上，`ProgressInput.branches` 类型 + `branchesDone` 计算（L11-20）—— **服务端权威重算，两端必须同步改，否则云端裁决错** | L11-21 |
| `apps/api/src/types.ts` | zod `SaveStateSchema.branches` 是 `z.object({ship,teashop,birthday})`（L15-19），**加第四个 key，否则 PUT 400** | L13-40 |
| `apps/web/src/components/BagDrawer.tsx` | 结局按钮区 L160-197：`branches.teashop` / `branches.birthday` 两个硬编码按钮要加第四个 | L160-197 |
| `apps/api/tests/api.test.ts` | 最小合法存档 fixture 的 `branches`（L42）+ 进度分断言（L56-73）要同步 | L42, L56-73 |

#### 1.2 `SHIP_BRANCH` 单例假设是否仍成立？

**结论：加第四条支线后 `SHIP_BRANCH` 仍然成立，但这个写法本身已经是隐患，建议顺手改成编译期常量。**

- `stages.ts:118`：`export const SHIP_BRANCH = BRANCHES.find((b) => b.id === 'ship')!;`
  `find` 按 id 查，与数组长度、顺序无关 → 加第 4 条后**不受影响**。
- 但 `!` 非空断言意味着：**如果将来有人把 `ship` 这条支线删掉或改 id，这里会静默变成 `undefined`，
  运行时在 `launch.ts:47` 的 `branchStatus(SHIP_BRANCH, bag)` 炸掉（`branch.requires.map` on undefined）**。
- 建议改法（低风险、纯类型增强）：
  ```ts
  const SHIP_BRANCH_DEF = { id:'ship', name:'造飞船', ... } as const;
  export const BRANCHES: BranchDef[] = [SHIP_BRANCH_DEF, teashop, birthday, stay];
  export const SHIP_BRANCH: BranchDef = SHIP_BRANCH_DEF;
  ```
  这样 `SHIP_BRANCH` 是编译期常量，删支线会直接编译报错而不是运行时炸。

### 批次 A3 —— 新增物品与精确配方

| 文件 | 改什么 |
|---|---|
| `packages/game-core/src/items.ts` | 新增 mid / commission / keepsake 物品 |
| `packages/game-core/src/recipes.ts` | 新增精确配方 |
| `packages/game-core/src/items.ts` + `apps/web/src/components/ItemIcon.tsx` | 每件新物品必须：① `icon:` 值在 `SHAPE_OF` 有键（`ItemIcon.tsx:293`）；② (形状, 颜色) 组合全局唯一（check-assets 断言 D）；③ 若用新形状，`SHAPES` 里要有实现（`ItemIcon.tsx:105`） |

### 批次 C1 —— 前任日志载体 + 文本 + 展示

| 文件 | 改什么 |
|---|---|
| `packages/game-core/src/items.ts` 或新文件 `packages/game-core/src/logs.ts` | 日志正文数据（建议独立文件，避免撑大 items.ts） |
| `packages/game-core/src/types.ts` + `index.ts` | `LogEntry` 现有的 `kind` 联合类型 L163 需加 `'前任'`，或用独立类型 |
| `apps/web/src/components/`（**新组件**） | 日志载体，见 §5 组件清单 |
| `apps/web/src/components/BagDrawer.tsx` | 入口按钮（L160 附近「结局区」上方，或抽屉头部） |
| `apps/web/src/styles/app.css` | 新组件样式（当前 1093 行） |

### 批次 C2 —— 二周目（字段 + reset + 结局收集）

见 §2。核心文件：`apps/web/src/store/gameStore.ts`（`SaveStateV2` 类型 L66-71、
`fromCore` L81-99、`toCore` L76-78、`readSavedGame` L166-188、`newGame` L340-367、
`resetAll` L702-728）、`packages/game-core/src/types.ts`（`SaveState` L143-159）、
`apps/api/src/types.ts`（zod schema）、`apps/web/src/lib/cloud.ts` + `apps/api/src/lib/progress.ts`（进度分）。

---

## 2. 存档兼容结论（最关键）

### 2.1 schemaVersion 在哪、当前值多少

| 位置 | 常量 | 值 | 是否生效 |
|---|---|---|---|
| `packages/game-core/src/state.ts:16` | `SCHEMA_VERSION` | `1` | **不生效**。这是 v1 `SaveState` 的遗留值；web 层用 `SaveStateV2` 覆盖了 `schemaVersion` |
| `apps/web/src/store/gameStore.ts:53` | `SAVE_SCHEMA` | `2` | **生效**。localStorage key = `haola.save.v2`（L50） |
| `apps/web/src/store/gameStore.ts:171` | 读档校验 | `parsed.schemaVersion !== SAVE_SCHEMA → return null` | 丢弃存档 |
| `apps/api/src/types.ts:14` | zod `schemaVersion: z.number()` | 宽松 | 不校验具体值 |
| `apps/api/src/db/schema.pg.ts:14` | DB 列 `schema_version` | 整型 | 只存不算 |

**契约 §3.1 的实际语义**：只检查「是不是 2」，不是 2 就整个丢掉，没有迁移函数。
所以**任何 bump 都会丢弃所有现存存档**（本地 + 云端），与设计要求冲突。

### 2.2 结论：**不 bump schemaVersion**

理由与 T7 先例：

- **先例存在且已上线**：`tutorial` 字段是 T7 引入的，`SAVE_SCHEMA` 从头到尾是 `2`，
  没有为它 bump 过。它的做法是：
  - 类型上**必填**（`SaveStateV2.tutorial: TutorialState`，L70），
  - 读档时用 `readTutorial(parsed.tutorial)` 归一化（L184），
  - 归一化常量 `TUTORIAL_SKIP = { step: 'free', picks: 0 }`（L119），
  - 坏形状 / 缺字段 / `picks` 到顶 → 一律退化成 `free`（老玩家不重播引导）。
- **本次新增字段性质完全相同**（可选元数据、缺了不影响主线），
  因此照抄 `tutorial` 的模式是**最小改动、最低风险**的路径。

### 2.3 新增字段的归一化默认值写法

推荐字段集（可按产品口味调整命名）：

```ts
// packages/game-core/src/types.ts —— SaveState / SaveStateV2 同步扩
export interface SaveState {
  // ...现有字段...
  /** 已解锁结局集合。旧存档缺此字段 → 归一化为 [] */
  endingsCollected: EndingId[];
  /** 已读前任日志的 id 集合 */
  logReadIds: string[];
  /** 二周目计数。0 = 一周目 */
  ngPlusCount: number;
}
```

归一化实现（**放在 web 层 `gameStore.ts`，与 `readTutorial` 并排**，
因为归一化是「存档形状兼容」问题，不是「游戏规则」问题，不该进 game-core）：

```ts
// apps/web/src/store/gameStore.ts

/** 老存档缺 ngPlus 相关字段时的归一值（对齐 T7 的 TUTORIAL_SKIP 先例） */
const META_SKIP = {
  endingsCollected: [] as EndingId[],
  logReadIds: [] as string[],
  ngPlusCount: 0,
} as const;

/** 读档归一化：缺字段 / 坏形状 → 归零，不抛不崩 */
function readMeta(raw: unknown): {
  endingsCollected: EndingId[];
  logReadIds: string[];
  ngPlusCount: number;
} {
  if (!raw || typeof raw !== 'object') return { ...META_SKIP };
  const m = raw as Partial<{
    endingsCollected: unknown;
    logReadIds: unknown;
    ngPlusCount: unknown;
  }>;

  const endingsCollected = Array.isArray(m.endingsCollected)
    ? m.endingsCollected.filter(
        (e): e is EndingId =>
          typeof e === 'string' && e in ENDINGS,
      )
    : [];

  const logReadIds = Array.isArray(m.logReadIds)
    ? [...new Set(m.logReadIds.filter((s): s is string => typeof s === 'string'))]
    : [];

  const ngPlusCount =
    typeof m.ngPlusCount === 'number' &&
    Number.isFinite(m.ngPlusCount) &&
    m.ngPlusCount > 0
      ? Math.floor(m.ngPlusCount)
      : 0;

  return { endingsCollected, logReadIds, ngPlusCount };
}
```

**在 `readSavedGame` 里挂上**（与 `readTutorial` 同一行附近，L184）：

```ts
return {
  ...(parsed as SaveStateV2),
  world,
  tutorial: readTutorial(parsed.tutorial),
  ...readMeta(parsed),          // ← 新增
};
```

**在 `fromCore` 里透传**（L81-99）：`fromCore` 是 v1→v2 的唯一适配器，
**新增的三个字段必须在 `fromCore` 的返回对象里显式带过去**，
否则每次 `craft` / `collect` / `chooseEnding` 调 `fromCore` 都会把它们**清零**——
这是最容易踩的坑（L512 `fromCore(res.state, save.world, ...)` 每次合成都调用）。

```ts
function fromCore(next, world, tutorial, meta): SaveStateV2 {
  return {
    /* ...现有字段... */,
    world,
    tutorial,
    endingsCollected: meta.endingsCollected,
    logReadIds: meta.logReadIds,
    ngPlusCount: meta.ngPlusCount,
  };
}
```

> `fromCore` 目前签名是 3 参、11 处调用（`gameStore.ts` L323/344/512/610/621/713 等）。
> 加第 4 参 `meta` 会让所有调用点都要改。
> **更省事的替代方案**：把三个字段从 `fromCore` 的入参/出参里拿掉，
> 改为在 `commit()` 里 merge：
> ```ts
> function commit(save, extra = {}) {
>   persist(save);
>   queuePush(save);
>   set({ save, world: save.world, ...extra });
> }
> ```
> 但 `fromCore` 产出的是完整对象，`commit` 拿到的是**已经丢掉 meta 的对象**，
> merge 也救不回来。**结论：必须改 `fromCore`。**
> 建议把 `fromCore` 的签名从 `(next, world, tutorial)` 改成
> `(next, world, tutorial, meta)`，并把 `meta` 提到 `GameStore` 的一个非持久化 ref 上不可行
> （zustand state 里存着更简单：`save` 里已经有这三个字段，直接读 `get().save`）。

**推荐做法（改动最小）**：`fromCore` 内部不再从入参拿 meta，改为
`fromCore(next, world, tutorial)` 保持 3 参，但在函数体内
**不写这三个字段**——让它们由调用方在 `set` 时补回。
最稳的写法是把这三个字段从 `SaveStateV2` 里**移出 core 适配层**，
单独存在 zustand store 的一个 `meta` 切片里（见 2.4 备选方案）。

### 2.4 两种存档结构方案（推荐 B）

**方案 A：三个字段进 `SaveState` / `SaveStateV2`**
- 优点：跟 `tutorial` 完全同构，一眼能看懂；`persist` 自动带上。
- 缺点：`fromCore` 适配器必须扩参（11 处调用点）；`packages/game-core/src/types.ts` 的
  `SaveState`（L143-159）也被拖脏 —— 那是「规则状态」类型，塞「UI 收集元数据」语义不对。

**方案 B（推荐）：三个字段不进 core，单独放 store 的 `meta` 切片**
```ts
// apps/web/src/store/gameStore.ts
export interface MetaState {
  endingsCollected: EndingId[];
  logReadIds: string[];
  ngPlusCount: number;
}
```
- 持久化：`persist()` 改为写 `{ ...save, meta }`（或写两个 key）。
  **注意**：localStorage key 名 `haola.save.v2` 不变，`schemaVersion` 仍是 2，
  只是 payload 里多了个 `meta` 字段。老代码读老存档不受影响。
- 好处：
  1. `packages/game-core/src/types.ts` 的 `SaveState` **零改动** → game-core 单测零改动；
  2. `fromCore` **零改动** → 不存在「每次合成清零」的坑；
  3. `toCore` 零改动；
  4. 二周目 reset 只重置 `meta` 的部分字段，不碰 `save` → 改动面极小。
- 代价：`persist` / `readSavedGame` / `queuePush` / `pullSave` 的 payload 形状要带 `meta`
  （4 个点：`gameStore.ts` L149-155 persist、L166-188 read、L661-700 syncFromCloud、
  `lib/cloud.ts` L76-95 push/pull）。
- **云端**：zod schema 是 `.passthrough()`（`apps/api/src/types.ts:40`），
  顶层多字段自动放行 → **后端不用改 schema**。
  但 `lib/cloud.ts` 的 `pushSave` 发的是 `{ state: save, ... }`，
  若 `meta` 与 `save` 平级，需确认后端 `PUT /api/saves/me` 存的是 `state` 字段。
  → **最省事的做法：`meta` 塞进 `state` 内部**，即 `SaveStateV2` 加一个 `meta: MetaState` 字段，
  这样 `state` 整体被 JSON 存进 DB，`meta` 自动持久化、自动同步、zod passthrough 自动放行。

> **综合建议**：**方案 B 的变体**——在 `SaveStateV2` 里加**一个** `meta: MetaState` 字段（不是三个平铺字段），
> 这样：
> - `fromCore` 只需在返回里带 `meta`（可用一个模块级常量或从 `next` 读），
>   实际上因为 `fromCore` 的 `next` 是 core `SaveState`（不含 meta），
>   最简单是让 `fromCore` 从入参取 `meta`，调用点统一传 `get().save.meta`；
>   或者 —— **更妙**：让 `fromCore` 不管 meta，由 `commit()` 统一 merge：
>   ```ts
>   const commit = (save, extra = {}) => {
>     const full = { ...save, meta: get().save.meta };
>     persist(full); queuePush(full); set({ save: full, world: full.world, ...extra });
>   };
>   ```
>   `commit` 是**所有持久化写入的唯一出口**（L315-320），
>   在这里 merge 一次就够，**`fromCore` 零改动、11 处调用点零改动**。✅
> - `readSavedGame` 里 `meta: readMeta(parsed.meta)`。
> - `toCore`（L76-78）用 `{ ...save, scene: [], areaId: 'crash' } as SaveState`，
>   `meta` 会被多带一个字段进去，但 `as SaveState` 是断言，运行时无影响。

**结论：采用 `SaveStateV2.meta: MetaState` + `commit()` 统一 merge + `readSavedGame()` 归一化。**

### 2.5 「重开一周目但保留收集」的最小改动点

先看现状：

| Action | 位置 | 现在的行为 | 清了什么 |
|---|---|---|---|
| `newGame()` | `gameStore.ts:340-367` | 从 `createInitialState()` 重开 | 清空全部游戏进度；**`cancelPendingPush()` + `clearCloudSave()` + `queuePush(save)`**；**清云端**；教程重置为 `newcomer` |
| `resetAll()` | `gameStore.ts:702-728` | `localStorage.removeItem(KEY)` + `clearCloudSave()` + `set` 回初始态 | **本地 + 云端全清**；教程重置为 `TUTORIAL_SKIP`（free） |
| `continueGame()` | `gameStore.ts:369-393` | 读档继续 | 不清 |

**因此二周目的最小改动是新增一个 action，而不是改 `newGame` / `resetAll`**（改它们会破坏现有「重新开始」语义和云端一致性）：

```ts
// apps/web/src/store/gameStore.ts —— 新增
newGamePlus: () => {
  const spawn = spawnPoint();
  const base = createInitialState();
  const world = redistribute(fromCore(base, [], TUTORIAL_SKIP), spawn, DEFAULT_MAX_DIST);
  const prevMeta = get().save.meta;

  const save: SaveStateV2 = {
    ...fromCore(base, world, TUTORIAL_SKIP),
    // 保留收集，递增周目数
    meta: {
      endingsCollected: prevMeta.endingsCollected,   // ← 保留
      logReadIds: prevMeta.logReadIds,                // ← 保留
      ngPlusCount: prevMeta.ngPlusCount + 1,          // ← 递增
    },
  };
  persist(save);
  queuePush(save);
  set({
    save, world, screen: 'game',
    slots: [null, null],
    dialog: lines('ngPlus'),   // 新增台词
    dialogIndex: 0,
    viewing: null, bagOpen: false,
    tutorFlags: { wrong: false, blocked: false },
    player: spawn, spawn, moveTarget: null, zoom: 1, toast: null,
  });
},
```

**关键要点**：

1. **不要调 `clearCloudSave()`**。二周目要保留云端收集，
   调了就把云端收集也删了。
   但 `newGame()` 里那句 `clearCloudSave()` 的注释说明了它的用意：
   「开始页『重新开始』同时丢弃云端旧档，否则按『高分不败』的冲突规则，新档永远赢不过云端旧档」。
   → **二周目面临同一个问题，但方向相反**：
   二周目的 `progressScore`（stage×10000 + …）比一周目低（新档 stage 重置为 1），
   **云端会用「高分不败」把一周目的大分档赢回去，把二周目覆盖掉**。
   → **必须修 `progressScoreOf`**，让 `ngPlusCount` 进入评分，且权重足够大：
   ```ts
   // apps/web/src/lib/cloud.ts + apps/api/src/lib/progress.ts（两端必须一致）
   return (
     s.ngPlusCount * 1_000_000 +          // ← 周目数权重最大，压过 stage
     s.stage * 10000 + s.stepIndex * 1000 + branchesDone * 200 + s.day
   );
   ```
   `1_000_000` 的理由：一周目 `stage=3, stepIndex=2, branches=3, day=200` 上限约
   `30000+2000+600+200 = 32800`，远小于 1e6 → 二周目必然赢。
   **服务端 `computeProgressScore` 是权威重算，两端不改就一定不同步。**
2. **保留哪些 key**：`endingsCollected`、`logReadIds` 保留；`ngPlusCount` 递增；
   其余（`day`/`bag`/`discovered`/`stage`/`stepIndex`/`branches`/`keepsakes`/`accidents`/
   `log`/`ending`/`launchAttempts`/`launchFailures`/`world`/`tutorial`）全部重置。
   注意 `tutorial` 应重置为 `TUTORIAL_SKIP`（二周目玩家不需要再看引导）。
3. **二周目是否保留 `keepsakes`？** 产品决策。工程侧建议**保留**
   （纪念品是「收集」，重开不该抹掉），但这会让 `keepsakes` 与「一周目的」混在一起，
   二周目计数需要另设 `meta.keepsakesByCycle` 之类。建议：**二周目保留 `meta.endingsCollected` 与
   `meta.logReadIds`，纪念品按产品口径定**（本文默认保留，因为 `ks_*` 是内容收集而非进度）。
4. **「结束一周目」的入口在哪？** 现状 `EndingScreen.tsx:32-34` 的「再来一次」调 `resetAll()`（全清），
   `EndingScreen.tsx:35-37` 的「回到开始页」调 `backToStart()`（只切屏）。
   二周目入口应加在 **EndingScreen**（打完一个结局后顺势「再来一周目」）
   和/或 **StartScreen**（有新档时提供「二周目」按钮）。见 §5。

### 2.6 需要新增的测试用例

| 文件 | 新增用例 |
|---|---|
| `packages/game-core/tests/data.test.ts` | ① 「所有支线候选物都存在」已覆盖 BRANCHES 全量（L71-81），新增第四条后**自动生效**，无需改；② 新增「新结局 id 在 `ENDINGS` 与 `ENDING_LINES` 里都有条目」（防 `Record<EndingId,…>` 漏项） |
| `packages/game-core/tests/playthrough.test.ts` | ① 「四条支线的每个槽位都有可达候选」——现有用例 L154 名为「三条支线」，改 BRANCHES 后**自动覆盖 4 条**，但**用例名要改**，否则误导；② 新增「阶段 3 目标链可在 N 步内走完」的模拟 |
| `packages/game-core/tests/resolve.test.ts` | ① 「阶段 3 第 1 步命中标签并集 → 产出 step.output」；② 「阶段 3 目标链**不会**截胡支线产物配方」——**这是 §3 的回归护栏，必须有**（例：`resolveMix('manual','sandwich', at(3,0))` 若阶段 3 第 1 步 requires 含 `知识+实体` 会截胡 `theoryfuel`，这条断言能挡住回归） |
| `packages/game-core/tests/search.test.ts` | ① **改写** L73「阶段 3 没有标签目标，不会触发保底」→ 阶段 3 有目标后，保底**必须**补齐 requires 标签；② 新增「阶段 3 需要的标签在已解锁区域池里存在」 |
| **新文件** `apps/web/tests/store.test.ts`（**需先给 web 加 vitest 依赖**，当前 web 无测试） | ① 老存档（缺 `meta`）读档后 `meta` 归一化为 `{[], [], 0}`；② `newGamePlus` 保留 `endingsCollected`/`logReadIds` 且 `ngPlusCount+1`；③ `newGamePlus` 清空 `day`/`stage`/`bag`；④ `progressScoreOf` 在 `ngPlusCount` 更大时更大（**跨前后端一致性**：web 与 api 同一组输入必须同分） |
| `apps/api/tests/api.test.ts` | ① zod schema 接受新增第四个支线 key（否则 PUT 400）；② `computeProgressScore` 在 `ngPlusCount` 更大时更大 |

> ⚠️ **`apps/web` 当前没有 vitest、没有 `test` script**（`apps/web/package.json` 只有
> `dev`/`build`/`preview`/`typecheck`）。
> 二周目的存档逻辑全在 web 层 → **要么给 web 加 vitest，要么把这部分逻辑下沉到 game-core**。
> **推荐后者**：把「meta 归一化 + 周目数评分」做成 game-core 的纯函数
> （`packages/game-core/src/meta.ts`），web 与 api 都能 import，
> 一处实现、两端复用、game-core 已有 vitest → **零新增测试基建成本**。✅

---

## 3. 阶段 3 目标链的截胡风险（工程视角）

### 3.1 阶段目标判定的位置与优先级

- **判定代码**：`packages/game-core/src/resolve.ts:59-72`
  ```ts
  if (stage && progress.stepIndex < stage.steps.length) {
    const step = stage.steps[progress.stepIndex];
    if (step.requires.every((r) => tags.includes(r))) {   // ← L61 判定点
      ...
      return { result, hint: null };                        // ← L70 提前返回
    }
  }
  ```
- **优先级顺序**（`resolve.ts:34-43` 注释 + 实际代码顺序）：
  1. **阶段目标**（标签匹配，覆盖即通过）— L59-72
  2. 精确配方 — L77-80
  3. 风险物品 → 失败的味道 — L83-88
  4. 意外配对表 — L91-97
  5. 兜底「说不清的东西」 — L100
- **关键**：阶段目标**优先于**精确配方（L70 的 `return` 在 L77 之前）。
  → 阶段 3 的 requires 一旦命中，**配方产物就被吃掉**，玩家拿不到支线槽位物品。
- **前置闸门**（`resolve.ts:55-57`）：
  ```ts
  const stage = progress.stage === 1 || progress.stage === 2
    ? getStage(progress.stage)
    : undefined;
  ```
  **阶段 3 目前进不来**。A1 必须改这里，否则 3 步是死数据。

### 3.2 截胡判定模型

阶段目标在 `progress.stepIndex` 处**只看当前一步**。
玩家合成 `(a, b)` 时，若 `tags(a) ∪ tags(b) ⊇ step.requires`，
则本该产出的配方物品被替换成 `step.output`。

注意两个放大因素：
- `requires` 是**标签并集覆盖**，不要求两个物品各带一个标签 → 一个多标签物品 + 任意物品都可能被吞。
- 阶段 3 的 `stepIndex` 与「支线进度」**是两套独立游标**：玩家可能同时在推进阶段 3 步骤与支线，
  截胡在**任何 stepIndex** 都可能发生。

### 3.3 必须避开的标签组合清单

用脚本枚举了「材料标签并集 ⊇ requires」且产物落在**现有 3 条支线槽位**上的全部配方
（`optimistic/theoryfuel/doorthing/doorplate/hullplate/ration/hopefood/hotsandwich/
shopfront/menu/fakecustomer/mannequin/birthproof/bankrupt/cakerepl/clapper/musicbox`）：

#### 🔴 绝对禁用（截胡 ≥4 条支线产物配方）

| requires | 被吞的支线产物数 | 典型被吞配方 |
|---|---|---|
| **实体 + 实体** | **17** | theoryfuel / doorthing / ration / doorplate / hopefood / shopfront / menu / fakecustomer / birthproof / cakerepl / clapper / musicbox / bankrupt / hullplate / hotsandwich |
| **实体 + 知识** | 5 | theoryfuel / menu / birthproof / bankrupt |
| **知识 + 知识** | 5 | 同上 |
| **外星 + 外星** | 5 | optimistic / menu / cakerepl / mannequin |
| **抽象 + 抽象** | 6 | optimistic / hopefood / fakecustomer / clapper / musicbox / mannequin |
| **实体 + 金属** | 4 | doorthing / shopfront / hullplate |
| **实体 + 抽象** | 4 | hopefood / fakecustomer / clapper / musicbox |
| **粘 + 粘** | 4 | doorthing / clapper / mannequin |
| **金属 + 金属** | 4 | doorthing / shopfront / hullplate |

> **结论 A：阶段 3 的 requires 里绝不出现「实体」。**
> 「实体」是池内标签最多的（21 件可捡），任何带「实体」的组合都在高危区。
> 顺带：`实体+实体` 已被阶段 2 第 1 步用过（`stages.ts:62`）——同一个标签对在不同阶段重复出现，
> 会让玩家的「我刚合过这个」记忆产生误导，**新步骤避开「实体」也有 UX 收益**。

#### 🟠 高危（截胡 1–3 条，建议避开）

`实体+粘`(3) / `实体+导电`(3) / `实体+能推`(3) / `实体+外星`(3) / `实体+部件`(3) /
`粘+导电`(2) / `粘+金属`(2) / `粘+抽象`(2) / `导电+金属`(2) / `金属+能推`(2) /
`知识+风险`(2) / `知识+外星`(2) / `风险+风险`(2) / `能烧+能烧`(2) / `外星+抽象`(2) /
`实体+风险`(2) / `实体+能烧`(2) / `实体+能挡风`(1) / `实体+能呼吸`(1) /
`粘+外星`(1) / `导电+能推`(1) / `能烧+外星`(1) / `抽象+部件`(1) / `抽象+能呼吸`(1) /
`部件+能挡风`(1) / `部件+能呼吸`(1) / `能挡风+能挡风`(1) / `能呼吸+能呼吸`(1) /
`实体+中间`(1) / `金属+中间`(1) / `金属+部件`(1) / `能推+中间`(1) / `能推+部件`(1) /
`中间+中间`(1) / `中间+部件`(1)

#### 🟢 零风险（截胡 = 0，可安全使用）

以下标签对的「材料并集覆盖它」的配方**没有一条产出支线槽位物品**：

- **粘 + 知识**、**粘 + 风险**、**粘 + 能推**、**粘 + 能烧**
- **导电 + 知识**、**导电 + 风险**、**导电 + 能烧**、**导电 + 外星**、**导电 + 抽象**
- **金属 + 知识**、**金属 + 风险**、**金属 + 能烧**、**金属 + 外星**、**金属 + 抽象**
- **知识 + 能推**、**知识 + 能烧**、**知识 + 抽象**
- **风险 + 能推**、**风险 + 能烧**、**风险 + 外星**、**风险 + 抽象**
- **能推 + 能烧**、**能推 + 外星**、**能推 + 抽象**
- **能烧 + 抽象**

#### ✅ 给文策渊的「阶段 3 requires 白名单」

**从「功能标签」里挑两个不同功能标签的组合**：
`粘 / 导电 / 金属 / 知识 / 风险 / 能推 / 能烧 / 外星 / 抽象`（9 个），
任意两两组合共 36 种，其中 **25 种零风险**（上表），
另外 11 种高危（`粘+导电`/`粘+金属`/`粘+抽象`/`导电+金属`/`金属+能推`/`知识+风险`/`知识+外星`/`风险+风险`/`能烧+能烧`/`外星+抽象`/`实体`相关全部）。

**推荐 3 步示例（供文策渊参考，最终以 GDD 为准）**：
- 第 1 步：`粘 + 知识`（零风险）
- 第 2 步：`导电 + 能烧`（零风险）
- 第 3 步：`风险 + 抽象`（零风险）

#### ⚠️ 额外约束：requires 里的标签必须在池里有 ≥2 个可捡来源

`check-content.mjs` 断言 B 只统计**可捡池内**物品的标签数。
`requires` 引用的标签若池内只有 1 个来源 → 硬保底会反复刷同一件，
玩家一旦用掉就卡住（`world.ts:444-460` 的保底逻辑会 throw）。
当前池内来源数（`check-content.mjs` 口径）：
`实体:21 粘:4 导电:3 金属:3 知识:6 风险:5 能推:3 能烧:4 外星:8 抽象:7`
→ **`导电`(3) / `金属`(3) / `能推`(3) 是最紧的三个**，阶段 3 步骤尽量别连续用同一个。

#### ⚠️ 第三条隐藏约束：阶段 3 步骤的产出物不能是支线槽位物品

`step.output` 会进背包。如果阶段 3 某步产出 `menu`（奶茶店槽位），
玩家会「顺手」把支线凑齐 → 支线变成「做阶段 3 顺手就能完成」，支线设计失去意义。
→ **阶段 3 的 3 个 output 应该是全新的 mid 物品，不与现有支线槽位物品重叠。**

---

## 4. 内容校验脚本对新内容的约束

### 4.1 断言位置

| 断言 | 脚本行号 | 逻辑 |
|---|---|---|
| **A 无孤立物品** | `scripts/check-content.mjs:75-95`（判定在 **L91-95**） | `orphans = items.filter(i => !inPool.has(i.id) && !used.has(i.id) && !mayBeUnreferenced.has(i.kind))` |
| **B 每标签 ≥2 来源** | `scripts/check-content.mjs:97-106`（判定在 **L104-106**） | `byTag` 只累加 `inPool` 里的物品；`n < 2` 即失败 |
| A 的豁免名单 | L90：`mayBeUnreferenced = new Set(['accident', 'keepsake'])` | 只有 `accident` 和 `keepsake` 可以既不在池里也不被配方引用 |

### 4.2 新增物品若**全部来自合成**（无 `area`），断言 A 如何满足？

**只要新物品出现在任意一条 `RECIPES` 里（作为 a / b / out 任一位置）即可。**
`used` 集合（L76-77）由全部配方的 `a`/`b`/`out` 构成：

```js
const used = new Set();
for (const r of recipes) for (const id of [r.a, r.b, r.out]) if (id) used.add(id);
```

所以：
- 新物品是**合成产物** → 出现在某条配方的 `out` → 进 `used` → 不孤立 ✅
- 新物品是**合成材料** → 出现在某条配方的 `a`/`b` → 进 `used` → 不孤立 ✅
- 新物品是 **keepsake** → `kind: 'keepsake'` → L90 豁免 ✅
- 新物品是 **accident** → `kind: 'accident'` → L90 豁免 ✅
- 新物品是 **base 但没写 `area`** → 既不在 `inPool`、也可能不在 `used` → ❌ **孤立**

⚠️ **注意**：`mid` / `ship` / `commission` 三种 kind **不在豁免名单里**，
所以它们**必须**至少被一条配方引用，不能只靠「阶段目标产出」而不出现在配方里。
检查现有数据：`mid` 物品如 `wire`/`bracket`/`signal` 都有配方 ✅；
`doorplate`/`hopefood`/`hotsandwich` 也都有配方 ✅。
→ **新加的 mid / commission 物品一定要配一条精确配方**（哪怕只是为了满足 A 而加的「备选路径」）。

### 4.3 只加合成产物、不加可捡基础物品时，断言 B 是否仍然成立？

**成立，但有一个前置条件。**

- 断言 B 统计的是 `inPool` 物品的标签（`check-content.mjs:100-103`：
  `if (!inPool.has(i.id)) continue;`）。**不加可捡物品 → `byTag` 完全不变 → B 的结论不变** ✅
- **但**：如果新合成产物带了**全新的标签**，且这些标签**只在合成产物上**，
  那这些标签在 `byTag` 里根本不存在（`byTag` 只装池内标签）→ **B 不会报错**，
  但 `scripts/check-assets.mjs` 与 `world.ts` 的保底逻辑会有别的问题：
  - `world.ts:204-206` 的 `tagExistsAnywhere(tag)` 只查区域池。
    若阶段 3 的 requires 用了这样一个「只在合成产物上」的标签，
    硬保底会走 `throw new Error('保底失败：没有任何区域池包含标签「X」')`
    （`world.ts:458-462`）→ **运行时炸**（store 里有 try/catch 兜住，但玩家拿不到新物品 → 卡死）。
  - `check-content.mjs` 的 C 段「分布统计」只是打印，不失败。
- → **结论**：新标签可以引入，但**阶段 3 的 requires 只许用「池内已有 ≥2 来源」的标签**
  （即上文 10 个：`实体/粘/导电/金属/知识/风险/能推/能烧/外星/抽象`，
  且避开来源数 ≤3 的 `导电/金属/能推` 连用）。

### 4.4 check-assets.mjs 的连带约束（A2/A3 会碰到）

| 断言 | 行号 | 约束 |
|---|---|---|
| A 色值镜像 | `check-assets.mjs:144-179` | `palette.ts` 与 `tokens.css` 逐键相等（新增物品不涉及，除非换色） |
| B icon 覆盖 | L181-200 | 每个 `items.ts` 的 `icon:` 值必须在 `ItemIcon.tsx` 的 `SHAPE_OF` 有键 |
| C 无孤立形状 | L202-214 | `SHAPES` 里每个形状至少被 1 件物品用；**加了新形状却没给任何物品用 → 失败** |
| D 视觉可区分 | L216-238 | **(形状, 颜色) 组合数必须 == 物品数**。80 件物品已有 80 个唯一组合。新增 N 件物品 → 需要 N 个新的唯一 (形状, 颜色) 组合。**颜色只有 5 种（orange/mint/purple/pink/yellow）**，所以必须新增足够多的**形状**，否则 D 会因撞脸失败 |
| 解析自检 | L250-265 | `SHAPES.size ≥ 39`、`SHAPE_OF.size ≥ 59`、`ITEMS.length ≥ 60`（下限，只增不减，OK） |

> ⚠️ **D 断言是 A2/A3 最容易踩的坑**：现有 45 个形状 × 5 色 = 225 种组合，
> 80 件已用掉 80 种，理论上还有 145 种可用 —— 但**同一个形状只能配一次同色**，
> 所以新增 N 件物品需要 N 个**不同形状**（或复用旧形状但配未用过的颜色）。
> 结论：**新增物品必须同步在 `ItemIcon.tsx` 的 `SHAPES` 里加新形状**，
> 且新形状必须被至少一件新物品使用（否则触发 C 断言）。

---

## 5. 前端影响面

### 5.1 需新增 / 改动的组件清单

| 组件 | 动作 | 说明 |
|---|---|---|
| `apps/web/src/components/ItemIcon.tsx` | **改** | 新形状（`SHAPES` + `SHAPE_OF`），见 §4.4 |
| `apps/web/src/components/ItemCard.tsx` | 可能**改** | 若日志物品要在背包里以特殊卡呈现 |
| `apps/web/src/components/Hud.tsx` | **改** | ① L33 `阶段 {stage === 3 ? '3 · 建设' : stage}` → 阶段 3 有目标链后，阶段 4 的显示要补；② 二周目徽标（如「第 2 周目」）可加在 HUD 左侧 |
| `apps/web/src/components/BagDrawer.tsx` | **改** | ① 结局按钮区 L160-197 加第四支线；② 日志入口；③ 二周目入口（或放 StartScreen） |
| `apps/web/src/components/HintBar.tsx` | **改** | L53 `getStage(stage as 1 \| 2)` → `as 1 \| 2 \| 3`；L50-54 阶段 3 文案重写（现在是「凑齐一条三件套就能收尾」） |
| **新组件** `apps/web/src/components/ExLogDrawer.tsx`（前任日志） | **新增** | 见 §5.2 |
| `apps/web/src/screens/EndingScreen.tsx` | **改** | ① 新结局文案渲染（走 `ENDINGS[ending]` + `ENDING_LINES[ending]`，数据驱动，**结构不用改**，只是数据里多一条）；② 加「二周目」按钮（当前 L32-37 只有「再来一次」= `resetAll` 全清、「回到开始页」） |
| `apps/web/src/screens/StartScreen.tsx` | 可能**改** | 若二周目入口放在开始页（「新档 + 二周目」两个按钮），L84-93 的按钮区要扩 |
| `apps/web/src/store/gameStore.ts` | **改** | `newGamePlus` action、`meta` 归一化、`fromCore`/`commit` 适配、`branchSummary` switch |
| `apps/web/src/styles/app.css` | **改** | 新组件样式（当前 1093 行） |

### 5.2 前任日志放哪个组件？→ **建议新组件 `ExLogDrawer`**

理由与取舍：

- **不放 BagDrawer 内联**：BagDrawer 是背包 + 合成台 + 结局区，已经很重；
  日志是长文本，内联会让抽屉在 375px 屏上过长，且与 `content-visibility` 跳过机制（L84-93）冲突。
- **不做成新 Screen**：`Screen` 类型是 `'start' | 'game' | 'ending'`（`gameStore.ts:190`），
  加 `'log'` 会让游戏主屏被完全替换掉（失去世界背景），观感差。
- **✅ 做成 overlay 抽屉**（`position: absolute` / `fixed` 全屏遮罩 + 右侧面板），
  从 BagDrawer 头部或 HUD 触发：
  - 复用 `BagDrawer` 的 `drawer__scrim` / `drawer` 样式词汇 → 视觉一致；
  - 不影响 `GameScreen` 的组件树（SPEC §6.1 不动）；
  - 可关闭后 `content-visibility: hidden` 跳过布局。
- **数据载体**：`packages/game-core/src/logs.ts`（新文件）导出日志条目数组
  （`{ id, title, body, day? }`），通过 `index.ts` 导出 → web 直接 import。
  **放 game-core 而不是 web**：① 前后端共用（`/api/config` 下发）；② 游戏-core 已有 vitest 可测；
  ③ 体积可控（见 §5.3）。
- **`logReadIds` 的写入点**：`read` 事件 → `gameStore` action → `commit`（保证落盘）。

### 5.3 首屏体积影响评估

**当前基线：首屏 JS gzip = 158.88 KB，红线 250 KB，余量 ~91 KB。**

（来源：`docs/perf/PERF-REPORT-v2.md:83`「`index-*.js` 154.2KB gzip」+ CSS 4.4KB = 158.6KB；
任务书给的 158.88KB 是同一口径。）

实测各数据文件 gzip（zlib level 9）：

| 文件 | raw | gzip |
|---|---|---|
| `items.ts` | 18.6 KB | **6.6 KB** |
| `recipes.ts` | 4.3 KB | 1.8 KB |
| `stages.ts` | 4.4 KB | 2.1 KB |
| `dialogue.ts` | 5.8 KB | 3.1 KB |
| `types.ts` | 4.1 KB | 2.1 KB |
| `state.ts` | 10.0 KB | 3.6 KB |
| `world.ts` | 16.8 KB | 6.1 KB |
| `resolve/search/launch` | 7.6 KB | 3.7 KB |
| **game-core 合计** | **71.5 KB** | **29.0 KB** |
| `ItemIcon.tsx` | 17.5 KB | **7.2 KB** |

**增量估算**：

| 新增内容 | 数量 | gzip 增量估算 | 说明 |
|---|---|---|---|
| 新物品（mid/commission/keepsake） | ~15 件 | **+1.5 KB** | 每件 ~100B gzip（含 desc 中文） |
| 新配方 | ~15 条 | **+0.4 KB** | 每条 ~25B |
| 新结局台词 + 日志正文 | ~8 KB 文本 | **+2.5 KB** | 中文文本 gzip 率约 35% |
| 新支线定义 | 1 条 | +0.1 KB | |
| **新增 SVG 形状**（ItemIcon） | ~8 个 | **+0.9 KB** | 每个形状 ~110B gzip |
| 前端新组件（ExLogDrawer 等） | ~300 行 TSX+CSS | **+1.2 KB** | |
| **合计** | | **≈ +6.6 KB** | |

**结论：首屏 ≈ 165 KB gzip，距 250 KB 红线仍有 ~85 KB 余量。不会破线。**

⚠️ 但有两个**必须注意**的点：

1. **别把新数据做成独立 chunk 之外的额外动态 import**。`StartScreen.tsx:33-47` 的注释
   记录了一次真实事故：动态 `import('pixi.js')` 导致 Rollup 把整个 pixi 图合并进主 chunk，
   首屏从 158.6KB 涨到 **345.8KB**，破线。
   → **新数据应静态 import**（跟现有 items.ts 一样进主 chunk），
   新组件（ExLogDrawer）**可以用 `React.lazy`** 分割（因为它不进首屏渲染路径），
   但**不要**因此把 game-core 的数据模块变成动态 import。
2. **重新验收**：`node scripts/perf-static-serve.mjs` + `scripts/perf-cdp.mjs`
   走一遍产物 gzip 实测（PERF-REPORT-v2.md §2 的口径），别只看构建器自报值。

---

## 6. 实施顺序建议（可独立验收的最小批次）

> 我把任务书建议的 4 个批次**调整为 6 个**，理由写在每个批次下方。
> 核心调整：A1 不能只做数据（会漏掉 3 处隐式闸门），
> 因此拆成 **A1a（打通阶段 3 目标链机制）** 与 **A1b（填 3 步内容）**；
> C2 因为存档字段与 reset 语义耦合较深，单独成批且必须先有测试基建。

---

### 批次 A1a —— 打通阶段 3 目标链机制（无新内容，先让机制跑通）

**改哪些文件**
- `packages/game-core/src/resolve.ts`（L55-57 闸门放宽；复核 L131 `stageCleared`）
- `packages/game-core/src/search.ts`（L34-40 闸门放宽）
- `packages/game-core/src/state.ts`（L204-224 阶段跃迁分支）
- `packages/game-core/src/types.ts`（如需扩 `Progress`/`StageDef`）
- `packages/game-core/tests/{resolve,search,playthrough}.test.ts`（修被打破的用例）

**要跑哪些校验**
```bash
pnpm --filter @haola/game-core test
pnpm --filter @haola/game-core typecheck
pnpm --filter @haola/web typecheck
node scripts/check-content.mjs
node scripts/check-assets.mjs
```

**验收口径**
1. 阶段 3 有了 steps 后，`resolveMix` 在 stage 3 能命中第 1 步并产出 `step.output`；
2. 阶段 3 的 `missingForBag` 返回非空，且 `distribute` 在阶段 3 会补齐对应标签的地面点；
3. 原有 60 个 game-core 用例全绿（**打破的用例必须被修，而不是被删**：
   `search.test.ts:73` 改成「阶段 3 保底会补齐 requires 标签」；
   `resolve.test.ts:109` 的 `at(3,0)` 改成 `at(1,0)` 或调整断言）；
4. `check-content` / `check-assets` 全绿；
5. **手动**：进游戏到阶段 3，能看到 HintBar 显示「第 1 步 / 共 3 步」。

---

### 批次 A1b —— 阶段 3 目标链内容（3 步）

**改哪些文件**
- `packages/game-core/src/stages.ts`（`STAGES[2].steps` 填 3 步）
- `packages/game-core/src/items.ts`（3 个新 mid 产物）
- `packages/game-core/src/recipes.ts`（3 条配方，满足 check-content 断言 A）
- `packages/game-core/src/dialogue.ts`（`stage3` 文案改四条 + 阶段 3 完成播报）
- `apps/web/src/components/HintBar.tsx`（阶段 3 文案与 cast 修正）
- `apps/web/src/components/ItemIcon.tsx` + `scripts/check-assets.mjs` 的 D 断言（3 个新形状）
- `packages/game-core/tests/{data,resolve,search,playthrough}.test.ts`（新用例）
- `docs/content/CONTENT.md`（内容总表同步）

**要跑哪些校验**：同 A1a，另加 `node scripts/check-content.mjs` 与 `node scripts/check-assets.mjs` 必须仍绿。

**验收口径**
1. **§3.3 的白名单约束成立**：3 个 requires 全部落在「零风险标签对」内，
   且**都不含「实体」**；
2. 3 个 output 是全新 mid 物品，**不与现有支线槽位物品重叠**；
3. 新 mid 物品各有 ≥1 条精确配方（断言 A）；
4. requires 的每个标签在池内 ≥2 个来源（断言 B + 硬保底不 throw）；
5. 阶段 3 三步可在有限操作内走完（新增模拟用例）；
6. **回归护栏**：新增用例「阶段 3 目标链不会截胡支线产物配方」——
   枚举全部 `BRANCHES` 槽位候选品的配方，逐条跑 `resolveMix` 在 stage 3 的 progress 下，
   断言结果 `kind === 'recipe'` 且 `output` 正确。**这条是整个 A 线最有价值的护栏。**

---

### 批次 A2 —— 第四条支线 + 新结局 + 支线判定改造

**改哪些文件**
- `packages/game-core/src/types.ts`（`BranchId` / `EndingId` / `BranchDef`）
- `packages/game-core/src/stages.ts`（`BRANCHES` + `ENDINGS` + `SHIP_BRANCH` 重构）
- `packages/game-core/src/items.ts`（3 个 commission 槽位物品 + 1 个 keepsake）
- `packages/game-core/src/recipes.ts`（3 条配方）
- `packages/game-core/src/state.ts`（`createInitialState` 的 branches key L30；`craft` L265 的支线→结局映射；`availableEndings` L363-371）
- `packages/game-core/src/dialogue.ts`（`ENDING_LINES` 加新结局 → **不加以 TS 编译失败**）
- `packages/game-core/src/index.ts`（新导出）
- `apps/web/src/store/gameStore.ts`（`branchSummary` L732）
- `apps/web/src/components/BagDrawer.tsx`（结局按钮 L160-197）
- `apps/web/src/components/ItemIcon.tsx`（新形状）
- `apps/web/src/lib/cloud.ts` + `apps/api/src/lib/progress.ts`（**支线计分**）
- `apps/api/src/types.ts`（zod `branches` 加第四个 key）
- `apps/api/tests/api.test.ts`（fixture + 进度分断言）
- `packages/game-core/tests/{data,playthrough}.test.ts`（用例名「三条支线」→「四条支线」）

**要跑哪些校验**：同 A1a + `pnpm --filter @haola/api test` + `pnpm --filter @haola/api typecheck`

**验收口径**
1. `BRANCHES.length === 4`，第四条支线三个槽位均可从基础物品合成到达
   （`playthrough.test.ts` 的「支线每个槽位都有可达候选」用例自动覆盖 4 条）；
2. 新结局能在 `ENDINGS` 与 `ENDING_LINES` 中查到，`endingLines('新id')` 非空；
3. 完成第四条支线后，BugDrawer 出现对应结局按钮，点击能进结局；
4. **`availableEndings` 的语义被明确**（见 §7 风险 R2）——
   写一条用例锁定「完成任一支线 → 能选自由模式」；
5. `progressScoreOf`（web）与 `computeProgressScore`（api）对同一输入返回**同一个数**
   （跨端一致性，用例要同时跑在两个包）；
6. zod schema 接受带第四支线 key 的存档（PUT 不 400）；
7. `SHIP_BRANCH` 重构后 `launch.ts` 的强行起飞行为不变（`launchCheck` 仍只认飞船）。

---

### 批次 C1 —— 前任日志载体 + 文本 + 展示

**改哪些文件**
- **新** `packages/game-core/src/logs.ts`（日志条目数据）
- `packages/game-core/src/index.ts`（导出）
- `packages/game-core/src/types.ts`（如需给 `LogEntry.kind` 加 `'前任'`）
- **新** `apps/web/src/components/ExLogDrawer.tsx`
- `apps/web/src/components/BagDrawer.tsx`（入口按钮）
- `apps/web/src/styles/app.css`
- `packages/game-core/tests/data.test.ts`（日志 id 唯一、文案非空）

**要跑哪些校验**：同 A1a + `node scripts/smoke-build.mjs`（需先 build + 起 preview）

**验收口径**
1. 日志能打开/关闭，375×667 无横向滚动、不遮挡底部合成台；
2. 日志全文可读，读过的条目标记（`logReadIds` 落盘，**刷新后仍在**）；
3. 日志数据在 game-core，前后端共用（`/api/config` 能拿到）；
4. **包体**：首屏 gzip 实测 ≤ 170 KB（预估 165，留 5 KB 余量）；
5. 移动端按钮热区 ≥ 44×44 CSS px。

---

### 批次 C2 —— 二周目（字段 + reset + 结局收集）

**前置**：建议先把「meta 归一化 + 进度分」下沉到 game-core
（**新** `packages/game-core/src/meta.ts`，导出 `META_SKIP` / `readMeta` / `ngPlusScore`），
这样 web 与 api 共用一份实现，两端不可能漂移。

**改哪些文件**
- **新** `packages/game-core/src/meta.ts`（归一化 + 评分）
- `packages/game-core/src/index.ts`（导出）
- `packages/game-core/src/types.ts`（`SaveState` 加 `meta` 或 web 层 `SaveStateV2` 加）
- `apps/web/src/store/gameStore.ts`（`SaveStateV2` + `readSavedGame` + `commit` + `newGamePlus` + `persist`）
- `apps/web/src/lib/cloud.ts`（`progressScoreOf` 加 `ngPlusCount` 权重）
- `apps/api/src/lib/progress.ts`（同）
- `apps/api/src/types.ts`（若 meta 顶层放行则不用改，`.passthrough()` 已覆盖）
- `apps/web/src/screens/EndingScreen.tsx`（二周目按钮）
- `apps/web/src/screens/StartScreen.tsx`（可选入口）
- `apps/web/src/components/Hud.tsx`（周目徽标）
- `packages/game-core/tests/data.test.ts` 或 **新** `packages/game-core/tests/meta.test.ts`
- `apps/api/tests/api.test.ts`（进度分）

**要跑哪些校验**：全量 + `pnpm --filter @haola/api test`

**验收口径**
1. **不 bump schemaVersion**：`SAVE_SCHEMA` 仍是 `2`，`localStorage` key 仍是 `haola.save.v2`，
   **老存档（v2.0.0 线上存的）能被正常读出**，不丢档（契约 §3.1 语义不变）；
2. 老存档缺 `meta` → 归一化为 `{ endingsCollected: [], logReadIds: [], ngPlusCount: 0 }`，
   **不崩、不重播引导**（对齐 T7 的 `TUTORIAL_SKIP` 行为）；
3. `newGamePlus()` 后：`day=1`、`stage=1`、`bag` 清空、`branches` 全 false、
   `ngPlusCount+1`、`endingsCollected` 与 `logReadIds` **保留**；
4. **云端不倒退**：二周目存档的 `progressScore` **大于**一周目旧档，
   否则云端会用「高分不败」把二周目覆盖 → 写一条跨端一致性用例；
5. **不调 `clearCloudSave()`**（否则云端收集被删）；
6. 一周目的结局收集在二周目里可见（EndingScreen / 日志面板能翻到已解锁结局）。

---

### 批次顺序与依赖

```
A1a（机制）─→ A1b（内容）─┐
                          ├─→ A2（支线+结局）
A3（新物品/配方）─────────┘

C1（日志展示）── 独立，可与 A 线并行
C2（二周目）── 依赖 A2 的「结局收集」语义已定（endingsCollected 收哪些 id）
```

**C2 依赖 A2**：二周目的「结局收集」要知道有哪几个结局 → 结局集合由 A2 扩。
但 **C2 的存档字段与 reset 逻辑可以先行**（用当前 4 个结局做占位），
所以 C2 不必严格等到 A2 完成，只需在 A2 落地后同步 `endingsCollected` 的白名单。

---

## 7. 风险清单

| # | 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|---|
| **R1** | **阶段 3 目标链抢走支线产物** | **高**（若 requires 用「实体」则 100%） | **高** —— 玩家凑不齐支线三件套，支线内容作废 | ① 严格按 §3.3 白名单选标签（**禁用「实体」**）；② 新增回归护栏用例「阶段 3 目标链不截胡支线产物配方」；③ 阶段 3 的 3 个 output 用全新 mid 物品，不与支线槽位重叠 |
| **R2** | **第四条支线让「自由模式」判定分叉** | 中 | 中 | 现状 `availableEndings`（`state.ts:363-371`）里 **`free` 是无条件 push 的**（L369），并非「完成支线才解锁」；而 SPEC §4.1 写的是「完成任一 → 自由模式」。**这两处语义已经不一致**。加第四条支线前必须先拍板：`free` 是「随时可选」还是「完成支线后可选」？若后者，要改 `availableEndings` L369 + `BagDrawer` L189-195 的无条件按钮 |
| **R3** | **旧存档归一化遗漏** | 中 | **高**（丢档 = 丢玩家进度，v2.0.0 已上线） | ① 照抄 `readTutorial` 模式做 `readMeta`；② **不 bump `SAVE_SCHEMA`**（bump = 按契约 §3.1 全丢）；③ `meta` 塞进 `state` 内部（走 zod `.passthrough()`，后端零改动）；④ `commit()` 统一 merge，禁止在某个 action 里手写 save 对象；⑤ 补「老存档缺字段」用例 |
| **R4** | **SVG 包体膨胀** | 低 | 低 | 预估 +0.9 KB gzip（8 个新形状），首屏 ≈165 KB < 250 KB。**但 D 断言**（`check-assets.mjs:216-238`）会因 (形状,颜色) 撞脸失败 → 必须加新形状；别用「同形状换颜色」凑数超过 5 色上限。验收时用 `perf-static-serve` 实测，别信构建器自报值 |
| **R5** | **check-content / check-assets 断言失败** | **高** | 中（拦在合并前，返工） | ① 新 mid/commission 物品**必须**有精确配方（`mid`/`ship`/`commission` 不在 `mayBeUnreferenced` 豁免名单里）；② 新形状必须被至少一件物品使用（C 断言）；③ (形状,颜色) 必须全局唯一（D 断言）；④ 新增物品**不要**加 `area` 除非真要进池（会改动池内标签计数 → 影响断言 B 与硬保底） |
| **R6** | **`fromCore` 适配层丢字段** | **高**（改存档结构时必踩） | **高**（每次合成清零收集） | `fromCore` 是 v1→v2 唯一适配器（`gameStore.ts:81-99`），**显式列举字段**。新字段若不在 `fromCore` 的返回里 → 每次 `craft`（L512 调 `fromCore`）都会清零。→ 走 `commit()` 统一 merge，或改 `fromCore` 签名并同步全部调用点。**补用例：合成一次后 meta 仍在** |
| **R7** | **二周目被云端「高分不败」覆盖** | **中高** | **高**（二周目进度丢失） | 二周目 `stage` 重置为 1 → `progressScore` 低于一周目 → 云端旧档赢 → 二周目被覆盖。必须把 `ngPlusCount` 纳入评分（权重 ≥ 1e6），**且 web 与 api 两端同步改**（服务端权威重算）。补跨端一致性用例 |
| **R8** | **前后端进度分漂移** | 中 | 中 | `progressScoreOf`（`lib/cloud.ts:38-49`）与 `computeProgressScore`（`api/lib/progress.ts:11-21`）是**两份手抄实现**。加支线计数 + 周目数权重时要同时改，且**加一条跨端用例**（同输入同输出）。**长期建议**：下沉到 game-core 一份实现，web/api 都 import |
| **R9** | **阶段 3 步骤的硬保底 throw** | 中 | **高**（运行时卡死） | `world.ts:458-462`：requires 的标签若在任何区域池都不存在 → `distribute` throw → store 兜底后地面不刷新 → 玩家卡住。→ requires 的标签必须来自池内已有标签（10 个），且池内来源 ≥2 |
| **R10** | **A1 打破既有测试** | **高** | 低（但会误判为「回归」） | `search.test.ts:73`（阶段 3 无标签目标）与 `resolve.test.ts:109`（`at(3,0)` 自合）会直接红。**必须改写断言，不能删用例**。`playthrough.test.ts` 的 `while (state.stage < 3)` 不覆盖阶段 3 → 新写模拟 |
| **R11** | **阶段 3 走完 3 步后的阶段跃迁语义未定义** | **高**（现在就是空白） | 中 | `state.ts:204` 现在只处理 stage 1/2。阶段 3 走完 → 到 stage 4？还是解锁支线？`Progress.stage` 已有 `4` 这个成员（`types.ts:110`）但**全代码无任何地方产生 stage 4**。**产品必须在 A1a 之前拍板**，否则 state.ts 会写出一个语义不清的分支 |

---

## 8. 待产品 / 主理人拍板的问题（工程侧无法自行决定）

1. **阶段 3 的 3 步目标链走完之后，玩家进入什么状态？**
   直接进 stage 4（自由模式）？还是解锁四条支线？还是有别的？
   （`types.ts` 里 `Progress.stage` 已预留 `4` 但从无实现。）
2. **「自由模式」是随时可选，还是完成任一分支后可选？**
   现状 `availableEndings` L369 是无条件 push，与 SPEC §4.1 表述不一致。
   加第四条支线前必须统一口径，否则结局入口会出现 5 个（4 支线 + free）且规则不明。
3. **第四条支线「留下来」完成时是否即刻进结局？**
   现状 `state.ts:265` 的规则是「非飞船支线完成即进结局」——
   但「留下来」作为支线名，语义上更像是**自由模式的具象化**，
   若它也即刻进结局，会与 `free` 结局重叠。建议：`BranchDef` 加 `autoEnding: boolean` 字段。
4. **二周目保留什么？** 纪念品（`keepsakes`）保留还是清空？
   `endingsCollected` / `logReadIds` 保留是确定的。
5. **前任日志的规模**：几篇？每篇多长？
   影响包体估算与「是否要做分页/懒加载」。当前估算按「8 篇 × ~1KB 中文」。

---

## 附录 A：本次评估用到的可复算脚本

截胡矩阵的复算方法（不落盘，一次性 `node -e` 即可）：

```js
// 1. 解析 items.ts / recipes.ts / stages.ts（正则抠字面量，同 check-content.mjs 做法）
// 2. slotIds = BRANCHES 里所有 requires 候选 id
// 3. 对每个「标签对 p」（含同标签）：
//    hits = RECIPES.filter(r => slotIds.has(r.out) &&
//             p.every(t => union(tags(r.a), tags(r.b)).includes(t)))
// 4. hits.length >= 4 → 禁用；1..3 → 高危；0 → 安全
```

**重要**：这份矩阵基于**当前 33 件可捡物品 + 36 条配方**。
A2/A3 新增物品与配方后**必须重算**——
新增的「合成产物」如果落在支线槽位上，会让原本安全的标签对变成高危。
**建议把这段逻辑固化进 `scripts/check-content.mjs`，作为新断言 E**
（「阶段 3 目标链不得截胡支线产物」），这样以后加内容自动拦截，而不是靠人记。✅

## 附录 B：关键行号速查

| 主题 | 文件:行 |
|---|---|
| 阶段目标判定点 | `packages/game-core/src/resolve.ts:61` |
| 阶段闸门（挡住 stage 3） | `packages/game-core/src/resolve.ts:55-57` |
| 优先级链（注释） | `packages/game-core/src/resolve.ts:34-43` |
| 搜索保底闸门（挡住 stage 3） | `packages/game-core/src/search.ts:34-40` |
| 硬保底 throw | `packages/game-core/src/world.ts:458-462` |
| `SHIP_BRANCH` 单例 | `packages/game-core/src/stages.ts:118` |
| `BRANCHES` / `ENDINGS` | `packages/game-core/src/stages.ts:86-115` / `123-130` |
| 强行起飞 50% | `packages/game-core/src/launch.ts:46-51` + `stages.ts:121` |
| `ks_fail` 纪念章发放 | `packages/game-core/src/state.ts:308-310` |
| 支线完成 → 结局映射 | `packages/game-core/src/state.ts:265` |
| `availableEndings`（自由模式判定） | `packages/game-core/src/state.ts:363-371` |
| `createInitialState` branches key | `packages/game-core/src/state.ts:30` |
| `SaveState` 类型 | `packages/game-core/src/types.ts:143-159` |
| `BranchId` / `EndingId` | `packages/game-core/src/types.ts:42` / `40` |
| `SAVE_SCHEMA = 2` | `apps/web/src/store/gameStore.ts:53` |
| 读档 schema 校验（丢弃） | `apps/web/src/store/gameStore.ts:171` |
| `readTutorial`（T7 归一化先例） | `apps/web/src/store/gameStore.ts:119-135` |
| `fromCore` 适配器 | `apps/web/src/store/gameStore.ts:81-99` |
| `commit()` 唯一持久化出口 | `apps/web/src/store/gameStore.ts:315-320` |
| `newGame` / `resetAll` | `apps/web/src/store/gameStore.ts:340-367` / `702-728` |
| `progressScoreOf` | `apps/web/src/lib/cloud.ts:38-49` |
| 服务端权威评分 | `apps/api/src/lib/progress.ts:11-21` |
| zod 存档 schema | `apps/api/src/types.ts:13-40` |
| check-content 断言 A / B | `scripts/check-content.mjs:75-95` / `97-106` |
| check-assets 断言 A–D | `scripts/check-assets.mjs:144-179` / `181-200` / `202-214` / `216-238` |
| 首屏 gzip 基线 | `docs/perf/PERF-REPORT-v2.md:83,96` |
