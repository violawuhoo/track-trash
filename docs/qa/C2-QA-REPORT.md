# C2 批次（二周目 + 图鉴）独立 QA 复验报告

- **复验对象**：C2 批次 8 个 commit（`be3eac5` → `b17dbaf` → `15cfa31`），**尚未 push**
- **复验人**：独立 QA（未参与开发）
- **复验日期**：2026-10-22
- **工作区**：`C:\Users\E14\WorkBuddy\好垃`
- **源码状态**：复验全程未修改任何产品源码（变异测试的临时改动已全部 `git checkout` 恢复，见第 4 章）

---

## 1. 结论

### 有条件通过

C2 批次的核心机制**全部实测通过**，没有发现 blocker 级缺陷：

- 二周目不会被云端旧档覆盖（纯函数层 + 真实 Fastify 端到端双向验证）
- 主菜单「重新开始」档案全项保全，三个镜像在所有改动 `save` 的路径上同步
- 「留在这里继续」不清档；`branches.stay` 残留**不构成状态不一致缺陷**（详见 §2.3 的实测结论）
- 二周目内 8 条日志载体全部可达（自写随机模拟，60 局）
- 护栏断言确实在跑（4 条变异全部被捕获）

但有 **1 条 major**（确认页「重置」段漏列 `crafts` / `logsFound`，玩家会低估二周目收集难度）和 **4 条 minor**（G4 文案矛盾、两处清单漏列、GDD 文档不同步）。另有一条**流程性 major**：`apps/api` 的测试基建存在会把数据写进仓库本地库的问题（见 §2.5）。

**建议**：major 项修完再进 push；minor 项可在文案定稿轮一并处理。

### 分级问题统计

| 级别 | 数量 | 编号 |
|---|---|---|
| blocker | 0 | — |
| major | 2 | M-1、M-2 |
| minor | 4 | m-1 ~ m-4 |

---

## 2. 问题清单

### M-1（major）确认页「重置」段漏列 `crafts` 与 `logsFound`，玩家会低估二周目的收集难度

**位置**：`apps/web/src/components/NgPlusConfirm.tsx:125-132`（重置段）、`packages/game-core/src/ngplus.ts:195-196`（实际重置逻辑）

**复现步骤**：

1. 完成任意结局，进入结局页 → 点「开始二周目」→ 打开确认页
2. 观察「重置」段，只有三条：
   - 背包、地面上的东西、天数
   - 阶段进度与已完成的支线
   - 意外次数与这一周的世界日志
3. 对照 `packages/game-core/src/ngplus.ts:195-196`，`startNextCycle` 实际还重置了：
   ```ts
   crafts: 0,        // 合成计数
   logsFound: [],    // 本周目载体记账
   ```

**实际结果 vs 期望结果**：

- **实际**：确认页未提及「合成次数会清零」「本周目已获得的日志载体记录会清零」。
- **期望**：确认页的职责是「把 GDD §7.1 的保留 / 重置清单原样列出来（不夸大、不缩小）」（该文件自身第 14 行的注释就是这么写的）。`crafts` 归零直接影响两条日志的解锁条件——L1 需要 `crafts >= 3`、L5 需要 `crafts >= 14`（见 `packages/game-core/src/logs.ts`）；玩家看完确认页会以为二周目能立刻重读 L1–L5，实际上要重新攒 3 次 / 14 次合成。`logsFound` 归零直接影响图鉴「本周目已获得」三态（`CodexPanel.tsx` 用 `logsFound.includes` 判定 `carried`）。

**影响**：二周目是本批次的主推功能，确认页是唯一的「不可逆操作告知」界面。漏列会让玩家在低预期下进二周目，发现 L1–L5 突然看不了，产生「被偷走进度」的体感——与该页存在的目的相反。

**建议修法**：在「重置」段补两条，建议合并为一句以免列表过长：
```jsx
<li>合成次数，和这一周已经捡到的日志载体</li>
```
同时补 `docs/design/CONTENT-v3-GDD.md:698` 的重置清单（见 m-4）。

---

### M-2（major）`apps/api` 测试基建会把数据写进仓库内的本地库，造成跨次运行假红

**位置**：`apps/api/src/db/client.ts:35`（顶层 `await init()`）、`apps/api/src/env.ts:22`（`SQLITE_FILE` 默认 `data/saves.db`）

**复现步骤**（QA 实际踩到）：

1. 写一个 api 端到端测试，在**静态 import** 之前设 `process.env.SQLITE_FILE = <临时目录>/saves.db`
2. `import { buildApp } from '../src/app.js'`（静态 import）
3. 第一次跑：全绿（库是空的）
4. 第二次跑：**红**——`A-E2 expected 3 to be 1`、`A-E3 expected 3 to be 1`、`A-E4 expected 2032260 to be 2011005`

**实际结果 vs 期望结果**：

- **实际**：测试写的不是临时库，而是仓库内的 `apps/api/data/saves.db`（该目录被 `.gitignore:15` 忽略，所以 `git status` 看不到，但文件是真实存在的开发数据）。第二次跑时残留的旧档参与冲突裁决，导致断言红。QA 第一次跑 5/5 绿、第二次跑 3 红，**同一个文件两次结果不同**。
- **期望**：测试用 `SQLITE_FILE` 指向临时库，跨次运行结果一致。

