# 《好垃》v2 性能实测报告（T10-R2）

- **执行**：engineering-lead（程基岩）· 2026-10-21
- **范围**：只测量与报告，**未改任何代码 / 配置 / workflow**。新增文件仅限 `docs/perf/` 与 `scripts/perf-*.mjs`、`shots/perf-*`。
- **对象**：`apps/web`（Vite 5 + React 18 + TS + Zustand 4 + PixiJS 8，pnpm monorepo），`main = 5882d30`。
- **合并说明**：本轮有两条测量线并发进行（本会话 + 并行会话，后者产物在 `docs/perf/measurements/`、`scripts/perf-cdp.mjs`、`scripts/perf-static-serve.mjs`）。本报告已合并双方数据并交叉验证；凡两轮不一致处均以范围/备注呈现，不以单轮下结论。**冲突点已与并行方对齐。**

---

## 0. 结论摘要

### 0.1 验收判定：**PASS**（全部达标；两项贴线，建议真机复核）

| # | 验收基线 | 目标 | 实测 | 判定 |
|---|---|---|---|---|
| 1 | 中端安卓 60fps | 连续移动 60s 稳定 60fps | **59.6–59.9fps / 掉帧 0.1–0.4% / 最差帧 66.7–83.3ms**（CPU 4× 降速，生产构建，两轮安静环境，60.6–60.9s） | ✅ 达标 |
| 2 | 首屏 < 2s | < 2s | 生产构建冷启动 FCP **384–912ms**（本地 4× 两轮）；Lighthouse 模拟中端机 LCP **2.04s** | ✅ 达标（Lighthouse 口径贴线） |
| 3 | Lighthouse 移动端 Performance | ≥ 85 | **98**（FCP 1.77s / LCP 2.04s / TBT 53ms / CLS 0；两方独立复测一致） | ✅ 超标达标 |
| 4 | 首屏 JS gzip | < 250KB | **158.6KB**（JS 154.2 + CSS 4.4，实际文件 gzip 实测） | ✅ 超标达标（全量 JS 232.1KB） |

**质量门判定：PASS（附 1 项 CONCERNS，不阻塞）**

> **CONCERNS**：`collect`（拾取）瞬间存在可感知卡顿——React 全量重渲染背包网格 + 新物品图标 innerHTML + 整文档 Layout（trace 实锤，§6）。4× 降速下每轮 3–15 帧 > 33ms（0.1–0.4%）。这是全程**唯一**实测到的掉帧源，修复方案低风险（§8-QW1），建议进修复 backlog。

**一句话**：世界层（Pixi）每帧主线程仅 ~1.1–1.5ms 真机当量，余量 >85%；瓶颈全在 DOM/React 层的「拾取瞬间整文档重排」。产物体积与首屏双双达标。

### 0.2 瓶颈 Top 3（按影响排序，详见 §7）

1. **B1 · collect 触发整文档 Layout**：每次拾取背包网格全量重渲染 → `dangerouslySetInnerHTML` 插入 → 弄脏 `#document` → 整文档 Layout **30–239ms@4×**（3 次 trace 的大 Layout 100% 紧邻 ParseHTML）。唯一被 trace 证实的长帧根因。
2. **B2 · Pixi 双 rAF 链 + 空闲全量重绘**：`autoDensity: true` 使 `CanvasObserver` 向 `Ticker.shared` 挂第二条每帧链（rAF 回调数恒为帧数 2 倍）；世界层无脏矩形，静止仍每帧全量提交。空闲主线程 31.4%@4×。**本轮不建议动**（成本已极低 + 有静止玩家 bug 前科）。
3. **B3 · 进游戏时才加载 Pixi 渲染器 chunk**：点击「开始游戏」后才发 7 个请求（≈56.2KB gz），进游戏 **488–610ms@4×**（有负载时 2.7s）。开始屏空闲 10s+ 本可用来预热（QW2）。

### 0.3 Quick Win（文本可证、低风险、大收益；本轮不动代码，详见 §8）

