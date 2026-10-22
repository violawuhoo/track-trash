# 任务书 · V3-DISCOVER · 二周目入口可发现性（独立小批次）

> 这份 prompt 是**自包含**的：执行者不需要看我们的对话历史，所有背景、约束、验收标准都在这里。

---

## 0 · 一句话目标

把「二周目」这个入口从**结局页上一个不起眼的普通按钮**，变成**结局页一个有标题说明的区块 + 主菜单一个次级文字入口**，让玩家知道自己可以再走一遍。**不改任何判定、不加任何机制、不泄露未解锁内容。**

---

## 1 · 背景（为什么做这件事）

《好垃》v3 的 C2 批次（二周目 + 图鉴）已于 2026-10-22 上线 GitHub Pages。C2 交付了完整的二周目机制（core 状态机、图鉴面板、确认页、评分下沉），但**入口的可发现性没做**。

我们做了一轮现状调研（实读代码，不是推测），结论如下 —— **这些是本任务的事实前提，不要重新推翻它**：

1. **二周目入口全站只有一个**，在 `apps/web/src/screens/EndingScreen.tsx:132-140`，条件是 `canStartNgPlus = ngPlusUnlocked(archive)`。
2. **主菜单 `apps/web/src/screens/StartScreen.tsx` 完全没有二周目入口**（grep `ngPlus` 零命中）。它只有三个按钮：开始游戏/重新开始、继续游戏、图鉴。
3. **视觉权重低**：该按钮是 `className="btn btn--block"`，**无 primary、无标题、无说明文案**，且排在「留在这里继续」（primary）**下面**。
4. **`ngPlusUnlocked` = `cycle >= 1 && endings.length >= 1`**（`packages/game-core/src/ngplus.ts:140-142`）。而 `createNgPlus()` 给 `cycle: 1` → `cycle >= 1` **恒真**，真正的闸门是 `endings.length >= 1`。**因此玩家达成第一个结局那一刻，入口就在那一屏 —— 不存在「一周目内完全看不到」的情况。**
5. **但玩家可能永远看不到**：结局页点完按钮就走。点「留在这里继续」还能再进结局页看到入口；**点「回到开始页」就彻底没了**（因为主菜单没有入口）。这是唯一的真实丢失路径。
6. **「留在这里继续」不是问题**：主菜单常驻「自由模式」按钮（`BagDrawer`），`free` 在 `stage >= 2` 恒可选，所以「玩家走不到结局页」在实现上不成立。
7. **确认页信息量很足**（保留 / 重置 / 本周目增益 三段），所以**教育成本不在确认页，在入口那一屏**。

---

## 2 · 硬边界（越过任何一条都算做错）

| # | 边界 |
|---|---|
| 1 | **不改任何判定**：`ngPlusUnlocked` / `startNextCycle` / `NEXT_CYCLE_KEPT` / `NEXT_CYCLE_RESET` / `DIALOGUE.ngplus` / 结局分支（`availableEndings` / `finishGame` / `chooseEnding`）**一个字都不许改**。特别是 `ngPlusUnlocked` 里 `cycle >= 1` 恒真是**刻意的**（表达「已经进入过周目流程」这层独立语义），**不许**改成 `cycle >= 2`、不许删、不许"优化"。 |
| 2 | **不改 `packages/game-core`**。本任务只动 `apps/web`。 |
| 3 | **不改 `NgPlusConfirm.tsx` 的三段内容与文案**（保留 K1–K5 / 重置 R1–R8 / 增益 G1–G4）。那是玩家**主动点进来之后**的权益说明，位置正确、文案已定稿。**尤其不得因主菜单入口而绕过它。** |
| 4 | **任何玩家可见文案里不得出现「二周目」**。它是内部/文档术语；玩家可见统一用「再走一遍」。包括 `aria-label`、`title`、按钮文字。 |
| 5 | **不得给二周目加任何「奖励 / 解锁 / 领取 / 成就」字样**。它是**重来一遍**，不是通关后的商店。 |
| 6 | **不得暗示「必须走二周目」**。它是可选的自由模式。不得把二周目升为 `btn--primary`，不得在主菜单放并列的大按钮。 |
| 7 | **不得泄露未解锁内容**。不许出现「已解锁内容预告」「下一章预告」之类。 |
| 8 | **不新增任何机制**。特别是**不许复活「搜索」按钮**（v2 已删该机制，物品固定铺在地面、走近自动拾取）。 |
| 9 | **不改 `docs/design/CONTENT-v3-NGPLUS-UI-COPY.md` 的 K1–K5 / R1–G4**。本任务新增的 5 条（T1–T5）**已回写进该文件**（§6），照抄即可。 |
| 10 | **不手抄字段清单**。确认页的清单真源在 core，组件只渲染 —— 本任务不要引入第二份清单。 |