**根因**：`apps/api/src/db/client.ts` 在模块顶层 `await init()`，`init()` 内部读 `env.SQLITE_FILE`；而 `env.ts` 用 zod 在模块加载时就把 `SQLITE_FILE` 固化。ESM 的静态 import 会被提升到文件顶部的 `process.env.SQLITE_FILE = ...` **之前**执行 —— 于是赋值根本没生效。

**影响**：
- 任何后续 api 端到端测试都会踩同一个坑，且失败现象是「断言红」而非「路径错」，**极易被误判为产品缺陷**（QA 自己第一反应就是这个）。
- 会持续污染开发方的本地开发库 `apps/api/data/saves.db`（该库当前有 189 行开发数据）。

**建议修法**：
- 测试侧：改用动态 import（QA 已验证有效）：
  ```ts
  process.env.SQLITE_FILE = join(tmp, 'saves.db');
  const { buildApp } = await import('../src/app.js');
  const { closeDb } = await import('../src/db/client.js');
  ```
- 基建侧（更彻底）：给 `apps/api` 加一个 `vitest.config.ts` 的 `setupFiles`，在那里设 `process.env.SQLITE_FILE`，让所有 api 测试默认走临时库。**或者**在 `apps/api/package.json` 的 `test` 脚本里加 `--setupFiles`。
- 顺带建议把 `apps/api/data/` 从「开发数据目录」改为明确文档化（它被 gitignore 忽略了，但仍是共享状态）。

> QA 已清理自己写入的那一行（`device_id = aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`），其余 189 行开发数据未动。

---

### m-1（minor）G4 增益文案与实际实现措辞矛盾

**位置**：`apps/web/src/components/NgPlusConfirm.tsx:61` vs `apps/web/src/store/gameStore.ts:645-648`

**复现步骤**：读这两处。

**实际结果 vs 期望结果**：

| 位置 | 文案 |
|---|---|
| `NgPlusConfirm.tsx:61` | 「第一天捡到会唱歌的石头时，它会**多唱一句**给你听。」 |
| `gameStore.ts:645-648`（实现） | 「它今天唱得**比上次少一遍**，不知道为什么。」 |
| `CONTENT-v3-GDD.md:709`（原文） | 「多**一句**『它今天唱得比上次少一遍，不知道为什么』」 |

GDD 说的是「多一句**文案**」，`NgPlusConfirm` 把它误写成了「多**唱**一句」——玩家读到会期待歌曲变长，实际实现是变短。方向完全相反。

**建议修法**：改成「第一天捡到会唱歌的石头时，它会多**一句**没唱完的抱怨。」或直接照抄实现原文。

---

### m-2（minor）确认页「保留」段漏列 `ngPlus.branchesHistory`

**位置**：`apps/web/src/components/NgPlusConfirm.tsx:116-122`（保留段）

**实际结果 vs 期望结果**：

- **实际**：保留段只列三项（已解锁的结局 / 读过的前任记录 / 纪念品）。但 `startNextCycle` 实际还保留了 `ngPlus.branchesHistory`（`ngplus.ts:203` 的 `np` 继承自 `state.ngPlus`）。
- **期望**：按该页自己的口径（「原样列出来」），应补一条「走过哪条支线」。

**定级理由**：定 minor 而非 major，因为「本周目增益」段的 G3 条目已经写了「走过哪条支线会被标出来——但还是得重新做一遍」，玩家仍能间接得知这一信息会跨周目保留。属于「表述可更完整」而非「信息缺失」。

---

### m-3（minor）G2 三步示例共用同一件材料 `battery`，易被误读为步骤依赖

**位置**：`packages/game-core/src/ngplus_gain.ts:68-73`

**复现步骤**：

1. 二周目第 1 天，坠毁点拾取
2. 按 G2 提示的 s1-1 建议合成 `battery + tape` → **`battery` 被消耗**
3. 推进到 s1-2，提示写「漏气电池（导电）配撬棍（金属）」——但 `battery` 已不在背包

**实际结果 vs 期望结果**：

- **实际**：三条示例都点名 `battery`（s1-1 `battery+tape`、s1-2 `battery+crowbar`、s1-3 `manual+battery`）。玩家可能理解为「battery 是这三步都要用的东西」。
- **期望**：三步示例各自独立，不共享同一件消耗品，避免误导。

**不构成缺陷的证据（已实测）**：

- 文案说了「同一类里换别的也行」——**确实兜得住**。坠毁点 base 池里 导电来源 2 件（`wrench` / `battery`）、金属 2 件（`wrench` / `crowbar`）、粘 2 件（`tape` / `ducttape`）、知识 2 件（`manual` / `photo`），每类都有 ≥2 个可选 base。
- `wrench` 同时带 导电+金属 → s1-2 的 `[导电,金属]` 可由 `wrench + 任意一件` 满足。
- `distribute()` 对「当前步骤缺的标签」有**硬保底**（`packages/game-core/src/world.ts:441`），地面必定刷出带该标签的物品。

**建议修法**：把 s1-2 改成 `wrench + crowbar`？不行——`wrench` 带 导电+金属、`crowbar` 带 金属+能推，F4 断言要求两件各贡献一个必需标签，s1-2 的 requires 是 `[导电,金属]`，`crowbar` 贡献不了「导电」也不贡献不了「金属」？它带金属，贡献「金属」，`wrench` 贡献「导电」——但 F4 还要求「两件合起来覆盖全部要求」→ `wrench`(导电+金属) + `crowbar`(金属+能推) 覆盖 {导电,金属} ✓。可行但让 `crowbar` 承担双重语义。更简单的做法：**保持现状，文案里把「同一类里换别的也行」改成更前置的表述**，例如「这一步要『导电』和『金属』——两样各来一件，同类里换别的也行」（先说标签方向，再给例子），降低玩家对具体物品 id 的依赖。