- **QW1** BagDrawer 细粒度订阅 + `ItemCard`/`ItemIcon` memo → 预期消除 B1 全部长任务。
- **QW2** 开始屏 `modulepreload` 预热 7 个 Pixi chunk → 进游戏耗时 -0.4s@4×。
- **QW3** 性能门口径统一「生产构建 + 4× 降速」，防止 dev server 的 Lighthouse 35 分被误读（流程项，零代码风险）。

---

## 1. 测量环境与方法

### 1.1 工具链（全部新增于 `scripts/`，零新依赖）

| 脚本 | 归属 | 用途 |
|---|---|---|
| `scripts/perf-probe.mjs` | 本会话 | 主探针：冷启动首屏 + 进游戏耗时 + 空闲/连续移动/UI 三场景帧率 + 每场景长任务与最差帧 |
| `scripts/perf-trace.mjs` | 本会话 | 4× 降速抓 CDP trace，长任务归因 + store 事件时间对齐 |
| `scripts/perf-cdp.mjs` | 并行会话 | 并行对照探针（独立实现交叉验证）：每 5s 采样 store + 长任务/堆按场景切片 |
| `scripts/perf-static-serve.mjs` | 并行会话 | 零依赖静态服务器（dist 内存缓存 + gzip），替代 `vite preview`（见 §10 已知坑） |

### 1.2 环境参数

- headless Chrome，视口 390×844 @ DPR2，`isMobile + hasTouch`，UA：Galaxy A54 级（Android 13 + Chrome 126）
- CPU 降速：CDP `Emulation.setCPUThrottlingRate(4)`，**导航前挂载**
- GL 后端实测：`ANGLE (Intel Arc 130T, Direct3D11)`——真实 GPU，非 SwiftShader（`WEBGL_debug_renderer_info`）
- 帧率测量：注入 rAF 钩子记录每帧时间戳，按场景分段统计帧间隔分位；**按时间戳去重**（双 rAF 链会造成 120fps 假象，见 §4.3）
- 主线程占用：CDP `Performance.getMetrics` 的 `TaskDuration` 增量 / 场景时长
- Lighthouse 12.8.2：`--form-factor=mobile` + 屏幕模拟，simulate throttling（RTT 150ms / 1.6Mbps / CPU 4×），**生产构建 + gzip**
- dev server 验收环境：`vite --port 5176`（遵守已知坑①）；生产参考：静态服务器 / `vite preview` + `--base=/` 构建（§10）

### 1.3 测量轮次台账

| 轮次 | 目标 | 环境 | 机器负载 | 用途 |
|---|---|---|---|---|
| prodbase | 生产构建 1× | 静态服务器 | 安静 | 无降速基线 |
| **prod4x / prod4x-clean** | 生产构建 4×（两方各一轮） | 静态服务器 / preview | 安静 | **主数据** |
| base / android4x | dev server 1× / 4× | vite dev 5176 | 安静 | 对照 + trace 归因环境 |
| prod4x-b / prod4x-c | 生产构建 4× | 静态服务器 | **有外部负载**（主线程 77–82%） | 污染对照，**不作结论** |
| swiftshader4 | 强制软件光栅 | dev server | — | 最坏情况参考（6.6fps），**不代表真机 GPU** |
| lighthouse-prod / lighthouse-dev | Lighthouse 移动端 | 生产构建 / dev server | 安静 | 验收分数 / 反面对照 |

原始数据：`shots/perf-probe-*.json`（10 份）、`docs/perf/measurements/*`、`shots/perf-trace-el.json`（本会话稳定 trace）、`shots/perf-trace.json`（共享目录，曾被并发覆盖，见 §10）。

---

## 2. 产物体积与 gzip 构成

生产构建（`/track-trash/` base，即 Pages 实配）。gzip 为对实际产物文件 `zlib level 9` 实测（vite 构建输出自报值略偏高，以本表为准）：