---

## 3 · 要做的三处改动

### 改动① 结局页：把入口包进有标题说明的区块

**文件**：`apps/web/src/screens/EndingScreen.tsx`

**现状**（`:132-140`，逐字）：

```tsx
{canStartNgPlus && (
  <button className="btn btn--block" onClick={openNgPlusConfirm}>
    {/* 一周目时写「开始二周目」（GDD §7.2 的原措辞）；
        已经在第 2 周目及以后就写「开始新的周目」——
        否则玩家在第三周目点「开始二周目」，进去发现是第三周目，会以为自己记错了。
        `cycle` 的口径是「当前周目序号」，与确认页 / 图鉴三处一致。 */}
    {archive.cycle >= 2 ? '开始新的周目' : '开始二周目'}
  </button>
)}
```

**改成**：在 `canStartNgPlus` 为真时，把这个按钮**包进一个新区块**：

- 小标题 = **T1**：`带着记忆再来一遍`
- 说明行 = **T2**：`地面上的东西会回到原位。你记得的会留下来。`
- 按钮文案 = **T3**：`再走一遍`（**固定文案**，`archive.cycle >= 2 ? '开始新的周目' : '开始二周目'` 那个分支**一并删掉**）

**必须保持不变**：
- 按钮的 `onClick`（`openNgPlusConfirm`）、显示条件（`canStartNgPlus`）、在按钮列里的**位置顺序**全部不变。
- 「留在这里继续」的位置与 `btn--primary` 样式不变。
- 不在此页新增任何别的出口。

**⚠️ 顺带必须改掉的**（容易漏，会留下「二周目」字样）：
- `:138` 那个 `archive.cycle >= 2 ? ... : ...` 表达式整个删掉（它就是「二周目」字样的来源之一）。
- `:134-137` 的那段注释（它在解释「开始二周目」这个措辞）—— 按钮改名后这段注释失效，**必须一起删掉或改写**。
- **文件头注释** `:8`（`「开始二周目」 | ngPlusUnlocked = ...`）、`:10`（`「再来一次」`）、`:19-22`、`:28` —— 这些是**代码注释不是玩家可见串**，但含「二周目」字样且描述的是旧按钮名。**请一并更新**，否则后来的人会按注释里的旧名字去改代码。
- `:145-150` 那个「再来一次」的注释块 —— 按钮改名后要同步（见改动②）。

### 改动② 结局页：「再来一次」改名

**同一文件** `:151-153`：

```tsx
<button className="btn btn--block" onClick={newGame}>
  再来一次
</button>
```

按钮文案改为 **T4**：`重新开始这一遍`

**为什么不用「重开这一遍」**：「重开」在中文里更像「重开一局」，暗示把之前那遍作废；「重新开始这一遍」明确指向「同一段的另一次」，与二周目的语义一致。

**T3 与 T4 必须同批改** —— 只改一个，两个按钮仍会互相混淆（「再走一遍」vs「重新开始这一遍」）。