---

### m-4（minor）GDD §7.1 重置清单与 C1/C2 实现不同步

**位置**：`docs/design/CONTENT-v3-GDD.md:696-700`

**实际结果 vs 期望结果**：

GDD §7.1 的重置清单写的是：
> `bag` / `discovered` / `day`(=1) / `areaId`(=crash) / `scene` / `stage`(=1) / `stepIndex`(=0) / `branches` / `accidents` / `log`(世界日志) / `ending`(=null) / `launchAttempts` / `launchFailures`。

而 `packages/game-core/src/ngplus.ts:194-196` 实际还重置了 `buildDone`(=false)、`crafts`(=0)、`logsFound`(=[])。`ngplus.ts:174-179` 的注释里已说明这是「C1 落的两项」，但 GDD 文档没跟上。

**建议修法**：同步 GDD §7.1 的重置清单，补上 `buildDone` / `crafts` / `logsFound`（与 M-1 是同一件事的两面：M-1 是 UI 漏，GDD 漏是文档漏）。

---

## 3. 逐项验证结果（A–F）

### A. 二周目不会被云端旧档覆盖 —— ✅ 通过（双层实测）

**评分公式**（`packages/game-core/src/progress.ts`，唯一实现）：
```
progressScore = cycle * 1_000_000 + stage * 10_000 + stepIndex * 1_000 + branchesDone * 200 + day
```

#### A-1 纯函数层（`apps/api/tests/zz-qa-a.test.ts`，7/7 绿）

| 断言 | 内容 | 实测值 |
|---|---|---|
| A1 | 一周目上限 vs 二周目起点 | `cycle1max = 1033900` < `cycle2start = 2010001` → **二周目必赢**，差 10 倍量级 |
| A2 | `normalizeNgPlus(true).cycle` vs `cycleOfNgPlus(true)` | 两侧均 **2** → 一致 |
| A3 | web `progressScoreOf` vs api `computeProgressScore`（`ngPlus: true`） | 两侧均 **2021212** → 一致 |
| A4 | 对象形态 `ngPlus: {cycle:2,...}` | 两侧均 **2021212** → 一致 |
| A5 | 缺 `branches.stay` 键的老存档 | 两侧均 **1010003** → 一致 |
| A6 | 同 cycle 内更靠后 `2032260` vs 新档 `2010001` | 旧档赢 → **证实 `newGame` 必须保留 `clearCloudSave()`** |
| A7 | 布尔 `true` vs 其归一化对象 `cycle:2` | 均 **2010001** → **web 归一化后回传 api 不产生分数漂移** |

A2 是用户点名的「两端必须一致」：实测 `normalizeNgPlus(true).cycle = 2` 与 `cycleOfNgPlus(true) = 2` **数值完全相同**。

#### A-2 端到端（`apps/api/tests/zz-qa-e2e.test.ts`，真实 Fastify `app.inject()`，5/5 绿）

```
A-E1 PUT c1 score= 1033880                              ← 一周目后期档上云
A-E2 PUT c2 score= 2010001 | 云端现存的 cycle = 2 | stage = 1 | day = 1   ← 二周目新档上云，必须赢
A-E3 GET score= 2010001 cycle= 2 stage= 1 day= 1        ← 拉回来还是二周目档，没被一周目旧档覆盖
A-E4 PUT ngPlus=true → score= 2011005 | winner cycle = true   ← 布尔老存档，服务端按 cycle=2 算分
A-E5 新档 score= 2032260 | 服务端保留的 stage = 3 day = 60 → 旧档赢（=预期，说明 newGame 必须清云端）
```

**结论**：正向（二周目覆盖一周目）与反向（同 cycle 靠后档胜出）都符合设计。服务端裁决逻辑在 `apps/api/src/routes/saves.ts`（`computeProgressScore` 权威重算，`score > existing.progressScore` 才覆盖）。

> 备注：本次 e2e 测试第一次跑 5/5 绿、第二次跑 3 红。**原因是我自己测试文件的缺陷（ESM import 提升导致 `SQLITE_FILE` 未生效），不是产品缺陷** —— 已升级为 M-2 记录。

#### A-3 反向验证的必要性

A6 / A-E5 证明了「同 cycle 内更靠后的档会赢」。这不是缺陷，而是 `newGame()` 里 `clearCloudSave()` 存在的**必要理由**——若不主动清云端，主菜单「重新开始」的新档永远赢不过云端旧档，下次启动会被原样覆盖回来。`gameStore.ts:544-546` 的注释与这个实测一致。

#### A-4 已知问题 1 的复核：`newGame` 是否读 `get().save.ngPlus`

`apps/web/src/store/gameStore.ts:525` 实测为 `base.ngPlus = get().archive;` —— ✅ **已修好**。`gameStore.ts:530` 同样读 `get().archiveKeepsakes`。注释里明确写了「不能读 `get().save.ngPlus`」及其原因（主菜单时 `save` 还是空档案）。

### B. 主菜单「重新开始」的档案保全 —— ✅ 通过（自写 store 级实测 4/4 绿）