| 文件 | raw | gzip | 加载时机 |
|---|---|---|---|
| `index-*.js`（React + 应用 + Pixi 核心） | 467.4KB | **154.2KB** | 首屏 |
| `index-*.css` | 18.5KB | **4.4KB** | 首屏 |
| `WebGLRenderer` | 72.1KB | 19.7KB | 点击后 |
| `WebGPURenderer` | 55.1KB | 15.7KB | **本机从未加载**（见 B4） |
| `RenderTargetSystem` | 53.1KB | 14.6KB | 点击后 |
| `browserAll` | 43.1KB | 11.2KB | 点击后 |
| `CanvasRenderer` | 18.0KB | 6.0KB | 未观察到（Canvas 回退路径） |
| `webworkerAll` | 15.3KB | 4.8KB | 点击后 |
| `getTexelRangeRects` | 11.2KB | 2.9KB | 点击后 |
| `canvasUtils` | 5.7KB | 1.8KB | 点击后 |
| `CanvasPool` | 2.7KB | 1.2KB | 点击后 |
| **合计** | **762.1KB** | **236.5KB**（JS 232.1 + CSS 4.4） | |

- **首屏 JS gzip = 158.6KB < 250KB 达标**（余量 91KB）。
- **进游戏增量 = 点击后 7 个 chunk ≈ 56.2KB gzip**（网络证据见 §5）；全量 JS gzip 232.1KB。
- Lighthouse `total-byte-weight` 160 KiB（首屏口径）；`unused-javascript` 107KB/151KB——首屏未进游戏、游戏代码尚未执行，**属预期拆分，不是死代码**（见 B5）。
- 纹理显存（代码走读常量，未单独实测）：玩家 4 向×6 帧 = 24 张 + 地面物品 ≤18 张 + 地形 47 实例（17 个唯一 key）≈ 59 张 96px RGBA ≈ **2.2MB**，按 id 缓存 + 引用计数释放。

---

## 3. 首屏加载实测

### 3.1 生产构建（开始页冷启动，禁 HTTP 缓存）

| 指标 | 1× 安静 (prodbase) | 4× 安静（本会话轮） | 4× 安静（并行轮 clean） | Lighthouse 移动端 |
|---|---|---|---|---|
| 导航墙钟 | 899ms | — | 1366ms | — |
| TTFB | 11ms | 3ms | 3ms | — |
| DCL / load | 156ms | 146ms | 343ms | — |
| **FCP** | **464ms** | **384ms** | **912ms** | 1770ms |
| **LCP** | **464ms** | **384ms** | **912ms** | 2044ms |
| TBT | 2ms | 42ms | 169ms | 53ms |
| CLS | 0 | 0 | 0 | 0 |
| 请求 / 传输 | 3 / 160KB | 3 / 160KB | 3 / 160KB | 160 KiB |
| 长任务 | 1（52ms） | 1 | 2 | — |

- LCP 元素 = `h1.start__title`（纯文字，无图片依赖）。
- 首屏仅 3 个请求：HTML + 1 JS + 1 CSS；另有 1 个 `/api/saves/me` 存档探测（319B，失败静默，离线优先设计）。
- **两轮 4× 安静环境 FCP 相差 2.4×（384 vs 912ms）**——机器状态/服务器实现差异，均远低于 2s 目标，不影响判定；引用时建议给范围。
- **首屏 < 2s 判定**：最保守口径为 Lighthouse 模拟网络 LCP 2.04s；本地冷启动 384–912ms。均达标。

### 3.2 dev server 对照（验收环境，仅作参考）

| 指标 | 1× | 4× |
|---|---|---|
| FCP | 760–1112ms | 1980–2456ms |
| DCL | 470–744ms | 1436–1684ms |
| TBT | 140–201ms | 838–907ms |
| 请求 / 传输 | 64 个 / 4.30MB | 同 |

- dev server 首屏被 64 个未打包模块请求主导——开发模式成本，**任何性能结论不得引用 dev server 数据**（QW3）。
- Lighthouse dev = **35 分**（FCP 14s / LCP 26.2s / TBT 890ms）：Vite dev 无 tree-shaking/压缩的环境伪影，与产物无关。

---

## 4. 帧率实测（连续移动 60s）

### 4.1 场景设计

- **空闲 10s**：世界层挂载后不给输入——量化「Pixi 空闲是否仍在重绘、成本多少」（回答 B2）。
- **连续移动 60s**：每 1.2s 轮换 W→D→S→A，角色 140u/s 持续位移，中途自然触发拾取（任务指定主场景）。
- **UI 开关背包 ×10**（附加场景）：反复开合背包抽屉——React 重渲染叠加在跑着的世界层上。
- 每场景记录：rAF 帧时间戳（去重）、CDP TaskDuration 增量、堆、场景内长任务、最差 5 帧。