### 改动③ 主菜单：加一个次级文字入口

**文件**：`apps/web/src/screens/StartScreen.tsx`

在 `start__actions` 按钮列**下方**、`start__hint`（`:99`）**上方**，新增一行**文字链**入口：

- 文案 = **T5**：`你已经走过 {n} 个结局，可以再走一遍 →`
- `n = archive.endings.length`
- **仅当 `ngPlusUnlocked(archive)` 为真时渲染**

**要求**：
- **不要做成按钮**（不用 `btn` / `btn--primary` 类），保持次级。
- **不要放进主按钮列**（`start__actions` 那个 flex 列里），它是另一个层级的入口。
- 不改主菜单那三个主动作。

---

## 4 · ⚠️ 主菜单入口的实现路径（E1）—— 本任务最容易出事的地方

**流程**：主菜单点入口 → **先 `continueGame()`** → **再 `openNgPlusConfirm()`**。

**为什么必须先 `continueGame()`**：主菜单状态下 store 的 `save` 是 `createInitialState()` 的空档案（真实存档在 localStorage）。结局页的「开始二周目」能直接工作，是因为那时 `save` 就是真实存档；**主菜单没有这个前提**。若直接调 `startNewCycle()`，会**用空档案覆盖玩家当前存档**。

### 关于「会不会落盘」—— 我已经替你确认过了

`continueGame()` 在 `apps/web/src/store/gameStore.ts:573-608`。我逐行读过：**它内部只有 `readSavedGame()` + `set({...})`，既没有调 `persist()`，也没有调 `queuePush()`。**（对比一下：`commit()` 才是那个会 `persist` + `queuePush` 的函数，`continueGame` 走的是 `set` 而非 `commit`。）

**所以 E1 路径是安全的，不会写回存档、不会触发云端推送。** 但请你在实现时**再确认一遍**（读 `gameStore.ts:573-608`），并在 commit message 里写明这条确认结论 —— 如果你发现我说的不对（比如你打算顺手改 `continueGame` 的实现），**先停下来告诉我**，不要自己改。

### 实跑验证（必须做，把输出贴进 commit message 或回报里）

1. 主菜单点入口 → 确认页「已解锁的结局（N 个）」的 N **与实际档案一致**（**不是 0**）。
2. 在确认页点「再想想」取消 → 回到主菜单。
3. 重进游戏 → **原存档完好**（天数、阶段、背包、纪念品、已读日志全部在位），且**没有**产生一次异常的云端推送。
4. 反向验证：确认本地存档内容未变（localStorage 快照比对）。

**如果 `apps/web` 没有测试运行器**（确实没有 —— `apps/web/package.json` 只有 `dev`/`build`/`preview`/`typecheck`），就用**浏览器手工实跑**或**写一个零依赖探针脚本**（参考仓库里既有的探针做法）把这 4 步记录下来。**不要为了这个任务去给 `apps/web` 装测试框架** —— 那是另一件事。

---

## 5 · 样式

**文件**：`apps/web/src/styles/app.css`

新增区块样式（建议类名 `.ending__ngplus` / `.ending__ngplus-title` / `.ending__ngplus-note`）。

- **必须用 `tokens.css` 里的既有令牌**（`--orange` / `--mint` / `--ink-soft` / `--sp-*` / `--fs-*` / `--stroke` / `--radius-*` 等）。`tokens.css` 是**唯一色值真源**，**不许引入新的十六进制色值**。
- **不许改 `.btn` / `.btn--primary` 的既有定义** —— 那会影响全站所有按钮。
- ⚠️ 注意结局页的按钮列现在用的是**内联 style**（`EndingScreen.tsx:117-123`：`display:flex; flexDirection:column; gap:10; maxWidth:320; margin:0 auto; width:100%`）。新区块要在这个 flex 列里正常排布，注意别撑破 `maxWidth: 320`。
- 若你要给主菜单的文字链加样式，同样只用既有令牌。文字链在深色/浅色下的对比度要够（`--ink-soft` 约 4.7:1，够 16px 正文用）。