#### B-1 路径清单核对（逐条列举，未只信 commit 说明）

改动 `save` 的全部路径：

| # | 路径 | 写法 | 三镜像同步 |
|---|---|---|---|
| 1 | `commit(save, extra)` | `set({save, world, archive: save.ngPlus, archiveKeepsakes: save.keepsakes, archiveLogsFound: save.logsFound, ...extra})` | ✅ 自动同步（`gameStore.ts:472`） |
| 2 | `collect` / `craft` / `refreshWorld` / `doLaunch` / `chooseEnding` / `startNewCycle` / `continueAfterEnding` / `readLog` | 都走 `commit` | ✅ 自动同步 |
| 3 | `newGame()` | `set` | ✅ 显式同步（`gameStore.ts:553-555`） |
| 4 | `continueGame()` | `set` | ✅ 显式同步（`gameStore.ts:582-584`） |
| 5 | `resetAll()` | `set` | ✅ 显式清空（`gameStore.ts:1070-1072`） |
| 6 | `syncFromCloud()` 两处 | `set` | ✅ 显式同步（`gameStore.ts:1023-1025` / `1041-1043`） |
| 7 | `setMoveTarget()` | 只改内存 `tutorial` | ✅ 不碰 ngPlus/keepsakes/logsFound，无需同步 |

**结论：三个镜像（`archive` / `archiveKeepsakes` / `archiveLogsFound`）在所有改动 `save` 的路径上都同步，未发现遗漏。**

#### B-2 store 级实测（`apps/api/tests/zz-qa-b.test.ts`，4/4 绿）

- **B-1**：localStorage 造一个「已经二周目、读过 3 篇日志、走过 2 条支线、拿过 2 件纪念品、本周目捡到 2 个载体」的存档 → 启动（主菜单）→ 点「重新开始」→
  - `save.ngPlus`：`cycle=2` / `endings=['stay','teashop']` / `readLogs=['L1','L3','L5']` / `branchesHistory=['ship','stay']` **全部保留** ✅
  - `save.keepsakes = ['ks_signal','ks_stay']` **保留** ✅
  - 三个镜像全部同步 ✅
  - `ngPlusUnlocked(archive) === true` → **二周目入口仍在** ✅
  - 图鉴数据源 `archive.endings` 含 `stay`、`archive.readLogs` 含 `L3` → **图鉴内容还在** ✅
  - `save.logsFound = []`、`day=1`、`stage=1`、`stepIndex=0`、`ending=null`、`branches` 全 false → **本周目确实重置** ✅
- **B-2**：`newGame` → `continueAfterEnding` → `startNewCycle` 每一步后镜像都同步；`startNewCycle` 后 `archive.cycle` 从 2 → **3**，但 `readLogs` / `endings` / `branchesHistory` / `keepsakes` 仍保留 ✅
- **B-2**：`continueGame` 读档后镜像同步 ✅
- **B-2**：`resetAll` 后三镜像全清（`cycle` 回到 1、`endings`/`readLogs`/`branchesHistory` 空、`keepsakes`/`logsFound` 空）✅

### C. 「留在这里继续」必须不清档 —— ✅ 通过（含用户点名的残留问题结论）

#### C-1 不清档（实测）

`packages/game-core/src/ngplus.ts:224` 的 `continueAfterEnding` 只做两件事：`ending: null` + 追加一条系统日志。`apps/web/src/store/gameStore.ts:959` 走 `commit`，**不调 `resetAll`**（`resetAll` 会调 `localStorage.removeItem` + `clearCloudSave`，实测 `localStorage.removeItem` 调用次数 = 0）。

`packages/game-core/tests/zz-qa-c.test.ts`（6/6 绿）：
- `ending` 清 null ✅
- `keepsakes` / `ngPlus`（`endings`/`readLogs`/`branchesHistory`）/ `branches` / `logsFound` 全保留 ✅
- `ending` 已为 null 时是**幂等**的（返回同一个对象引用，不做无谓写入）✅

#### C-2 用户点名的问题：`branches.stay: true` 残留是否造成状态不一致？

**实测结论：不会造成状态不一致。属于「语义冗余」，判 minor / 观察项，非 blocker。**

三条证据：

1. **支线面板显示「本周目完成」是事实描述，不是错误。** `apps/web/src/components/BagDrawer.tsx:172` 读 `branches[b.id] === true` → 残留后仍显示「本周目完成」。但玩家**确实**在本周目完成了 stay 支线 —— 事实正确。G3「上次走过」用的是 `ngPlus.branchesHistory`（跨周目来源），两态不冲突：「本周目完成」优先显示，「上次走过」是补充（`branchesHistory.includes(b.id)` 且 `!done`）。

2. **结局页再次可达，但不会重复发放任何东西。** `availableEndings`（`packages/game-core/src/state.ts:455`）对 `state.branches[b.id] && b.id !== 'ship'` 仍 push `b.ending` → `stay` 结局仍在可选列表里，玩家可再次进入结局页。这是**可重复进入同一结局的正常流程**（`free` 结局同样可重复进入）。
   关键：**core `craft()` 的支线检查是 `if (status.done && !next.branches[status.id])`**（`state.ts:313`）—— `branches.stay` 已是 `true` → **不会重复写 `ending`、不会重复发纪念品、不会重复 `recordEnding`**。
   实测（`zz-qa-c.test.ts` C-2）：
   - 残留组（`branches.stay=true`）：合成后 `r.ending === undefined`、`state.ending === null`、`keepsakes` 仍 `['ks_stay']`（未重复追加）、`ngPlus.endings` 仍 `['stay']`（未重复）✅
   - 对照组（`branches.stay=false`）：同样条件下合成**会**正常触发 `ending='stay'` + 发 `ks_stay` + `recordEnding('stay')` ✅
     （两组都必须用**无关材料** `tape + sandwich` 触发合成 —— 若用 `staykey + landdeed` 合成会把 stay 槽位消耗掉，导致对照组也不触发，这是我第一版测试写错的地方，已修正。）
   - `recordEnding` 本身幂等：重复 record `stay` → `endings` 仍 `['stay']`（`zz-qa-c.test.ts` C-4）✅