### 4.2 主数据：生产构建 + CPU 4× + 连续移动 60s（两轮安静环境）

| 场景 | 轮次 | 帧数/时长 | 均值 | p95 | 最差帧 | >33ms 帧 | 掉帧率 | 主线程占用 | 堆 |
|---|---|---|---|---|---|---|---|---|---|
| 空闲 | 本会话 | 601 / 10.0s | 60.0fps | 16.8ms | 16.9ms | 0 | 0% | 25.7% | 7MB |
| 空闲 | 并行轮 | 602 / 10.0s | 59.9fps | 16.8ms | 33.4ms | 1 | 0.2% | 31.4% | 8MB |
| **移动** | **本会话** | 3627 / 60.6s | **59.9fps** | 16.8ms | 83.3ms | 3 | **0.1%** | 25.6% | 7MB |
| **移动** | **并行轮** | 3629 / 60.9s | **59.6fps** | 16.8ms | 66.7ms | 15 | **0.4%** | 35.2% | 7MB |
| UI 开关背包 | 本会话 | 425 / 7.1s | 59.6fps | 16.8ms | 49.9ms | 2 | 0.5% | 33.5% | 8MB |
| UI 开关背包 | 并行轮 | 442 / 7.5s | 59.1fps | 16.8ms | 66.6ms | 4 | 0.9% | 40.3% | 8MB |

移动场景内长任务（>50ms）：本会话轮 97ms@12.0s、72ms@14.6s；并行轮 63ms@13.1s、80ms@16.0s、50ms@58.9s。**全部为 collect 帧（§6-B1）**。无 >100ms 帧（安静轮）。页面错误 0。

### 4.3 全轮次对照（连续移动场景）

| 轮次 | 环境 | 均值 | 掉帧率 | 最差帧 | 场景长任务 | 主线程 | 备注 |
|---|---|---|---|---|---|---|---|
| prod4x-clean | 生产 4× 安静 | 59.6fps | 0.4% | 66.7ms | 63/80/50ms ×3 | 35.2% | 主数据 |
| prod4x（本会话） | 生产 4× 安静 | 59.9fps | 0.1% | 83.3ms | 97/72ms ×2 | 25.6% | 主数据 |
| **prodbase** | 生产 1× 安静 | **60.0fps** | **0%** | **19.3ms** | 0 | 11% | 无降速基线，零掉帧 |
| base（dev 1×） | dev 1× 安静 | 60.0fps | 0.1% | 383.6ms¹ | 0 | 6.5% | 单帧离群无长任务，疑 HMR client，prod 未复现 |
| android4x | dev 4× 安静 | 59.9fps | 0.1% | 66.6ms | 67/61ms ×2 | 26.9% | 与主数据互证 |
| prod4x-b / prod4x-c | 生产 4× **有负载** | 53.8 / 55.3fps | 4.2% / 3.0% | 400.1 / 216.8ms | 239/410ms 等 | 77–78% | **污染轮次，不采信** |
| swiftshader4 | 强制软件光栅 | 6.6fps | ~100% | 250ms | 全帧 | — | 软件 GL，非真机代表 |

¹ dev 无降速时 60s 内 1 次 383.6ms 帧且无对应长任务（主线程空闲）——合成/光栅侧偶发停顿，疑与 dev 模式 HMR client 有关；生产构建同场景零掉帧，未复现。

**污染轮次说明**：prod4x-b/c 与安静轮跑同一份产物，差异来自测量期间机器外部负载（主线程 77–82% vs 25–35%）。结论以安静轮为准；污染轮恰好演示「机器忙时 4× 模拟掉到 54fps」——真机验收应在空载机器上做。

### 4.4 双 rAF 链（B2 的量化证据）

所有 prod 轮次的 rAF 回调数恰为帧数的 **2 倍**（如 7254/3627、1204/602）。根因：PixiJS 8 在 `autoDensity: true` 时由 `CanvasObserver`（`pixi.js@8.22.0/lib/dom/CanvasObserver.mjs:75`）向 `Ticker.shared` 注册每帧回调，与 `app.ticker` 形成两条独立 rAF 链，同帧双回调。**按时间戳去重后才是真实帧率**——早期未去重版本测出 120fps 假象（并行会话早期数据 119.7fps 即此伪影）。