---

## 6 · 文案定稿（逐字照抄，一个标点都不许改）

| 编号 | 文案 | 落点 |
|---|---|---|
| **T1** | `带着记忆再来一遍` | 结局页区块小标题 |
| **T2** | `地面上的东西会回到原位。你记得的会留下来。` | 结局页区块说明行 |
| **T3** | `再走一遍` | 结局页区块按钮 |
| **T4** | `重新开始这一遍` | 结局页「再来一次」按钮（改名） |
| **T5** | `你已经走过 {n} 个结局，可以再走一遍 →` | 主菜单文字链（`{n}` 替换为结局数） |

完整定稿与工程自检清单在 `docs/design/CONTENT-v3-NGPLUS-UI-COPY.md` §6（已入库）。**照抄那里，不要自己重新措辞。**

---

## 7 · 参考文档

| 文件 | 你要从中读什么 |
|---|---|
| `docs/design/CONTENT-v3-NGPLUS-DISCOVERABILITY.md` | 完整方案：现状调研（§1）、诊断（§2）、采纳方案（§3.1）、否决方案及理由（§3.2）、落地清单（§5）、四条边界自检（§6）、代码位置索引（附录） |
| `docs/design/CONTENT-v3-NGPLUS-UI-COPY.md` | T1–T5 逐字定稿（§6）+ 工程自检清单第 16–23 条 |
| `docs/design/CONTENT-v3-GDD.md` §7.2 | 二周目的设计口径；「结局页入口已区块化（方案已批准，代码待落地）」那条补记 |

**注意**：`CONTENT-v3-NGPLUS-DISCOVERABILITY.md` 的 §5.4 写的是「工程必须确认 `continueGame()` 是只读档还是读档+落盘」—— **这个问题我（team-lead）已经确认过了，答案见本任务书 §4**。以本任务书为准。

---

## 8 · 验收标准（我这样验）

### 8.1 静态检查

```bash
pnpm -r typecheck                # 三包全绿
pnpm -r test                     # core 10 文件/156 例、api 2 文件/25 例，守恒断言均通过
node scripts/check-content.mjs   # ✓
node scripts/check-assets.mjs    # ✓
pnpm --filter @haola/web build   # 成功，index.js gzip 必须 ≤ 250 KB
```

**基线值**（当前状态，用于对比）：core **10 文件 / 156 例**、api **2 文件 / 25 例**、web build `index.js` gzip **171.87 KB**。

**build 注意**：`apps/web/vite.config.ts` 的 `base` 是 `process.env.VITE_BASE || (command === 'build' ? '/track-trash/' : '/')` —— GitHub Pages 部署走 `/track-trash/`，**本任务不需要改这个**，直接 `pnpm --filter @haola/web build` 即可。

### 8.2 变异测试（我自己会做，你不用做，但要知道我在测什么）

我会把 T1–T5 逐条改掉，检查是否有断言/检查脚本能抓到。**如果你的实现里没有任何可被自动抓到的痕迹**（比如文案散落在多处、无法集中校验），告诉我，我可能会要求你补一条检查。**建议**：把 T1–T5 集中到 `EndingScreen.tsx` / `StartScreen.tsx` 各自的一个常量里（各 2–3 条），而不是散落在 JSX 里 —— 这样后续改文案只有一处。

### 8.3 功能验收（人工实跑）

- 结局页：达成一个结局后，入口**以区块形式**出现，能看到 T1 小标题 + T2 说明 + T3 按钮；按钮点下去正常打开确认页。
- 结局页：T3 与 T4 **同时**出现且不混淆。
- 主菜单：有存档且已解锁结局时，文字链出现且 N 正确；无存档或未解锁结局时**不出现**。
- 主菜单点入口：确认页 N 正确；取消后回主菜单；**原存档完好**。
- 玩家可见文案里**搜不到「二周目」**：`grep -rn "二周目" apps/web/src/` 的结果里，**只允许出现在代码注释中**，不允许出现在 JSX 文本、aria-label、title 里。