3. **残留会被下一个新周目清掉。** `startNextCycle` 重置 `branches` 全 false（`zz-qa-c.test.ts` C-3 实测 `after.branches.stay === false`），且 `endings`/`readLogs`/`branchesHistory`/`keepsakes` 保留。

**结论**：玩家点「留在这里继续」→ 自由模式里支线面板仍显示 stay「本周目完成」、结局页可再次进入 stay —— 这两件事描述的是**同一个事实**，语义自洽。真正会出问题的场景是「残留导致重复发纪念品 / 重复写 ending / 图鉴出现重复项」，**实测均未发生**。

**唯一可提的观察点**（不改代码，仅记录）：`branches` 的语义在「留在这里继续」后是「本周目已完成的支线」，而 `branchesHistory` 也是「这辈子走过的支线」——两者在「留在这里继续」后**完全重合**（`recordBranch` 在支线达成时同时写 `branches[b.id]=true` 和 `branchesHistory.push(b.id)`）。因此 G3「上次走过」在**同一周目内**永远不会显示（`done` 恒为 true，第二个条件 `!done` 不成立）。这是设计如此（同一周目不需要提示「上次走过」），但如果将来想让 G3 在一周目内也有表现，需要另立字段。**不作为缺陷。**

### D. 二周目内 8 条日志载体的可达性 —— ✅ 通过（自写随机模拟，60 局）

**模拟器**：`packages/game-core/tests/zz-qa-sim.test.ts`（我自写，未复用 `world.test.ts` 现成用例）。走完整链路：`distribute()` → `sweep()` 捡取 → `craft()` → 重刷地面；seeded RNG（mulberry32）。

**三种策略 × 20 种子**：

| 策略 | 结果 | 说明 |
|---|---|---|
| A-mainline-first（先推主线到 `buildDone`，再回头收日志） | **19/20 全 OK** | 1 例（seed=15）缺 `log_b1`，跑到 600 回合上限仍缺（`buildDone=true` 已达成）→ 属模拟器耐心边界，非游戏硬缺陷 |
| C-random（随机选材合成） | **20/20 全 OK** | `day` 范围 23–66，`buildDone=true` 全部达成 |
| B-logs-first（只收日志不推主线） | **0/20** | **策略产物，非缺陷** —— 不推主线 → `market`/`cave` 永不解锁 → 依赖这些区域的载体（L4/L5/L6/L7/L8）永远拿不到材料。这是「材料按阶段解锁」的自然结果 |

**8 条载体的依赖闭包（实测输出）**：

| 载体 | 日志 | base 材料 | 中间产物 |
|---|---|---|---|
| `log_page1` | L1 | `manual@crash`, `photo@crash` | — |
| `log_map2` | L2 | `lamp@crash`, `lottery@junkyard` | — |
| `log_page2` | L3 | `manual@crash`, `broom@junkyard` | — |
| `log_map1` | L4 | `manual@crash`, `mirror@market` | — |
| `log_chip1` | L5 | `homework@market`, `battery@crash`, `lottery@junkyard` | `switchpanel` |
| `log_q1` | L6 | `echo@cave`, `broom@junkyard`, `poker@cave` | `hourglass` |
| `log_b1` | L7 | `firework@junkyard`, `tape@crash`, `crystal@cave` | `warnlamp` |
| `log_reel1` | L8 | `crowbar@crash`, `fuel@market`, `note@market` | `generator` |

**阶段目标截胡实测**：`log_page1` 的 `manual+photo` 在 stage2/step0 被截胡成 `windbreak`；`log_map2` 的 `lamp+lottery` 在 stage2/step2 被截胡成 `shelter` —— **但推进到 `buildDone` 后全部可合成**（⑧e 覆盖的正是这条）。

**`readLogs` 保留时不需要载体**：实测 `logsFound=[]` + `readLogs` 含 8 篇 → `readableLogs` 返回 `L1..L8` 全部可读 ✅。这正是 G1 的语义。

**`crafts` 归零后的解锁条件可达性**：二周目 `crafts` 从 0 起、每次合成 +1 天 → `crafts>=14`（L5）需 ≥14 次合成、`day>=20`（L7）需 ≥19 次合成。实测 A 策略 `day` 最高到 521，**100 天档的时间预算内充裕**。

> 附注：本次模拟的 v1 版本有 bug（依赖规划器用了错误的多重比较 `r.result.output === cc[1] === side`），且「先收日志」策略从不动主线导致永远停在 stage 1/2 → 产生 `log_chip1`/`log_b1` 假性不可达。已整体重写为 v2（`PRODUCER` 映射 + `closureOf()` 自底向上算依赖闭包 + `resolveMix` 校验实际产物）后结果可信。