### 4.5 每帧预算与余量

- **主线程成本**（CDP `TaskDuration` ÷ 帧时长）：连续移动 **4.3–5.9ms@4× ≈ 1.1–1.5ms 真机当量**。60fps 预算 16.7ms——**世界层余量 >85%，不是瓶颈**。
- **常规帧的布局+绘制**（trace X-phase，40s@4×）：UpdateLayoutTree 均值 0.6ms + PrePaint 0.6ms + Layout 均值 0.23ms + Layerize/Paint ~0.1ms = **<1.5ms@4× ≈ 0.4ms 真机**。贵的是 collect 帧的整文档 Layout（§6）。
- **GC 可忽略**：MinorGC 最大 10.7ms@4× ≈ 2.7ms 真机；MajorGC 40s 内 1 次 28.5ms@4× ≈ 7ms 真机。
- 方法注：Chrome trace 的 `AnimationFrame::*` async 事件存在跨帧嵌套，逐阶段分位配对统计不稳定；本报告只采用「TaskDuration 全量占用率 + 大事件绝对值」两项互证。

---

## 5. 进游戏耗时与按需加载（网络证据）

| 轮次 | 点击「开始游戏」→ canvas 出现 |
|---|---|
| prodbase（1×） | 305ms |
| prod4x（4× 安静，本会话） | 488ms |
| prod4x-clean（4× 安静，并行轮） | 610ms |
| android4x（dev 4×） | 791ms |
| prod4x-b/c（4× 有负载） | 2719 / 2741ms（不采信） |

**网络证据**（决定性实验）：页面加载期仅 3 个请求；点击开始后才新增 7 个 Pixi chunk：

```
WebGLRenderer 19.7 + RenderTargetSystem 14.6 + browserAll 11.2 + webworkerAll 4.8
+ getTexelRangeRects 2.9 + canvasUtils 1.8 + CanvasPool 1.2   ≈ 56.2KB gz
```

即渲染器分包按需加载，首次点击要「下载 + 解析 + 初始化 WebGL」一条龙走完才出 canvas。世界循环启动（aria-label 首次更新）与 canvas 同时刻；地面物品 14–18 件（设计常量内）。开始屏空闲通常 >10s，足够覆盖预热（QW2）。

---

## 6. 卡顿根因：collect 瞬间的整文档重排（trace 实锤）

3 次 trace（本会话 2 次 + 并行会话 1 次，40s/30s 移动 @4×）结论一致：

```
拾取(collect) → store.commit → set({save, world})
  → FunctionCall 15–131ms@4×（React 重渲染：BagDrawer 订阅整个 save，重渲染全部 ItemCard）
  → ParseHTML ×2（首次发现的新物品挂载新 ItemIcon → dangerouslySetInnerHTML 写入）
  → Layout 30–239ms@4×（整文档重排：dirtyObjects 40–47 / totalObjects 121–162，layoutRoot=#document）
  → 后续全页重绘（含 .grain 混合层重新合成）
```

- **相关性 100%**：3 次 trace 中全部大 Layout（>30ms，每轮 4–5 个）前 22–50ms 内必有一对 ParseHTML；每对 ParseHTML 后 300ms 内必出现大 Layout。ParseHTML 本身便宜（0.3–1ms），贵的是它把布局脏区扩到 `#document`：一次拾取 = 一次全页重排。**背包越大越贵**（totalObjects 随拾取增长）。
- **代码链印证**：`BagDrawer.tsx` 用 `useGame((s) => s.save)` 订阅整个 save 对象，且 `GameScreen` 常驻挂载（开关背包只是 CSS class，不卸载）→ 每次 collect 全量重渲染背包网格；`ItemCard` 未 memo 化且 `onClick` 每次渲染新建闭包；`ItemIcon` 是全场唯一 `dangerouslySetInnerHTML` 使用者（内容为模块内静态字符串，无用户输入）。
- **真机当量**：一次「首次发现新物品」的拾取 ≈ 8–60ms 主线程 → 掉 1–3 帧；「重复物品」拾取只有 React 重渲染成本，帧内消化。
- 该模式在 dev 与生产、降速与不降速下均复现；是 §4 所有 >33ms 帧的来源。