---

## 9 · 提交要求

1. **不要 push**。只 commit，push 由我统一做。
2. **单独成批**，不要和别的批次混在一起。建议拆成 2–3 个 commit：
   - `feat(web): 结局页二周目入口区块化 + 「再来一次」改名（T1–T4）`
   - `feat(web): 主菜单加二周目次级文字入口（T5，E1 路径）`
   - （如需要）`style(web): 入口区块样式`
3. commit message 里**必须包含**：
   - §4 的 4 步验证的实际输出（主菜单点入口 → 确认页 N 正确 → 取消 → 存档完好）。
   - 「`continueGame()` 是纯读档（无 `persist`、无 `queuePush`）」这条确认结论。
   - build 后的 gzip 体积。
4. **不要提交** `docs/qa/` 下的任何东西（那是 QA 报告，我另行处理）。

---

## 10 · 完成后回报给我什么

1. 每个 commit 的 hash + 标题。
2. §8.1 全部 5 条命令的**实际输出**（不是「通过了」三个字）。
3. §8.3 的功能验收结论。
4. `grep -rn "二周目" apps/web/src/` 的完整输出 + 你对每一处的判断（注释 / 玩家可见）。
5. **你在实现中发现的任何与本任务书描述不符的事实** —— 尤其如果你发现 `ngPlusUnlocked` / `archive` / `continueGame` 的行为与本文档描述的**不一致**，**立刻告诉我**，不要自己按你的理解改。

---

## 11 · 附：相关文件速查

| 路径 | 关键行 | 内容 |
|---|---|---|
| `apps/web/src/screens/EndingScreen.tsx` | `:8` | 文件头注释表，含旧按钮名「开始二周目」 |
| | `:91` | `canStartNgPlus = ngPlusUnlocked(archive)` |
| | `:117-123` | 按钮列的内联 style（`maxWidth:320` 等） |
| | `:132-140` | 改造①的目标：二周目入口按钮 |
| | `:141-143` | 图鉴按钮（不动） |
| | `:145-153` | 改造②的目标：「再来一次」按钮 + 其注释块 |
| `apps/web/src/screens/StartScreen.tsx` | `:57-63` | store 订阅（`newGame` / `continueGame` / `toggleCodex` / `hasSavedGame`） |
| | `:84-97` | `start__actions` 三个按钮（不动） |
| | `:99` | `start__hint`（改动③的插入点在其上方） |
| `apps/web/src/store/gameStore.ts` | `:466-490` | `archive` / `archiveKeepsakes` 初值从 localStorage 读 |
| | `:513-556` | `newGame`（⚠️ 读 `get().archive` 而非 `get().save.ngPlus`） |
| | `:573-608` | `continueGame`（**纯读档**：`readSavedGame()` + `set()`，无 `persist`/`queuePush`） |
| | `:909-911` | `openNgPlusConfirm` / `closeNgPlusConfirm` |
| | `:922-951` | `startNewCycle`（`commit` + `clearCloudSave` + `queuePush`） |
| `packages/game-core/src/ngplus.ts` | `:140-142` | `ngPlusUnlocked`（**不许改**） |
| `apps/web/src/styles/app.css` | `:213-225` | `.start__actions` / `.start__hint` |
| | `:1028-1040` | `.ending` / `.ending__stamp` |
| `apps/web/src/styles/tokens.css` | 全文件 | **唯一色值真源**（116 令牌） |

---

**任务边界之外的事，不要做**：给 `apps/web` 加测试框架、实现 v3.1 叙事联动追加块、改任何 core 判定、补 `requiresBuild` 门控、动 `.sheet` 遮罩层级。这些各自是独立的批次。