### E. 断言是否真在跑（变异测试）—— ✅ 4/4 变异全部被捕获

详见第 4 章。

### F. 其它自由发挥 —— 全部通过，3 条 minor 已列入 §2

| 检查项 | 结论 |
|---|---|
| `CodexPanel.tsx` 三态判定 | ✅ **正确**。`readLogs.includes` → `'read'`；`logsFound.includes` → `'carried'`；否则 `'unknown'`。**没有把 `logsFound` 误当「已读」**。结局格用 `archive.endings.includes`，未解锁显示「？？？」+「还没走到这条路上。」，**未泄露剧透** |
| `BagDrawer.tsx` 支线面板三态 | ✅ **正确**。`branches[b.id] === true` → 「本周目完成」；`!done && branchesHistory.includes(b.id)` → 「上次走过」；否则无标记。三态互斥且优先级正确 |
| 结局页 `cycle === 1` vs `>= 2` 文案切换 | ✅ **正确**。`archive.cycle >= 2 ? '开始新的周目' : '开始二周目'` |
| 结局页 `!ending` 兜底 | ✅ **正确**。显式报「结局数据缺失」并提供 `resetAll` 入口，**不静默兜底成 free**（静默兜底会让玩家看到错误的结局） |
| `canStayHere` 范围 | ✅ 只对 `stay` / `free` 结局开放（`EndingScreen.tsx`） |
| `NgPlusConfirm` 增益 G1–G4 四条 | ⚠️ G4 文案矛盾 → **m-1** |
| `NgPlusConfirm` 保留/重置段 | ⚠️ 重置段漏列 → **M-1**；保留段漏列 → **m-2** |
| `ngplus_gain.ts` G2 标签方向提示 | ✅ 文案确实是「标签方向」不是「配方步骤」；`F4` 断言（两件各贡献一个必需标签）实测能拦住退化；「换别的也行」确实兜得住 → 但三步共用 `battery` 有误导性 → **m-3** |

---

## 4. 变异测试记录

**方法**：临时改产品源码 → 跑对应 vitest → 确认目标断言变红 → `git checkout -- <文件>` 恢复 → 复核 `git status` 干净。

### M-1 删除 `crowbar + fuel → generator` 配方

- **改了什么**：`packages/game-core/src/recipes.ts:60` — 删除 `{ a: 'crowbar', b: 'fuel', out: 'generator' }`
- **命令**：`cd packages/game-core && npx vitest run tests/stage3.test.ts tests/ngplus.test.ts`
- **结果**（**4 failed | 38 passed**）：

```
× G1 每件载体的依赖链末端都是可捡的基础物品
  → log_reel1 的叶子 generator 必须是 base: expected 'mid' to be 'base'
× ⑦ R7 / R8 / R9 三条精确配方在阶段 3 之前可命中
  → expected 'accident' to be 'recipe'
× ⑧f 载体的完整依赖链：每层非 base 节点都可合成，且每阶段都有可命中步位
  → expected [ Array(1) ] to deeply equal []
× ⑧g 正向可达性：每件载体都能从可捡的基础物品有限次合成得到（闭包证明）
  → expected [ 'log_reel1 无法从可捡的基础物品有限次合成得到' ] to deeply equal []
```

- **结论**：**⑧f、⑧g、G1 三条断言全部命中**。这正面证实了「⑧f 曾有『查不到产出处就当 base』的盲区」**已修好** —— 用 `items.ts` 的 `kind` 判定后，`generator`（`kind='mid'`）不再被跳过。
- **观察**：⑧d 未红（符合其口径 —— ⑧d 只验载体的**直接**配方，不看中间层）。
- **恢复**：`git checkout -- packages/game-core/src/recipes.ts` → `git status --short packages/game-core/src/` 输出为空 ✅

### M-2 删除 G2 文案里的「换别的也行」

- **改了什么**：`packages/game-core/src/ngplus_gain.ts:102` — 「同一类里换别的也行。」→「照着做一定能过。」
- **命令**：`cd packages/game-core && npx vitest run tests/ngplus.test.ts`
- **结果**（**1 failed | 26 passed**）：

```
× F5 文案给出标签方向而不是配方步骤
  → expected '比如：漏气电池（导电）配 胶带（粘）—— 这一步要「导电」和「粘」，照着做…' to contain '换别的也行'
```

- **结论**：F5 命中。**F5 是真在跑的** —— 它同时守住了 GDD §7.1 固化的口径「不得承诺『照着做一定能过』」。
- **恢复**：`git checkout -- packages/game-core/src/ngplus_gain.ts` ✅

### M-3 把 s1-2 示例退化为「凑数材料」

- **改了什么**：`packages/game-core/src/ngplus_gain.ts:71` — `'s1-2': ['battery', 'crowbar']` → `['battery', 'tape']`（`tape` 只带「实体/粘」，对 s1-2 的 requires `[导电,金属]` 一个标签都贡献不上）
- **命令**：`cd packages/game-core && npx vitest run tests/ngplus.test.ts`
- **结果**（**4 failed | 23 passed**）：

```
× F1 三个阶段 1 步位都有示例      → expected null not to be null
× F3 示例里的物品都在坠毁点能捡到  → Cannot read properties of null (reading 'a')
× F4 每件示例材料都贡献该步的一个必需标签 → Cannot read properties of null (reading 'a')
× F5 文案给出标签方向而不是配方步骤 → Cannot read properties of null (reading 'text')
```