---

## 7. 瓶颈清单（按影响排序）

### B1 · collect 瞬间 React 全量重渲染 + 整文档 Layout —— **唯一实测掉帧源**

- **现象**：移动中每次拾取掉 1–3 帧（4× 下降速 60s 内 3–15 帧 >33ms，0.1–0.4%）；首次发现新物品时最重。
- **根因（已实锤）**：见 §6。BagDrawer 订阅整个 `save` → 每次 collect 重渲染所有 ItemCard；新 bag 条目挂载新 ItemIcon（innerHTML）→ 40+ 对象脏标记 → 整文档 Layout → 全页重绘。
- **修复建议**：① BagDrawer 改细粒度订阅（`s.save.bag` / `s.save.stage` 分项）；② `React.memo(ItemCard)` + BagDrawer 传稳定回调（`useCallback((id)=>toggleSlot(id),[toggleSlot])`，ItemCard 改收 `onSelect(id)`）；③ `ItemIcon` 的 markup 按 (shape,tint,size) 用 `useMemo`/模块级 Map 缓存；④ 中期可给背包网格加 `content-visibility`。
- **预估收益**：拾取帧从掉 1–3 帧 → 0 帧；移动场景长任务归零、掉帧 0.1–0.4% → ~0%；UI 场景（59.1–59.6fps）同步受益。
- **风险**：低（纯渲染层，不碰玩法逻辑与 store 契约）。需回归：背包网格截图、选中态、堆叠数字、合成槽联动。

### B2 · Pixi 双 rAF 链 + 空闲全量重绘 —— 记录在案，**本轮不建议动**

- **现象**：空闲 10s 主线程仍占 25.7–31.4%@4×；rAF 回调数恒为帧数 2 倍（§4.4）。
- **根因**：Pixi v8 无损坏重绘，场景每帧全画；`autoDensity: true` 使 CanvasObserver 在 `Ticker.shared` 挂第二条链。
- **现状判断**：每帧总成本 ~1.1–1.5ms 真机当量，60fps 余量 >85%——「空闲停 ticker/降频」收益极小，且历史上踩过「静止玩家只剩贴地阴影」的坑（变化才更新必须带重试）。后台停 ticker（visibilitychange）已实现。**如未来要动**：仅在真机实测确认帧预算紧张时再考虑。
- **风险**：中（ticker 生命周期改动易复燃静止玩家 bug；autoDensity 管 DPR 适配，关闭需手动接管）。

### B3 · 进游戏时才加载 Pixi 渲染器 chunk

- **现象**：点击后 7 个 chunk ≈56.2KB gz 才发起，进游戏 488–610ms@4×（有负载时 2.7s）。
- **根因**：渲染器分包按需加载 + 首次 WebGL 上下文初始化（shader 编译）串行发生。
- **修复建议**：开始屏挂载后即 `<link rel="modulepreload">` 这 7 个 chunk，或 `requestIdleCallback` 里动态 import 预热。
- **预估收益**：进游戏 -0.4s@4×（610ms → 预期 <200ms），消除点击瞬间的网络+解析尖峰。
- **风险**：低（modulepreload 只提前下载不提前执行；可加 `navigator.connection.saveData` 判断防弱网浪费）。

### B4 · WebGPURenderer 死重 15.7KB gz

- **现象**：产物含 `WebGPURenderer` chunk，但本机 Chrome + ANGLE/D3D11 环境下**任何轮次都未请求它**（点击后请求清单只有 WebGL 路径 7 个 chunk）。
- **根因**：Pixi 8 的 `autoDetectRenderer` 在本机走 WebGL 回退；WebGPU 分支代码随图产出但不执行。
- **修复建议**：若产品确认暂不支持 WebGPU，`preference: 'webgl'` 可将其从依赖图中剔除。
- **预估收益**：产物 -15.7KB gz（全量 236.5 → 221KB）；首屏与进游戏传输不受影响（本就不加载）。
- **风险**：中。放弃 WebGPU 设备加速路径；支持 WebGPU 的真机可能更快。**需产品/引擎决策，不默认执行。**

### B5 · 首屏 JS 中约 2/3 是点击后才用到的游戏代码（观察项）

- **现象**：Lighthouse `unused-javascript` 107KB/151KB——首屏开始页只执行了 React + 开始屏组件。
- **修复建议**（非 quick win）：GameScreen 及以上代码分割（路由级 lazy），首屏 JS 可从 154KB 降到 ~50KB gz。
- **风险**：中高。涉及路由/构建改造与加载态设计，且当前 158.6KB 已远低于 250KB 预算——**收益不紧迫，建议 v3 再评估**。

### B6 · `.grain` 全屏 mix-blend-mode 图层 —— 需设计确认

- **现象**：每次 Layout/重绘后，固定全屏的 `mix-blend-mode: multiply` 噪点层都要重新合成（trace 中 Render 段主要成分之一）。
- **根因**：CSS 设计元素（`app.css` `.grain`，feTurbulence 160×160 平铺 + multiply 混合）。
- **修复建议**：低端机降级候选（检测到持续掉帧时移除 blend）——**属设计元素，须文策渊/林绘澄确认**，本报告仅标记。
- **风险**：视觉回归（纸感氛围依赖它）。

---

## 8. Quick Win 专项（文本可证 · 低风险 · 大收益 · 待拍板）

> 按硬约束本轮**只列不改**。验证方法一栏供实现后排期使用。

| # | 改动 | 依据 | 预估收益 | 风险 | 验证方法 |
|---|---|---|---|---|---|
| QW1 | BagDrawer 细粒度订阅 + `ItemCard` memo + `ItemIcon` markup 缓存 | B1 代码链 + 3 次 trace 100% 相关（§6） | 消除全部 collect 长任务；移动掉帧 0.1–0.4% → ~0% | 低（渲染层，需回归背包 UI） | 重跑 `perf-probe --throttle=4`：move 场景长任务数 = 0、ui 场景最差帧 <50ms |
| QW2 | 开始屏 `modulepreload` 预热 7 个 Pixi chunk | B3 网络证据（§5） | 进游戏 610ms → 预期 <200ms @4× | 低（只提前下载；加 saveData 判断） | `perf-probe` 的 `gameEntry.clickToCanvasMs`；点击后新增请求数 = 0 |
| QW3 | 性能门口径统一「生产构建 + 4× 降速」；dev server 数据仅作调试参考 | lighthouse-dev 35 vs lighthouse-prod 98（§3） | 防止团队被 dev 数据误导、做出错误优化决策 | 零（流程约定） | RELEASE-CHECKLIST 性能门一行（数字见 §0.1） |

**明确不做（避免后续会话重复踩）**：
- **空闲不重绘/降频 ticker**：B2 已论证收益极小且有静止玩家 bug 前科。
- **纹理预算**：59 张 96px 纹理 ≈2.2MB 显存，id 缓存 + 引用计数释放已是现状；降 `ITEM_TEXTURE_PX` 会在 zoom 1.6 + DPR2 下糊——不建议。

---

## 9. 对玩法红线的遵守情况（只读约束核查）

本报告所有建议均未触碰：物品不唯一堆叠、硬保底非概率、判定优先级固定、断网可完整通关。B1/QW1 是渲染层优化；B2 明确建议不动；B4 需产品决策。测量过程中未修改任何游戏逻辑。

---

## 10. 已知限制与注意事项