- **结论**：F4 命中。
- **附带观察**：这次变异的红因是**运行时 guard 先拦截**（`pairingExample` 在 `!tagB` 时返回 `null`，`ngplus_gain.ts:96`）→ F1/F3/F4/F5 全部因 `null` 而红，而非 F4 自己的「凑数材料」判据生效。这说明 F4 的**判据本身**在当前实现下**几乎不可能被单独触发**——因为运行时 guard 保证了「tagA 和 tagB 必然各贡献一个 requires 标签」。F4 是一道**冗余但正确的护栏**（它守的是「未来有人放宽运行时 guard 时这条判据还在」），不是空跑。
- **恢复**：`git checkout -- packages/game-core/src/ngplus_gain.ts` ✅

### M-4 阶段目标判定从「覆盖」放宽为「任一标签命中」

- **改了什么**：`packages/game-core/src/resolve.ts:64` — `step.requires.every((r) => tags.includes(r))` → `step.requires.some((r) => tags.includes(r))`
- **命令**：`cd packages/game-core && npx vitest run tests/stage3.test.ts`
- **结果**（**5 failed**，其中 ⑧d 命中）：

```
× ⑦ R7 / R8 / R9 三条精确配方在阶段 3 之前可命中
× ⑧ 阶段 3 目标链不截胡支线产物配方（各槽位候选品逐条验证）
× ⑧c 支线候选品的「材料配方」也不被阶段目标截胡（闭包护栏）
  → expected [ …(49) ] to deeply equal []   （49 条截胡明细）
× ⑧d 前任日志载体不被阶段 1 / 2 的目标链永久截胡（8 件逐条验证）
  → expected [ …(7) ] to deeply equal []     ← ⑧d 命中，7 条截胡
× ⑧f 载体的完整依赖链：每层非 base 节点都可合成，且每阶段都有可命中步位
  → expected [ …(12) ] to deeply equal []
```

- **结论**：**⑧d 命中**（用户点名要验的三条之一）。⑧c/⑧f 也一并命中，说明整条「截胡」检测链是活的。
- **恢复**：`git checkout -- packages/game-core/src/resolve.ts` ✅

### 变异测试小结

| 目标断言 | 变异 | 是否命中 |
|---|---|---|
| **⑧f** | 删 `crowbar + fuel → generator` | ✅ 红 |
| **⑧g** | 删 `crowbar + fuel → generator` | ✅ 红 |
| **⑧d** | 阶段目标判定 `every` → `some` | ✅ 红（7 条明细） |
| **G1** | 删 `crowbar + fuel → generator` | ✅ 红 |
| **F4** | s1-2 改为无标签贡献的 `tape` | ✅ 红（附注：红因是运行时 guard 先拦截，见 M-3 说明） |
| **F5** | 文案去掉「换别的也行」 | ✅ 红 |

**6 条目标断言全部命中，0 条空跑。** 恢复后全量 core 测试 159 passed（12 files）/ api 41 passed（5 files）。

---

## 5. 实际跑的命令与关键输出

### 5.1 环境准备（Windows 沙箱必需）

```bash
cd /c/Users/E14/WorkBuddy/好垃
export TMPDIR="$PWD/.tmp" TEMP="$PWD/.tmp" TMP="$PWD/.tmp"
mkdir -p .tmp
```

不设这三个变量时，vitest 的 SSR 缓存写入会被 Windows 沙箱拒绝（`EPERM: operation not permitted, open '.../.tmp/xxx/ssr/...'`），表现为「测试全绿但有 1 个 unhandled error」。这是环境噪音，非产品缺陷。

### 5.2 core 全量测试

```bash
cd packages/game-core && npx vitest run
```
```
✓ tests/zz-qa-sim.test.ts > QA-D 二周目 8 条载体可达性（重写版） > D1 三策略 × 20 种子（readLogs 空） 8290ms
 Test Files  12 passed (12)
      Tests  159 passed (159)
```
> 159 = 原有 134 + 我的 25（`zz-qa-sim` 4 + `zz-qa-c` 6 + …，见 §6 说明）。

### 5.3 api 全量测试

```bash
cd apps/api && npx vitest run
```
```
 Test Files  5 passed (5)
      Tests  41 passed (41)
```

### 5.4 A 项：纯函数层评分一致性

```bash
cd apps/api && npx vitest run tests/zz-qa-a.test.ts
```
```
Tests  7 passed (7)
```
关键实测值（已在 §2.1 A-1 表格列出）：`cycle1max=1033900` / `cycle2start=2010001` / `normalizeNgPlus(true).cycle=2` = `cycleOfNgPlus(true)=2` / web 与 api 对三形态得分全部相同。

### 5.5 A 项：真实 Fastify 端到端冲突裁决

```bash
cd apps/api && npx vitest run tests/zz-qa-e2e.test.ts
```
```
A-E1 PUT c1 score= 1033880
A-E2 PUT c2 score= 2010001 | 云端现存的 cycle = 2 | stage = 1 | day = 1
A-E3 GET score= 2010001 cycle= 2 stage= 1 day= 1
A-E4 PUT ngPlus=true → score= 2011005 | winner cycle = true
A-E5 新档 score= 2032260 | 服务端保留的 stage = 3 day = 60 → 旧档赢（=预期，说明 newGame 必须清云端）
      Tests  5 passed (5)
```
（连跑两次均为 5/5，验证幂等 —— 前提是 `SQLITE_FILE` 生效，见 M-2。）