1. **真机验收**：CPU 4× 是 Chrome 模拟降速，GL 走桌面 ANGLE/D3D11。中端安卓真机的 GPU 带宽、触屏输入延迟、后台 throttling 均未覆盖。建议发布前用一台 Galaxy A54 级真机跑同一组场景（可复用 `scripts/perf-probe.mjs` + 真机 remote debugging）。
2. **污染轮次**：prod4x-b/c 因外部负载失真（§4.3），保留备查；两轮安静数据结论一致。
3. **trace 时钟桥未生效**：`console.timeStamp('__bridge')` 事件未被 trace 捕获（blink.console 类别不采集），store↔trace 时间对齐缺失；B1 结论改用「ParseHTML 与大 Layout 同帧相邻 + 代码链」的直接证据，不依赖对齐计算。
4. **SwiftShader 轮次**（6.6fps）仅证明「软件光栅下不可玩」，与真机无关，不作瓶颈证据。
5. **`vite preview` 的 base 坑**（团队已知坑①复现）：preview 时 base 解析为 `/`，`/track-trash/assets/*` 全走 SPA fallback；测量请用 `scripts/perf-static-serve.mjs` 或 `--base=/` 重建。另注意 **Git Bash 的 MSYS 路径转换会毁 `VITE_BASE=/` / `--base=/`**（值变成 Git 安装目录）——需用 node spawn 传参。
6. **`apps/web/dist` 现状提醒（给 release 协作方）**：工作树里的 `apps/web/dist` 于 12:02 被本会话以 `--base=/` 重建（为 Lighthouse 测量，hash `index-IwNPd2WD.js`），其 `index.html` 引用 `/assets/...`（无 `/track-trash/` 前缀），**与 Pages 部署 base 不匹配，直接服务会白屏**。本报告 Lighthouse 测量对应 base 正确的构建（`apps/web/dist-perf/`，hash `index-B5gny12C.js`）。**部署前请确认用哪份产物。**
7. **并发写冲突**：`shots/` 为共享目录，本会话的 `shots/perf-trace.json` 曾被并行会话覆盖（内容换成了他们的 30s trace——结论一致，已互相印证）；本会话的稳定 trace 在 `shots/perf-trace-el.json`。后续测量请用带会话标识的输出路径。

---

## 11. 数据文件与复现

| 文件 | 内容 |
|---|---|
| `scripts/perf-probe.mjs` / `perf-trace.mjs` | 本会话测量脚本（零新依赖，playwright-core 为仓库既有） |
| `scripts/perf-cdp.mjs` / `perf-static-serve.mjs` | 并行会话脚本 |
| `shots/perf-probe-{base,android4x,prodbase,prod4x,prod4x-clean,prod4x-b,prod4x-c,dev4x-b}.json` | 全轮次帧率/首屏原始数据 |
| `docs/perf/measurements/el-*.json` | 本会话 Lighthouse ×2 + 探针 ×4 的持久化副本 |
| `docs/perf/measurements/*`（其余） | 并行会话原始数据 |
| `shots/perf-trace-el.json` | 本会话稳定 trace（45102 事件）；`shots/perf-trace.json` 为共享文件 |

```bash
# 主探针：CPU 4× + 连续移动 60s（生产构建）
node scripts/perf-probe.mjs --label=prod4x --url=http://127.0.0.1:4182/track-trash/ --throttle=4 --move=60

# dev server 对照
node scripts/perf-probe.mjs --label=android4x --url=http://127.0.0.1:5176/ --throttle=4 --move=60

# 长任务归因（trace）
node scripts/perf-trace.mjs --seconds=40 --throttle=4 --out=shots/perf-trace-el.json

# Lighthouse 移动端（生产构建）
npx --yes lighthouse@12 http://127.0.0.1:4182/track-trash/ --only-categories=performance \
  --form-factor=mobile --screen-emulation.mobile --screen-emulation.width=390 \
  --screen-emulation.height=844 --screen-emulation.deviceScaleFactor=2 --quiet
```

---

## 12. 后续建议（给主理人汇总）

1. **QW1/QW2 进修复 backlog**：唯一掉帧源 + 进游戏预热，均低风险；实现后按 §8 验证方法复测（预期 move 场景长任务归零、进游戏 <200ms@4×）。
2. **真机抽验**：本报告 4× 降速是主线程算力模拟；建议 1–2 台真中端机复测帧率，补齐 T10 产出物要求的「真机机型 + 帧率 + 内存」。
3. **验收口径**：Lighthouse 以生产构建（Pages 同配置）为准；dev server 分数仅作开发期参考。
4. **B4（WebGPU 剔除）需产品决策**：收益 15.7KB gz，风险是放弃 WebGPU 加速路径——建议问明目标设备矩阵后再定。

—— engineering-lead（程基岩），2026-10-21。本轮零代码改动；QW1/QW2 实现排期建议由 team-lead 决策。