### 5.6 B 项：主菜单「重新开始」store 级复核

```bash
cd apps/api && npx vitest run tests/zz-qa-b.test.ts
```
```
✓ B-1 主菜单「重新开始」：档案全项保全 > cycle/endings/readLogs/branchesHistory/keepsakes 全保留，logsFound 清零，入口仍在 537ms
      Tests  4 passed (4)
```

### 5.7 C 项：留在这里继续 + 残留实测

```bash
cd packages/game-core && npx vitest run tests/zz-qa-c.test.ts
```
```
      Tests  6 passed (6)
```

### 5.8 D 项：二周目 8 条载体可达性随机模拟

```bash
cd packages/game-core && npx vitest run tests/zz-qa-sim.test.ts
```
```
✓ QA-D 二周目 8 条载体可达性（重写版） > D1 三策略 × 20 种子（readLogs 空） 3972ms
```
策略结果：A-mainline-first 19/20、C-random 20/20、B-logs-first 0/20（策略产物）。依赖闭包实测输出见 §2 D 表格。

### 5.9 变异测试

见第 4 章（4 条变异，6 条目标断言全部命中）。

### 5.10 关于「core 149 用例」的口径差异

开发方自述 core 149 用例，我实测**原有 134**（9 files）。加我自己的 `zz-qa-*` 后是 159（12 files）。

- 复核 `packages/game-core/tests/` 目录：9 个既有文件（`a2-stay` / `data` / `logs` / `ngplus` / `playthrough` / `progress` / `resolve` / `search` / `stage3` / `world` —— 实为 10 个，其中 `world.test.ts` 内含「10 万次随机游玩模拟」）。
- `packages/game-core/package.json` 只有 `test: vitest run`，无过滤参数，**没有遗漏跑的文件**。
- 结论：**149 与 134 的差异是口径问题**（可能含 api 包的 `web-integration.test.ts` 等跨包用例，或按断言条数而非 `it()` 块数统计）。**不构成缺陷**，但建议在交付说明里统一口径。

---

## 6. 我无法验证的项

| 项 | 原因 |
|---|---|
| **真机 / 浏览器端到端体验** | 本环境无浏览器/图形环境。`apps/web` 的 `package.json` 只有 `dev/build/preview/typecheck`，**没有配测试运行器**，所以 web 的 React 组件（图鉴面板、确认页、结局页、背包抽屉、日志面板）**全部是读代码 + 逻辑推演，没有在真实 DOM 里点过**。UI 布局、遮挡、点击热区、动画、`aria` 属性、键盘导航均未验证 |
| **Pixi.js 渲染层** | 世界层（`WorldCanvas` / `world.ts` 的地面分布表现）完全未跑过。只验证了 `distribute()` 的**数据**正确性，没看过它**画出来**是什么样 |
| **云端真机联调** | A 项的端到端验证用的是 `app.inject()`（进程内 HTTP 注入）+ 本地 SQLite，**没起真实监听端口**、没走真实网络、没验 CORS / 鉴权 / 限流在真实链路上的行为。`X-Device-Id` 的 UUID 校验、`RATE_LIMIT` 只在注入层面验证过 |
| **Postgres 分支** | `apps/api/src/db/postgres.ts` 分支（`DATABASE_URL=postgres://`）**完全未测** —— 本地无 Postgres 实例。只测了 better-sqlite3 分支 |
| **多端 / 多设备并发** | 「同一 device 从两台设备登录」这类冲突场景没测。`syncFromCloud`（web 侧）只在 `screen === 'start'` 时生效，这个门槛的**实际交互后果**（例如玩家在游戏中途切标签页，回来后云端档案被静默忽略）**未做 UI 层验证** |
| **性能** | `world.test.ts` 里有 10 万次随机游玩模拟，但那只是**逻辑**模拟，不是性能压测。实际帧率、内存、`distribute()` 在大背包下的耗时未测 |
| **长时间 / 边界周目** | 只测了 cycle 1→2→3。cycle=10+、以及「反复开新周目 50 次」这类极端档案未测 |
| **文案定稿** | `NgPlusConfirm.tsx:19-21` 自己声明「文案是工程自拟，**待文策渊定稿**」。我只能指出「文案与实现矛盾」（m-1）和「清单漏列」（M-1/m-2），**无法判断措辞的文学质量** |
| **音频 / 触感 / 移动端适配** | 纯 Web 桌面假设 |

---

## 7. 复验过程产生的临时文件（已清理）

以下文件为本次复验期间**新建**（非产品代码），复验结束后已删除：

| 文件 | 用途 |
|---|---|
| `apps/api/tests/zz-qa-a.test.ts` | A 项纯函数层 7 条断言 |
| `apps/api/tests/zz-qa-e2e.test.ts` | A 项真实 Fastify 端到端 5 条断言 |
| `apps/api/tests/zz-qa-b.test.ts` | B 项 store 级 4 条断言 |
| `packages/game-core/tests/zz-qa-c.test.ts` | C 项残留实测 6 条断言 |
| `packages/game-core/tests/zz-qa-sim.test.ts` | D 项随机模拟 |
| `.qa/` | 初版草稿（已被后续版本取代） |
| `.tmp/` | Windows 沙箱临时目录（未被 gitignore） |

**清理后 `git status --short` 仅剩本报告文件**（按要求**未 commit**）。
